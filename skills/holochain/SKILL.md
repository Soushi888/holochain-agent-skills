---
name: holochain
description: >
  Holochain hApp development assistant covering coordinator/integrity zome
  architecture, Rust HDK/HDI patterns, entry/link types, CRUD, validation,
  cross-zome calls, Sweettest testing, TypeScript client integration, DNA
  migration and init properties, and Nix dev environments. USE WHEN writing zome code, designing DHT data models,
  scaffolding a new project, testing hApps, debugging HDK issues, implementing
  entry types or links, cap grants, access control, membrane proofs, cell cloning,
  configuring bootstrap and relay servers, deploying or packaging hApps,
  upgrading a hApp to Holochain 0.7, migrating DNA data, inspecting a running
  conductor, troubleshooting a Holochain error, or working on any Holochain project.
license: Apache-2.0
compatibility: >
  Requires Nix dev environment (holonix ref=main-0.7). Rust toolchain managed
  by Nix — no separate rustup install needed. Network access required for
  hc scaffold and nix flake updates.
metadata:
  author: soushi888
  version: "1.0.0-rc.1"
  holochain-versions: "hdk=0.7.0, hdi=0.8.0, holonix ref=main-0.7"
---

# Holochain Development Skill

Expert assistant for Holochain hApp development. Covers the full development spiral: architecture, design, scaffolding, implementation, testing, and deployment.

## Proactive Invocation Rule

**Always invoke this skill in the PLAN phase** when the task touches a Holochain project. Do not wait to be asked explicitly.

Trigger conditions — any of these means the skill should be loaded before coding begins:
- Working directory is a Holochain project (contains `workdir/*.happ` or `dnas/*/zomes/`)
- Task involves `.rs` files inside `zomes/coordinator/` or `zomes/integrity/`
- Task involves entry types, link types, cross-DNA calls, or zome functions
- Task involves a PR on a Holochain project

When proactively invoked: load `references/architecture.md` + `references/patterns.md`, run the **ReviewZome** checklist against any files being modified, surface issues before implementation begins.

---

## Workflow Routing

| Workflow | Trigger | File |
|----------|---------|------|
| **ReviewZome** | review zome, audit zome, check implementation, validate patterns, before implementing, PR review, pull request, sanity check, double-check, code review on zome | `references/workflows/review-zome.md` |
| **DesignDataModel** | design data model, model entries, what entries, what links, entry vs link, DHT schema, DHT shape | `references/workflows/design-data-model.md` |
| **Scaffold** | scaffold, new happ, new project, setup environment, init project, Holonix, nix develop, hc scaffold | `references/workflows/scaffold.md` |
| **ManualScaffold** | project files, scaffold without CLI, manual scaffold, by hand, AI creates files, no hc scaffold, scaffold in session | `references/workflows/manual-scaffold.md` |
| **ImplementZome** | implement zome, create zome, scaffold zome, write zome, full zome, CRUD zome, coordinator and integrity crates | `references/workflows/implement-zome.md` |
| **DesignAccessControl** | design access control, who can call, allowed to call, cap grant design, capability grants | `references/workflows/design-access-control.md` |
| **UpgradeHolochain07** | upgrade to 0.7, port from 0.6, migrate hApp, holochain 0.7 upgrade, upgrade holochain version, bring up to date, move to the latest holochain, hdi upgrade | `references/workflows/upgrade-holochain-0.7.md` |
| **PackageAndDeploy** | deploy, package, distribute, distribution, kangaroo, installer, desktop app, webhapp | `references/workflows/package-and-deploy.md` |

## Context Files

Load on demand based on task:

