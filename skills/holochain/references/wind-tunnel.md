# Wind-Tunnel — Performance and Load Testing

Wind-Tunnel is Holochain's load testing framework. It applies user-defined load to running Holochain conductors and measures system response: latency, throughput, DHT sync lag, resource usage. It is completely separate from Sweettest (integration/correctness) and Playwright (E2E UI).

**Repo:** https://github.com/holochain/wind-tunnel

> **Version trap: use `main`, not the latest tag.** Wind Tunnel's own release numbering is independent of the Holochain version it targets, and the two currently disagree. Verified 2026-08-17 by reading the workspace `Cargo.toml` on each ref:
>
> | Ref | Pins | Holochain generation |
> |---|---|---|
> | tag `v0.7.1` (2026-07-21, latest release) | `hdk 0.6.3`, `hdi 0.7.3`, `holochain_client 0.8.3`, `kitsune2 0.4.1` | **0.6** | <!-- legacy-ok -->
> | branch `main` | `hdk 0.7.0`, `hdi 0.8.0`, `holochain_client 0.9.0`, `kitsune2 0.5.2` | **0.7** |
>
> The "0.7.1" in the tag name is Wind Tunnel's version, not Holochain's. Checking out that tag against a 0.7 hApp gives you a dependency conflict, not a load test. Track `main` until a release ships with 0.7 pins.
**Used for:** Scheduled performance runs (the wind-tunnel repo's own `nomad-canonical` workflows run the canonical scenarios weekly on a Nomad cluster; Holochain's CI does not call it), soak testing, benchmarking

---

## Testing Layers Compared

| Layer | Tool | Purpose | Output |
|-------|------|---------|--------|
| 1 | Sweettest (Rust) | Correctness — does the hApp work right? | pass/fail |
| 2 | Playwright (TypeScript) | E2E functional — does the UI+zome flow work? | pass/fail |
| 3 | Wind-Tunnel (Rust) | Performance — how fast/scalable is this? | metrics (latency, throughput) |

**Rule:** Use Wind-Tunnel when you need time-series performance data, not when you need correctness assertions.

---

## Published Crates

| Crate | Purpose |
|-------|---------|
| `wind_tunnel_runner` | Core: `ScenarioDefinitionBuilder`, `run()`, `AgentContext`, `RunnerContext`, `Executor` |
| `wind_tunnel_instruments` | Metrics: `Reporter`, `ReportMetric`, `OperationRecord` |
| `wind_tunnel_instruments_derive` | Proc macro: `#[wind_tunnel_instrument]` |
| `wind_tunnel_core` | Core types: `AgentBailError`, `ShutdownHandle` |
| `holochain_wind_tunnel_runner` | Holochain bindings: `call_zome()`, `install_app()`, `HolochainAgentContext` |
| `holochain_client_instrumented` | Auto-instrumented `AdminWebsocket` / `AppWebsocket` |

Add to `Cargo.toml`:
```toml
[dev-dependencies]
# No published release targets Holochain 0.7: 0.6.0, 0.7.0 and 0.7.1 all depend on holochain_types 0.6. Track main.
holochain_wind_tunnel_runner = { git = "https://github.com/holochain/wind-tunnel", branch = "main" }
```

---

## Core API

### ScenarioDefinitionBuilder

```rust
use holochain_wind_tunnel_runner::prelude::*;
use holochain_wind_tunnel_runner::happ_path;

ScenarioDefinitionBuilder::<HolochainRunnerContext, HolochainAgentContext>::new_with_init(
    env!("CARGO_PKG_NAME")
)
    .with_default_duration_s(60)          // seconds to run
    .use_build_info(conductor_build_info) // attach conductor metadata to reports
    .use_agent_setup(fn)                  // called once per agent before loop
    .use_agent_behaviour(fn)              // called repeatedly per agent for entire duration
    .use_agent_teardown(fn)               // called once per agent after duration ends
    .use_named_agent_behaviour("write", fn)       // named role for multi-behavior scenarios
    .use_named_agent_behaviour("read", fn)        // multiple roles assigned via CLI
    .use_setup(fn)                        // global setup (before any agents)
    .use_teardown(fn)                     // global teardown (after all agents)
    .add_capture_env("MY_ENV_VAR")        // include env vars in report metadata
```

