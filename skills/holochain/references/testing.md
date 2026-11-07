# Holochain Testing

## Four-Layer Testing Strategy

```
┌──────────────────────────────────────────────────────────────────┐
│  Layer 4 — Performance (Wind-Tunnel, load testing)               │
│  "How fast, scalable, and resilient is this under load?"         │
├──────────────────────────────────────────────────────────────────┤
│  Layer 3 — E2E UI (Playwright + real conductor)                  │
│  "Does the UI render real data and journeys work?"               │
├──────────────────────────────────────────────────────────────────┤
│  Layer 2 — Integration (Sweettest, cargo test)                   │
│  "Do zomes, DHT sync, and validation work?"                      │
├──────────────────────────────────────────────────────────────────┤
│  Layer 1 — Unit (Vitest, stores/services/mappers)                │
│  "Do computed values and business logic work?"                   │
└──────────────────────────────────────────────────────────────────┘
```

| Layer | Tool | Output | What it catches |
|-------|------|--------|----------------|
| Unit | Vitest | pass/fail | Store logic, mappers, computed values |
| Integration | Sweettest | pass/fail | Zome logic, validation, DHT sync, auth |
| E2E UI | Playwright + `@holochain/client` | pass/fail | Full user journeys, real data display |
| Performance | Wind-Tunnel | metrics (latency/throughput) | Regressions under load, DHT sync lag, soak issues |

**Gap:** Browser-side signal handling (`recv_remote_signal`) is not well covered by any layer — it requires a running UI receiving WebSocket push events from a real conductor.

---

## Framework Overview

- **Sweettest** (`holochain::sweettest`) — Rust-native, in-process conductor. Official Holochain team recommendation. Run with `cargo test`.
- **Playwright** + **`@holochain/client`** — Browser automation against a real conductor. No mocks.
- **Wind-Tunnel** (`holochain_wind_tunnel_runner`) — Rust load testing. Separate repo. Measures latency, throughput, DHT sync lag. The wind-tunnel repo runs its canonical scenarios on a weekly schedule on a Nomad cluster; Holochain's own CI does not invoke it. See `wind-tunnel.md`.

