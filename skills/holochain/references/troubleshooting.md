# Troubleshooting

Keyed on the literal text the compiler, conductor or CLI prints. Search this page for the error you actually saw.

Entries marked **(verified)** were reproduced on Holochain 0.7.0 while building this skill's example hApp. The rest are drawn from the official 0.6 to 0.7 upgrade guide and the release CHANGELOG.

---

## Build and compile

| Error text | Cause | Fix |
|---|---|---|
| `The wasm32-unknown-unknown targets are not supported by default; you may need to enable the "wasm_js" configuration flag` **(verified)** | Building zomes without the getrandom backend flag. The error names `getrandom`, not Holochain, so it reads like a dependency problem | `RUSTFLAGS='--cfg getrandom_backend="custom"' cargo build --release --target wasm32-unknown-unknown`. `npm run build:zomes` sets this for you |
| `cannot find type EntryCreationAction in this scope` | 0.6 code on 0.7 | `TypedAction<EntryCreationData>`. See `patterns.md` |
| `error[E0599]` naming `StoreEntry` as not found on `FlatOp` | 0.6 FlatOp names | `CreateEntry`. Full rename table in `patterns.md` |
| `no variant named RegisterCreateLink` / `RegisterDeleteLink` | Both folded into one variant in 0.7 | `FlatOp::Link(OpLink::CreateLink { .. })` |
| `no method named author found` on an action struct | The per-variant action structs are gone | `action.author()`, or `action.header.author`. Accessors exist on both `Action` and `TypedAction<D>` |
| `cannot move out of dereference` on a `TypedAction` field | `TypedAction<D>` derefs to its data; you cannot move through a deref | Use `.data` explicitly: `action.data.target_address.into_action_hash()` |
| `error[E0603]` saying `Action` is private, on `use holochain_zome_types::action::Action` | Crate-root and module re-exports were removed in 0.7: the `action` module only imports `Action` privately from `holochain_integrity_types` | Import from a prelude: `holochain_zome_types::prelude::Action`. Zomes importing only `hdi::prelude` / `hdk::prelude` are unaffected |
| `feature sqlite-encrypted does not exist` | Renamed in 0.7 | `encryption` |
| `feature wasmer_sys does not exist` | Renamed in 0.7 | `wasmer-sys-cranelift` |
| `feature transport-iroh does not exist` | Removed; iroh is compiled in unconditionally | Drop it from the feature list |
| Build fails looking for `perl` | A holochain build dependency needs it on PATH, usually surfacing only when building a Sweettest suite | Add `perl` to the `packages` list in `flake.nix` |
| `non-exhaustive patterns: AdminRequest::DumpOpTimings { .. } not covered`, raised **inside the `holochain` crate itself** **(verified)** | Version skew: the `holochain` crate is pinned to a `0.7.0-rc` (rc.0 to rc.4; the variant first appears in rc.5) while `holochain_conductor_api` resolves to stable `0.7.0`, which has the `DumpOpTimings` variant that rc does not handle. `hc scaffold` 0.700.0-rc emits exactly this combination | Pin `holochain` to stable `0.7.1` in `[workspace.dependencies]`, then `cargo update -p holochain`. Never leave the scaffolder's rc pins in place |
| `error[E0027]` on `OpActivity::CreateAgent { ref action }`, the pattern not mentioning field `agent` **(verified)** | **Scaffolder output does not compile against stable 0.7.1.** `hc scaffold` 0.700.0-rc generates `ref create @ OpActivity::CreateAgent { ref action }` plus `create.agent()`, which matches the rc crates. Stable hdi 0.8.1 carries `agent` as a plain field, as the official upgrade guide documents | Match the field directly: `OpActivity::CreateAgent { agent, action } => { ... }` and drop the `create.agent()` block. `assets/templates/integrity-lib.rs` is already corrected |

---

## Scaffolding

### First, check which scaffolder you are running

```
hc scaffold --version
```

Holonix `main-0.7` bundles **`holochain_scaffolding_cli 0.700.1`** since 2026-10-23 (holonix commit `3ae9130`; verified 2026-11-07 by scaffolding a web app, a DNA, a zome and a CRUD entry type with it under holonix rev `a6cdfbd`). It emits `holonix?ref=main-0.7`, `nodejs_24`, `hdi =0.8.1`, `hdk =0.7.1`, `holochain 0.7.1`, `@holochain/client ^0.21.1` and `@holochain/hc-spin ^0.700.1`, so nothing needs re-pinning, and its generated entry-type code is the same as v0.700.0's.