### Lifecycle Order

```
Global Setup
  → Agent Setup (each agent, once)
    → Agent Behaviour loop (each agent, repeated until duration/shutdown)
  → Agent Teardown (each agent, once)
Global Teardown
```

### Contexts

```rust
// Per-agent context — available inside every hook
impl AgentContext<HolochainRunnerContext, HolochainAgentContext<SV>> {
    fn agent_index(&self) -> usize;
    fn agent_name(&self) -> &str;
    fn runner_context(&self) -> &Arc<RunnerContext<HolochainRunnerContext>>;
    fn get(&self) -> &HolochainAgentContext<SV>;        // read agent state
    fn get_mut(&mut self) -> &mut HolochainAgentContext<SV>; // write agent state
}

// Shared runner context
impl RunnerContext<HolochainRunnerContext> {
    fn reporter(&self) -> Arc<Reporter>;       // metrics sink
    fn executor(&self) -> &Arc<Executor>;      // async runtime
    fn get_connection_string(&self) -> Option<&str>;
    fn force_stop_scenario(&self);
}

// Async code inside sync hooks
ctx.runner_context().executor().execute_in_place(async {
    // Holochain client calls (async) go here
    Ok(())
})?;
```

### Holochain Conductor Helpers

```rust
// Setup helpers (call in agent_setup)
start_conductor_and_configure_urls(ctx)?;       // start conductor + bind ports
install_app(ctx, happ_path!("my_happ"), &"my_happ".to_string())?;
use_installed_app(ctx, &"my_role".to_string())?;  // connect to already-installed app (takes a role name)

// Teardown helpers (call in agent_teardown)
uninstall_app(ctx, None).ok();                  // None = use current app_id

// Peer coordination
try_wait_for_min_agents(ctx, Duration::from_secs(30))?;  // minimum count from MIN_AGENTS env var, default 2
try_wait_until_full_arc_peer_discovered(ctx)?;
get_peer_list_randomized(ctx)?;  // -> Vec<AgentPubKey>

// Zome calls
let result: MyType = call_zome(ctx, "zome_name", "fn_name", payload)?;
```

### Custom Metrics (ReportMetric)

```rust
use holochain_wind_tunnel_runner::prelude::ReportMetric;

let metric = ReportMetric::new("sync_lag")          // auto-prefixed: wt.custom.sync_lag
    .with_tag("agent", agent_pubkey.to_string())
    .with_field("value", lag_seconds);              // f64

ctx.runner_context().reporter().clone().add_custom(metric);
```

### Custom Per-Agent State

```rust
#[derive(Debug, Default)]
struct ScenarioValues {
    sent_count: u32,
    seen_hashes: HashSet<ActionHash>,
}

impl UserValuesConstraint for ScenarioValues {}

// Use HolochainAgentContext<ScenarioValues> everywhere
// Access via: ctx.get().scenario_values and ctx.get_mut().scenario_values
```

---

## Scenario Patterns

### Pattern 1: Simple Zome Call Benchmark