**Note on Tryorama:** The scaffolding tool no longer generates it, and Holochain no longer maintains it. It now lives at [holochain-open-dev/tryorama](https://github.com/holochain-open-dev/tryorama) as a community project. This skill targets Sweettest only. If you are maintaining a legacy suite, the community fork tracks 0.7; everything else here assumes you are not.

---

## When to Use Which

| Use Case | Sweettest | Playwright | Wind-Tunnel |
|----------|-----------|-----------|-------------|
| Zome logic, validation, CRUD | ✅ Preferred | No | No |
| DHT propagation, consistency | ✅ Preferred | No | No |
| Multi-agent scenarios | ✅ Preferred | No | No |
| Inline zomes (no WASM compile) | ✅ Yes | No | No |
| Direct DHT database inspection | ✅ Yes | No | No |
| Full UI user journeys | No | ✅ Yes | No |
| Real data rendered in browser | No | ✅ Yes | No |
| Latency / throughput metrics | No | No | ✅ Yes |
| DHT sync lag measurement | No | No | ✅ Yes |
| Soak / sustained load testing | No | No | ✅ Yes |
| Language | Rust | TypeScript | Rust |

---

## Sweettest (Rust-Native)

### Setup (Cargo.toml)

```toml
[dev-dependencies]
holochain = { version = "=0.7.1", default-features = false, features = ["encryption", "wasmer-sys-cranelift", "test_utils"] }
tokio = { version = "1", features = ["full"] }
```

### Core Types

| Type | Purpose |
|------|---------|
| `SweetConductor` | Single conductor instance |
| `SweetConductorBatch` | Multiple conductors for multi-agent scenarios |
| `SweetApp` | Installed app with pre-built cells |
| `SweetCell` | Cell reference — access agent key, DNA hash, zome handles |
| `SweetZome` | `(CellId, ZomeName)` handle passed to `conductor.call()` |
| `SweetAgents` | Agent key generation utilities |
| `SweetDnaFile` | DNA construction helpers |
| `SweetInlineZomes` | Define zome functions directly in test code |

### Standard Two-Agent Test

```rust
use holochain::sweettest::*;
use std::path::Path;

#[tokio::test(flavor = "multi_thread")]
async fn two_agents_can_share_entries() {
    // 1. Create two conductors
    let mut conductors = SweetConductorBatch::standard(2).await;

    // 2. Load DNA bundle
    let dna = SweetDnaFile::from_bundle(Path::new("workdir/my.dna")).await.unwrap();

    // 3. Install app on both conductors
    let apps = conductors.setup_app("my-app", &[dna]).await.unwrap();
    let ((alice_cell,), (bob_cell,)) = apps.into_tuples();

    // 4. Exchange peer info so conductors can gossip
    conductors.exchange_peer_info().await;

    // 5. Alice creates an entry
    let alice_zome = alice_cell.zome("my_coordinator");
    let hash: ActionHash = conductors[0]
        .call(&alice_zome, "create_my_entry", my_payload)
        .await;

    // 6. Wait for DHT consistency before any cross-agent read
    await_consistency([&alice_cell, &bob_cell]).await.unwrap();

    // 7. Bob reads the entry
    let bob_zome = bob_cell.zome("my_coordinator");
    let record: Option<Record> = conductors[1]
        .call(&bob_zome, "get_my_entry", hash)
        .await;

    assert!(record.is_some());
}
```

### CRITICAL: await_consistency is MANDATORY Before Cross-Agent Reads

Every cross-agent read must be preceded by it:

```rust
// After any write, before cross-agent reads:
await_consistency([&alice_cell, &bob_cell]).await.unwrap();

// Custom timeout in seconds (default is 60s):
await_consistency_s(30, [&alice_cell, &bob_cell]).await.unwrap();

// Instant non-waiting check:
check_consistency([&alice_cell, &bob_cell]).await.unwrap();
```

`await_consistency` polls every 500ms, comparing all peers' DHT databases at the op level until every op is integrated across all nodes.

### Calling Zome Functions

```rust
// Standard call — panics on error, uses authorship cap automatically:
let result: MyOutputType = conductor.call(&cell.zome("my_zome"), "fn_name", payload).await;

// Fallible call — returns ConductorApiResult:
let result = conductor.call_fallible(&cell.zome("my_zome"), "fn_name", payload).await?;

// Cross-agent call — simulate another agent calling with a cap secret:
let result: MyOutputType = conductor.call_from(
    &other_agent_key,
    Some(cap_secret),
    &cell.zome("my_zome"),
    "restricted_fn",
    payload,
).await;
```

### Agent Key Generation

```rust
// Named deterministic keys (same every run — useful for debugging):
let (alice, bob) = SweetAgents::alice_and_bob();
let alice = SweetAgents::alice();

// Random keys:
let agent = SweetAgents::one(conductor.keystore()).await;
let (a, b, c) = SweetAgents::three(conductor.keystore()).await;
let agents: Vec<AgentPubKey> = SweetAgents::get(conductor.keystore(), 5).await;
```

### Inline Zomes (Quick Isolated Tests, No WASM Compile)

```rust
// new(entry_defs, num_link_types); `.function` consumes and returns the builder
let zomes = SweetInlineZomes::new(vec![EntryDef::default_from_id("thing")], 0)
    .function("create_thing", |api, input: MyInput| {
        let hash = api.create(CreateInput::new(
            InlineZomeSet::get_entry_location(&api, EntryDefIndex(0)),
            EntryVisibility::Public,
            Entry::app(input.try_into().unwrap()).unwrap(),
            ChainTopOrdering::default(),
        ))?;
        Ok(hash)
    });
// Returns (DnaFile, Vec<IntegrityZome>, Vec<CoordinatorZome>), not a Result
let (dna, _, _) = SweetDnaFile::unique_from_inline_zomes(zomes).await;
```

### Single-Conductor Pattern (Validation and Unit Tests)

```rust
#[tokio::test(flavor = "multi_thread")]
async fn validate_entry_on_create() {
    let mut conductor = SweetConductor::from_config_rendezvous(
        SweetConductorConfig::standard(),
        SweetLocalRendezvous::new().await,
    ).await;
    let dna = SweetDnaFile::from_bundle(Path::new("workdir/my.dna")).await.unwrap();
    let app = conductor.setup_app("my-app", &[dna]).await.unwrap();
    let (cell,) = app.into_tuple();
    let zome = cell.zome("my_coordinator");

    // Test validation rejection
    let result = conductor.call_fallible(&zome, "create_my_entry", invalid_payload).await;
    assert!(result.is_err());
}
```

### SweetConductorConfig — Network Tuning

Most tests use `SweetConductorConfig::standard()`. Override for stress tests or timing-sensitive scenarios:

```rust
// `tune_network_config` and `tune_conductor` take `self` and return `Self`.
// NetworkConfig has no gossip fields: its `with_gossip_*` builders write k2Gossip keys into `advanced`.
let config = SweetConductorConfig::standard()
    // Tune gossip frequency (standard(): 1000ms interval, 10_000ms round timeout)
    .tune_network_config(|net| {
        *net = net
            .clone()
            .with_gossip_initiate_interval_ms(500)      // More frequent gossip
            .with_gossip_round_timeout_ms(20_000)       // Longer timeout
            .with_gossip_min_initiate_interval_ms(500)
            .with_gossip_initiate_jitter_ms(50);
    })
    // Tune validation and countersigning
    .tune_conductor(|tune| {
        tune.sys_validation_retry_delay = Some(Duration::from_secs(3));
        tune.countersigning_resolution_retry_delay = Some(Duration::from_secs(5));
        tune.countersigning_resolution_retry_limit = Some(10);
    });

let conductor = SweetConductor::from_config_rendezvous(
    config,
    SweetLocalRendezvous::new().await,
).await;
```

---

### Installation Patterns

#### Single Conductor, Multiple Agents

```rust
// Install same app for N generated agents (app IDs: "{prefix}0", "{prefix}1", ...)
let apps: SweetAppBatch = conductor
    .setup_apps("my-app", 3, &[dna_file])
    .await.unwrap();
let cells: Vec<SweetCell> = apps.cells_flattened();

// Install for a specific pre-generated agent
let agent = SweetAgents::one(conductor.keystore()).await;
let app: SweetApp = conductor
    .setup_app_for_agent("my-app", agent.clone(), &[dna_file])
    .await.unwrap();

// Install for multiple pre-generated agents
let agents = SweetAgents::get(conductor.keystore(), 3).await;
let apps: SweetAppBatch = conductor
    .setup_app_for_agents("my-app", &agents, &[dna_file])
    .await.unwrap();
```

#### Explicit DNA Role Binding

```rust
// Bind DNA to a named role (required when role name differs from DNA hash)
let dna_with_role: (RoleName, DnaFile) = ("my_role".into(), dna_file);
let app = conductor.setup_app("my-app", &[dna_with_role]).await.unwrap();
```

#### Multi-Cell App (Multiple DNA Roles)

```rust
let role_a = ("role_a", dna_a);
let role_b = ("role_b", dna_b);
let app = conductor.setup_app("my-app", &[role_a, role_b]).await.unwrap();

// Destructure cells by role order
let (cell_a, cell_b) = app.into_tuple();
```

#### SweetAppBatch Destructuring

```rust
// Two apps, one cell each
let ((alice,), (bob,)) = conductors
    .setup_app("my-app", &[dna_file])
    .await.unwrap()
    .into_tuples();

// Two apps, two cells each
let ((alice_a, alice_b), (bob_a, bob_b)) = conductors
    .setup_app("my-app", &[dna_a, dna_b])
    .await.unwrap()
    .into_tuples();
```

---

### SweetConductorBatch — Advanced Patterns

```rust
// From custom config applied to all conductors
let conductors = SweetConductorBatch::from_config_rendezvous(
    3,
    SweetConductorConfig::standard(),
).await;

// From different configs per conductor
let configs = vec![config_a, config_b, config_c];
let conductors = SweetConductorBatch::from_configs_rendezvous(configs).await;

// Force peer visibility between two specific conductors (unidirectional)
conductors.reveal_peer_info(0, 1).await;  // conductor 0 sees conductor 1

// Persist databases for debugging
conductors[0].persist_dbs();  // must call BEFORE shutdown
```

---

### App Lifecycle Management

```rust
// Disable then re-enable an app
conductor.disable_app("my-app".to_string(), DisabledAppReason::User).await.unwrap();
conductor.enable_app("my-app".to_string()).await.unwrap();

// Hot-reload coordinator zomes without restarting conductor
conductor.update_coordinators(
    cell.cell_id().clone(),
    updated_coordinator_zomes,
    vec![new_wasm],
).await.unwrap();

// Create a clone cell of an existing role
let cloned = conductor.create_clone_cell(
    &"my-app".to_string(),
    CreateCloneCellPayload {
        role_name: "clonable_role".into(),
        modifiers: DnaModifiersOpt::default().with_network_seed("clone-1"),
        membrane_proof: None,
        name: Some("My Clone".to_string()),
    },
).await.unwrap();

// Restart conductor
conductor.shutdown().await;
conductor.startup().await;
```

---

### Database Access and Inspection

Use these for debugging or asserting internal state without going through zome calls:

```rust
// Access the DHT store directly (0.7 has no separate authored_db / dht_db accessors)
let dht_store = cell.dht_store();
let dht_store_from_conductor = conductor.get_dht_store(cell.dna_hash()).unwrap();

// Read the full source chain for an agent
let chain = conductor
    .get_agent_source_chain(&agent_key, cell.dna_hash())
    .await;

// Get invalid / rejected ops (validates your validation logic)
let invalid_ops = conductor.get_invalid_integrated_ops(cell.dna_hash()).await.unwrap();
assert!(invalid_ops.is_empty(), "Found invalid ops: {invalid_ops:?}");

// Persist databases to disk before shutdown (for debugging)
let path = conductor.persist_dbs();
println!("DB saved to: {}", path.display());
conductor.shutdown().await;
```

---

### Network and Gossip Testing

```rust
// Wait for specific peers to become visible on this conductor
conductor.wait_for_peer_visible(
    vec![alice_pubkey.clone(), bob_pubkey.clone()],
    Some(cell.cell_id().clone()),
    Duration::from_secs(30),
).await.unwrap();

// Require at least N peers before gossip starts (avoids false positives)
conductor
    .require_initial_gossip_activity_for_cell(&cell, 2, Duration::from_secs(30))
    .await.unwrap();

// Declare this node holds the full DHT arc (affects peer routing)
conductor.declare_full_storage_arcs(cell.dna_hash()).await;

// Check consistency without blocking (instant snapshot)
check_consistency([&alice_cell, &bob_cell]).await.unwrap();

// Drop and restart signaling server (simulates network partition)
let rendezvous = SweetLocalRendezvous::new_raw().await;
rendezvous.drop_sig().await;   // kill signal channel
// ... test behavior during outage ...
rendezvous.start_relay().await;  // restore
```

---

### Op Integration Verification

Assert that ops are fully integrated without using `await_consistency`:

```rust
// All ops in the DHT for this DNA are integrated
let integrated = conductor.all_ops_integrated(cell.dna_hash()).await.unwrap();
assert!(integrated, "Ops not yet integrated");

// All ops authored by a specific agent are integrated
let author_integrated = conductor
    .all_ops_of_author_integrated(cell.dna_hash(), cell.agent_pubkey())
    .await
    .unwrap();
```

---

### Time-Based Testing (Scheduled Functions)

```rust
// Start scheduler with custom interval
conductor.start_scheduler(Duration::from_millis(100)).await.unwrap();

// Manually fire scheduled functions at a specific timestamp
let target_time = Timestamp::now() + Duration::from_secs(3600); // 1 hour in future
conductor.dispatch_scheduled_fns(target_time).await;

// Verify effects after scheduler fires
let result: Vec<Record> = conductor.call(&zome, "get_scheduled_entries", ()).await;
assert!(!result.is_empty());
```

---

### SweetInlineZomes — Integrity and Coordinator Separation

The full pattern separates integrity (validation) from coordinator (business logic):

```rust
use holochain::sweettest::{SweetInlineZomes, SweetDnaFile};
use holochain_zome_types::prelude::{EntryDef, EntryVisibility};

let entry_def = EntryDef {
    id: "my_entry".into(),
    visibility: EntryVisibility::Public,
    required_validations: RequiredValidations::default(),
    cache_at_agent_activity: false,
};

let zomes = SweetInlineZomes::new(vec![entry_def], /* num_link_types */ 0)
    // Integrity zome: validation callbacks
    .integrity_function("validate", |_api, _op: Op| {
        Ok(ValidateCallbackResult::Valid)
    })
    // Coordinator zome: zome functions
    .function("create_entry", |api, input: MyInput| {
        let hash = api.create(CreateInput::new(
            EntryDefLocation::app(0, 0),
            EntryVisibility::Public,
            Entry::app(SerializedBytes::try_from(input)?).unwrap(), // EntryError has no From into InlineZomeError
            ChainTopOrdering::default(),
        ))?;
        Ok(hash)
    })
    .function("get_entry", |api, hash: ActionHash| {
        api.get(vec![GetInput::new(hash.into(), GetOptions::default())])
            .map(|gets| gets.into_iter().next().flatten())
    });

let (dna, _, _) = SweetDnaFile::unique_from_inline_zomes(zomes).await;
```

**Zome name constants:** `SweetInlineZomes::INTEGRITY` = `"integrity"`, `SweetInlineZomes::COORDINATOR` = `"coordinator"`.

---

### WebSocket Interface Testing

For tests that need to verify WebSocket behavior (signals, app interface):

```rust
// Get admin WebSocket client
let (admin_sender, _admin_recv) = conductor.admin_ws_client::<AdminResponse>().await;

// Get app WebSocket client (auto-authenticated)
let (app_sender, mut app_recv) = conductor
    .app_ws_client::<AppResponse>("my-app".to_string())
    .await;

// Or authenticate manually for custom setup
let (app_sender, _) = websocket_client_by_port(app_port).await.unwrap();
authenticate_app_ws_client(app_sender.clone(), admin_port, "my-app".to_string()).await;
```

---

### Common Sweettest Failures (Extended)

| Symptom | Root Cause | Fix |
|---------|-----------|-----|
| Bob can't find Alice's entry | Missing `await_consistency` | Add `await_consistency([&alice_cell, &bob_cell]).await.unwrap()` |
| Compilation error on `call()` | Missing feature flag | Add `features = ["test_utils"]` to holochain dev-dep |
| Timeout in `await_consistency` | Conductors not networked | Call `conductors.exchange_peer_info().await` after `setup_app` |
| Wrong type on `call()` | Type annotation missing | Add explicit type: `let result: MyType = conductor.call(...)` |
| `into_tuple()` fails | Wrong number of cells destructured | Match tuple arity to number of DNA roles |
| Invalid ops present unexpectedly | Validation logic accepting bad data | Use `get_invalid_integrated_ops()` to inspect rejected ops |
| `reveal_peer_info` / gossip never starts | Full arc not declared | Call `declare_full_storage_arcs()` on test conductors |
| Scheduled fn never fires | Scheduler not started | Call `start_scheduler()` or `dispatch_scheduled_fns(timestamp)` |
| WebSocket auth fails in test | Using wrong port | Use `admin_ws_client()` for admin, `app_ws_client()` for app calls |

---

## E2E UI Testing (Playwright + Real Conductor)

For full end-to-end tests that drive the UI against a real Holochain backend — no mocks. Use `@holochain/client` directly against a conductor you start yourself.

### Setup (package.json)

```json
{
  "devDependencies": {
    "@playwright/test": "^1.40.0",
    "@holochain/client": "^0.21.1"
  }
}
```

### Conductor Setup Pattern (globalSetup)

The critical pattern: use `AdminWebsocket` to install the app and get a proper auth token, then keep the conductor alive for all Playwright tests.

```typescript
// tests/e2e/setup/global-setup.ts
import { AdminWebsocket, AppWebsocket } from '@holochain/client';
import { execSync, spawn } from 'child_process';

export default async function globalSetup() {
  // 1. Start conductor via hc sandbox. `run` has no --root: it reads the `.hc` file in its cwd
  const conductor = spawn('hc', ['sandbox', 'run', '--all'], {
    cwd: './test-workdir',
    stdio: ['ignore', 'pipe', 'pipe']
  });

  // 2. Wait for conductor ready signal in stdout (not polling)
  await new Promise<void>((resolve, reject) => {
    conductor.stdout?.on('data', (data: Buffer) => {
      if (data.toString().includes('Conductor ready')) resolve();
    });
    setTimeout(() => reject(new Error('Conductor startup timeout')), 30000);
  });

  // 3. Connect admin client (use admin port, not app port)
  const admin = await AdminWebsocket.connect({
    url: new URL('ws://localhost:8888')
  });

  // 4. Install and enable the happ properly
  const agentKey = await admin.generateAgentPubKey();
  await admin.installApp({
    installed_app_id: 'my_happ',
    agent_key: agentKey,
    // 0.21: the bundle location is a tagged union under `source`, not a top-level `path`.
    source: { type: 'path', value: './workdir/my_happ.happ' },
  });
  await admin.enableApp({ installed_app_id: 'my_happ' });

  // 5. Open app interface on a free port.
  // `allowed_origins` is required and has no default. Omit it and the browser
  // connection is rejected on origin, which looks exactly like a dead port.
  const { port } = await admin.attachAppInterface({
    port: 0,
    allowed_origins: '*',
  });

  // 6. Issue auth token
  const { token } = await admin.issueAppAuthenticationToken({
    installed_app_id: 'my_happ'
  });

  // 7. Connect app client and seed test data
  const client = await AppWebsocket.connect({
    url: new URL(`ws://localhost:${port}`),
    token,
  });

  await seedTestData(client);

  // 8. Store conductor process for teardown
  process.env.E2E_CONDUCTOR_PID = String(conductor.pid);
  process.env.E2E_APP_PORT = String(port);
}
```

### Data Seeding

Seed data directly via `AppWebsocket.callZome` before Playwright opens the browser:

```typescript
async function seedTestData(client: AppWebsocket) {
  // Seed in dependency order
  await client.callZome({
    role_name: 'my_dna',
    zome_name: 'my_coordinator',
    fn_name: 'create_service_type',
    payload: { name: 'Web Development', description: '...' },
  });

  await client.callZome({
    role_name: 'my_dna',
    zome_name: 'my_coordinator',
    fn_name: 'create_offer',
    payload: { title: 'Seed Offer', description: '...' },
  });
}
```

### Playwright Test Pattern

```typescript
// tests/e2e/specs/offers.spec.ts
import { test, expect } from '@playwright/test';