A project whose `flake.lock` pins a holonix older than that still gets **`0.700.0-rc.0`**, and hits the rc block below. Update the lock rather than fixing the output by hand:

```
nix flake update holonix && nix develop
hc scaffold --version   # holochain_scaffolding_cli 0.700.1
```

Outside holonix, run the stable one directly:

```
nix run github:holochain/scaffolding/v0.700.1 -- web-app my-app
# or, once:
cargo install holochain_scaffolding_cli --version 0.700.1 --locked
```

The previous stable, v0.700.0 (2026-07-31), predates Holochain 0.7.1 and emits `hdi 0.8.0` / `hdk 0.7.0` / `holochain 0.7.0`: re-pin to `=0.8.1` / `=0.7.1` / `0.7.1` and `@holochain/client` `^0.21.1` after scaffolding, as in Step 4 of the Scaffold workflow.

### Applies to every scaffolder version

| Symptom | Cause | Fix |
|---|---|---|
| `Integrity zome "<name>" was not found in dna "<dna>"` **(verified)** | `--zome` takes the integrity crate's **package** name, not the directory name. `hc scaffold zome posts` creates directory `posts` with package `posts_integrity` | Pass `--zome posts_integrity` |
| `hc: command not found` inside `nix develop` | Wrong holonix branch, or the shell did not rebuild | Check the `ref` in `flake.nix`, then `nix flake update && nix develop` |

### Applies to `hc-scaffold 0.700.0-rc.0` only (holonix locked before 2026-10-23)

Fixed in stable v0.700.0 and v0.700.1. If you are on stable and see one of these, something else is wrong.

| Symptom | Cause | Fix |
|---|---|---|
| Scaffolded `flake.nix` says `ref=main` **(verified)** | The rc emits `main`, and holonix `main` tracks the 0.8 dev line | Change to `ref=main-0.7` after scaffolding, then `nix flake update` |
| Scaffolded `flake.nix` says `nodejs_22` **(verified)** | Same stale template | Change to `nodejs_24` | <!-- legacy-ok -->
| Scaffolded `Cargo.toml` pins `-rc` crates **(verified)** | The scaffolding CLI is itself an rc and pins its own generation | Pin stable: `hdi = "=0.8.1"`, `hdk = "=0.7.1"`, `holochain = "0.7.1"` |

---

## Conductor startup

| Error / symptom | Cause | Fix |
|---|---|---|
| Conductor exits immediately after a 0.7 upgrade | `NetworkConfig` rejects unknown fields rather than ignoring them | Remove `signal_url` and `webrtc_config`. Move `request_timeout_s` under `network`. Rename `db_sync_strategy` to `db_sync_level` (`Full`/`Normal`/`Off`; old `Resilient` maps to `Normal`, `Fast` to `Off`). Remove `chc_url` |
| Conductor cannot read existing databases | 0.7 renamed its databases and there is no migration path | `hc sandbox clean`. Expected, not a bug |
| Peers never connect after upgrading | DNA hashes changed in 0.7 even for otherwise identical DNAs, so you are on a new network | Everyone must be on the same build. Republish the DNA hash to your users |
| `hc sandbox` rejects the network type | Only `mem` and `quic` remain; `webrtc` is gone with tx5 | Update scripts passing `webrtc` |
| App manifest rejected for an unrecognised field | App and web-app manifests now reject unknown fields | Remove stray or misspelled keys. `manifest_version` is `'0'` |

---

## Validation

| Symptom | Cause | Fix |
|---|---|---|
| Validation passes locally, fails for other agents | Non-deterministic validation: a `get()` or `get_links()` in a coordinator helper called from validation, `agent_info()`, `sys_time()`, or `get_init_properties()` | Validation may only inspect the op and what `must_get_*` returns. See `patterns.md` |
| A progenitor check works for the installer and nobody else | Reading `init_properties` instead of `modifiers.properties`. Init properties are conductor-local and invisible to other peers | Use `dna_info().modifiers.properties`. See `progenitor.md` |
| An entry fails to deserialize after a schema change | A field was added without `#[serde(default)]` | `Option<T>` alone is not sufficient. Add `#[serde(default)]` |
| `WrongActionError` from a narrowing conversion | The action was not the variant sys validation guarantees | Propagate with `?`, do not return `Invalid`. It is a fault, not bad author data |

