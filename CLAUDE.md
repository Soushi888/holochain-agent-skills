# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Repository Is

A vanilla agent skill for Holochain hApp development, targeting **Holochain 0.7 only**. It is a documentation repository plus one compiling reference hApp. The skill is loaded by Claude Code when a user invokes `/holochain` or when Holochain-related work is detected.

**Documentation site:** The repo also generates a static documentation site via mdBook (`book.toml` + `SUMMARY.md`). Run `mdbook build` to produce `book/` (gitignored). GitHub Actions deploys it to GitHub Pages on every push to `main`.

**PAI-independence constraint:** This skill must work with zero PAI infrastructure (`~/.claude/PAI/` not required). No voice notification curls, no Algorithm routing, no PROJECTS.md references. All content must be self-contained.

**License:** Apache-2.0

## Layout

The repository separates the **shipped skill** from the **workshop around it**. Everything under
`skills/` is what a consumer installs. Everything else exists to build, validate, document and
release that payload, and must never end up in a consumer's `.claude/skills/` directory.

```
skills/holochain/            THE SHIPPED SKILL. Nothing outside this directory ships.
  SKILL.md                     Entry point: routing table, context file index, quick reference, toolchain currency table
  references/                  Reference material, loaded on demand
    architecture.md              Coordinator/integrity split, DNA structure, Cargo workspace, Nix, dna_info, network_seed, private entries, multi-DNA
    progenitor.md                DnaProperties struct, check_if_progenitor, coordinator guard, integrity enforcement, bootstrap auto-registration, deploy-time injection
    patterns.md                  Entry types, link types, CRUD, update chain, validation, signals, HDK 0.7 API
    scaffolding.md               Holonix setup, Nix flake, hc CLI commands, project scaffolding
    access-control.md            Capability grants, cap claims, admin-only patterns, init() setup
    cell-cloning.md              Clone cells, partitioned data, createCloneCell, clone_limit
    error-handling.md            thiserror enums, WasmError, ExternResult patterns
    testing.md                   Sweettest (Rust-native) setup, two-agent scenarios, await_consistency, test organization
    wind-tunnel.md               Performance/load testing with the wind-tunnel framework
    client.md                    @holochain/client setup, callZome, signals, SvelteKit integration
    deployment.md                Kangaroo-Electron packaging, .webhapp bundling, CI/CD, versioning
    migration.md                 DNA migration, init_properties, carrying data across DNA versions
    networking.md                Kitsune2 + iroh transport, NetworkConfig, bootstrap and relay, self-hosting a bootstrap server
    membranes.md                 genesis_self_check, membrane proofs, AgentValidationPkg validation, memproof install flow
    source-chain.md              query() and ChainQueryFilter, cell introspection, sys_time/random_bytes, validation receipts
    debugging.md                 RUST_LOG and WASM_LOG, hc sandbox, hc-client admin calls and zome calls
    troubleshooting.md           Literal error strings mapped to causes and fixes
    frameworks/                  Effect and Svelte integration notes
    workflows/                   Step-by-step guided sequences, routed from SKILL.md
    example-happ/                A real, compiling 0.7 hApp. The ground truth for every code example
  assets/templates/            Real template files (flake.nix, Cargo.toml, happ.yaml, dna.yaml, zome lib.rs, sweettest harness)
  LICENSE                      Apache-2.0, shipped with the skill so an installed copy carries its licence

scripts/                     validate-skill.sh (CI gate), bump-versions.sh, install.ts, eval/
nix/                         skill.nix (the derivation), mk-skills-hook.nix (the devShell fragment)
docs/                        Requirements spec, roadmap, testing matrix. NOT loaded by the skill
AGENTS.md                    Install instructions addressed to an agent handed the repo URL
package.json                 npm packaging: `files`, `bin`, `agents`, the agent-skill keyword
flake.nix                    Exposes the skill as a package plus lib.mkSkillsHook for consumers
book.toml / SUMMARY.md       mdBook site over both the skill and docs/
```

Paths inside `SKILL.md` are relative to `skills/holochain/`, so routing rows read
`references/patterns.md`, not `skills/holochain/references/patterns.md`. Paths in this file,
in `SUMMARY.md` and in the scripts are relative to the repo root and carry the full prefix.

## Routing Architecture

`SKILL.md` is the entry point. It contains:
1. A **Workflow Routing** table mapping natural-language triggers to `references/workflows/*.md` files (relative to the skill root)
2. A **Context Files** table specifying which `references/*.md` file to load per topic
3. **Quick Reference** and a dated **Toolchain currency** table

Context files are loaded **on demand**, not all at once. When editing `SKILL.md`, maintain this lazy-loading discipline.

## Version Pins (update all occurrences when bumping)

```
hdk = "=0.7.0"
hdi = "=0.8.0"
holonix ref=main-0.7
@holochain/client 0.21.0
@holochain/hc-spin 0.700.0
nodejs_24
```