```rust
use holochain_wind_tunnel_runner::prelude::*;
use holochain_wind_tunnel_runner::happ_path;

fn agent_setup(
    ctx: &mut AgentContext<HolochainRunnerContext, HolochainAgentContext>,
) -> HookResult {
    start_conductor_and_configure_urls(ctx)?;
    install_app(ctx, happ_path!("my_happ"), &"my_happ".to_string())?;
    Ok(())
}

fn agent_behaviour(
    ctx: &mut AgentContext<HolochainRunnerContext, HolochainAgentContext>,
) -> HookResult {
    // Runs repeatedly. Zome call latency auto-captured.
    let _: MyReturn = call_zome(ctx, "my_zome", "my_fn", ())?;
    Ok(())
}

fn main() -> WindTunnelResult<()> {
    let builder =
        ScenarioDefinitionBuilder::<HolochainRunnerContext, HolochainAgentContext>::new_with_init(
            env!("CARGO_PKG_NAME"),
        )
        .with_default_duration_s(60)
        .use_build_info(conductor_build_info)
        .use_agent_setup(agent_setup)
        .use_agent_behaviour(agent_behaviour)
        .use_agent_teardown(|ctx| { uninstall_app(ctx, None).ok(); Ok(()) });

    run(builder)?;
    Ok(())
}
```

### Pattern 2: Write/Read CRUD Performance

```rust
fn agent_behaviour(
    ctx: &mut AgentContext<HolochainRunnerContext, HolochainAgentContext>,
) -> HookResult {
    let action_hash: ActionHash = call_zome(
        ctx, "my_zome", "create_entry", MyEntry { value: "test".to_string() },
    )?;
    let record: Option<Record> = call_zome(
        ctx, "my_zome", "get_entry", action_hash,
    )?;
    assert!(record.is_some(), "Entry must be readable immediately after create");
    Ok(())
}
```

### Pattern 3: DHT Sync Lag (Multi-Role)

```rust
#[derive(Debug, Default)]
struct ScenarioValues {
    sent_actions: u32,
    seen_actions: HashSet<ActionHash>,
}
impl UserValuesConstraint for ScenarioValues {}

// Writer: creates timestamped entries, records sent_count metric
fn agent_behaviour_write(
    ctx: &mut AgentContext<HolochainRunnerContext, HolochainAgentContext<ScenarioValues>>,
) -> HookResult {
    let _: ActionHash = call_zome(ctx, "timed", "create_timed_entry", Timestamp::now())?;
    ctx.get_mut().scenario_values.sent_actions += 1;
    let metric = ReportMetric::new("sent_count")
        .with_field("value", ctx.get().scenario_values.sent_actions);
    ctx.runner_context().reporter().clone().add_custom(metric);
    Ok(())
}

// Reader: queries locally, computes lag since creation, records sync_lag metric
fn agent_behaviour_record_lag(
    ctx: &mut AgentContext<HolochainRunnerContext, HolochainAgentContext<ScenarioValues>>,
) -> HookResult {
    let found: Vec<(ActionHash, Timestamp)> =
        call_zome(ctx, "timed", "get_timed_entries_local", ())?;
    let reporter = ctx.runner_context().reporter().clone();
    for (hash, created_at) in found {
        if !ctx.get().scenario_values.seen_actions.contains(&hash) {
            let lag_s = (Timestamp::now().as_micros() - created_at.as_micros()) as f64 / 1e6;
            reporter.add_custom(ReportMetric::new("sync_lag").with_field("value", lag_s));
            ctx.get_mut().scenario_values.seen_actions.insert(hash);
        }
    }
    Ok(())
}

fn main() -> WindTunnelResult<()> {
    let builder = ScenarioDefinitionBuilder::<
        HolochainRunnerContext, HolochainAgentContext<ScenarioValues>,
    >::new_with_init(env!("CARGO_PKG_NAME"))
        .with_default_duration_s(60)
        .use_build_info(conductor_build_info)
        .use_agent_setup(agent_setup)
        .use_named_agent_behaviour("write", agent_behaviour_write)
        .use_named_agent_behaviour("record_lag", agent_behaviour_record_lag)
        .use_agent_teardown(|ctx| { uninstall_app(ctx, None).ok(); Ok(()) });
    run(builder)?;
    Ok(())
}
```

Run with: `cargo run -- --behaviour write:2 --behaviour record_lag:2 --duration 120`

