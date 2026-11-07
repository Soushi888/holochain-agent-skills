# Networking and Conductor Configuration (0.7)

Everything here is read from `holochain_conductor_api 0.7.0` (`src/config/conductor.rs`, byte-identical in 0.7.1), `holochain_p2p 0.7.1` (`Cargo.toml`) and `kitsune2_bootstrap_srv 0.5.0`. If a field is not listed here, check those sources rather than guessing: `ConductorConfig` is `#[serde(deny_unknown_fields)]`, so an invented key is a startup error, not a silent no-op.

## What changed in 0.7

The whole transport layer was replaced.

| 0.6 | 0.7 |
|---|---|
| tx5 / WebRTC transport, optional `transport-iroh` feature | iroh over QUIC, unconditional. `grep tx5 holochain_p2p/Cargo.toml` returns nothing |
| `signal_url` pointing at an SBD signal server | `relay_url` pointing at an iroh relay |
| `webrtc_config` | gone. Use `advanced` for direct Kitsune2 tuning |
| `transport-iroh` cargo feature on the `holochain` crate | removed. `holochain_p2p` enables `kitsune2/transport-iroh` and `iroh-relay` itself |

Kitsune2 is on the `0.5` line. `holochain_p2p 0.7.1` requires `^0.5.1` for `kitsune2`, `kitsune2_api`, `kitsune2_core`, `kitsune2_transport_iroh` and `kitsune2_bootstrap_srv`, and a fresh lockfile resolves `0.5.2` (the example hApp's). The 0.7.0 line pinned `0.5.0`.

Client-side, the per-connection flag is `is_direct`. It replaced `is_webrtc` in `kitsune2_api 0.4` (the Holochain 0.6.1 line), so only code written against 0.6.0 still reads `is_webrtc`. See `client.md`.

## Minimal conductor config

This is the example from the `holochain_conductor_api` module documentation, unedited:

```yaml
---
## Configure the keystore to be used.
keystore:
  ## Use an in-process keystore with default database location.
  type: lair_server_in_proc

## Configure an admin WebSocket interface at a specific port.
admin_interfaces:
  - driver:
      type: websocket
      port: 1234
      allowed_origins: "*"

## Configure the network.
network:
  ## Use the Holochain-provided dev-test bootstrap server.
  bootstrap_url: https://dev-test-bootstrap2.holochain.org

  ## Use the iroh relay server.
  relay_url: https://use1-1.relay.n0.iroh-canary.iroh.link./
```

`allowed_origins` is not optional and not defaulted. A browser UI that gets no response from the admin or app port is usually being rejected on origin, not on port.

## `NetworkConfig`, field by field

Serialized under `network:` in `conductor-config.yaml`, `snake_case`, unknown fields rejected.

| Field | Type | Default | What it does |
|---|---|---|---|
| `bootstrap_url` | URL | `https://dev-test-bootstrap2.holochain.org` | The Kitsune2 bootstrap server used for WAN peer discovery |
| `relay_url` | URL | `https://use1-1.relay.n0.iroh-canary.iroh.link./` | The iroh relay used when a direct connection cannot be established |
| `base64_auth_material_bootstrap` | `Option<String>` | none | Auth material if your bootstrap service requires it. Base64 url-safe, no padding |
| `base64_auth_material_relay` | `Option<String>` | none | Same, for the relay service |
| `request_timeout_s` | `u64` | `60` | Request/response roundtrip timeout, in seconds |
| `target_arc_factor` | `u32` | `1` | Multiplier applied to arc-size hints from Kitsune2 |
| `report` | `ReportConfig` | `None` | Kitsune2 reporting output |
| `advanced` | `Option<JSON>` | none | Raw Kitsune2 module config. `bootstrap_url`, `relay_url` and `request_timeout_s` are merged into it at startup; the other fields above are not |

### "Default" here means the Rust `Default` impl, not a serde default

`bootstrap_url` and `relay_url` are the two fields in the table with no `#[serde(default)]`. The distinction matters when you hand-write `conductor-config.yaml`:

- Omit the whole `network:` block and you get every value in the table, because `ConductorConfig` marks the field `#[serde(default)]` and falls back to `NetworkConfig::default()`.
- Write a partial `network:` block that sets, say, only `request_timeout_s`, and startup fails with `missing field bootstrap_url`. Once the key is present, both URLs are required.

So a `network:` block is all-or-nothing on those two. Every other field in the table is individually optional.

### The two defaults you should not ship with

`dev-test-bootstrap2.holochain.org` is named "dev-test" for a reason, and the default relay is an iroh **canary** host. Both are fine for development and neither is a production commitment by anyone. A hApp you distribute should point at infrastructure you or your community controls. See "Running your own bootstrap server" below.

### `request_timeout_s` sets two timeouts, not one

Setting it derives one more value, in `NetworkConfig::to_k2_config`:

```
request_timeout_s              = 60   (what you set)
direct-connection attempt      = 22   floor(3/8 of request_timeout_s), irohTransport.connectTimeoutS, before falling back to relay
```

So halving the request timeout also halves how long a peer waits before giving up on a direct connection and paying the relay's latency. Tune it as one number with two consequences.

The 0.7 doc comment on the field still lists a third value, a "single transport message" timeout at floor(1/2), and calls the second the "webrtc connection" timeout. Both are leftover wording from the tx5 era: 0.6 wrote the 1/2 value to `tx5Transport.timeoutS`, and 0.7's `to_k2_config` sets no such key. The mechanism behind the 3/8 value is iroh's direct-path attempt before relay fallback.

### `target_arc_factor` and leecher nodes

`1` is normal operation: honour Kitsune2's arc-size hints as given. Set it to `0` for a node that should not contribute to gossip at all, which the field documentation calls a "leecher node".

A zero-arc node still reads from the DHT, but it stores nothing on behalf of the network. That is a legitimate configuration for a mobile or ephemeral client, and a bad one for the majority of a network's nodes: if everyone leeches, nobody holds the data.

### `report`

```yaml
network:
  report:
    json_lines:
      days_retained: 7
      fetched_op_interval_s: 60
```

`ReportConfig` is an externally tagged enum (no `type:` key): the variant name is the key, and its fields nest under it. Two variants only: `None` (the default, no reporting) and `JsonLines { days_retained, fetched_op_interval_s }`. Useful when diagnosing gossip behaviour over hours rather than seconds.

### `advanced`

Direct Kitsune2 module configuration, as raw JSON. The named fields above are merged into it at startup: `bootstrap_url` becomes the `serverUrl` key of the `coreBootstrap` module, `relay_url` becomes `irohTransport.relayUrl`, and `request_timeout_s` sets `irohTransport.connectTimeoutS`. Anything you set directly in `advanced` for the same key is what the named field overwrites, so do not set both.

Use it only when you know which Kitsune2 module you are configuring. Module names seen in the 0.7 sources include `k2Gossip` (with keys like `initiateIntervalMs`) and the bootstrap module's `serverUrl`.

## Test-only network switches

`disable_bootstrap`, `disable_publish` and `disable_gossip` exist on `NetworkConfig` but are gated behind the `test-utils` cargo feature. They are how Sweettest builds isolated networks. They are not available on a stock conductor binary, and a config file naming them will fail to parse.

## Running your own bootstrap server

The server is a standalone binary, `kitsune2-bootstrap-srv`, shipped by the `kitsune2_bootstrap_srv` crate (`0.5.1` or later for the 0.7.1 line, which requires `^0.5.1`). The holonix `main-0.7` default devShell already ships it, built from kitsune2 `v0.5.2`, so inside `nix develop` no install is needed.

```
cargo install kitsune2_bootstrap_srv --version 0.5.2 --locked
kitsune2-bootstrap-srv --production --listen 0.0.0.0:443 --tls-cert cert.pem --tls-key key.pem
```

It runs in a **testing** configuration by default, with deliberately light resource settings, and switches to production settings only with `--production`:

| Setting | Testing | Production |
|---|---|---|
| `--listen` | `127.0.0.1:0` | `0.0.0.0:443` and `[::]:443` |
| `--worker-thread-count` | 2 | 4 x cpu count |
| `--request-listen-duration-ms` | 10ms | 2s |
| `--prune-interval-ms` | 10s | 60s |
| `--max-entries-per-space` | 32 | 32 |

`--tls-cert` and `--tls-key` require each other, both PEM encoded. `--allowed-origins` defaults to allowing any origin. `--json` switches tracing output to JSON.

A bootstrap server holds nothing but agent info: it is how peers find each other, not where data lives. Losing it partitions new joiners, not existing peers who already know each other.

The relay is a separate protocol, but not necessarily a separate server: `kitsune2_bootstrap_srv` 0.5 builds with its default `iroh-relay` feature and serves an iroh relay on the `/relay` route of the same listener (the library's `no_relay_server` config turns it off). Holochain uses iroh's relay protocol, so any iroh relay will do, including that one.

## Other conductor config fields worth knowing

From `ConductorConfig` in the same file:

| Field | Note |
|---|---|
| `data_root_path` | Databases and compiled wasm live under here. Required by the time the config builds a conductor |
| `keystore` | `lair_server_in_proc` for a self-contained conductor, or a separate lair server |
| `admin_interfaces` | A list of `{ driver: { type: websocket, port, allowed_origins } }`. Omit in production if nothing should manage the conductor remotely |
| `wasm_backend` | Only needed when more than one wasm backend is compiled in |
| `db_sync_level` | SQLite `PRAGMA synchronous`. Leave alone unless you have measured a reason |
| `db_max_readers` | Defaults to twice the CPU count, minimum 8. Related to the authority-response concurrency limit; change both or neither |
| `tracing_override` | Overrides the environment tracing config. See `debugging.md` |

## Related

- `debugging.md` for reading what the network is actually doing at runtime
- `client.md` for `dumpNetworkStats` and `dumpNetworkMetrics` from TypeScript
- `deployment.md` for wiring these values into a Kangaroo build
