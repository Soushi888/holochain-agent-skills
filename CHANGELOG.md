# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.0.0-rc.2] - Unreleased

The second 1.0 candidate, built from what the first one met in the field. Every change below traces to a report: an issue, a post on X, or a release upstream that broke the candidate on a fresh project.

### Breaking

- **Holochain 0.7.1.** Pins move to `hdk = "=0.7.1"`, `hdi = "=0.8.1"` `@holochain/client` `^0.21.1` and `@holochain/hc-spin` `^0.700.1`, on holonix `main-0.7`. 0.7.1 is a patch release with breaking changes: capability grants are now `CapGrant { tag, constraint, capability }` (aliased `CapGrantEntry`), built with `CapGrant::new_zome_call_grant` or `CapGrant::new_direct_signal_grant`, and `ZomeCallCapGrant`, `CapAccess::Unrestricted` and their siblings are gone. Because `hdk 0.7.0` depends on `holochain_zome_types ^0.7.0`, a new project pinned to the rc.1 versions already resolves the 0.7.1 types, and rc.1's own remote-signal `init` fails to compile there (`E0422`, `E0599`). `references/access-control.md` carries the rename table and the upgrade workflow a section for moving from 0.7.0. Grants already on a source chain cannot be read by 0.7.1 and must be re-issued.

### Added

