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
  version: "1.0.0-rc.2"
  holochain-versions: "hdk=0.7.1, hdi=0.8.1, holonix ref=main-0.7"
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

## Version Check First

This skill teaches **Holochain 0.7 only**: the `hdk` 0.7 and `hdi` 0.8 lines, holonix `main-0.7`. Every API shape in it is wrong on another line, and an agent that writes 0.7 code into a 0.6 project, or 0.6 code from memory into a 0.7 one, produces calls that do not exist. So before writing or reviewing code in an existing project, find the versions the project actually builds with. The lockfile is the authority, because a manifest pin can be a workspace reference or a range, and because an exact 0.7.0 pin on `hdk` with a fresh lockfile already resolves the 0.7.1 type crates:

```bash
grep -A1 -E '^name = "(hdk|hdi|holochain_integrity_types)"$' Cargo.lock
grep -o 'holonix?ref=[^"]*' flake.nix
```

With no `Cargo.lock`, a manifest cannot settle rows 1 and 2: an exact 0.7.0 pin on `hdk` still resolves `holochain_integrity_types` 0.7.1 in a fresh lockfile. Generate one first (`cargo generate-lockfile`, or `cargo tree -i holochain_integrity_types`), then read it as above. Reading the manifests alone (`grep -rn --include=Cargo.toml -E '^(hdk|hdi)\b|dependencies\.(hdk|hdi)\]' .`) only tells the line.

| What the project resolves | Do this |
|---|---|
| `holochain_integrity_types` 0.7.1+ (and `hdk` 0.7.x) | Proceed with this skill. This holds for an exact 0.7.0 pin on `hdk` too: the grant types live in `holochain_integrity_types`, which such a pin resolves at 0.7.1 |
| `holochain_integrity_types` 0.7.0, or `0.7.1-rc.0` / `0.7.1-rc.1` (still the old grant shape; `0.7.1-rc.2` already has the new one) | The capability grant API differs from what this skill teaches. Follow "Already on 0.7.0: moving to 0.7.1" in the **UpgradeHolochain07** workflow first, or say plainly that grant code from this skill will not compile there |
| `hdk` 0.6.x or older (`hdi` 0.7.x or older) | Stop before writing code. Tell the user this skill's API shapes will not compile there, and offer the **UpgradeHolochain07** workflow, or the 0.6-era skill at tag `v0.2.0` if they are staying on 0.6 |
| `hdk` 0.8 or 0.9 dev builds, holonix `main` | Say the skill predates that line, and verify every API against the project's own crate sources before using it |
| Nothing found, or crates from different lines (an `hdk` 0.6 next to `holochain_integrity_types` 0.7, say; `hdk` 0.7.0 with `holochain_integrity_types` 0.7.1 is one line, row 1) | Do not proceed on a guess. Show the user what you found and ask which line the project targets |
| A new project | The current 0.7 line, as the Scaffold workflows set it up |

