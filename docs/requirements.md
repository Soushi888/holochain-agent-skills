# Requirements Specification: Holochain Agent Skill

**Discovery session:** 2026-03-12
**Status:** v1 scope confirmed

---

## Problem Statement

The Holochain developer ecosystem lacks a comprehensive AI coding assistant skill that covers the full development cycle in one place. Existing documentation is scattered across developer.holochain.org, GitHub repos, and community channels. New developers face steep learning curves; experienced developers lack a fast co-pilot for implementation patterns. This skill addresses both by providing a structured, context-aware assistant that works across the full spiral: architecture, design, scaffolding, implementation, testing, and deployment.

A secondary goal is enabling the wider Holochain community to benefit from AI-assisted development without requiring PAI (Personal AI Infrastructure) — the skill must work as a standalone agent skill with zero external dependencies.

---

## Target Users

| Persona | Context | Primary Need |
|---------|---------|-------------|
| **Junior Holochain developer** | Learning the framework, first hApp | Guided workflows, explanations, scaffold commands |
| **Experienced Holochain developer** | Active project, knows the patterns | Fast pattern lookup, CRUD generation, debugging help |
| **Full-stack developer new to Holochain** | Knows Rust/TypeScript, learning DHT concepts | Architecture explanation, data model design, TypeScript client integration |

---

## Functional Requirements

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| FR-01 | Skill must cover Architecture domain | Must | `references/architecture.md` loads on request; covers coordinator/integrity split, DNA structure, Nix, progenitor, multi-DNA, private entries |
| FR-02 | Skill must cover Design domain | Must | `references/workflows/design-data-model.md` guides entry/link type design with output artifacts |
| FR-03 | Skill must cover Scaffold domain | Must | `references/scaffolding.md` + `references/workflows/scaffold.md` cover: Holonix setup, Nix flake, hc CLI, `hc scaffold` commands, new project workflow, add-domain-to-existing workflow |
| FR-04 | Scaffold workflow follows official Holochain documentation | Must | Commands and patterns reference developer.holochain.org; version pins current (hdk=0.7.1, hdi=0.8.1) |
| FR-05 | Skill must cover Implementation domain | Must | `references/patterns.md` covers entry types, link types, CRUD, cross-zome calls, signals, validation, HDK 0.7 API |
| FR-06 | Skill must cover Testing domain | Must | `references/testing.md` covers Sweettest setup, two-agent scenarios, `await_consistency`, update/delete patterns |
| FR-07 | Skill must cover Deployment domain | Must | `references/deployment.md` + `references/workflows/package-and-deploy.md` cover Kangaroo-Electron packaging, CI/CD, versioning |
| FR-08 | Skill must be PAI-independent | Must | No voice notification curl, no SKILLCUSTOMIZATIONS hook, no PROJECTS.md references, no Algorithm routing; works in vanilla Claude Code |
| FR-09 | Skill must include installation documentation | Must | `README.md` with 3 installation options (global, project-local, symlink), quick start examples |
| FR-10 | Domain correspondence with PAI version | Should | Same sections, same knowledge depth, same workflow structure — different wrappers |
| FR-11 | Skill routing covers all 5 workflows | Must | `SKILL.md` routing table maps natural language triggers to correct workflows |
| FR-12 | Context files load on demand | Must | `SKILL.md` specifies which context file to load for each topic; not all pre-loaded |

---

## Non-Functional Requirements

| ID | Category | Requirement | Target |
|----|----------|-------------|--------|
| NFR-01 | Portability | Works with zero PAI infrastructure | Verified by install in fresh Claude Code with no `~/.claude/PAI/` |
| NFR-02 | Currency | Version pins match current stable Holochain | hdk=0.7.1, hdi=0.8.1, holonix ref=main-0.7 at release |
| NFR-03 | Completeness | All 6 domains have content | No stub files in v1 release |
| NFR-04 | Accuracy | Code examples compile and run correctly | Examples tested against real hAppenings/Nondominium codebase |

---

## Constraints

- **v1 conforms to Agent Skills Open Standard** — compatible with Claude Code, GitHub Copilot, Cursor, Augment, and Codex
- **Ecosystem expansion deferred to v2**: hREA, unyt, ADAM, and deep holochain-open-dev component patterns are not in scope. Wind Tunnel ships in v1.0 (`references/wind-tunnel.md`), and `SKILL.md` carries a companion-library currency table so users are not steered at 0.6-era tooling
- **Two independent codebases for v1** — PAI version and vanilla version developed separately; integration/merge post-v1
- **No GUI in v1** — visual tooling, diagram generation, and no-code interfaces are v3+ vision
- **Official docs anchor** — Scaffold workflow must follow developer.holochain.org, not invent conventions

---

## Decisions

Settled for v1.0 on 2026-08-17.

| Question | Decision | Evidence |
|---|---|---|
| Public repo location | Personal GitHub, `Soushi888/holochain-agent-skills`, Apache-2.0. Moving to a community org stays possible later and costs nothing now | The repo is already there; `LICENSE` is Apache-2.0 |
| Contribution model | Open from day one | `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1), issue forms including a dedicated stale-version report, and a PR template all ship in v1.0 |

### Still open, needs a maintainer call

- **Community discovery:** how to publicize to the Holochain developer community. Candidates are the Holochain Discord, the developer forum, and the holochain-open-dev orbit. Not a code decision, so it does not gate v1.0.
- **PAI merge trigger:** time-based or milestone-based. Out of scope for the public repo, which must stay PAI-independent by constraint.

---

## Deferred (v2+)

| Feature | Target Version | Description |
|---------|---------------|-------------|
| hREA / ValueFlows sub-skill | v2 | Scaffold and implement ValueFlows-compatible zomes |
| holochain-open-dev patterns | v2 | Profiles, links to other happs, linked devices |
| ADAM (coasys) integration | v2 | AD4M perspectives and expression languages |
| unyt integration | v2 | Unit-aware numeric types for resource tracking |
| Holo hosting / edge nodes | v2 | HTTP gateway, HolOS, Holo Node ISO setup |
| Cross-LLM portability | v2 | Adapt for GLM 5, other AI clients with skill support |
| Skill graph / ecosystem orchestrator | v2 | Parent skill routing to domain sub-skills |
| GUI / visual programming | v3+ | No-code interface with DHT model explorer |
| Diagram generation | v3+ | Visual architecture and data flow diagrams |
| Progressive disclosure UI | v3+ | Junior/senior mode switching |