- **Version Check First** in `SKILL.md`: before writing code, read the project's `hdk`/`hdi` pins and holonix ref, stop on anything that is not 0.7, and route a 0.6 project to the `UpgradeHolochain07` workflow. Prompted by Paul d'Aoust ([@helioscomm](https://x.com/helioscomm/status/2110052187086917850)), whose agent invented removed APIs because the 0.6 skill was installed on a 0.7 project, and by Evgeny Shevtsov ([@eVshevtsoV](https://x.com/eVshevtsoV/status/2110064372647121318)), who asked for exactly that step.
- **A rejection test in the example hApp.** `validate_create_post` now refuses an empty title, and `create_post_with_empty_title_is_rejected` asserts the commit fails with that validation message, not merely with an error; `references/testing.md` shows the assertion. Asked for by [@mktpavlenko](https://x.com/mktpavlenko) on 2026-09-10: a skill that teaches validation should prove a rejection.
- **The keystore's 8 KiB frame limit**, the envelope pattern that works around it, **Kangaroo patch and minor releases that never install the new hApp** (with the `UpdateCoordinators` workaround), and **remote refusals that arrive as `NetworkError`**, from Ceri John's report ([@topeuph-ai](https://github.com/topeuph-ai), [#9](https://github.com/Soushi888/holochain-agent-skills/issues/9)), each re-checked against the 0.7 sources.
- **Observing a live dev network** in `references/debugging.md`: `.hc_live_*` admin ports, the kitsune2 bootstrap API and its space-id encoding, what `storageArc: null` means, and where `hc playground` stands on 0.7 ([#8](https://github.com/Soushi888/holochain-agent-skills/issues/8)).
- `references/client.md`: the 0.21.x client line for Holochain 0.7, why `@holochain/client` 0.22.0 is not for 0.7, direct signals and their grant, and the 0.21.1 chain-op shapes.
- The example hApp grants remote signals in `init()` with the 0.7.1 shape, so that snippet is compiled ground truth.
- **Source chain restore on a new node** (new in 0.7.1) in `references/migration.md`: `restore_from_dht`, `AwaitingRestore`, `Unrecoverable`, and what `@holochain/client` 0.21.1 does not type yet.
- **`hc client` membrane proof commands** (0.7.1) in `references/membranes.md`: `--membrane-proof ROLE=PATH` on `install-app`, and `provide-memproofs`.
- **What the Hearth field report found** ([Discussion #12](https://github.com/Soushi888/holochain-agent-skills/discussions/12), from Ceri John, [@topeuph-ai](https://github.com/topeuph-ai), [#16](https://github.com/Soushi888/holochain-agent-skills/issues/16)): build the `.happ` once and ship the same file on every platform, because a Windows and a Linux build of one commit can give different DNA hashes and so separate networks, and check the released hash with `hc dna hash` (which takes `-s` and `--role-settings` from 0.7.1); sharding a long Sweettest suite in CI; a first `call_remote` after launch that fails until peers are discovered.
- Routing eval cases R35 to R43, one per new topic. Against rc.1's skill eight of the nine miss (R42 already routed to `testing.md`); all nine hit here, and the full set goes from 31/48 on rc.1 to 40/48.

### Fixed

- Two older errors in `references/cryptography.md`, found while checking #9: `hdk` 0.7 does have the decrypt functions (re-exported from `hdi`), and validation must not decrypt rather than cannot.
- The scaffolder caveat: holonix `main-0.7` bundles the stable `hc-scaffold` 0.700.1 since 2026-10-22, so the trap now applies only to a `flake.lock` older than that, rewritten from a real scaffold run.
- Kangaroo `main-0.7` bundles holochain 0.7.1 since 2026-10-22; the tables and the upgrade workflow no longer say 0.7.0.
- `sign_ephemeral` and `verify_signature` are exempt from the 8 KiB keystore limit: they never reach lair.
- The Kangaroo versioning tables: pre-releases share a data folder within one `major.minor.patch-<id>`, and from 1.0 a minor bump keeps the folder too.
- `client.md` and `frameworks/svelte.md` compared `signal.type` against `"App"`, so every signal was dropped; the enum value is `"app"`, now `SignalType.App`.
- `docs/roadmap.md` no longer says 1.0.0 shipped on 2026-08-17, and its v2 lists Flowsta and mobile builds.

### Validation

- `scripts/validate-skill.sh` rejects the capability types 0.7.1 removed, and now checks exact `hdk`/`hdi` pins in the inline-table form too; both proven by seeding a defect and watching the gate fail.

## [1.0.0-rc.1] - 2026-09-04

The 1.0 release candidate. Targets **Holochain 0.7 only**, a clean break from 0.6.

This teaches a coding agent how to build a Holochain hApp: the coordinator and integrity split, DHT data modelling, entry and link types, CRUD and update chains, validation that stays deterministic, capability grants, cell cloning, signals, Sweettest, the TypeScript client, Nix environments, and packaging a `.webhapp` for desktop. 20 reference pages, 8 guided workflows, 17 templates, and an example hApp that compiles with a passing two-agent test suite.

```bash
mkdir -p .claude/skills && curl -fsSL \
  https://github.com/Soushi888/holochain-agent-skills/releases/download/v1.0.0-rc.1/holochain-agent-skills.tar.gz \
  | tar -xz -C .claude/skills
```

Swap `.claude/skills` for your harness's path if it differs. The archive root is one directory per skill, so it lands `holochain/SKILL.md` with no rename step, and `SHA256SUMS` ships beside it. Nix users can pin the flake instead, and there is a harness-detecting installer in the repository for filling several harnesses at once; both are in the README.

**Why a candidate rather than 1.0.** Documentation about a moving target rots, and a rotted skill is worse than none: it produces confident code that does not compile, and it reads authoritative while doing it. Holochain 0.7 rewrote the Action model in July 2026, so this release carries CI that fails when the docs teach an API 0.7 removed, in shipped templates as well as in prose, and when a version pin disagrees with itself across files. Each of those gates was proven by seeding a defect and watching it fail, because a gate that never fails is not a gate.

What none of that can measure is whether an agent that has never seen this repository routes to the right page and gets the code right on someone else's project. That needs your project. Install it, run it on real work, and open an issue for anything it gets wrong: the page it should have loaded, the API it got stale, the workflow that sent it sideways. That feedback is what turns this candidate into 1.0.

The prerelease flag exists so this never reaches anyone who did not ask for it: `releases/latest/download` skips prereleases, so it keeps pointing at the previous stable release until 1.0.0 ships. Installing this candidate means naming its tag on purpose, which is the intent.

### Breaking

- **The skill moved to `skills/holochain/`.** The repository root used to be the skill, so
  anything that fetched the repository got the whole workshop: `book.toml`, `SUMMARY.md`,
  `CHANGELOG.md`, `CLAUDE.md`, `docs/` and `.github/` all landed inside the installed skill.
  It also violated the spec, which requires the frontmatter `name` to match the parent
  directory name. Consumers pinning the repository root must append `skills/holochain`:

  ```nix
  # before
  rsync -a --delete ${inputs.holochain-agent-skills}/ .claude/skills/holochain/
  # after
  rsync -a --delete ${inputs.holochain-agent-skills}/skills/holochain/ .claude/skills/holochain/
  ```

  Or drop the glue entirely and use `lib.mkSkillsHook`, which this release adds.

- **The repository is now `Soushi888/holochain-agent-skills`**, plural. GitHub redirects the
  old URL and existing git remotes keep working. The skill directory stays `holochain`,
  singular, because the spec ties it to the frontmatter `name`.

- **Holochain 0.6 content is gone.** On a 0.6 project this skill will actively mislead you.
  Pin `v0.2.0` for 0.6, or run the `UpgradeHolochain07` workflow to port.

### Added

- **A harness-detecting installer**, `scripts/install.ts`, built to `bin/install.mjs`. It
  finds the agent harnesses a project actually uses, installs into all of them, and never
  prompts without an interactive terminal, so an agent or a CI job can run it unattended.
  Flags for `--global`, `--target`, `--link`, `--dry-run` and `--list`. Run it from a clone;
  see the README. (A registry package was built and gated in CI, and publishing it is
  deferred: the archive, the flake and this installer cover every install path, and the
  package name is likely to change if the `@holochain` scope is granted.)
- **GitHub release archives** (`.tar.gz` and `.zip`) rooted at one directory per skill, so
  `tar -xzf ... -C .claude/skills` installs in a single command. Published with
  `SHA256SUMS`, reproducible byte for byte across builds of the same commit. Stable releases
  also answer at `releases/latest/download/holochain-agent-skills.tar.gz`; prereleases are
  skipped by that URL by design, so a candidate is installed by naming its tag
- **A Nix flake.** `packages.<system>.holochain` is rooted at the skill itself,
  `packages.<system>.default` is the bundle, and `lib.mkSkillsHook` replaces the rsync glue
  every consumer was writing by hand. The derivation runs the skill validator in its check
  phase, so a broken routing path fails `nix build` rather than reaching a project
- **`AGENTS.md`**, so an agent handed only the repository URL can install the skill unaided
- `scripts/check-versions.sh`: the version is declared in four places (`package.json`, the
  `SKILL.md` frontmatter, the changelog heading, the git tag) and nothing was comparing them
- `scripts/build-release-assets.sh` and a `release.yml` workflow that runs every gate before
  anything irreversible happens

- `references/countersigning.md`: atomic multi-agent commits, `PreflightRequest`, session times, enzymatic and M of N sessions, and the `unstable-countersigning` gate that means a stock conductor cannot run it
- `references/scheduling.md`: `schedule()`, persisted crontab versus ephemeral duration, `#[hdk_extern(infallible)]`, and why scheduled functions run as the chain author
- `references/cryptography.md`: `sign` / `sign_ephemeral`, `verify_signature` from validation, secretbox versus box, `create_x25519_keypair`, and what encryption does not buy you on a DHT
- `references/migration.md`, `references/troubleshooting.md`, and the `UpgradeHolochain07` workflow
- Warrants and chain status in `references/patterns.md`: what replaced the removed `block_agent` / `unblock_agent`, and why `ChainStatus::Valid` alone is not a clean bill of health
- A dated toolchain currency table, a companion-library table, and an unstable-feature-gate table in `SKILL.md`
- `references/example-happ/`: a real hApp that compiles and whose Sweettest suite passes, serving as the ground truth for every Rust example
- `assets/templates/`: real template files rather than inlined code blocks
- `scripts/validate-skill.sh` plus a CI workflow, and `scripts/bump-versions.sh`
- `scripts/eval/`: a lexical routing regression guard
- `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, issue forms including a stale-version report, and a PR template
- `docs/release-gate-1.0.md`: the completed release pass with evidence
- `references/networking.md`: the 0.7 network stack. Kitsune2 0.5.0 over iroh, every `NetworkConfig` field with its real default, `bootstrap_url` and `relay_url`, the three timeouts that `request_timeout_s` derives, `target_arc_factor` for leecher nodes, and self-hosting `kitsune2-bootstrap-srv`
- `references/membranes.md`: join-time gating. `genesis_self_check`, `GenesisSelfCheckDataV2`, membrane proofs in `AgentValidationPkg` validation, the deferred `provideMemproofs` flow and the `awaiting_memproofs` app status
- `references/source-chain.md`: `query()` and `ChainQueryFilter` including the hash-bounded efficiency cliff, cell introspection across `dna_info` / `zome_info` / `agent_info` / `call_info`, `sys_time` and `random_bytes`, and validation receipts
- `references/debugging.md`: reading a live conductor. `RUST_LOG` versus `WASM_LOG`, the `hc sandbox` subcommand set, and the `hc-client` admin and zome-call surface
- `references/frameworks/`: Effect and Svelte integration notes for the two frontend stacks the skill is used with
- App authentication tokens and the admin install surface in `references/client.md`: `issueAppAuthenticationToken`, `attachAppInterface`, `installApp` with `roles_settings`, and `authorizeSigningCredentials`

### Changed

- **Breaking: repository restructured** to `SKILL.md` + `references/` + `references/workflows/` + `assets/templates/` + `scripts/`. Symlink installs pointing at the old flat layout will break
- Version pins bumped to `hdk = "=0.7.0"`, `hdi = "=0.8.0"`, holonix `ref=main-0.7`, `@holochain/client` 0.21.0, `@holochain/hc-spin` 0.700.0, `nodejs_24`
- Every Rust validation example ported to the 0.7 action model and then to the **stable v0.700.0 scaffolder idiom**: `TypedAction::<D>::try_from_action(...)?` for fallible narrowing, infallible `.into()` for Create and Update widening, and no hand-rolled `WrongActionError` plus `map_err` boilerplate
- Testing guidance moved from the retired JS harness to Sweettest throughout
- `references/wind-tunnel.md` now warns that the latest Wind Tunnel tag pins Holochain 0.6 while its `main` branch pins 0.7

### Fixed

- Documented that holonix `main-0.7` bundles `hc-scaffold 0.700.0-rc.0`, whose generated `validate()` does not compile against the stable `hdi 0.8.0` it also pins, with each symptom and its fix
- Corrected `manifest_version` from `"1"` to `"0"` in YAML examples
- Corrected the cloning prerequisite in `references/cell-cloning.md` and `references/architecture.md`. `deferred: true` is not required for a clonable role, and the conductor ignores `deferred` outright: `AppBundle::resolve_cell` destructures `Create { .. }` without reading it. `strategy: clone_only` is the setting that leaves a role unprovisioned, and assembling `AppInfo` then reaches `unimplemented!()` in `holochain_conductor_api-0.7.0` (`src/app_interface.rs` line 548). Reported by @AlchemicalSpiralizer in #2
- Removed stale `HDK 0.6` labels from `SKILL.md` and corrected `await_consistency_60s`, which does not exist, to `await_consistency`
- Documented why a bare `cargo install holochain_scaffolding_cli` installs the wrong tool: crates.io orders `0.4000.4` above `0.700.0` by semver, so the version must be pinned explicitly
- **`scripts/validate-skill.sh` could not see `assets/templates/` or `references/example-happ/`.** Both were absent from the file inventory the forbidden-API corpus was built from, and the pin checks excluded `assets/` and listed no `*.rs`. A template could carry an API removed in 0.7, or a stale `hdk = "=0.6.1"` pin, and the gate still exited 0. Templates are the files users copy, so this was the worst place for the gate to be blind. A `SHIPPED_CODE` inventory now feeds the same checks, and the coverage is falsified by injection in four places
- `scripts/bump-versions.sh` used `sed -i`, a GNU extension, while its header claimed POSIX sh. On BSD and macOS, `sed -i -e` reads `-e` as a backup suffix and corrupts every file the script touches. Replaced with a portable temp-file helper
- `scripts/eval/run-eval.sh` existed but nothing ran it. It is now a CI step
- `references/networking.md` presented `NetworkConfig`'s Rust `Default` impl as if it were a serde default. `bootstrap_url` and `relay_url` carry no `#[serde(default)]`, so omitting the whole `network:` block works while a partial block without both URLs fails at startup with `missing field bootstrap_url`
- Corrected `authorizeSigningCredentials` in `references/client.md` to the 0.21 tagged union `{ type: "listed", value: [[zome, fn]] }`, replacing the 0.20-era `GrantedFunctionsType` object form, and `listCapabilityGrants` to pass the required `include_revoked`

## [0.2.0] — 2026-05-15

### Added

- mdBook documentation site — `book.toml`, `SUMMARY.md`, and GitHub Actions deploy to GitHub Pages on every push to `main`
- mdBook frontmatter-strip preprocessor — strips YAML frontmatter so it does not appear in rendered pages
- `Progenitor.md` — dedicated context file for the progenitor pattern (DnaProperties, check_if_progenitor, Moss enforcement, bootstrap auto-registration)

### Changed

- Version pins bumped: `hdk = "=0.6.1"`, `hdi = "=0.7.1"`, `holonix ref=main-0.6`

## [0.1.0] — 2026-04-01

Initial release of the Holochain agent skill.

### Added

- `SKILL.md` — entry point with workflow routing table and context-file index
- `Architecture.md` — coordinator/integrity split, DNA structure, Cargo workspace, Nix, private entries, multi-DNA
- `Patterns.md` — entry types, link types, CRUD patterns, update chain, validation, signals, HDK API
- `Scaffold.md` — Holonix setup, Nix flake, hc CLI commands, project scaffolding
- `AccessControl.md` — capability grants, cap claims, admin-only patterns, init() setup
- `CellCloning.md` — clone cells, partitioned data, createCloneCell, clone_limit
- `ErrorHandling.md` — thiserror enums, WasmError, ExternResult patterns
- `Testing.md` — Tryorama + Vitest setup, two-agent scenarios, dhtSync; Sweettest (Rust-native) patterns; three-layer testing strategy; E2E Playwright integration
- `TypeScript.md` — holochain-client setup, callZome, signals, SvelteKit integration
- `Deployment.md` — Kangaroo-Electron packaging, .webhapp bundling, CI/CD, versioning
- `WindTunnel.md` — performance and load testing reference using the wind-tunnel framework
- `Workflows/DesignDataModel.md` — DHT entry/link type design workflow
- `Workflows/Scaffold.md` — new project and domain scaffolding workflow
- `Workflows/ImplementZome.md` — full CRUD zome implementation workflow
- `Workflows/DesignAccessControl.md` — capability grants and admin patterns workflow
- `Workflows/PackageAndDeploy.md` — Kangaroo-Electron and CI/CD workflow
- `Workflows/ReviewZome.md` — guided code review checklist for coordinator and integrity zomes
- `docs/requirements.md` — v1 functional and non-functional requirements
- `docs/roadmap.md` — v1/v2/v3 vision and sub-skill roadmap
- Agent Skills Open Standard v1 compliance — YAML frontmatter, metadata block, and standard routing table in `SKILL.md`
- Multi-platform installation section in `README.md` covering Claude Code, GitHub Copilot, Cursor, Augment, and Codex
- DeepWiki badge in `README.md`

### Changed

- Repository renamed from `holochain-claude-skill` to `holochain-agent-skill`; all internal references updated
- All occurrences of "Claude Skill" replaced with "agent skill" for platform neutrality
- Clone URL updated to the canonical GitHub repository

[0.2.0]: https://github.com/Soushi888/holochain-agent-skills/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/Soushi888/holochain-agent-skills/releases/tag/v0.1.0