---

## Running Wind-Tunnel Tests

```bash
# Minimal run (in-memory reporter, single agent)
RUST_LOG=info cargo run -p my_scenario -- --duration 60

# Multiple agents, named roles
cargo run -p my_scenario -- --agents 4 --duration 120
cargo run -p my_scenario -- --behaviour write:2 --behaviour read:2 --duration 120

# Against external conductor (pre-running)
cargo run -p my_scenario -- --connection-string ws://localhost:8888 --duration 60

# With InfluxDB file reporter (for analysis)
cargo run -p my_scenario -- --reporter=influx-file --duration 300

# Soak test (no time limit)
cargo run -p my_scenario -- --soak --reporter=influx-file
```

### Environment Variables

| Variable | Purpose |
|----------|---------|
| `WT_HOLOCHAIN_PATH` | Path to custom Holochain binary |
| `HOLOCHAIN_INFLUXIVE_FILE` | Enable conductor-level metrics to file |
| `WT_METRICS_DIR` | Directory for metrics output (set by Nix) |
| `RUST_LOG` | Log level (e.g. `RUST_LOG=info`) |

---

## Metrics Architecture

Wind-Tunnel collects three simultaneous metric layers, enabling correlation:

| Layer | Source | What |
|-------|--------|------|
| OS | Telegraf (systemd) | CPU, memory, disk I/O, network, swap |
| Conductor | Holochain `influxive` | Internal conductor performance |
| Scenario | `ReportMetric` | Custom application metrics |

**Reporter backends:**

| Flag | Use |
|------|-----|
| `--reporter=in-memory` | Console output (default, local dev) |
| `--reporter=influx-file` | Write InfluxDB line protocol for upload |
| `--reporter=noop` | Disable all metrics |

---

## Cargo.toml Metadata for hApp Packaging

```toml
[package.metadata.required-dna]
name = "my_zome"
zomes = ["my_zome"]

[package.metadata.required-happ]
name = "my_happ"
dnas = ["my_zome"]
```

Use `happ_path!("my_happ")` macro in code to resolve the built hApp path.
A shared `build.rs` (`build = "../scenario_build.rs"`) packages zomes into DNAs/hApps automatically.

---

## Pre-Built Scenarios (Reference)

27 scenarios in the wind-tunnel repo cover common Holochain performance patterns:

| Scenario | Tests |
|----------|-------|
| `zome_call_single_value` | Baseline zome call latency |
| `write_read` | Create + immediate get throughput |
| `dht_sync_lag` | DHT propagation delay between agents |
| `app_install` | App installation latency (minimal vs large) |
| `remote_signals` | Remote signal round-trip latency |
| `remote_call_rate` | Remote zome call throughput |
| `two_party_countersigning` | Full countersigning session lifecycle |
| `single_write_many_read` | Write amplification pattern |
| `validation_receipts` | Validation receipt delivery timing |
| `local_signals` | Local signal handling performance |
| `full_arc_create_validated_zero_arc_read` | Mixed-arc topology |
| `zero_arc_create_data` | Zero-arc creation throughput |

Published results: https://holochain.github.io/wind-tunnel/

---

## When to Write a Wind-Tunnel Scenario

Write a Wind-Tunnel scenario (not a Sweettest test) when you need:
- **Continuous latency monitoring** — track how long zome calls take under load over time
- **Throughput measurement** — ops/sec for entry creation, linking, querying
- **DHT propagation timing** — how long until another agent sees your entries
- **Regression detection** — catch performance regressions between Holochain versions
- **Soak testing** — sustained load over hours to detect memory leaks or degradation
- **Multi-node topology testing** — full-arc vs zero-arc behavior at scale

Do NOT use Wind-Tunnel for:
- Checking correctness (use Sweettest)
- Testing UI flows (use Playwright)
- Testing specific HDK behaviors (use Sweettest inline zomes)
