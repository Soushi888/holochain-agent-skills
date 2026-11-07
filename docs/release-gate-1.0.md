# Release Gate: v1.0.0

Completed 2026-08-17 for `v1.0.0-rc.1`; re-measured on 2026-11-07 for `v1.0.0-rc.2` (Holochain 0.7.1): the toolchain currency rows against the registries and upstream branches, the code correctness and routing rows against the composed rc.2 tree. Every row records the command run and its result. Rows that cannot apply are marked N/A with the reason, never left blank.

## Toolchain currency

| Check | Result | Evidence |
|---|---|---|
| `hdk` pin matches crates.io stable | PASS | `hdk 0.7.1`: crates.io API `max_stable_version` and `newest_version` both `0.7.1` (2026-11-07) |
| `hdi` pin matches crates.io stable | PASS | `hdi 0.8.1`: `max_stable_version` and `newest_version` both `0.8.1` |
| `holochain` pin matches crates.io stable | PASS | `holochain 0.7.1` is `max_stable_version`; `newest_version` is `0.8.0-dev.14`, a dev line the skill does not target |
| `@holochain/client` pin matches npm `latest` on the 0.7 line | PASS | `0.21.1`, dist-tag `latest`, published 2026-10-15. `0.22.0` is excluded on purpose: built against an unreleased Holochain (see `references/client.md`) |
| `@holochain/hc-spin` pin matches npm latest | PASS | `0.700.1`, dist-tag `latest`, published 2026-10-22 |
| holonix ref exists and is the 0.7 line | PASS | branch `main-0.7`, tip `a6cdfbd31afd2094b7ccc9b3bd7cf9442ec055da` (2026-11-02), its `flake.lock` on `holochain-0.7.1`, matched by the example's `flake.lock` |
| kangaroo-electron ref bundles 0.7 | PASS | branch `main-0.7` at `0498122` (2026-10-22), `kangaroo.config.ts` declares `holochainVersion: '0.7.1'` |
| Scaffolder guidance names the stable release | PASS | holonix `a6cdfbd` locks `hc-scaffold` at `v0.700.1` (`77d49d1`), the newest `holochain_scaffolding_cli` on crates.io (2026-10-22). The skill says a `flake.lock` older than 2026-10-22 still gets `0.700.0-rc.0` |
| Companion libraries checked by pin, not tag | PASS | Wind Tunnel latest release `v0.7.1` pins hdk 0.6.3 while `main` pins hdk 0.7.0, hdi 0.8.0, kitsune2 0.5.2; hREA latest release `happ-0.5.0-beta.1` (2026-09-10) pins hdk =0.7.0, hdi =0.8.0. Both stated in `SKILL.md` |

## Skill integrity

| Check | Result | Evidence |
|---|---|---|
| Validator passes on a clean tree | PASS | `sh scripts/validate-skill.sh` exits 0 |
| No orphaned markdown | PASS | validator orphan check |
| Every routing target resolves | PASS | validator routing check |
| No 0.6-era removed APIs in code blocks | PASS | validator forbidden-API check |
| Old JS test harness retired to a single pointer | PASS | validator retirement check |
| No leftover placeholder markers | PASS | validator marker check |
| Docs site builds | PASS | `mdbook build` exits 0, writes `book/` |

## Code correctness

