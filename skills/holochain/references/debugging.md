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
    type: json_lines
    days_retained: 7
    fetched_op_interval_s: 60
```

Then read the resulting JSON lines rather than trying to catch the moment live. Details in `networking.md`.

## Observing a live dev network

A scaffolded `npm start` / `bun start` runs `hc-spin`, which starts a local `kitsune2-bootstrap-srv` (bootstrap and relay on the same `127.0.0.1` port), then runs `hc sandbox generate --run` for each agent against it. Everything below reads what that run leaves on disk or exposes over HTTP. None of it launches anything, which matters when the project's own rules forbid an agent from starting the app.

Observed on `holochain 0.7.0`, `hc 0.7.0` and `kitsune2-bootstrap-srv 0.5.0`, running the same two-agent `hc sandbox generate --run` against a local bootstrap server that `hc-spin 0.700.0` issues; commands and output shapes below are from that run.

### Read-only probes, cheapest first

| Probe | Answers |
|---|---|
| `.hc` in the directory the run started from | One line per sandbox directory. The directories live under `$TMPDIR`, not in the repo |
| `.hc_live_<n>` beside it | The admin port of running sandbox `<n>`, one number per file. Present only while that conductor runs |
| `<sandbox>/conductor-config.yaml`, `network:` block | `bootstrap_url`, `relay_url`, `target_arc_factor`. Settles "are they even on the same network" |
| `<sandbox>/databases/` | One `dht-<DnaHash>.db` and one `p2p-peer-meta-<DnaHash>.db` per installed DNA. Comparing two agents' listings answers "did they get the same DNA" with no tooling |
| `hc-client call --port $(cat .hc_live_0) list-agents` | Peers this conductor knows, each with `dna_hash` and `k2_space` (the space id the bootstrap server wants, see below) |
| `hc-client call --port $(cat .hc_live_0) dump-network-metrics` | Per DNA: `local_agents[].storage_arc` and `target_arc`, and per peer `storage_arc`, `completed_rounds`, `peer_timeouts` |

The bootstrap port is in `bootstrap_url`, and `hc-spin` also prints it on startup in a line containing `#kitsune2_bootstrap_srv#listening#127.0.0.1:<port>#`.

### The bootstrap server's HTTP API

The local bootstrap server answers plain HTTP, so it can be asked who has registered without touching either conductor:

```bash
curl -s http://127.0.0.1:$BOOT_PORT/health            # {} when up
curl -s http://127.0.0.1:$BOOT_PORT/bootstrap/$SPACE  # registered agent infos for one space
```

`/bootstrap/<space>` returns a JSON array of `{ "agentInfo": "<JSON string>", "signature": ... }`. `agentInfo` is itself JSON; parse it to read `agent`, `space`, `createdAt`, `expiresAt`, `url` and `storageArc`.

**The space id is not the DNA hash.** A Holochain hash such as `uhC0k…` is `u` plus 52 base64url characters, which decode to 39 bytes: a 3-byte type prefix, the 32-byte core, and a 4-byte location suffix. The space id is the 32-byte core alone, base64url-encoded **without padding**, 43 characters. Both wrong forms fail with a 400 that reads like a broken server:

| Sent | Response |
|---|---|
| The full DNA hash | `400 Invalid input length: 53` |
| The core with `=` padding | `400 Invalid padding` |
| The core, unpadded | `200` and the agent infos |

Easiest source of the right value is `k2_space` in `hc-client call list-agents`. To derive it by hand:

```bash
python3 -c 'import base64,sys; h=sys.argv[1][1:]; print(base64.urlsafe_b64encode(base64.urlsafe_b64decode(h+"="*(-len(h)%4))[3:35]).decode().rstrip("="))' uhC0k...
```

### `storageArc`: why two agents ignore each other at first

`storageArc` is the slice of the DHT an agent claims to store and serve. `null` is `DhtArc::Empty`, the default (`kitsune2_api`, `src/arc.rs`): the agent holds nothing for anyone yet. `[0, 4294967295]` is the full arc.

An agent's arc only grows after a gossip round with a peer reports its sectors as in sync (`update_storage_arcs` in `kitsune2_gossip`, `src/storage_arc.rs`). So on a fresh network **every agent starts at zero arc**, and cross-agent reads can come back empty until gossip has run. In the two-agent run above both agents registered with `"storageArc": null` and republished with the full arc about 105 seconds later; another 0.7 dev run saw 195 seconds. Expect a minute or more, not an instant.

That window is a recurring dev-mode surprise: a cross-agent read that returns nothing in the first minutes of `npm start` is usually this, not a bug in the zome. Check `storageArc` (bootstrap) or `storage_arc` (`dump-network-metrics`) before debugging the code.

### The Holochain Playground (`hc playground`)

A browser view of conductors: source chains per agent, DHT entries with their actions. It is **not** part of holonix `main-0.7`. The 0.6 upgrade guide removed `hc playground` from scaffolded scripts, and holonix dropped the package on `main-0.6` when it moved to Holochain 0.6.1-rc.0 (commit `7b46630`, "remove playground from nix flake"). The last commit there that still builds it is `2fec8bf` (`hc-playground 0.500.0`, from `darksoil-studio/holochain-playground`). Some 0.7 projects still pin that commit as an extra flake input and run `hc playground` alongside `hc-spin`; check the project's `flake.nix` and `package.json` before assuming it is there.

When it is running:

- **Finding it.** It serves `http://localhost:8282`, or another free port if 8282 is taken; `SERVER_PORT` overrides. `ps -eo pid,args | grep playground` finds the process and `ss -tlnp | grep 8282` the port; its startup log line `App is running at http://localhost:<port>` names the port it actually took.
- **Connecting it.** It reads every `.hc_live_*` file in its working directory each second and connects to those admin ports, so start it from the directory holding `.hc`. Passing `ws://localhost:<admin port>` URLs as arguments overrides the discovery.
- **What not to trust.** Its package version is 0.500.0, two Holochain lines behind. On a 0.7 run its Dht Entries graph has been seen to show entries and actions but no links, although the code draws links as edges, so "not in the graph" never means "did not happen". Confirm with `dump-state` or a zome call.
- **Driving it from an agent.** Its views are Lit web components rendered in shadow DOM, so text extraction and accessibility-tree reads come back empty. Take screenshots, or skip the playground and use the admin probes above.

## Test-time debugging

Sweettest failures have their own tools, and they are usually the faster path: a two-agent test that reproduces the bug beats any amount of conductor archaeology. `RUST_LOG` and `WASM_LOG` both apply to Sweettest runs. See `testing.md`.

## Related

- `troubleshooting.md` when you have a literal error string
- `networking.md` for what the network figures mean
- `client.md` for the admin and app API from TypeScript
- `source-chain.md` for in-zome introspection and validation receipts
