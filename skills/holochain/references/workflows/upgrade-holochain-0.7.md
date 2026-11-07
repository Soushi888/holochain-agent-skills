# Workflow: Upgrade an existing hApp from 0.6 to 0.7

For a hApp already running on Holochain 0.6. If you are on 0.5, do the 0.6 upgrade first.

**Authoritative source:** [developer.holochain.org/resources/upgrade/upgrade-holochain-0.7](https://developer.holochain.org/resources/upgrade/upgrade-holochain-0.7/). This workflow sequences it and adds what the example hApp in this repo hit in practice. Where the two disagree, the official guide wins.

---

## Step 0 — Decide whether to go now

Three things make this more than a version bump:

1. **The action model was rewritten.** Every integrity zome's `validate` callback and every coordinator's `signal_action` needs porting. This is the bulk of the work.
2. **tx5 and WebRTC are gone.** Iroh over QUIC is the only transport.
3. **There is no data migration path.** DNA hashes change even for identical DNAs, and the databases were renamed. Existing installs must clear their data.

That third point is the decision gate: **every 0.7 network is a new network.**

- No production users yet → pure code port, go.
- Users whose data matters → the port is the easy half. You also need a data strategy, and the developer experience for it is incomplete. Budget for it separately and consider whether a clean restart plus a user-facing export/import is cheaper. See `migration.md`.

**Checkpoint:** you know whether you are porting code only, or code plus user data.

---

## Step 1 — Branch and re-pin the toolchain

Expect nothing to compile at the end of this step. That is normal.

```bash
git checkout -b upgrade/holochain-0.7
```

`flake.nix`:

```nix
holonix.url = "github:holochain/holonix?ref=main-0.7";   # was main-0.6
```

```nix
packages = (with pkgs; [
  nodejs_24      # was nodejs_22 (legacy-ok)
  binaryen
  perl           # add if your Sweettest build fails looking for it
]);
```

Do not use bare `main`: it now tracks the 0.8 dev line.

```bash
nix flake update && git add flake.* && nix develop
holochain --version     # expect 0.7.1
```

Root `Cargo.toml`:

```toml
[workspace.dependencies]
hdi = "=0.8.1"
hdk = "=0.7.1"
```

If you have a `holochain` dev-dependency for Sweettest, its features changed:

```toml
holochain = { version = "0.7.1", default-features = false, features = ["encryption", "wasmer-sys-cranelift"] }
# was: features = ["sqlite-encrypted", "wasmer_sys", "transport-iroh"]   (legacy-ok)
```

`package.json`: `@holochain/client` to `^0.21.1`, `@holochain/hc-spin` to `^0.700.1`.

Then `cargo update` and `npm install`. Delete every sandbox and conductor data directory in the repo; 0.7 cannot read them and the failure is confusing rather than explicit.

**Checkpoint:** `cargo check` fails with real API errors, not dependency-resolution errors.

---

## Step 2 — Port the integrity zomes

This is the bulk. Do integrity first; coordinator code depends on the types.

**The fastest route is not hand-porting.** Scaffold a throwaway app with the same entry and link types and copy its dispatcher across:

```bash
hc scaffold -t headless web-app throwaway "tmp"
cd throwaway
hc scaffold -t headless dna d
hc scaffold -t headless zome z --integrity dnas/d/zomes/integrity/ --coordinator dnas/d/zomes/coordinator/
hc scaffold -t headless entry-type my_entry --dna d --zome z_integrity \
  --fields "title:String" --crud crud --reference-entry-hash false --no-ui
```

Note `--zome` takes the integrity **package** name (`z_integrity`), not the directory name.

The renames you are applying, in full, are in `patterns.md`. The short version:

- `FlatOp::StoreEntry` → `CreateEntry`, `StoreRecord` → `CreateRecord`, `RegisterUpdate` → `Update`, `RegisterDelete` → `Delete`, `RegisterAgentActivity` → `AgentActivity`, and both link variants → `FlatOp::Link(OpLink::…)`
- `EntryCreationAction` → `TypedAction<EntryCreationData>`
- `Create`/`Update`/`Delete`/`CreateLink`/`DeleteLink` → `…Data` structs, matched on `action.data`
- `action.author` → `action.author()`
- Link validation functions lose their base/target/tag arguments; read them off the action

**Checkpoint:** integrity crates compile.

---

## Step 3 — Port the coordinator zomes

- `signal_action` matches on `&action.hashed.content.data` with `ActionData::` variants.
- `get_agent_activity` takes a fourth `GetOptions` argument and returns `AgentActivityStatus`.
- `ChainFilter` uses constructors: `ChainFilter::take(chain_top, 10)`, not `ChainFilter::new(chain_top).take(10)`.
- `Record::new` takes a `RecordEntry`, not an `Option<Entry>`.
- `block_agent` and `unblock_agent` are **removed**, host functions included. WASM referencing them fails to instantiate. Application-level blocking built on them needs redesigning, not porting: blocking is now a system behaviour driven by warrants.
- `must_get_agent_activity` has new response variants; match them if you match exhaustively.

**Checkpoint:** the workspace compiles.

```bash
RUSTFLAGS='--cfg getrandom_backend="custom"' \
  cargo build --release --target wasm32-unknown-unknown
```

That RUSTFLAGS setting is required. Without it the build fails inside `getrandom` with a message about `wasm32-unknown-unknown` being unsupported, which does not look like a Holochain problem.

---

## Step 4 — Conductor config and clients

Only if you maintain a `conductor-config.yaml`, for example in a Kangaroo build. `NetworkConfig` rejects unknown fields, so a leftover key is a startup failure, not a warning.

- Remove `signal_url`, `webrtc_config`, `chc_url`
- Move `request_timeout_s` under `network`
- `db_sync_strategy` → `db_sync_level`, values `Full` / `Normal` / `Off`
- `wasm_backend` is new and optional

JavaScript, see `client.md`:

- `SignedActionHashed` is no longer generic
- `action.hashed.content.author` → `.header.author`
- `TransportStats` → `ApiTransportStats`, `is_webrtc` → `is_direct`
- `signalingServerUrl` → `relayServerUrl`

---

## Step 5 — Tests

Sweettest is the supported path; `hc scaffold` no longer generates Tryorama. <!-- legacy-ok -->

- `await_consistency` has a 60 second timeout; `await_consistency_s(n, ..)` for a custom one
- `Conductor::install_app_with_manifest` moved behind `test_utils`
- `mock_network` was removed from `holochain_p2p`
- Inline zome definitions changed: closures moved to `DnaFile`, `InlineZome::uuid` became `hash`

```bash
hc sandbox clean
cargo test
```

---

## Step 6 — Packaging

Rebuild whatever you ship through and check its own 0.7 support first; conductor pins lag core. Kangaroo `main-0.7` pins holochain 0.7.0.

Publish the new DNA hashes somewhere your users can see. The old network is not reachable from the new build.

---

## Effort

| Step | Rough effort |
|---|---|
| 1 Re-pin toolchain | half a day |
| 2 Integrity zomes | two to four days |
| 3 Coordinator zomes | one to two days |
| 4 Config and clients | half a day |
| 5 Tests | one day |
| 6 Packaging | half a day, or open-ended |

Port the smallest hApp first to build the vocabulary, then the larger ones.

---

## Already on 0.7.0: moving to 0.7.1

0.7.1 (2026-10-14) is a patch release with breaking changes in the capability types. A fresh lockfile under an `=0.7.0` pin already pulls the 0.7.1 types, because `hdk =0.7.0` depends on `holochain_zome_types ^0.7.0`. So a project can start failing to compile without anyone touching a version.

1. Re-pin: `hdk = "=0.7.1"`, `hdi = "=0.8.1"`, `holochain` 0.7.1, `@holochain/client` `^0.21.1`. `@holochain/hc-spin` to `^0.700.1` (built against 0.7.1). Then `cargo update -p hdk -p hdi` and `nix flake update holonix`.
2. Rewrite every grant. `ZomeCallCapGrant { tag, access, functions }` becomes `CapGrant::new_zome_call_grant(tag, constraint, functions)`, and `CapAccess::{Unrestricted, Transferable, Assigned}` becomes `GrantConstraint::{..}`. Details and the full rename table: `access-control.md` (section 0.7.0 to 0.7.1).
3. Grants already on a source chain must be re-issued in the new shape. Nothing migrates them.
4. If you use direct signals, add a `Capability::DirectSignal` grant on the receiver. `Signal::AppDirect` also carries `from_agent` now.
5. Other removals: `Entry::app_fancy` and `Entry::entry_type`; `Action::signer` (use `Action::author`); `ConductorError::CellDisabled` is now `CellNotRunning(cell_id, reason)`.
6. Client: `@holochain/client` 0.21.1 changes `ChainOp` and `OpEntry` to the 0.7 msgpack encoding. See `client.md`.