| File | Load When |
|------|-----------|
| `references/architecture.md` | Coordinator/integrity split, coordinator and integrity, DNA structure, Cargo workspace, Nix, dna_info, network_seed, private entries, multi-DNA (multiple roles, bridge call, OtherRole, cross-DNA call) |
| `references/progenitor.md` | Progenitor pattern, founder of the network, DnaProperties struct, check_if_progenitor, bootstrap mode, coordinator guard, integrity enforcement (Moss pattern), auto-registration in create_user, deploy-time injection (dna.yaml / Sweettest / Kangaroo / Moss) |
| `references/scaffolding.md` | New project setup, Holonix installation, Nix flake, hc CLI, `hc scaffold` commands, new domain, adding a new domain to existing project |
| `references/patterns.md` | Entry types, link types, CRUD, cross-zome calls, validation (`FlatOp`, `TypedAction<D>`), HDK 0.7 get/link API (`GetStrategy`, `LinkQuery`, `GetOptions`, get_links), update chain, `ZomeCallResponse` variants (NetworkError, Unauthorized), warrants and chain forks, must_get, signals (remote signal, init cap grant) |
| `references/access-control.md` | Cap grants, capability grants, capability system, cap claim, remote signal, recv_remote_signal setup, admin-only access |
| `references/cryptography.md` | App-level signing and encryption: `sign`, `sign_ephemeral`, `verify_signature` in validation, secretbox vs box, `create_x25519_keypair`, encrypting to an AgentPubKey, and what encryption does not buy you |
| `references/scheduling.md` | Scheduled functions, `schedule()`, `Schedule::Persisted` crontab vs `Schedule::Ephemeral`, `#[hdk_extern(infallible)]`, scheduler loop timing, why scheduled fns run as the chain author |
| `references/countersigning.md` | Countersigning, atomic multi-agent commits, `PreflightRequest`, `accept_countersigning_preflight_request`, session times, enzymatic sessions, M of N optional signers, `unstable-countersigning` feature gate |
| `references/cell-cloning.md` | Cell cloning, partitioned data, own copy of the DNA, clone roles, createCloneCell, clone_limit |
| `references/error-handling.md` | Error types, WasmError, ExternResult, extern result patterns, thiserror |
| `references/testing.md` | Four-layer strategy, Sweettest (Rust-native), two agents, await_consistency, E2E Playwright + AdminWebsocket, Wind-Tunnel performance |
| `references/wind-tunnel.md` | Performance/load testing with wind-tunnel: ScenarioDefinitionBuilder, call_zome, ReportMetric, multi-agent roles, sync lag, DHT sync lag measurement, load testing, InfluxDB metrics pipeline |
| `references/client.md` | holochain-client setup, callZome, signals, SvelteKit integration |
| `references/troubleshooting.md` | **Any literal error string** from the compiler, conductor, `hc` CLI or a test, keyed on the text you actually saw. Check here first when something fails. Build and compile errors, cannot find type, no variant named, unresolved import, feature does not exist, `hc scaffold` errors, integrity zome, scaffolder rc pins, conductor startup, peers never connect, validation passes locally but fails for other agents, test failures, deployment and data reset symptoms |
| `references/networking.md` | Kitsune2 and iroh transport, conductor `NetworkConfig`, `bootstrap_url`, `relay_url`, running your own bootstrap server, arc factor and leecher nodes, request timeouts, gossip reporting |
| `references/debugging.md` | Nothing threw but something is wrong: `RUST_LOG` and `WASM_LOG`, `hc sandbox` subcommands, `hc-client call` admin requests, dump-state, dump-network-stats, dump-network-metrics, calling a zome function by hand, observing a live dev network, `hc playground`, `.hc` / `.hc_live` files, bootstrap server HTTP API, space id, `storageArc` |
| `references/membranes.md` | Membrane proof, `genesis_self_check`, gating who may join, `AgentValidationPkg` validation, `provideMemproofs`, `awaiting_memproofs`, invite codes |
| `references/source-chain.md` | `query()` and `ChainQueryFilter` over your own chain, `agent_info` / `zome_info` / `call_info` / `dna_info`, scratch-space chain head, `sys_time`, `random_bytes`, tracing from wasm, validation receipts |
| `references/migration.md` | DNA migration, `init_properties`, `get_init_properties()`, carry over, chain history, carrying data across DNA versions, why 0.7 is a new network |
| `references/deployment.md` | Packaging, distributing, Kangaroo-Electron, installers, desktop app, versioning, version bump, data resets after update |

## Quick Reference

```
Versions (current stable):  hdk = "=0.7.0"   hdi = "=0.8.0"   holonix ref=main-0.7
Client / tooling:           @holochain/client 0.21.0   hc-spin 0.700.0   nodejs_24
Dev commands:  nix develop  |  hc sandbox clean  |  cargo test
Build zomes:   RUSTFLAGS='--cfg getrandom_backend="custom"' cargo build --release --target wasm32-unknown-unknown
Scaffold:      hc scaffold entry-type MyEntry  |  hc scaffold link-type AgentToMyEntry
```

### Toolchain currency

Verified against live registries and git refs on **2026-08-20**. Re-verify before trusting these past a Holochain minor release.

| Component | Current | Source |
|---|---|---|
| `hdk` / `hdi` / `holochain` | 0.7.0 / 0.8.0 / 0.7.0 | crates.io |
| `@holochain/client` | 0.21.0 | npm |
| `@holochain/hc-spin` | 0.700.0 | npm |
| `holochain_scaffolding_cli` | 0.700.0 (stable, 2026-07-31) | crates.io / scaffolding `v0.700.0` |
| holonix | branch `main-0.7` | github.com/holochain/holonix |
| kangaroo-electron | branch `main-0.7` | github.com/holochain/kangaroo-electron |
| `@holochain/tryorama` | 0.19.2, last published 2026-05-15, **no 0.7 release** | npm | <!-- legacy-ok -->


