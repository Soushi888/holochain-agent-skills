# Debugging a Running Conductor

`troubleshooting.md` maps literal error strings to causes. This file is for the other case: nothing has thrown, and you need to see what the conductor and the network are actually doing.

Command surface read from `holochain/holochain` at tag `holochain-0.7.0` (`crates/hc_sandbox/src/cli.rs`, `crates/hc_client/src/cli.rs`, `crates/hc_client/src/calls.rs`, `crates/hc_client/src/zome_call.rs`), and log behaviour from `holochain 0.7.0` (`src/core/ribosome/host_fn/trace.rs`), `holochain_trace 0.7.0` and `hdk 0.7.0`.

## `hc sandbox call` is gone in 0.7

If you have muscle memory for `hc sandbox call dump-state`, it no longer exists. The 0.7 `hc sandbox` subcommands are exactly:

```
generate   run   list   clean   remove   admin-ports   create
```

Admin API calls moved to a separate client CLI. It ships two ways and both work: as a standalone `hc-client` binary, and as a builtin `hc client` subcommand (`holochain_cli` depends on `holochain_cli_client`, and `hc-client` is in its builtin command list). This file writes `hc-client`; substitute `hc client` if you prefer. That split is the single most disorienting change in the 0.7 developer tooling, and nothing in the error message tells you where the command went.

## Two log streams, two environment variables

The conductor and your wasm log through different filters. Setting only one and seeing nothing from the other is a common false alarm.

| Stream | Variable | Default |
|---|---|---|
| Conductor (Rust) | `RUST_LOG` | unset means the tracing subscriber is a no-op |
| Your zome code (wasm) | `WASM_LOG` | `[wasm_trace]=debug` |

`WASM_LOG` parses exactly like `RUST_LOG`, and `holochain_trace` will also read `CUSTOM_FILTER` as an override, complaining loudly if that one fails to parse while staying quiet if `RUST_LOG` does.

```bash
RUST_LOG=info WASM_LOG=debug hc sandbox run
RUST_LOG='holochain=debug,kitsune2_gossip=trace' hc sandbox run
```

`hc sandbox` takes `--structured` to pick Holochain's log output format, and `-f` / `--force-admin-ports` to pin admin ports so they stay stable across runs. `-f` is only honoured by `generate` and `run`, and must be passed on every run:

```bash
hc sandbox -f=9000,9001 run
```

Without `-f`, ports are assigned by the OS and change every run, which is what breaks a hardcoded `HC_ADMIN_PORT` in a UI dev script.

### Logging from inside a zome

```rust
debug!("post {:?} created by {:?}", action_hash, agent);
warn!("unexpected state: {:?}", state);
```

`trace!`, `debug!`, `warn!` and `error!` all work because every `#[hdk_extern]` registers a wasm-capable tracing subscriber. Spans do not: applying `#[instrument]` to a zome function will likely panic the wasm. Serialization failures between host and guest are already traced as `error!` without you doing anything.

## Finding the conductor

```bash
hc sandbox list                # sandboxes in $(pwd)/.hc, with indices
hc sandbox list --verbose
hc sandbox admin-ports         # JSON array of admin ports, for scripting
```

`admin-ports` exists precisely to feed `hc-client`:

```bash
PORT=$(hc sandbox admin-ports | jq -r '.[0]')
```

## Inspecting state with `hc-client call`

Every subcommand maps to one admin API request. Pass the admin port with `--port`, and `--origin` if the interface restricts origins.

```bash
hc-client call --port $PORT list-apps
hc-client call --port $PORT dump-state --help
```

| Subcommand | Answers |
|---|---|
| `list-apps`, `list-cells`, `list-dnas`, `list-app-ws` | What is installed and running |
| `dump-state` | State for one cell |
| `dump-full-state` | Everything, including the source chain. Large |
| `dump-conductor-state` | Conductor-level state, not per cell |
| `dump-op-timings` | How long ops took. Start here for "why is this slow" |
| `dump-network-stats` | Transport-level connection figures |
| `dump-network-metrics` | Kitsune2 metrics, per space |
| `list-agents` | Peers this conductor knows about |
| `peer-meta-info` | What this conductor records about one peer |
| `list-capability-grants` | Grants currently in force for a cell |
| `revoke-zome-call-capability` | Remove one |
| `add-agents` | Inject agent info, for offline or test networks |
| `install-app`, `uninstall-app`, `enable-app`, `disable-app`, `new-agent` | Lifecycle, by hand |
| `add-admin-ws`, `add-app-ws` | Attach interfaces at runtime |

`add-app-ws` takes an optional app id, and the restriction it applies is worth knowing: if provided, only apps holding an authentication token issued for that same app id may connect to that interface. See the token flow in `client.md`.

### The three questions and where to look

**"Did my write land?"** `dump-state` for the cell, then `get_validation_receipts` from inside the zome for per-action confirmation. See `source-chain.md`.

**"Why can't these two agents see each other?"** `list-agents` on both conductors. If each knows only itself, that is bootstrap, not gossip: check `bootstrap_url` and whether both are on the same `network_seed`. If they know each other and data still is not moving, look at `dump-network-metrics` and `dump-op-timings`. See `networking.md`.

**"Why is this call refused?"** `list-capability-grants` for the cell, then compare against what the caller presented. See `access-control.md`.

## Calling a zome function by hand

Two steps, because zome calls must be signed:

```bash
# 1. Mint signing credentials and grant the capability. `app_id` is positional.
hc-client zome-call-auth --port $PORT my-app

# 2. Call. All five of app_id, dna_hash, zome, function and payload are
#    positional, in that order. Payload is JSON.
hc-client zome-call --port $PORT \
  my-app \
  uhC0k... \
  posts \
  get_all_posts \
  'null'
```

`zome-call-auth` generates signing credentials and grants the capability; `zome-call` uses them. Payload is JSON. Both read the passphrase interactively unless you pass `--piped`, which reads it from stdin instead. That is the flag a script needs.

This is the fastest way to isolate whether a bug is in the zome or in the UI: if `hc-client zome-call` returns the right answer, the zome is fine.

## Network diagnostics from TypeScript

The same figures are reachable from a client, which is often more convenient inside a UI:

```typescript
const stats = await client.dumpNetworkStats();
const connected = stats.transport_stats.connections.length;
const direct = stats.transport_stats.connections.filter((c) => c.is_direct).length;
```

A healthy small network has most connections `is_direct`. A network where everything is relayed still works, and will be slower and more dependent on the relay staying up. See `client.md` for the full type.

## Reading gossip behaviour over time

For a problem that only appears after minutes, per-call dumps are the wrong instrument. Turn on Kitsune2 reporting in the conductor config instead:

```yaml
network:
  report:
    json_lines:
      days_retained: 7
      fetched_op_interval_s: 60
```

Then read the resulting JSON lines rather than trying to catch the moment live. Details in `networking.md`.

## Test-time debugging

Sweettest failures have their own tools, and they are usually the faster path: a two-agent test that reproduces the bug beats any amount of conductor archaeology. `RUST_LOG` and `WASM_LOG` both apply to Sweettest runs. See `testing.md`.

## Related

- `troubleshooting.md` when you have a literal error string
- `networking.md` for what the network figures mean
- `client.md` for the admin and app API from TypeScript
- `source-chain.md` for in-zome introspection and validation receipts
