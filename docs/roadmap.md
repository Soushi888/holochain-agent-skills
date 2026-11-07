# Roadmap

## v1 - Core Spiral (SHIPPED 2026-08-17, v1.0.0)

**Theme:** Everything needed to build, test, and deploy a Holochain hApp from scratch.

**Domains:** Architecture, Design, Scaffold, Implement, Test, Deploy

**Workflows:**
- `DesignDataModel` — DHT entry/link type design with validation rules
- `Scaffold` — New project and new domain scaffolding workflows
- `ImplementZome` — Full CRUD zome implementation
- `DesignAccessControl` — Capability grants and admin patterns
- `PackageAndDeploy` — Kangaroo-Electron packaging and CI/CD
- `ReviewZome` — Proactive code review checklist

**Context files shipped ahead of schedule:**
- `references/wind-tunnel.md` — Performance/load testing with wind-tunnel (originally v2)

**Target:** All Agent Skills-compatible tools (Claude Code, GitHub Copilot, Cursor, Augment, Codex)

---

## v2 — Ecosystem Expansion

**Theme:** Connect to the broader Holochain ecosystem. Cross-hApp and cross-network patterns.

**Planned additions:**

### Sub-skills
- **hREA / ValueFlows** — Scaffold and implement ValueFlows-compatible economic resource tracking; `EconomicEvent`, `EconomicResource`, `Process` entry types; REA ontology patterns
- **holochain-open-dev** — Community-standard patterns: Profiles zome, linked devices, file storage, notifications
- **ADAM (coasys)** — AD4M perspectives, expression languages, cross-hApp linking
- **Holo Hosting** — HTTP gateway setup, edge node configuration, Holo Node ISO, HolOS
- **Unyt** — Holochain Foundation's P2P accounting and payment infrastructure; Alliance setup and configuration, Smart Agreements (RHAI scripting, three-layer template/agreement/RAVE architecture), transaction types (Pay, Request, Trade), inter-network and EVM bridging, agent onboarding via Joining Service REST API, Pricing Oracle integration, and deployment with `tauri-plugin-holochain`

### Architecture improvements
- Skill graph: parent orchestrator routing to sub-skills
- Cross-LLM portability (GLM 5, any client with skill support)

---

## v3 — GUI and Visual Tooling

**Theme:** Make Holochain accessible without deep framework knowledge. From developers to builders.

**Vision:**
- Visual DHT data model explorer — design entry/link types through a diagram interface
- No-code workflow UI — guided scaffold and deploy without terminal commands
- Architecture diagram generation — auto-generate from zome code
- Progressive disclosure — beginner mode (guided, verbose) vs. expert mode (fast, terse)
- Monitoring integration — visual DHT health, gossip status, conductor logs

**Inspiration:** Holo Node ISO's web-based Node Manager shows the direction — powerful infrastructure made accessible through UI. This skill's v3 applies the same principle to development tooling.

---

## PAI Integration (post-v1)

Once both the PAI version and vanilla version are field-tested:

1. **Audit differences** — what did each version evolve to independently?
2. **Extract shared knowledge** — create canonical knowledge files usable by both
3. **Layer PAI on top** — PAI SKILL.md wraps shared files and adds PAI-specific features (voice, project routing, Algorithm integration)
4. **Publish shared core** — vanilla skill becomes the community baseline; PAI version is a superset

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 0.1.0 | 2026-03-12 | Initial vanilla skill — 6 domains, 5 workflows, requirements spec |
| 0.1.1 | 2026-03-12 | Agent Skills Open Standard conformance, multi-platform README, testing plan |
| 0.1.2 | 2026-05-15 | Version bump to Holochain 0.6.1 (hdk=0.6.1, hdi=0.7.1); references/wind-tunnel.md shipped ahead of schedule | <!-- legacy-ok: a release history row, not a pin -->
| 0.2.0 | 2026-05-15 | Expanded progenitor pattern: full DnaProperties setup, bootstrap mode (`Option<AgentPubKey>`), integrity validation enforcement, is_progenitor hdk_extern, init() bootstrap, deploy-time injection via Kangaroo roles_settings; based on Requests & Offers implementation |
| 1.0.0 | 2026-08-17 | First stable release. Holochain 0.7 only (hdk=0.7.0, hdi=0.8.0, holonix main-0.7). Repository restructured to references/ + assets/ + scripts/. Example hApp compiles and its Sweettest suite passes. Countersigning, scheduling, cryptography and warrants documented. Validator, version bumper and routing eval in CI. Community files added. Verified end to end by a second model producing code that compiled on first try |