Say which line you found in your first reply, and offer to record it where the next session will read it (the agent instructions file the project already has, AGENTS.md or CLAUDE.md: "Holochain 0.7.x, holochain skill `<metadata.version>`"), so a later session does not rediscover it by writing broken code first.

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
| **UpgradeHolochain07** | upgrade to 0.7, port from 0.6, still on 0.6, project is on 0.6, hdk 0.6, older holochain, wrong holochain version, migrate hApp, holochain 0.7 upgrade, upgrade holochain version, bring up to date, move to the latest holochain, hdi upgrade | `references/workflows/upgrade-holochain-0.7.md` |
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
| `references/cryptography.md` | App-level signing and encryption: `sign`, `sign_ephemeral`, `verify_signature` in validation, secretbox vs box, `create_x25519_keypair`, encrypting to an AgentPubKey, decrypting, 8 KiB keystore limit, `FrameOverflow`, encrypting large content, and what encryption does not buy you |
| `references/scheduling.md` | Scheduled functions, `schedule()`, `Schedule::Persisted` crontab vs `Schedule::Ephemeral`, `#[hdk_extern(infallible)]`, scheduler loop timing, why scheduled fns run as the chain author |
| `references/countersigning.md` | Countersigning, atomic multi-agent commits, `PreflightRequest`, `accept_countersigning_preflight_request`, session times, enzymatic sessions, M of N optional signers, `unstable-countersigning` feature gate |
| `references/cell-cloning.md` | Cell cloning, partitioned data, own copy of the DNA, clone roles, createCloneCell, clone_limit |
| `references/error-handling.md` | Error types, WasmError, ExternResult, extern result patterns, thiserror |
| `references/testing.md` | Four-layer strategy, Sweettest (Rust-native), two agents, await_consistency, E2E Playwright + AdminWebsocket, Wind-Tunnel performance |
| `references/wind-tunnel.md` | Performance/load testing with wind-tunnel: ScenarioDefinitionBuilder, call_zome, ReportMetric, multi-agent roles, sync lag, DHT sync lag measurement, load testing, InfluxDB metrics pipeline |
| `references/client.md` | holochain-client setup, callZome, signals, SvelteKit integration |
| `references/troubleshooting.md` | **Any literal error string** from the compiler, conductor, `hc` CLI or a test, keyed on the text you actually saw. Check here first when something fails. Build and compile errors, cannot find type, no variant named, unresolved import, feature does not exist, `hc scaffold` errors, integrity zome, scaffolder rc pins, conductor startup, peers never connect, validation passes locally but fails for other agents, test failures, deployment and data reset symptoms |
| `references/networking.md` | Kitsune2 and iroh transport, conductor `NetworkConfig`, `bootstrap_url`, `relay_url`, running your own bootstrap server, arc factor and leecher nodes, request timeouts, gossip reporting, first call_remote after launch fails, peer discovery |
| `references/debugging.md` | Nothing threw but something is wrong: `RUST_LOG` and `WASM_LOG`, `hc sandbox` subcommands, `hc-client call` admin requests, dump-state, dump-network-stats, dump-network-metrics, calling a zome function by hand, observing a live dev network, `hc playground`, `.hc` / `.hc_live` files, bootstrap server HTTP API, space id, `storageArc` |
| `references/membranes.md` | Membrane proof, `genesis_self_check`, gating who may join, `AgentValidationPkg` validation, `provideMemproofs`, `awaiting_memproofs`, invite codes |
| `references/source-chain.md` | `query()` and `ChainQueryFilter` over your own chain, `agent_info` / `zome_info` / `call_info` / `dna_info`, scratch-space chain head, `sys_time`, `random_bytes`, tracing from wasm, validation receipts |
| `references/migration.md` | DNA migration, `init_properties`, `get_init_properties()`, carry over, chain history, carrying data across DNA versions, why 0.7 is a new network, source chain restore on a new node, restore, get the source chain back, new machine, new device, lost device, lost laptop, reinstall, same agent key (`restore_from_dht`, `AwaitingRestore`, `Unrecoverable`) |
| `references/deployment.md` | Packaging, distributing, Kangaroo-Electron, installers, desktop app, versioning, version bump, data resets after update, patch release, new hApp not installed after update, `UpdateCoordinators`, different DNA hashes across platforms, Windows and Linux builds, separate networks, reproducible build |

## Quick Reference

```
Versions (current stable):  hdk = "=0.7.1"   hdi = "=0.8.1"   holonix ref=main-0.7
Client / tooling:           @holochain/client 0.21.1   hc-spin 0.700.1   nodejs_24
Dev commands:  nix develop  |  hc sandbox clean  |  cargo test
Build zomes:   RUSTFLAGS='--cfg getrandom_backend="custom"' cargo build --release --target wasm32-unknown-unknown
Scaffold:      hc scaffold entry-type my_entry  |  hc scaffold link-type agent my_entry
```

### Toolchain currency

Verified against live registries and git refs on **2026-11-07**. Re-verify before trusting these past a Holochain minor release.

| Component | Current | Source |
|---|---|---|
| `hdk` / `hdi` / `holochain` | 0.7.1 / 0.8.1 / 0.7.1 (released 2026-10-14) | crates.io, holochain CHANGELOG on branch `main-0.7` |
| `@holochain/client` | 0.21.1 (2026-10-15). **Not 0.22.x**: 0.22.0 is built against an unreleased Holochain, see `references/client.md` | npm, release notes on github.com/holochain/holochain-client-js |
| `@holochain/hc-spin` | 0.700.1 (2026-10-22, built against Holochain 0.7.1) | npm dist-tags |
| `holochain_scaffolding_cli` | 0.700.1 (stable, 2026-10-22), the one holonix `main-0.7` bundles since 2026-10-23 | crates.io / scaffolding `v0.700.1` / holonix `flake.nix` |
| holonix | branch `main-0.7` | github.com/holochain/holonix |
| kangaroo-electron | branch `main-0.7` | github.com/holochain/kangaroo-electron |
| `@holochain-open-dev/tryorama` | 0.21.0 (2026-10-16, on `@holochain/client ^0.21.1`), the 0.7 line of Tryorama. The old `@holochain/tryorama` name stops at 0.19.2 (2026-05-15). Sweettest stays the taught path | npm dist-tags | <!-- legacy-ok -->