> **Scaffolder version trap.** Holonix `main-0.7` ships **`hc-scaffold 0.700.0-rc.0`**, not the stable `v0.700.0`. The rc emits `holonix?ref=main` and `-rc` crate pins, and its generated `validate()` does not compile against the stable `hdi 0.8.0` it also pins. Install the stable scaffolder alongside holonix rather than using the bundled one:
> ```
> nix run github:holochain/scaffolding/v0.700.0 -- web-app my-app
> # or: cargo install holochain_scaffolding_cli --version 0.700.0 --locked
> ```
> **Always pass `--version`.** `cargo install holochain_scaffolding_cli` with no version installs **0.4000.4**, a Holochain 0.4-era scaffolder. This crate's version history mixes numbering schemes, and semver orders `0.4000.4` above `0.700.0`, so crates.io reports the old release as the latest stable one. Verified 2026-08-17: the crates.io API returns `"max_stable_version":"0.4000.4"` while `0.700.0` sits further down the version list.
>
> `references/troubleshooting.md` lists each rc symptom and its fix if you are stuck with the bundled binary.

### Companion libraries: what is actually on 0.7

Verified against npm and each repo's `Cargo.toml` on **2026-08-17**. Version numbers in this ecosystem are not reliable signals, so check the pins rather than the tag.

| Project | State on 0.7 | What to do |
|---|---|---|
| `@holochain-open-dev/elements`, `/utils`, `/file-storage` | 0.700.0, published 2026-07-31 to 08-13 | Safe to use |
| `@holochain-open-dev/profiles` | 0.701.0, published 2026-08-11 | Safe to use |
| `@holochain-open-dev/signals` | stable is 0.601.0 (2026-01-26); only a `dev` tag at 0.700.0-dev.0 (2026-04-27) | Pre-release only, do not treat as settled |
| Wind Tunnel | latest tag `v0.7.1` pins hdk **0.6.3**; branch `main` pins hdk 0.7.0 | Track `main`. See `references/wind-tunnel.md` |
| hREA | `happ-0.4.0-beta` pins hdk **0.6.1** | Still 0.6 generation. Do not assume 0.7 compatibility |
| Moss / Weave (`@theweave/api`) | 0.7.0-dev.2, dev channel only | Pre-release |
| Tauri Holochain plugins | `tauri-plugin-holochain-service` 0.2.3, last published 2025-11-10; `tauri-plugin-holochain` is a 0.0.0 placeholder | Unmaintained against 0.7. Use Kangaroo |
| Official editor extension, non-JS/Rust bindings | none found | The supported clients are `@holochain/client` and the `holochain_client` crate |

### Unstable feature gates

Holochain 0.7 keeps several capabilities behind Cargo features that are **off by default**. Default features on `holochain 0.7.0` are `encryption`, `schema`, `wasmer-sys-cranelift` only. Turning any of these on means building and shipping your own conductor, which stock holonix and Kangaroo binaries will not have.

| Feature | Gates | Notes |
|---|---|---|
| `unstable-countersigning` | Atomic multi-agent commits | See `references/countersigning.md` |
| `unstable-migration` | The DNA manifest `lineage` field and `UseExisting` dependency matching | A declared ancestor chain. Holochain does not verify the lineage is truthful |
| `unstable-functions` | A small set of host functions including the deprecated `sleep()` | Low value for most hApps |
| `unstable-sharding` | Declared in `holochain 0.7.0`'s feature list. Nothing in the vendored crate sources references it, so its current scope is **unverified** | Do not design around it |

**Agent key management (DeepKey / DPKI) is not in the SDK.** There is no `dpki` or `deepkey` surface anywhere in `hdk 0.7.0` or `hdi 0.8.0`. It exists as a separate, still-unstable conductor service. Do not expect key rotation or key-to-person binding APIs from a zome.

## Common Pitfalls Checklist

Run this against any zome code being written or reviewed. Each item is a class of bug that has burned projects before.

### Entry Schema Evolution
- [ ] **`#[serde(default)]` on new optional fields** — Any field added to an existing entry struct after initial deployment MUST have `#[serde(default)]`. Without it, existing entries serialized before the field existed will fail to deserialize. `Option<T>` alone is NOT sufficient.
  ```rust
  #[serde(default)]          // ← REQUIRED for fields added post-deployment
  pub new_field: Option<ActionHash>,
  ```