test('user sees seeded offers on load', async ({ page }) => {
  await page.goto('/offers');

  // Wait for Holochain connection (not a mock — real loading time)
  await expect(page.locator('[data-testid="offer-card"]'))
    .toHaveCount(1, { timeout: 15000 });

  await expect(page.locator('text=Seed Offer')).toBeVisible();
});
```

### playwright.config.ts Key Settings

```typescript
export default defineConfig({
  globalSetup: './tests/e2e/setup/global-setup.ts',
  globalTeardown: './tests/e2e/setup/global-teardown.ts',
  workers: 1,           // Single worker — one conductor, no conflicts
  fullyParallel: false, // Holochain state is shared across tests
  timeout: 60000,       // Holochain operations are slow
  use: {
    baseURL: 'http://localhost:5173',
  },
  webServer: {
    command: 'bun run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
  },
});
```

### Common E2E Failures

| Symptom | Root Cause | Fix |
|---------|-----------|-----|
| Conductor never ready | Polling instead of stdout | Listen for `"Conductor ready"` in stdout |
| `callZome` rejected | Using `AppWebsocket` on admin port | Use `AdminWebsocket` on admin port (8888), `AppWebsocket` on app port |
| Auth error on connect | Missing token | Call `admin.issueAppAuthenticationToken()` and pass token to `AppWebsocket.connect` |
| Tests interfere with each other | Shared conductor state | Run with `workers: 1`, reset data in `beforeEach` if needed |
| UI shows no data | Race — browser loads before seeding | Seed in `globalSetup` (runs before browser opens), not in `beforeAll` |
