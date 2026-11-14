# Testing Plan: Holochain Agent Skill v1

**Status:** Pre-release checklist
**Target:** v1.0.0 release gate

All tests are manual unless marked `[auto]`. Check each box before cutting a release.

---

## T1 — Agent Skills Open Standard Conformance

Validate that `SKILL.md` frontmatter meets the [Agent Skills Open Standard](https://agentskills.io) spec.

```bash
head -25 SKILL.md
```

| # | Test | Pass Condition |
|---|------|----------------|
| T1.1 | `name` field present | Key exists in frontmatter |
| T1.2 | `name` is lowercase | Value is `holochain` (no uppercase, no spaces) |
| T1.3 | `name` uses only alphanumeric + hyphens | Regex: `^[a-z0-9-]+$` |
| T1.4 | `description` field present | Key exists |
| T1.5 | `description` is between 1 and 1024 characters | `wc -c` on the value |
| T1.6 | `description` mentions primary use cases | Contains: "zome", "HDK", "Holochain" |
| T1.7 | `license` field is `Apache-2.0` | Value exactly matches |
| T1.8 | `compatibility` field present and non-empty | Key exists, value not blank |
| T1.9 | `metadata.author` is `soushi888` | Value matches |
| T1.10 | `metadata.version` is present | Key exists, SemVer format |
| T1.11 | `metadata.holochain-versions` references current pins | Contains `hdk=0.7.1`, `hdi=0.8.1`, `holonix ref=main-0.7` |

---

## T2 — File Integrity

Verify every file referenced in `SKILL.md` routing tables actually exists.

```bash
ls Workflows/*.md
ls *.md
```

| # | File | Exists? |
|---|------|---------|
| T2.1 | `references/workflows/design-data-model.md` | ☐ |
| T2.2 | `references/workflows/scaffold.md` | ☐ |
| T2.3 | `references/workflows/implement-zome.md` | ☐ |
| T2.4 | `references/workflows/design-access-control.md` | ☐ |
| T2.5 | `references/workflows/package-and-deploy.md` | ☐ |
| T2.6 | `references/architecture.md` | ☐ |
| T2.7 | `references/scaffolding.md` | ☐ |
| T2.8 | `references/patterns.md` | ☐ |
| T2.9 | `references/access-control.md` | ☐ |
| T2.10 | `references/cell-cloning.md` | ☐ |
| T2.11 | `references/error-handling.md` | ☐ |
| T2.12 | `references/testing.md` | ☐ |
| T2.13 | `references/client.md` | ☐ |
| T2.14 | `references/deployment.md` | ☐ |
| T2.15 | `LICENSE` at repo root | ☐ |
| T2.16 | `README.md` at repo root | ☐ |

---

## T3 — Routing Accuracy

For each Workflow Routing entry in `SKILL.md`, verify the trigger resolves to the correct file and the file's content matches the described purpose.

| # | Trigger phrase | Expected file | Content check |
|---|----------------|---------------|---------------|
| T3.1 | "design data model" | `references/workflows/design-data-model.md` | Contains Step 1 (domains/zome pairs) and Step 2 (entry type definition) |
| T3.2 | "new happ" | `references/workflows/scaffold.md` | Contains Nix install and `hc scaffold happ` commands |
| T3.3 | "implement zome" | `references/workflows/implement-zome.md` | Contains `hc scaffold entry-type` and integrity/coordinator structure |
| T3.4 | "who can call" | `references/workflows/design-access-control.md` | Contains `GrantConstraint::Unrestricted`, `GrantConstraint::Assigned` |
| T3.5 | "package" | `references/workflows/package-and-deploy.md` | Contains Kangaroo-Electron setup steps |

For each Context Files entry in `SKILL.md`:

| # | Load-when trigger | Expected file | Content check |
|---|-------------------|---------------|---------------|
| T3.6 | coordinator/integrity split | `references/architecture.md` | Contains `hdi` and `hdk` crate explanation |
| T3.7 | Nix flake setup | `references/scaffolding.md` | Contains `nix develop` and `flake.nix` |
| T3.8 | entry types, CRUD | `references/patterns.md` | Contains `#[hdk_entry_helper]` and `create_entry()` |
| T3.9 | cap grants | `references/access-control.md` | Contains `GrantConstraint::Unrestricted` and `init()` |
| T3.10 | cell cloning | `references/cell-cloning.md` | Contains `createCloneCell` and `clone_limit` |
| T3.11 | WasmError | `references/error-handling.md` | Contains `WasmError` and `ExternResult` |
| T3.12 | Sweettest tests | `references/testing.md` | Contains `await_consistency` and two-agent scenario |
| T3.13 | holochain-client | `references/client.md` | Contains `callZome` and signal handling |
| T3.14 | packaging, Kangaroo | `references/deployment.md` | Contains `.webhapp` and versioning guidance |

---

## T4 — Content Coverage

Verify each of the 6 skill domains has substantive (non-stub) content.

| # | Domain | Primary file | Pass condition |
|---|--------|--------------|----------------|
| T4.1 | Architecture | `references/architecture.md` | > 100 lines, covers integrity/coordinator split |
| T4.2 | Design | `references/workflows/design-data-model.md` | Has at least 4 numbered steps with examples |
| T4.3 | Scaffold | `references/scaffolding.md` + `references/workflows/scaffold.md` | Contains `nix develop`, `hc scaffold happ`, Nix flake template |
| T4.4 | Implement | `references/patterns.md` | Contains CRUD patterns, link types, validation section |
| T4.5 | Test | `references/testing.md` | Contains Sweettest setup, `await_consistency`, two-agent example |
| T4.6 | Deploy | `references/deployment.md` + `references/workflows/package-and-deploy.md` | Contains `kangaroo-electron`, `.webhapp` bundling, versioning |

---

## T5 — Code Example Accuracy

Validate specific API calls against the actual HDK 0.7 API (use the hAppenings or Nondominium codebase as reference).

### HDK / HDI API

| # | Example to validate | Expected form | File |
|---|---------------------|---------------|------|
| T5.1 | Entry type macro | `#[hdk_entry_helper]` on struct | `references/patterns.md` |
| T5.2 | Entry type enum in integrity | `#[hdk_entry_types]` on enum with `#[unit_enum(UnitEntryTypes)]` | `references/patterns.md` |
| T5.3 | Create entry | `create_entry(EntryTypes::MyEntry(entry))` | `references/patterns.md` |
| T5.4 | Get entry | `get(hash, GetOptions::default())` or `must_get_entry(hash)` | `references/patterns.md` |
| T5.5 | Delete link | `delete_link(link_hash, GetOptions::default())` (second arg required in 0.6) | `references/patterns.md` |
| T5.6 | Link types enum | `#[hdk_link_types]` on enum | `references/patterns.md` |
| T5.7 | Update chain tracking | `create_link(original_hash, new_hash, LinkTypes::EntryUpdates, ())` | `references/patterns.md` |
| T5.8 | Validation signature | `pub fn validate(op: Op) -> ExternResult<ValidateCallbackResult>` | `references/patterns.md` |
| T5.9 | `post_commit` infallible | `#[hdk_extern(infallible)]` + `pub fn post_commit(...)` | `references/architecture.md` or `references/patterns.md` |
| T5.10 | Remote signal cap grant | `GrantConstraint::Unrestricted` grant created in `init()` | `references/access-control.md` |
| T5.11 | consistency call | `await_consistency([&alice_cell, &bob_cell])` | `references/testing.md` |
| T5.12 | Scaffold compile check | `hc s sandbox generate workdir/` | `references/workflows/implement-zome.md` |

### Version pin consistency `[auto]`

```bash
grep -rn "hdk\s*=\s*\"=" . --include="*.md" --include="*.toml" | grep -v Plans/
grep -rn "hdi\s*=\s*\"=" . --include="*.md" --include="*.toml" | grep -v Plans/
grep -rn "holonix" . --include="*.md" | grep -v Plans/
```

| # | Check | Expected value | Pass condition |
|---|-------|----------------|----------------|
| T5.13 | `hdk` pin in SKILL.md Quick Reference | `"=0.7.1"` | All occurrences match |
| T5.14 | `hdi` pin in SKILL.md Quick Reference | `"=0.8.1"` | All occurrences match |
| T5.15 | `holonix ref` in SKILL.md and references/scaffolding.md | `main-0.7` | All occurrences match |
| T5.16 | No file references `hdk = "0.6.*"` or older | — | Zero matches |
| T5.17 | PackageAndDeploy.md Cargo.toml example pins match current | `hdk = "=0.7.1"` | Matches T5.13 |

---

## T6 - Installation Tests

Every method below is now covered by an automated job in `.github/workflows/validate.yml`
(the `package` and `nix` jobs). Run them by hand only when changing the installer, the
`files` array, the archive builder or the flake. Each one starts from a clean scratch
directory.

### Option A - release archive, the documented default

<!-- x-release-please-start-version -->
```bash
mkdir -p /tmp/t6a/.claude/skills && cd /tmp/t6a
curl -fsSL https://github.com/Soushi888/holochain-agent-skills/releases/download/v1.0.0-rc.2/holochain-agent-skills.tar.gz | tar -xz -C .claude/skills
```
<!-- x-release-please-end -->

| # | Test | Pass condition |
|---|------|----------------|
| T6.1 | Skill installed at the printed path | `.claude/skills/holochain/SKILL.md` exists |
| T6.2 | `references/` present | `.claude/skills/holochain/references/workflows/` holds 8 files |
| T6.3 | `assets/templates/` present | 17 template files copied |
| T6.4 | No workshop files leaked | No `book.toml`, `SUMMARY.md`, `CHANGELOG.md`, `CLAUDE.md`, `docs/` or `scripts/` under the installed directory |
| T6.5 | No build output copied | No `target/` or `node_modules/` under the installed directory |

### Option B - harness detection, via the bundled installer

Build it from a clone first (`bun run build`), then run `node <clone>/bin/install.mjs install`
from each scratch directory. Registry publishing is off, so this is how the installer is
reached; the detection logic itself is unchanged.

| # | Test | Setup | Pass condition |
|---|------|-------|----------------|
| T6.6 | Nothing detected | Empty directory | Falls back to `.claude/skills` and `.agents/skills`, and says so |
| T6.7 | Exactly one detected | `mkdir .cursor` | Installs to `.cursor/skills` without asking |
| T6.8 | Several detected, no TTY | `mkdir .claude .opencode .github`, run with stdin closed | Installs to all three, does not prompt, does not hang |
| T6.9 | Several detected, TTY | Same, under a pty | Prompts, honours a numeric selection, installs only what was chosen |
| T6.10 | Unknown target | `--target nope` | Exits 2 and names the known targets |

### Option C - archive integrity and the stable URL

```bash
# a stable (non-prerelease) tag also answers at the latest/download URL;
# a prerelease is skipped by it by design, so name the tag for a candidate
mkdir -p /tmp/t6c/.claude/skills && cd /tmp/t6c
curl -fsSL https://github.com/Soushi888/holochain-agent-skills/releases/latest/download/holochain-agent-skills.tar.gz | tar -xz -C .claude/skills
```

| # | Test | Pass condition |
|---|------|----------------|
| T6.11 | One command, correct shape | `.claude/skills/holochain/SKILL.md` exists, no rename step needed |
| T6.12 | Checksums verify | `sha256sum -c SHA256SUMS` passes for every asset |
| T6.13 | Archives are reproducible | Two builds of the same commit produce identical `SHA256SUMS` |

### Option D - symlink, for skill development

```bash
git clone https://github.com/Soushi888/holochain-agent-skills ~/holochain-agent-skills
cd /tmp/t6d && node ~/holochain-agent-skills/bin/install.mjs install --link
```

| # | Test | Pass condition |
|---|------|----------------|
| T6.14 | Symlink created | `.claude/skills/holochain` is a symlink to `skills/holochain` in the clone |
| T6.15 | `git pull` propagates | Pull in the clone, the symlinked install sees the change immediately |
| T6.16 | Reinstall over a symlink | A subsequent plain `install` replaces the symlink with a real directory rather than failing |

### Option E - Nix

| # | Test | Command | Pass condition |
|---|------|---------|----------------|
| T6.17 | Skill derivation is rooted at the skill | `nix build .#holochain` | `$out/SKILL.md` exists |
| T6.18 | Bundle matches the archive shape | `nix build .#default` | `$out/holochain/SKILL.md` exists |
| T6.19 | The derivation gates on the validator | Seed a frontmatter/directory name mismatch | `nix build` fails with that message |
| T6.20 | Flake checks pass | `nix flake check` | Exit 0 |
| T6.21 | `mkSkillsHook` survives a second shell | Enter a consumer devShell twice | No permission error on the second entry |

---

## T7 — Invocation Tests

Verify the skill loads and responds correctly in Claude Code.

| # | Test | Steps | Pass condition |
|---|------|-------|----------------|
| T7.1 | Explicit command invocation | Type `/holochain` in Claude Code | Skill loads, greets with Holochain context |
| T7.2 | Natural language trigger — workflow | Type "implement zome for Profile entry type" | `references/workflows/implement-zome.md` guidance appears |
| T7.3 | Natural language trigger — context file | Type "how do I set up a Sweettest test?" | `references/testing.md` content cited |
| T7.4 | Natural language trigger — scaffold | Type "scaffold a new happ called my-network" | `references/workflows/scaffold.md` steps appear |
| T7.5 | Version question | Ask "what version of hdk does this skill target?" | Responds with `0.7.1` |
| T7.6 | Out-of-scope question | Ask a non-Holochain question | Skill does not answer as if it's Holochain-related |

---

## T8 — PAI Independence

Verify the skill works in a clean Claude Code environment with no PAI infrastructure.

| # | Test | Steps | Pass condition |
|---|------|-------|----------------|
| T8.1 | No `~/.claude/PAI/` required | Temporarily rename `~/.claude/PAI/` to `~/.claude/PAI_bak/`, invoke skill | Skill loads without error |
| T8.2 | No voice curl in skill files | `grep -r "localhost:8888" .` | Zero matches |
| T8.3 | No Algorithm routing references | `grep -r "ALGORITHM\|AlgorithmMode\|PAI/Algorithm" .` | Zero matches in skill files |
| T8.4 | No PROJECTS.md references | `grep -r "PROJECTS.md" .` | Zero matches in skill files |
| T8.5 | Restore PAI after test | `mv ~/.claude/PAI_bak ~/.claude/PAI` | Restore before next session |

---

## T9 — Workflow End-to-End Tests

For each workflow, walk through the steps in Claude Code with a real or simulated project and verify guidance is accurate and complete.

### T9.A — DesignDataModel

**Trigger:** "design data model for a marketplace listing"

| # | Step | Pass condition |
|---|------|----------------|
| T9.A.1 | Step 1: Identify domains | Skill asks or describes how to map business nouns to zome pairs |
| T9.A.2 | Step 2: Define entry types | Produces a Rust struct definition with field types |
| T9.A.3 | Step 3: Define link types | Produces at least AgentTo*, PathTo*, *Updates link types |
| T9.A.4 | Step 4: Discovery strategy | Explains Path anchor vs. agent-linked discovery tradeoffs |
| T9.A.5 | Step 5: Validation rules | Produces at least one validation rule per entry type |
| T9.A.6 | Output completeness | Produces a summary table or structured output usable as implementation spec |

### T9.B — Scaffold

**Trigger:** "scaffold new happ called community-app"

| # | Step | Pass condition |
|---|------|----------------|
| T9.B.1 | Nix install step | Provides `curl` Determinate Nix installer command |
| T9.B.2 | flake.nix creation | Provides template with `holonix ref=main-0.7` |
| T9.B.3 | `hc scaffold happ` command | Correct command with app name parameter |
| T9.B.4 | First DNA scaffold | `hc scaffold dna` command shown |
| T9.B.5 | First zome pair scaffold | `hc scaffold zome` for integrity + coordinator |
| T9.B.6 | Compile verification | `hc s sandbox generate workdir/` step present |

### T9.C — ImplementZome

**Trigger:** "implement zome for Profile entry type"

| # | Step | Pass condition |
|---|------|----------------|
| T9.C.1 | Scaffold step | `hc scaffold entry-type Profile` and link-type commands shown |
| T9.C.2 | Integrity crate | Produces `Profile` struct with `#[hdk_entry_helper]`, entry type enum |
| T9.C.3 | Validation function | Produces `validate()` function with `Op` pattern matching |
| T9.C.4 | Coordinator — create | Produces `create_profile()` using `create_entry()` |
| T9.C.5 | Coordinator — read | Produces `get_profile()` using `get()` with `GetOptions::default()` |
| T9.C.6 | Coordinator — update | Uses `update_entry()` and `create_link()` for update chain |
| T9.C.7 | Coordinator — delete | Uses `delete_entry()` and handles link cleanup |
| T9.C.8 | Test scaffold | Produces at minimum a two-agent Sweettest structure |

### T9.D — DesignAccessControl

**Trigger:** "design access control for my admin zome"

| # | Step | Pass condition |
|---|------|----------------|
| T9.D.1 | Caller mapping table | Produces table of function → caller type |
| T9.D.2 | Unrestricted grant | Shows `init()` with `GrantConstraint::Unrestricted` for remote signals |
| T9.D.3 | Progenitor check | Shows `dna_info().provenance` check for admin-only functions |
| T9.D.4 | Assigned grant | Shows `GrantConstraint::Assigned` pattern with agent key |
| T9.D.5 | `recv_remote_signal` | Shows correct extern signature and cap grant pairing |

### T9.E — PackageAndDeploy

**Trigger:** "package my happ for desktop distribution"

| # | Step | Pass condition |
|---|------|----------------|
| T9.E.1 | Version compatibility check | Asks for or checks `hdk`/`hdi` versions before proceeding |
| T9.E.2 | Kangaroo-Electron setup | `git clone` command for Kangaroo repo shown |
| T9.E.3 | `.happ` bundle step | `hc app pack` or equivalent command shown |
| T9.E.4 | `.webhapp` bundle step | UI + `.happ` combined packaging step shown |
| T9.E.5 | Versioning guidance | Explains semantic version bump for DNA updates vs UI-only updates |
| T9.E.6 | CI/CD note | At minimum mentions GitHub Actions or manual release process |

---

## T10 — Cross-Tool Compatibility

### Claude Code (primary)

Covered by T7 and T9 above.

### GitHub Copilot

| # | Test | Pass condition |
|---|------|----------------|
| T10.1 | Install to `.claude/skills/holochain/` in project root | Directory exists with `SKILL.md` |
| T10.2 | Copilot agent mode recognizes skill | Skill name `holochain` appears in available skills list |
| T10.3 | Basic invocation | Copilot responds with Holochain context when asked about zomes |

### Cursor

| # | Test | Pass condition |
|---|------|----------------|
| T10.4 | Install to `.claude/skills/holochain/` in project root | Directory exists with `SKILL.md` |
| T10.5 | Cursor agent detects skill | Skill is listed or referenced in agent context |
| T10.6 | Basic invocation | Cursor responds with Holochain guidance when triggered |

### Augment Code

| # | Test | Pass condition |
|---|------|----------------|
| T10.7 | Install to `.claude/skills/holochain/` | Directory exists |
| T10.8 | Skill loaded by Augment | Skill context is included in agent workspace |

### OpenAI Codex CLI

| # | Test | Pass condition |
|---|------|----------------|
| T10.9 | Install to `.claude/skills/holochain/` | Directory exists |
| T10.10 | Codex reads SKILL.md frontmatter | Invocation triggers Holochain-domain responses |

> **Note:** T10.2–T10.10 require access to each tool. Mark as `N/A` if the tool is not installed. T10.1 and T10.4 are always testable.

---

## T11 — Repository Hygiene

| # | Test | Command | Pass condition |
|---|------|---------|----------------|
| T11.1 | `LICENSE` file is Apache-2.0 | `head -3 LICENSE` | Contains "Apache License, Version 2.0" |
| T11.2 | No `Plans/` content ships as skill | `SKILL.md` routing table has no reference to `Plans/` | Zero `Plans/` entries in routing table |
| T11.3 | No `docs/` loaded by skill | `SKILL.md` routing table has no reference to `docs/` | Zero `docs/` entries in routing table |
| T11.4 | No broken markdown links | Scan for relative markdown links in all files | All linked files exist |
| T11.5 | No TODO / STUB markers | `grep -rn "TODO\|STUB\|PLACEHOLDER" . --include="*.md"` | Zero matches in non-Plans/ files |
| T11.6 | README install command is the one that works | Run the first fenced command in README.md verbatim in a scratch directory | Skill installed, exit 0 |
| T11.8 | Nothing outside the payload ships | `npm pack --dry-run` (the packaging manifest is still the payload allowlist, whether or not the package is published) | Every path is under `skills/`, `bin/`, or is `README.md` / `LICENSE` / `package.json` |
| T11.9 | The four version declarations agree | `sh scripts/check-versions.sh` | Exit 0 |
| T11.7 | CLAUDE.md license annotation | `grep "Apache" CLAUDE.md` | Matches `Apache-2.0` |

---

## Release Gate

All items below must be ✅ before tagging a release.

**Spec & Structure (non-negotiable)**
- [ ] T1 — All 11 frontmatter checks pass
- [ ] T2 — All 16 files exist
- [ ] T3 — All 14 routing entries resolve correctly
- [ ] T11 — All 7 hygiene checks pass

**Content**
- [ ] T4 — All 6 domains have substantive content
- [ ] T5.13–T5.17 — Version pins consistent across all files

**Code Accuracy** (sample — validate at least 6 of 12)
- [ ] T5.1–T5.12 — At least 6 code examples verified against real codebase

**Installation**
- [ ] T6.1–T6.4 — Option A passes
- [ ] T6.5–T6.6 — Option B passes
- [ ] T6.7–T6.9 — Option C passes

**Invocation**
- [ ] T7.1–T7.5 — Claude Code invocation tests pass (T7.6 optional)

**Workflows** (all 5 required)
- [ ] T9.A — DesignDataModel workflow complete
- [ ] T9.B — Scaffold workflow complete
- [ ] T9.C — ImplementZome workflow complete
- [ ] T9.D — DesignAccessControl workflow complete
- [ ] T9.E — PackageAndDeploy workflow complete

**Independence**
- [ ] T8.1–T8.4 — PAI independence verified

**Cross-tool** (Claude Code required; others optional for v1)
- [ ] T10.1 — Install path verified for at least one non-Claude-Code tool

---

*Once all release gate items are checked, merge the `1.0.0` release PR (see "Cutting a release" in `CONTRIBUTING.md`).*