| Check | Result | Evidence |
|---|---|---|
| Example hApp zomes compile to wasm | PASS | Composed rc.2 tree (`compose/rc.2` at `905cea5`: #20 #10 #11 #21 #18 #19 merged in order), inside `nix develop` on holonix `a6cdfbd`: `RUSTFLAGS='--cfg getrandom_backend="custom"' cargo build --release --target wasm32-unknown-unknown`, exit 0 (2026-11-07) |
| DNA and hApp pack from freshly built wasms | PASS | `hc app pack workdir --recursive`, exit 0, wrote `dnas/forum/workdir/forum.dna` and `workdir/my_forum.happ` |
| Sweettest suite passes | PASS | `cargo test -- --test-threads 6` on holochain 0.7.1, exit 0: `create_post_with_empty_title_is_rejected`, `create_post`, `create_and_read_post`, `create_and_delete_post`, `create_and_update_post` (5 passed, 33.25s); two-agent `link_a_agent_to_a_post` (1 passed, 10.56s) |
| Validation rejects invalid data | PASS | `create_post_with_empty_title_is_rejected` asserts `InvalidCommit` with the integrity zome's message. Red certified on #21: with the rule disabled the same suite exits 101 and only that test fails, with `got Ok(Record ..)` |
| Generated-code idiom matches the stable scaffolder | PASS | A probe app scaffolded with `hc-scaffold 0.700.1` (its `flake.lock`: holonix `a6cdfbd`, `hc-scaffold` `v0.700.1`; web-app, dna `forum`, zome `posts`, entry type `post` with CRUD and link-from-original, fields `title` and `content`), diffed on 2026-11-07: `integrity/posts/src/post.rs` and `coordinator/posts/src/post.rs` are identical to #20's example hApp; both `lib.rs` differ only by the example's `agent_to_posts` link module and its remote-signal grant and `recv_remote_signal`. On the composed tree the integrity `post.rs` also differs by #21's hand-written title rule, nothing else. That generated code is what the suite above compiled and passed |
| Templates match the example | NOT RE-MEASURED | Not re-derived for rc.2. `validate-skill.sh` passes on the composed tree, which covers pin consistency and the removed 0.7.0 capability types in templates, not template-to-example identity |

## Skill efficacy

| Check | Result | Evidence |
|---|---|---|
| Live end-to-end, run A (2026-08-17) | PASS, with a caveat | GLM 5.3 via opencode, task: add a `Comment` entry type with CRUD, validation and a `PostToComments` link. Wrote 6 files, then `cargo build --release --target wasm32-unknown-unknown` exit 0 on first try. **Caveat:** described at the time as isolated on the strength of `--pure`. It was not. `--pure` disables plugins only; the `instructions` array still loaded eleven local files. The compile evidence stands; the routing and idiom evidence is weakened, because a context-loaded agent is not the naive reader the check describes |
| Live end-to-end, run B (2026-08-19) | PASS, with the same caveat | A later, separate run against the iteration-3 content: membrane gating plus a source-chain query, `E2E_WASM_BUILD_EXIT=0`, `posts_integrity.wasm` 1732446 bytes and `posts.wasm` 3123616 bytes. Same isolation defect as run A. These are two distinct runs on two different task sets, not two descriptions of one run |
| Live end-to-end under verified isolation | OPEN | The isolation recipe (`HOME` + `XDG_CONFIG_HOME` + `XDG_DATA_HOME` overridden onto a sandbox home) was established on 2026-08-19 and verified by behaviour rather than self-report. Re-running runs A and B under it is tracked as C46 and C47 in the project ISA. Not a 1.0 blocker: the compile evidence is unaffected, and what is open is how much the skill alone contributed to the routing |
| End-to-end output uses current idiom | PASS | `try_from_action` present, zero `WrongActionError`, `LinkQuery::try_new` and `GetStrategy` used, zero removed-in-0.7 APIs |
| Routing regression guard | PASS | `scripts/eval/run-eval.sh` on the composed rc.2 tree, 40/48 (83.3%) against a 65% floor (rc.1's skill on the same 48 cases: 31/48). This is a lexical coverage guard, not an accuracy metric. See `scripts/eval/README.md` |
| Multi-conductor network test on real infrastructure | N/A | Requires a deployed bootstrap and relay. Out of scope for a documentation skill; the two-agent Sweettest covers DHT propagation in-process |
| Cross-tool portability (other AI clients) | N/A | Deferred to v2 in `docs/requirements.md`. v1.0 targets Claude Code. The cross-model checks that were run are the two GLM 5.3 end-to-ends above |
| Windows support | N/A | Holochain scaffolding refuses to set up Nix on Windows (`ScaffoldError::NixSetupError`). Upstream limitation, not a skill gap |

## Community readiness

| Check | Result | Evidence |
|---|---|---|
| License present | PASS | `LICENSE`, Apache-2.0 |
| Contribution guide present and accurate to this repo | PASS | `CONTRIBUTING.md`, written against the actual scripts and layout |
| Code of conduct present | PASS | `CODE_OF_CONDUCT.md`, Contributor Covenant 2.1 |
| Issue templates present | PASS | bug report, feature request, stale version report, plus `config.yml` |
| PR template present | PASS | `.github/pull_request_template.md` |
| CI runs the validator | PASS | `.github/workflows/validate.yml` |
| Requirements open questions resolved or explicitly deferred | PASS | `docs/requirements.md` now has a Decisions section; the two that remain are flagged as maintainer calls that do not gate v1.0 |
| No personal or PAI-specific content in the public tree | PASS | `MEMORY/` and `references/example-happ/target/` are gitignored. No absolute home-directory paths, personal identity, or private-tooling references in tracked files. The `~/.claude/skills/` paths in `README.md` are install instructions for a Claude Code skill, which is what the repo is |
