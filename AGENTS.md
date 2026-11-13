# AGENTS.md

Two audiences. If someone handed you this repository's URL and asked you to
install the skill, read the first section and stop. If you are changing files
here, read the second.

---

## Installing this skill

Run this from the root of the project that should get the skill:

```bash
curl -fsSL https://raw.githubusercontent.com/Soushi888/holochain-agent-skills/main/install.sh | sh
```

It needs git, and Node 22.18 or later or Bun, and checks for both. It clones the release into `~/.holochain-agent-skills` (or moves that clone to the release), detects every harness directory the project has, and links the skill into each without prompting. Running it again is safe and updates the clone. Pass options after `sh -s --`: `--target claude,cursor`, `--global`, `--copy`, `--dry-run`. Without git or Node, use the release archive:

```bash
mkdir -p .claude/skills && curl -fsSL \
  https://github.com/Soushi888/holochain-agent-skills/releases/download/v1.0.0-rc.2/holochain-agent-skills.tar.gz \
  | tar -xz -C .claude/skills
```

Replace `.claude/skills` with your harness's path if it differs: `.agents/skills` for the
tool-agnostic location, `.opencode/skills`, `.github/skills` for Copilot, `.gemini/skills`,
`.cursor/skills`. Extract into more than one if the project uses more than one harness. The
archive's root is one directory per skill, so the extraction lands
`.claude/skills/holochain/SKILL.md` with no rename step and no `--strip-components`.

Each release also publishes `SHA256SUMS` beside the archive if you want to verify the
download, and a `.zip` if `tar` is unavailable.

### Confirming it worked

`SKILL.md` should exist under the printed path. Restart the agent afterwards:
most harnesses read skills once, at startup.

### What you just installed

A skill for Holochain hApp development pinned to **Holochain 0.7**: HDK 0.7.1,
HDI 0.8.1, holonix `main-0.7`. It covers coordinator and integrity zome
architecture, entry and link types, validation, capability grants, membranes,
Sweettest, the TypeScript client, and packaging. If the project you are
working in uses Holochain 0.6 or earlier, this skill will actively mislead
you: it documents the 0.7 action model and deliberately carries no 0.6 API
content. Use the `v0.2.0` tag for 0.6.

---

## Working on this repository

`CLAUDE.md` is the authoritative guide: layout, routing architecture, version
pins, and the rules for editing reference files. `CONTRIBUTING.md` covers the
contribution workflow. Read one of them before changing anything.

Three things worth knowing before your first edit:

**Only `skills/` ships.** Everything else in the repository is workshop:
`docs/`, `scripts/`, `nix/`, `book.toml`, the community files. A consumer who
installs this package gets `skills/holochain/` and nothing else. If you add a
file that consumers need, it goes under `skills/holochain/`.

**Never write an API shape from recall.** Every Rust example must match
something that compiles in `skills/holochain/references/example-happ/`, which
is a real hApp with a passing Sweettest suite. If you cannot point at the line
that proves a shape, do not write it.

**The validator is the gate, and it is not advisory:**

```bash
sh scripts/validate-skill.sh      # structure, routing, links, pins, removed APIs
sh scripts/eval/run-eval.sh       # routing regression floor
sh scripts/check-versions.sh      # the four version declarations agree
```

Read the exit code from the script itself, not from a pipeline. `validate-skill.sh
| tail -2; echo $?` reports `tail`'s status, so a failing run reads as success.
This has bitten twice.