> **Check the scaffolder before trusting its output.** Since 2026-10-23, holonix `main-0.7` bundles the stable **`hc-scaffold 0.700.1`**, which emits `holonix?ref=main-0.7`, `nodejs_24` and the 0.7.1 pins (`hdi =0.8.1`, `hdk =0.7.1`, `holochain 0.7.1`, `@holochain/client ^0.21.1`, `@holochain/hc-spin ^0.700.1`). A project whose `flake.lock` predates that still gets **`0.700.0-rc.0`**, whose output does not compile against the stable crates. Run `hc scaffold --version`; anything but `0.700.1` means `nix flake update holonix` first. Outside holonix:
> ```
> nix run github:holochain/scaffolding/v0.700.1#hc-scaffold -- web-app my-app
> # or: cargo install holochain_scaffolding_cli --version 0.700.1 --locked
> ```
> **Always pass `--version`.** `cargo install holochain_scaffolding_cli` with no version installs **0.4000.4**, a Holochain 0.4-era scaffolder. This crate's version history mixes numbering schemes, and semver orders `0.4000.4` above `0.700.x`, so crates.io reports the old release as the latest stable one. Re-verified 2026-11-07: the crates.io API returns `"max_stable_version":"0.4000.4"` while `0.700.1` is the newest.
>
> `references/troubleshooting.md` lists each rc symptom and its fix if you are stuck with an old lock.

### Companion libraries: what is actually on 0.7

Verified against npm, crates.io and each repo's `Cargo.toml` on **2026-11-07**. Version numbers in this ecosystem are not reliable signals, so check the pins rather than the tag.

| Project | State on 0.7 | What to do |
|---|---|---|
| `@holochain-open-dev/elements`, `/utils`, `/file-storage` | 0.701.0, published 2026-10-16, on `@holochain/client ^0.21.1` | Safe to use |
| `@holochain-open-dev/profiles` | 0.702.0, published 2026-10-16, on `@holochain/client ^0.21.1` | Safe to use |
| `@holochain-open-dev/signals` | stable is 0.601.0 (2026-01-26); only a `dev` tag at 0.700.0-dev.0 (2026-04-27) | Pre-release only, do not treat as settled |
| Wind Tunnel | latest tag `v0.7.1` pins hdk **0.6.3**; branch `main` pins hdk 0.7.0 and kitsune2 0.5.2 | Track `main`. See `references/wind-tunnel.md` |
| hREA | `happ-0.5.0-beta.1` (2026-09-10) pins hdk **=0.7.0** / hdi **=0.8.0** | 0.7 generation, pinned before 0.7.1. Check its lockfile before mixing it with 0.7.1 code (the capability types differ) |
| Moss / Weave (`@theweave/api`) | `latest` tag is 0.7.0-dev.5 (2026-09-25), `next` is 0.7.0-rc.4 (2026-11-06); no stable 0.7 release | Pre-release |
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

## Feedback Mode

This skill is a release candidate, and what an agent meets on a project its maintainers have never seen is the one thing its CI cannot measure. So when the skill itself lets you down, offer your user to report it.

**What counts.** The skill was wrong, not the user's code:
- an API, pin or command it gave does not compile or run against the versions the project resolves;
- a pattern you needed is missing, and you worked it out from crate sources, docs or trial and error;
- a workflow or a page sent you the wrong way, or the routing table pointed at the wrong page;
- a version, a pin or a tool it names is stale;
- an improvement your user suggests for the skill, or one you would make.

A compiler error in the user's own logic is not a skill defect. Neither is a question the skill never claimed to answer.

**When and how.** Finish the user's task first. Then, at most once per finding and never mid-task, say in one sentence what the skill got wrong or lacked, and offer to draft a report. If the user agrees, draft it in the shape of the [Field reports form](https://github.com/Soushi888/holochain-agent-skills/discussions/new?category=field-reports): kind of report (defect, suggestion or run report), skill version (`metadata.version` above), harness and model, the Holochain, `hdk` and `hdi` versions the project resolves, the skill file involved, what the skill said, what actually happened (errors pasted literally), and the fix if you know it. Show the draft and let the user edit it.

**Sending it is the user's act.** Give the user the form link with the draft to paste. Where `gh` is authenticated, you may offer to post it as a discussion in the Field Reports category instead (`gh api graphql` with `createDiscussion`), but only after the user has approved the final text. Never post anything without that approval.

**Keep it about the skill.** The draft carries versions, the skill's words and the error, not the user's project: no source code beyond the minimal snippet that shows the defect, no paths, repository names, hostnames, keys or agent public keys, unless the user adds them.

**Off switch.** If the user says no, or asks for no feedback prompts, stop offering for the rest of the session. A line `holochain-skill-feedback: off` in the project's agent instructions file (AGENTS.md or CLAUDE.md) turns it off for good.

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
→ If hc scaffold CLI is available: guides nix flake setup → hc scaffold web-app → entry types
→ If no CLI (AI coding session): invokes references/workflows/manual-scaffold.md → writes identical structure
→ Both paths produce the same standard hc scaffold architecture
→ Verifies compilation with npm run build:happ
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
