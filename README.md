# Holochain Agent Skills

[![Validate](https://github.com/Soushi888/holochain-agent-skills/actions/workflows/validate.yml/badge.svg)](https://github.com/Soushi888/holochain-agent-skills/actions/workflows/validate.yml)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/Soushi888/holochain-agent-skills)

Agent skills for Holochain hApp development, built to the
[Agent Skills Open Standard](https://agentskills.io) so they work in Claude Code, opencode,
GitHub Copilot, Cursor, Gemini CLI and every other tool that adopted the format. Pinned to
**Holochain 0.7**, verified against a reference hApp that actually compiles.

## Install

```bash
mkdir -p .claude/skills && curl -fsSL \
  https://github.com/Soushi888/holochain-agent-skills/releases/download/v1.0.0-rc.1/holochain-agent-skills.tar.gz \
  | tar -xz -C .claude/skills
```

Run it from the root of the project that should get the skill, and replace `.claude/skills`
with your harness's path if it differs (the table below lists them all). The archive's root is
one directory per skill, so the extraction lands `skills/holochain/SKILL.md` with no rename
step and no `--strip-components`. Every release also publishes `SHA256SUMS`, so you can verify
what you downloaded.

Restart your agent afterwards. Most harnesses read skills once, at startup. Then ask it
anything about Holochain, or invoke it by name (`/holochain` in Claude Code).

<details>
<summary>Other ways to install</summary>

**Nix.** Either take the source tree and point at the subdirectory:

```nix
inputs.holochain-agent-skills = {
  url = "github:Soushi888/holochain-agent-skills/v1.0.0-rc.1";
  flake = false;
};
# consume: "${inputs.holochain-agent-skills}/skills/holochain"
```

or use the flake, which also hands you the devShell glue:

```nix
inputs.holochain-agent-skills.url = "github:Soushi888/holochain-agent-skills/v1.0.0-rc.1";

# in your devShell:
shellHook = ''
  ${inputs.holochain-agent-skills.lib.mkSkillsHook {
    inherit pkgs;
    skills = [{
      src  = inputs.holochain-agent-skills.packages.${system}.holochain;
      name = "holochain";
    }];
  }}
'';
```

`packages.<system>.holochain` is rooted at the skill itself, so `${it}/SKILL.md` exists.
`packages.<system>.default` is the bundle, one directory per skill, matching the release
archive. `mkSkillsHook` writes into `.claude/skills`, `.cursor/skills` and `.agents/skills`
by default; pass `targets` to change that. It exists because every consumer writes the same
rsync glue and hits the same wall: Nix store paths are read-only and `rsync -a` preserves
that mode, so the *second* `nix develop` fails with a permission error. The hook passes
`--chmod=u+w`.

**Clone it, and use the installer.** The repository ships a harness-detecting installer that
finds every agent harness a project uses and installs into all of them at once:

```bash
git clone https://github.com/Soushi888/holochain-agent-skills ~/holochain-agent-skills
cd ~/holochain-agent-skills && bun run build

cd your-project
node ~/holochain-agent-skills/bin/install.mjs install --yes
```

Useful flags: `--global` installs into the home-directory scope instead of the project,
`--target claude,opencode` picks specific harnesses, `--dry-run` prints what would happen,
and `--link` symlinks rather than copies so a `git pull` updates every installed copy at
once. `install.mjs list` prints every skill and every harness path it knows.

**Pin a version.** The archive URL above names its tag, so pinning is just choosing the tag.
Release candidates are marked as prereleases, which means `releases/latest/download` skips
them: it keeps pointing at the last stable release until 1.0.0 ships.

**If you pinned this repository before 1.0, the path changed.** The repository root used to be
the skill, so glue that copied the root worked. It no longer does, and it fails silently: the
root now holds no `SKILL.md` at all, so a harness pointed at a copy of it finds no skill and
loads nothing, with no error to read. Append `skills/holochain` to whatever you pin:

```bash
# before 1.0
rsync -a --delete "${SRC}/" .claude/skills/holochain/
# 1.0 and later
rsync -a --delete "${SRC}/skills/holochain/" .claude/skills/holochain/
```

or drop the glue and use `lib.mkSkillsHook` above. The full breaking list is in
[CHANGELOG.md](CHANGELOG.md).

</details>

### Where it installs

Extract the archive into whichever path your harness reads. If you use the bundled installer
instead, detection looks for each harness's marker directory in the project root, or in `$HOME`
with `--global`: exactly one found means that one is used; several found means all of them, or
an interactive choice if you are at a terminal; none found falls back to `.claude/skills` and
`.agents/skills`.

| Harness | Project path | Global path |
|---------|--------------|-------------|
| Claude Code | `.claude/skills` | `~/.claude/skills` |
| Agent Skills (tool-agnostic) | `.agents/skills` | `~/.agents/skills` |
| opencode | `.opencode/skills` | `~/.config/opencode/skills` |
| GitHub Copilot | `.github/skills` | `~/.copilot/skills` |
| Gemini CLI | `.gemini/skills` | `~/.gemini/skills` |
| Cursor | `.cursor/skills` | `~/.cursor/skills` |

The bundled installer never prompts without an interactive terminal, so an agent or a CI job
can run it unattended.

## What it covers

| Domain | Description |
|--------|-------------|
| **Architecture** | Coordinator and integrity zome split, DNA structure, Cargo workspace, Nix dev environment, progenitor pattern, multi-DNA, private entries |
| **Design** | DHT data modeling, entry and link type design, discovery strategy, validation rules |
| **Scaffold** | Holonix setup, Nix flake, `hc` CLI, `hc scaffold`, new project and new domain workflows |
| **Implement** | Entry types, link types, CRUD, cross-zome calls, signals, validation, HDK 0.7 API |
| **Test** | Sweettest two-agent scenarios, `await_consistency`, update and delete patterns, inline zomes |
| **Deploy** | Kangaroo-Electron packaging, `.webhapp` bundling, CI/CD, versioning, auto-update |

**Version pins:** `hdk = "=0.7.0"` | `hdi = "=0.8.0"` | `holonix ref=main-0.7`

This release targets Holochain 0.7 only, and carries no 0.6 API content by design. On a 0.6
project it will actively mislead you. Use the `v0.2.0` tag for 0.6, or the skill's
`UpgradeHolochain07` workflow to port.

## Quick start

```
# Design a new data model
/holochain design data model for a marketplace listing with status transitions

# Scaffold a new hApp from scratch
/holochain scaffold new happ called my-network

# Implement a full CRUD zome
/holochain implement zome for Profile entry type

# Debug a flaky test
/holochain my Sweettest passes alone but fails when Bob reads Alice's entry

# Package for distribution
/holochain deploy package my happ for desktop distribution
```

## Workflow triggers

| Say... | Triggers |
|--------|---------|
| "design data model", "model entries", "what entries" | DesignDataModel |
| "scaffold", "new happ", "new project", "setup environment" | Scaffold |
| "implement zome", "create zome", "write zome" | ImplementZome |
| "design access control", "cap grant", "who can call" | DesignAccessControl |
| "upgrade to 0.7", "port from 0.6", "migrate hApp" | UpgradeHolochain07 |
| "deploy", "package", "webhapp", "kangaroo" | PackageAndDeploy |

## Ecosystem roadmap

**v1 (current):** the full development cycle. Architecture, design, scaffold, implement,
test, deploy.

**v2 (planned):** ecosystem expansion, as further skills in this repository.

- hREA and ValueFlows
- holochain-open-dev patterns
- ADAM (coasys) integration
- unyt integration

**v3 (vision):** GUI and visual tooling. A visual DHT data model explorer, architecture
diagram generation, progressive disclosure from junior to senior.

## Repository layout

`skills/` is the shipped payload. Everything else exists to build, validate, document and
release it, and never reaches an installed copy.

```
skills/holochain/              THE SKILL. Nothing outside this directory ships.
  SKILL.md                       Entry point: routing table, context index, quick reference,
                                 toolchain currency and companion-library tables
  references/                    Reference material, loaded on demand
    architecture.md                Coordinator/integrity split, DNA structure, workspace, Nix
    progenitor.md                  Progenitor pattern, DNA properties, bootstrap founder
    patterns.md                    Entry types, links, CRUD, validation, signals, HDK 0.7 API
    scaffolding.md                 Holonix, Nix flake, hc CLI, hc scaffold
    access-control.md              Capability grants, cap claims, remote signals
    membranes.md                   genesis_self_check, membrane proofs, gating who may join
    cryptography.md                App-level signing and encryption
    scheduling.md                  Scheduled functions, persisted vs ephemeral
    countersigning.md              Atomic multi-agent commits
    cell-cloning.md                Partitioned data via clone cells
    error-handling.md              thiserror and WasmError patterns
    source-chain.md                query(), introspection, host functions, validation receipts
    networking.md                  Kitsune2 and iroh, NetworkConfig, bootstrap and relay servers
    testing.md                     Sweettest patterns, two-agent scenarios, E2E
    wind-tunnel.md                 Performance and load testing
    client.md                      @holochain/client, auth tokens, admin API, signals
    deployment.md                  Kangaroo-Electron packaging and distribution
    migration.md                   DNA migration and init properties
    troubleshooting.md             Literal error strings mapped to causes
    debugging.md                   Logs, hc sandbox, hc-client, inspecting a live conductor
    frameworks/                    Svelte and Effect-TS integration
    workflows/                     Step-by-step guided sequences, routed from SKILL.md
    example-happ/                  A real, compiling 0.7 hApp: ground truth for every example
  assets/templates/              Template files (flake.nix, manifests, zome sources, harness)

scripts/                       validate-skill.sh, bump-versions.sh, check-versions.sh,
                               build-release-assets.sh, install.ts, eval/
nix/                           skill.nix, mk-skills-hook.nix
docs/                          Requirements, roadmap, testing matrix. Not part of the skill
AGENTS.md                      Install instructions addressed to an agent
```

## Community

Questions, ideas, and reports on how the skill behaved on your project go to [Discussions](https://github.com/Soushi888/holochain-agent-skills/discussions). While `v1.0.0-rc.1` is a candidate, a [field report](https://github.com/Soushi888/holochain-agent-skills/discussions/new?category=field-reports) is the most useful thing you can send. Issues are for defects you can point at a file.

## Contributing

Contributions welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) first; the short version is
that no API shape may be written from recall, and every Rust example must match something
that compiles in `skills/holochain/references/example-happ/`.

Before opening a pull request:

```bash
sh scripts/validate-skill.sh      # structure, routing, links, pins, removed APIs
sh scripts/eval/run-eval.sh       # routing regression floor
sh scripts/check-versions.sh      # the four version declarations agree
```

When updating for a new Holochain release, run `scripts/bump-versions.sh` rather than
hand-editing pins, then run the validator to confirm nothing was missed. CI runs all three
gates plus a Nix build and an mdBook build on every push and pull request.

## Documentation site

<https://soushi888.github.io/holochain-agent-skills/>

## License

Apache-2.0