### Cross-DNA Calls
- [ ] **`ZomeCallResponse` is exhaustive** — 0.7 has 5 variants: `Ok(ExternIO)`, `AuthenticationFailed(Signature, AgentPubKey)`, `Unauthorized(ZomeCallAuthorization, Option<CapSecret>, ZomeName, FunctionName)`, `NetworkError(String)`, `CountersigningSession(String)`. Note `Unauthorized` carries no `AgentPubKey` in 0.7. Wildcard `_` is safe but hides new variants. Exhaustive match is preferred.
- [ ] **Role name matches `happ.yaml`** — `CallTargetCell::OtherRole("role_name")` must exactly match the role name in `workdir/happ.yaml`. Typos fail silently at runtime.
- [ ] **Zome name matches coordinator crate name** — `ZomeName("zome_name")` must match the coordinator's `name` in `Cargo.toml`. Check both.
- [ ] **Local mirror structs for cross-DNA types** — Avoid importing the remote DNA's Cargo crate. Define a local serialization mirror struct instead.

### Validation Rules
- [ ] **No non-deterministic reads in `validate()`** — no `get()`, `get_links()`, `agent_info()`, `sys_time()`. DHT reads ARE allowed through `must_get_*`, which defers on an unresolved dependency instead of failing. Everything else comes from the op itself.
- [ ] **Use `op.flattened::<EntryTypes, LinkTypes>()`** — Not the old `op.to_type()`. `references/patterns.md` has the correct pattern.
- [ ] **Narrow actions with `TypedAction::<D>::try_from_action(...)?`** — Not `let r: Result<_, WrongActionError> = action.try_into();` followed by `map_err(|e| wasm_error!(...))`. `try_from_action` returns `ExternResult` and drops into a `?`-chain directly. `TypedAction<CreateData>` and `TypedAction<UpdateData>` widen into `TypedAction<EntryCreationData>` infallibly with `.into()`.
- [ ] **A shape sys validation already guarantees is an error, not `Invalid`** — if a `DeleteLink`'s target is not a `CreateLink`, propagate with `?`. Returning `ValidateCallbackResult::Invalid` blames the author for a fault in how the op reached your code.
- [ ] **`TypedAction<D>` derefs to `D`** — `action.data.entry_hash` and `action.entry_hash` both work for reads. Keep `action.data.x` where you need to move the field out, since `Deref` only lends.

### HDK 0.7 Get and Link API
- [ ] **`delete_link()` requires `GetOptions`** — `delete_link(hash, GetOptions::default())` not `delete_link(hash)`.
- [ ] **`get_links()` takes a `LinkQuery` plus a `GetStrategy`** — `get_links(LinkQuery::try_new(base, LinkTypes::X)?, GetStrategy::default())`. Not `GetLinksInputBuilder` for most cases.
- [ ] **`GetStrategy::Local` vs `Network`** — Use `Local` for own-data queries (fast, no network), `Network` for DHT queries (cross-agent data).

### Shared Utility Patterns (project-specific)
- [ ] **`agent_pub_key` and `created_at` are NOT entry fields** — They live in the action header. Remove them from entry structs.
- [ ] **If using a shared utility crate** — verify intra-DNA and cross-DNA call helpers are used consistently rather than raw `call()` inline.

## Examples

**Example 1: Design a new entry type for a marketplace listing**
```
User: "I need to model a Listing entry with status transitions"
→ Loads references/patterns.md (entry types, status enum, link types)
→ Designs ListingStatus enum (Active/Archived/Deleted)
→ Defines link types (AgentToListing, PathToListing, ListingUpdates)
→ Implements soft-delete via status field update, not entry deletion
```

**Example 2: Debug a cross-agent test that fails intermittently**
```
User: "My Sweettest passes alone but fails when another agent reads the entry"
→ Loads references/testing.md
→ Identifies missing await_consistency call before cross-agent read
→ Adds await_consistency(&cells).await.unwrap() after Alice's create, before Bob's get
→ Test passes reliably
```

**Example 3: Scaffold a new hApp from scratch**
```
User: "Start a new Holochain project for a community coordination app"
→ Loads references/scaffolding.md + references/workflows/scaffold.md
→ If hc scaffold CLI is available: guides nix flake setup → hc scaffold happ → entry types
→ If no CLI (AI coding session): invokes references/workflows/manual-scaffold.md → writes identical structure
→ Both paths produce the same standard hc scaffold architecture
→ Verifies compilation with hc s sandbox generate workdir/
```

**Example 4: Implement CRUD for a new zome**
```
User: "Implement a full resource zome with create, read, update, delete"
→ Loads references/architecture.md + references/patterns.md
→ Invokes references/workflows/implement-zome.md
→ Creates integrity crate (entry struct, link enum, validation)
→ Creates coordinator crate (create/read/update/delete functions)
→ Writes Sweettest tests at foundation + integration layers
```
