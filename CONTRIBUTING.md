# Contributing

Thanks for considering a contribution to the Holochain Agent Skill. This is a documentation-only repository: a vanilla [Agent Skills Open Standard](https://agentskills.io) skill for Holochain hApp development. There is no Rust build and no TypeScript build for the skill itself. Every file is Markdown, YAML frontmatter, or a template file, except for the reference hApp under `skills/holochain/references/example-happ/`, which is real Rust and TypeScript that compiles.

## What this repository is

The skill is loaded by Claude Code (and other Agent Skills-compatible tools) when a user invokes `/holochain` or when Holochain-related work is detected. `skills/holochain/SKILL.md` is the entry point: it routes to `skills/holochain/references/workflows/*.md` for step-by-step sequences and to the other `skills/holochain/references/*.md` files for reference material, loaded on demand rather than all at once.

The repository also generates a static documentation site with mdBook, built from `book.toml` and `SUMMARY.md`. GitHub Actions deploys it to GitHub Pages on every push to `main`.

For the full file layout and the key architectural concepts the skill teaches (coordinator/integrity split, validation determinism, update chains, and so on), read `CLAUDE.md` at the repository root before editing reference content. It is the canonical map of this repository and takes precedence over anything below if the two ever disagree.

## The hard rule: examples must compile

Every Rust code example in this skill must match an API shape that actually compiles against `skills/holochain/references/example-happ/`, the reference hApp. `skills/holochain/references/example-happ/` is the ground truth for the skill: it is not sample text, it is a real Holochain 0.7 project.

**Never write an API shape from recall.** Holochain's HDK and HDI change in breaking ways between minor versions, and a plausible-looking function signature that used to be correct in an older release is exactly the kind of error this skill exists to prevent. Before adding or changing a code example:

1. Find the equivalent pattern in `skills/holochain/references/example-happ/` (or write it there first if it does not yet exist) and confirm it builds.
2. Copy the actual shape into the reference file, not a remembered approximation of it.
3. If you cannot verify a pattern against the example hApp, say so in the pull request rather than guessing.

## The validator is the gate

`scripts/validate-skill.sh` is what CI runs on every push and pull request (see `.github/workflows/validate.yml`), and it must pass locally before you open a pull request. It checks:

- `SKILL.md` frontmatter (`name`, `description`, `license`, `metadata`)
- that every routing target named in `SKILL.md` resolves to a real file
- that every skill markdown file is reachable from `SKILL.md` or `SUMMARY.md` (no orphans)
- that relative markdown links resolve
- version pin consistency between `SKILL.md` frontmatter and the rest of the skill
- that APIs removed in Holochain 0.7 are not taught as current
- that the old async test harness is not presented as the recommended one anymore (Sweettest is; at most one pointer to its community fork is allowed) <!-- legacy-ok -->
- that no leftover placeholder marker is left outside a fenced code block <!-- legacy-ok -->

Run it from the repository root:

```bash
sh scripts/validate-skill.sh
```

Add `-v` for verbose output that also prints passing checks:

```bash
sh scripts/validate-skill.sh -v
```

If the validator flags a new file you added as an orphan, that means it is not reachable from `SKILL.md`'s routing table or from `SUMMARY.md`. Add a link from the appropriate place rather than editing the validator's orphan rule to special-case your file.

## Bumping version pins

Holochain is sensitive to minor version changes, so this skill pins exact versions (`hdk = "=0.7.1"`, not `hdk = "0.7"`). **Never hand-edit a version pin.** Use `scripts/bump-versions.sh`, which rewrites every occurrence across the skill consistently:

```bash
scripts/bump-versions.sh --hdk X.Y.Z --hdi X.Y.Z --holonix main-X.Y \
  --node NN --client X.Y.Z --hc-spin X.Y.Z
```

Add `--dry-run` to preview the changes first. Bumping the pins is not the same as making the content correct: after running the script, you must run `scripts/validate-skill.sh`, which fails if any surviving code example still teaches an API that the new version removed. A green pin bump with a red validator means the skill claims a version it does not actually teach, and that pull request will not be merged as-is.

### Release tooling needs GNU coreutils

`scripts/validate-skill.sh`, `scripts/bump-versions.sh` and `scripts/check-versions.sh` are portable POSIX `sh` and run anywhere. The release scripts are not. `scripts/build-release-assets.sh` uses `tar --sort=name --owner --group --numeric-owner` and `sha256sum`, and `scripts/check-reproducible.sh` parses `tar -tvzf` output by field position. All of those are GNU behaviour. On macOS the bundled `bsdtar` has no `--sort` and there is no `sha256sum`, only `shasum -a 256`, so both scripts fail immediately rather than producing a wrong archive.

This does not affect a release, which runs on `ubuntu-latest`. It affects a maintainer building the archives locally before tagging. On macOS, `brew install coreutils gnu-tar` and put their `gnubin` directories on `PATH` first.

## Cutting a release

Releases are cut by [release-please](https://github.com/googleapis/release-please). The single human step is merging the release PR.

One version, declared in four places, and one tag. `package.json`, the `metadata.version` field of `skills/holochain/SKILL.md`, the topmost `## [x.y.z]` heading in `CHANGELOG.md`, and the git tag must all agree; `scripts/check-versions.sh vX.Y.Z` says whether they do, and `release.yml` refuses to publish when they do not. release-please moves all of them together, plus the install lines that name the tag (`README.md`, `AGENTS.md`, `docs/testing.md`) and the tag `install.sh` pins, which is what a rerun of the curl line moves every linked project to, which carry `x-release-please-*` markers. Keep those markers when editing around them.

1. **Write conventional commits.** release-please reads the commits merged to `main` since the last release. `feat` lands under Added, `fix` under Fixed, `docs` (most skill content) and `perf` under Changed, `ci` and `test` under Validation; `chore`, `build`, `style` and `refactor` are left out of the changelog. A `!` after the type or a `BREAKING CHANGE:` footer adds a breaking-changes section. The mapping lives in `release-please-config.json`.
2. **Read the release PR.** On every push to `main`, `.github/workflows/release-please.yml` opens or refreshes one PR titled `chore(release): X.Y.Z` that sets the version everywhere and prepends the new `CHANGELOG.md` section. That section is generated from commit subjects; to give it the narrative the hand-written sections have, edit `CHANGELOG.md` on the release PR's branch just before merging, because the next push to `main` regenerates the PR and drops edits made earlier. The workflow extracts that section verbatim as the GitHub release body.
3. **Merge it.** release-please tags the merge commit `vX.Y.Z` and leaves a draft GitHub release on the tag, then dispatches `release.yml` on that tag with `publish=true`. `release.yml` re-runs every gate (`validate-skill.sh`, the routing eval, `check-versions.sh` against the tag, the installer smoke test, the npm payload check, archive build and reproducibility), publishes to npm, uploads the `.tar.gz`, the `.zip` and `SHA256SUMS` to the draft and publishes it. A gate that fails stops the run before npm, so nothing is published and the release stays a draft. npm publishes before the GitHub release does, so a failure in between leaves the version on npm with its release still a draft; dispatching again finishes it.

The dispatch is there because of a GitHub rule: a tag or release created with `GITHUB_TOKEN` starts no workflow run, so `release.yml`'s own `push: tags` trigger never fires for a release-please tag. `workflow_dispatch` is the exception that always starts a run, and dispatching (rather than calling `release.yml` as a reusable workflow) keeps `release.yml` the workflow npm trusted publishing sees.

The gates are worth running locally before merging a release PR, since release-please opens it with `GITHUB_TOKEN` and that token's PRs do not start `validate.yml`: `sh scripts/validate-skill.sh`, `sh scripts/eval/run-eval.sh`, `sh scripts/check-versions.sh vX.Y.Z`, `bun run build`, `sh scripts/build-release-assets.sh`, `sh scripts/check-reproducible.sh`, `nix flake check`.

To rehearse without publishing, run `release.yml` by hand from the Actions tab (`workflow_dispatch`) with the tag as input and `publish` left off, or `gh workflow run release.yml --ref <branch> -f tag=vX.Y.Z`. Every gate and every build step runs, `Publish to npm` runs with `--dry-run` and prints the exact command and authentication mode a live run would use, and the GitHub release is not touched. The tag input must match the version in the tree, because `check-versions.sh` runs first. To finish a release whose run failed after the cause is fixed, dispatch it again on the tag itself: `gh workflow run release.yml --ref vX.Y.Z -f tag=vX.Y.Z -f publish=true`. If npm already has that version, its step fails on the duplicate and the job reports failure, but the GitHub release step still runs and publishes the draft.

Pushing a tag by hand (`git tag vX.Y.Z && git push origin vX.Y.Z`) still works, for a release cut outside release-please; the tree must already carry the version in every place above. `release.yml` then creates the release itself.

### Release candidates

A version that carries a hyphen, such as `1.0.0-rc.3`, is a prerelease. The workflow marks the GitHub release as one and publishes to npm under `next`. The `releases/latest/download` URL skips prereleases, so a candidate never reaches anyone following the stable install line; testers opt in by naming the candidate's own tag in the archive URL from its release page.

While the line is in candidates, `release-please-config.json` sets `"versioning": "prerelease"` with `"prerelease-type": "rc"`, so any releasable commit after `1.0.0-rc.2` proposes `1.0.0-rc.3`, then `rc.4`, and so on. To turn the candidate into the release, merge a commit whose body carries the footer `Release-As: 1.0.0`. An empty commit is enough, but give it a type that reaches the changelog, because release-please proposes nothing when every commit since the last release is hidden: `git commit --allow-empty -m "docs(release): promote the candidate to 1.0.0" -m "Release-As: 1.0.0"`. The next release PR proposes `1.0.0`, and the release is published as a normal release under the npm `latest` tag. After 1.0.0, set `versioning` back to `default` and `prerelease` to `false` in the config, or a `feat` would propose `1.1.0-rc` rather than `1.1.0`.

### Publishing to npm

The package is `holochain-agent-skills` on npm. A candidate publishes under the `next` dist-tag and a release under `latest`, so `npm install holochain-agent-skills` never picks up a candidate. The `Publish to npm` step runs on a tag push only when the repository variable `NPM_PUBLISH` is `true`, and it is deliberately not a gate on the GitHub release: a registry refusal fails the job visibly but never withholds archives that passed every check.

The step authenticates one of two ways, and prints which one it was given (`mode=token` or `mode=oidc`):

- **Bootstrap, once, with a token.** npm trusted publishing is configured on a package that already exists, so the very first publish needs a token. Create an npm granular access token with read and write access to packages and **Bypass 2FA** enabled (it is off by default at creation, and an account that requires 2FA for writes refuses CI without it, which is the 403 the first attempt hit). Store it as the `NPM_TOKEN` repository secret, set `NPM_PUBLISH` to `true`, and push the tag.
- **Steady state, with OIDC.** Once the package exists, add a trusted publisher in its settings on npmjs.com: GitHub Actions, repository `Soushi888/holochain-agent-skills`, workflow file `release.yml`, no environment (all fields are exact and case-sensitive). The first publish through it must happen within two days or the configuration expires. Then delete the `NPM_TOKEN` secret. The CLI exchanges the job's `id-token` for a short-lived credential, and provenance is generated automatically because the repository is public. `npm trust github` can set the publisher from the command line, but it needs npm 11.15.0 or later.

Trusted publishing needs npm 11.5.1 or later on Node 22.14.0 or later; the workflow upgrades npm when the runner's is older and prints both versions. It also needs `repository.url` in `package.json` to match this repository exactly, which it does (`git+https://github.com/Soushi888/holochain-agent-skills.git`).

## Reporting a stale version pin

If you notice a version pin in this skill that no longer matches what a Holochain project actually needs (a newer `hdk`/`hdi` release, a new `holonix` ref, a new `@holochain/client` or `hc-spin` version), that is the single most useful and lowest-friction contribution you can make. Open an issue using the **Stale Version Pin** issue template, which asks for the component, the version the skill currently claims, the version that is actually current, and the registry URL (crates.io, npm, or the relevant git ref) proving it. You do not need to fix the pin yourself; a well-sourced report is enough for a maintainer to run `scripts/bump-versions.sh` and re-verify the surrounding prose.

## `references/workflows/` vs. the other `skills/holochain/references/*.md` files

Files under `skills/holochain/references/workflows/` are step-by-step guided sequences: they walk through a task from start to finish (scaffolding a project, designing a data model, implementing a zome, and so on) and are what `SKILL.md`'s Workflow Routing table points to for a given natural-language trigger.

The other files directly under `skills/holochain/references/` (`architecture.md`, `patterns.md`, `testing.md`, `scaffolding.md`, `access-control.md`, `cell-cloning.md`, `error-handling.md`, `wind-tunnel.md`, `client.md`, `deployment.md`, `migration.md`, `troubleshooting.md`, and the `frameworks/` subdirectory) are reference material: they explain a domain rather than walking through a task. `SKILL.md`'s Context Files table routes to these on demand.

Keep this distinction when adding new content. A new step-by-step sequence belongs in `skills/holochain/references/workflows/`; a new domain explanation belongs alongside the existing reference files. Each pattern should live in exactly one canonical file, with `SKILL.md` routing to it, rather than being duplicated across files.

## `docs/` is not part of the skill

`docs/requirements.md`, `docs/roadmap.md`, and `docs/testing.md` are project tracking: a requirements specification, a roadmap, and a testing strategy. They are not loaded by the skill's routing table at runtime, and Claude Code never reads them when the skill is invoked. Feel free to consult them for project context, but do not treat them as skill content, and do not expect changes there to affect what the skill actually teaches.

## Building the documentation site

The documentation site is built with [mdBook](https://rust-lang.github.io/mdBook/) plus the `mdbook-frontmatter-strip` preprocessor (so that each file's YAML frontmatter does not leak into the rendered page):

```bash
cargo install mdbook mdbook-frontmatter-strip
mdbook build
```

This produces the `book/` directory, which is gitignored and rebuilt from source on every push to `main` via `.github/workflows/deploy-docs.yml`. You do not need to commit anything under `book/`.

## PAI-independence: no personal or private tooling

This skill must work with **zero** PAI (Personal AI Infrastructure) dependency: no `~/.claude/PAI/` directory, no Algorithm routing, no voice notification curls, no `PROJECTS.md` references, no personal file paths, no references to any private tooling that a community contributor would not have installed. Every piece of content must be self-contained and work in a vanilla Claude Code install, or in any other Agent Skills-compatible tool.

When contributing, check that you have not introduced:

- absolute filesystem paths specific to a maintainer's machine
- shell commands that call out to personal infrastructure (voice notifications, private APIs, personal cron jobs)
- references to files or systems that only exist in a maintainer's private setup

If in doubt, ask yourself whether the instruction would still make sense to someone who cloned this repository fresh, with nothing installed beyond Nix and the Holochain toolchain.

## Opening a pull request

1. Make your changes, keeping the "examples must compile" rule and the file-role distinctions above in mind.
2. Run `sh scripts/validate-skill.sh` locally and confirm it exits `0`.
3. If you touched a code example, confirm it still matches `skills/holochain/references/example-happ/` (or update the example hApp alongside it).
4. If you touched a version pin, use `scripts/bump-versions.sh`, not a hand edit.
5. Open the pull request. The template will ask you to confirm the above; fill it in honestly rather than skipping items.

## License

By contributing, you agree that your contributions will be licensed under the [Apache-2.0](LICENSE) license that covers this repository.