Exact pins (`=`) are required. Holochain is sensitive to minor version changes. Use `scripts/bump-versions.sh` rather than hand-editing, then run `scripts/validate-skill.sh` to confirm no occurrence was missed.

## Maintaining the Skill

- **`scripts/validate-skill.sh` is the gate.** It checks frontmatter, routing target resolution, orphaned markdown, relative links, version pin consistency, forbidden 0.6-era APIs, retirement of the old JS test harness, and leftover placeholder markers. CI runs it on every push and PR. Run it before committing. Read the script for the exact check names, since it scans for those names as literal strings and repeating them here would trip its own checks.
- **`skills/holochain/references/example-happ/` is the ground truth.** Every Rust example in the reference files must match an API shape that compiles there. Do not write API shapes from recall.
- **The stable scaffolder is authoritative for generated-code idiom.** Holonix `main-0.7` ships `hc-scaffold 0.700.0-rc.0`, whose output does not compile against the stable crates. Generated-code examples must match `holochain_scaffolding_cli` **v0.700.0 stable**, installed separately.
- **No duplication across files.** Each pattern lives in one canonical file; `SKILL.md` routes to it.
- **Workflows vs references.** Files in `references/workflows/` are step-by-step sequences; the other `references/*.md` files are reference material. Keep the roles distinct.
- **Only `skills/` ships.** `npm pack --dry-run` is the check: if a file outside `skills/`, `bin/`, `README.md` or `LICENSE` appears in the tarball, the `files` array in `package.json` is wrong.
- **docs/ is not part of the skill.** `docs/requirements.md`, `docs/roadmap.md` and `docs/testing.md` are project tracking.

## Every Release Updates the Pinned Discussions

[Discussions](https://github.com/Soushi888/holochain-agent-skills/discussions) is where feedback on each release arrives, and its two pinned posts are the first thing a visitor reads. A release that leaves them pointing at the previous tag hands every new reporter a stale install command and asks for feedback on a version nobody should install anymore. So every tag, release candidate or stable, is not finished until:

- **The current release post is pinned in Announcements, and only that one.** Rewrite the previous release post for the new tag or open a new one (install command naming the new tag, what changed, what feedback is wanted), then unpin the old one. The `v1.0.0-rc.1` call is #6.
- **The welcome post (#5) links the current release post by number**, and its "What helps most right now" section matches the stage: candidate feedback before a stable tag, regular field reports after.
- **The landing page reads right to a visitor**: welcome first, current release post second, both linking to tags that exist.

Posting and editing go through `gh api graphql` (`createDiscussion`, `updateDiscussion`). Pinning has no API, since GraphQL exposes no pin mutation, so pins are set in the web UI from the discussion's sidebar.

## Key Architectural Concepts (for editing reference files accurately)

- Every Holochain domain = one integrity crate (`hdi`) + one coordinator crate (`hdk`)
- Integrity code is locked to the DNA hash; coordinator code can be hot-swapped post-deployment
- Validation in integrity must be **pure and deterministic**: no `get()`, no `get_links()`, no `agent_info()`, no time comparisons. The only reads available are the `must_get_*` family, which defers on an unresolved dependency rather than failing
- 0.7 action model: `Action` is `{ header, data }`. `FlatOp` variants are `CreateEntry`, `Update`, `Delete`, `Link`, `CreateRecord`, `AgentActivity`. Narrow with `TypedAction::<D>::try_from_action(action)?`, which returns `ExternResult`. `TypedAction<CreateData>` and `TypedAction<UpdateData>` widen into `TypedAction<EntryCreationData>` infallibly via `.into()`
- A shape that sys validation already guarantees is an error to propagate with `?`, never a `ValidateCallbackResult::Invalid`
- Update chain tracking: `create_link(original_hash, updated_action_hash, LinkTypes::MyEntryUpdates)`, always link from original, never chain links
- `post_commit` is infallible: must use `#[hdk_extern(infallible)]`
- `send_remote_signal` is fire-and-forget; `recv_remote_signal` requires an unrestricted cap grant in `init()`
- Sweettest consistency: `await_consistency(cells)` waits 60s, `await_consistency_s(timeout, cells)` takes an explicit budget, `check_consistency(cells)` does not wait. There is no `await_consistency_60s`
- Networking is Kitsune2 0.5.0 over iroh, unconditionally. tx5 and WebRTC are gone from `holochain_p2p 0.7`, `signal_url` became `relay_url`, and the `transport-iroh` cargo feature no longer exists on the `holochain` crate
- `hc sandbox call` was removed in 0.7. Admin API calls moved to the `hc-client` binary (`hc-client call <subcommand> --port`), and its zome-call arguments are positional
- `genesis_self_check` is written under that name but exported as `genesis_self_check_2`; `GenesisSelfCheckData` aliases V2, which carries only `membrane_proof` and `agent_key`. Call `dna_info()` inside the callback for DNA properties
- Membrane enforcement that binds is validation of `FlatOp::CreateRecord(OpRecord::AgentValidationPkg { .. })`. The self-check runs on the joiner's own machine and a modified conductor skips it