---

## Testing

| Symptom | Cause | Fix |
|---|---|---|
| Cross-agent read returns `None` intermittently | Missing consistency wait | `await_consistency([&alice_cell, &bob_cell]).await.unwrap()` before every cross-agent read. `await_consistency_s(n, ..)` for a custom timeout |
| Suites over roughly 8 tests hang or flake | Too many in-process conductors at once | `cargo test -- --test-threads 6` |
| `Conductor::install_app_with_manifest` not found | On `Conductor` it is `pub(crate)` and `test_utils`-gated in 0.7, so test code cannot reach it | Call `SweetConductor::install_app_with_manifest` instead (public, in `holochain::sweettest`, which needs the `test_utils` feature) |
| `mock_network` not found | Removed from `holochain_p2p` in 0.7 | Use `test_utils` directly |
| Inline zome tests fail to compile | Inline zome definitions are no longer embedded in `DnaDef`; closures live on `DnaFile`, and `InlineZome::uuid` became `InlineZome::hash` | Rework against the 0.7 inline zome API |

---

## Capability grants and client versions (0.7.1)

| Error / symptom | Cause | Fix |
|---|---|---|
| `error[E0422]` naming `ZomeCallCapGrant` as not found in scope **(verified)** | The type was renamed in 0.7.1 to `CapGrant`, and the grant is now `{ tag, constraint, capability }`. This breaks a project still pinned `=0.7.0` as soon as the lockfile is regenerated, because `hdk =0.7.0` depends on `holochain_zome_types ^0.7.0` and resolves the 0.7.1 types | Build the grant with `CapGrant::new_zome_call_grant(tag, constraint, functions)`. See `access-control.md` |
| `error[E0599]` saying there is no variant `Unrestricted` (or `Transferable`, `Assigned`) on `CapAccess` **(verified)** | In 0.7.1 `CapAccess` is a different enum (`ChainAuthor` / `RemoteAgent`); the three-tier enum is now `GrantConstraint` | Use `GrantConstraint::Unrestricted`, `::Transferable { secret }` or `::Assigned { secret, assignees }` |
| Remote calls to a function you granted under 0.7.0 stop being authorised after moving to 0.7.1 | Grants committed under 0.7.0 use the old shape and must be re-issued (the 0.7.1 CHANGELOG says so; the exact conductor message is not recorded here) | Create the grants again with the new shape; `init()` only runs once per cell, so use a coordinator call or a fresh cell |
| Direct signals never reach the receiver | Receiving a direct signal needs an explicit `Capability::DirectSignal` grant; a zome-call grant does not cover it | `CapGrant::new_direct_signal_grant`, or `grantDirectSignalCapability` from the client |
| Client calls fail or types do not match against a 0.7 conductor after installing `@holochain/client@0.22` | `@holochain/client` 0.22.x targets an unreleased Holochain and renames wire types, so it is not for 0.7. A bare `npm install @holochain/client` gets the `latest` dist-tag, 0.21.1; 0.22 arrives only through an explicit version or range. The mismatch is the client line, not your code | Run `npm ls @holochain/client`. If it shows 0.22.x, install `@holochain/client@^0.21.1` and clear the lockfile entry. See `client.md` <!-- legacy-ok --> |

---

## Deployment

| Symptom | Cause | Fix |
|---|---|---|
| Kangaroo build uses the wrong conductor | Cloned the default branch | `git checkout main-0.7`. `main-0.7` bundles holochain 0.7.1 since 2026-10-22 (read `holochainVersion` in its `kangaroo.config.ts`); `main-0.6` pins 0.6.3 |
| App will not start after a version bump | Kangaroo isolates data folders on minor and major bumps by design | Expected. Only patch bumps share a data folder |

See also `deployment.md`, `testing.md` and `scaffolding.md`, which point here rather than repeating these tables.
