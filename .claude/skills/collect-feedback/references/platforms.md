# Where feedback on the skill arrives

Mapped on 2026-11-16 by a full sweep.
A platform that turns out to matter, or to be dead, is added or removed here in the same PR that learns it.

## Read without a browser

| Platform | How to read it | Check |
|---|---|---|
| GitHub Discussions (field reports, Q&A, ideas, show and tell, polls) | `gh api graphql` over `repository.discussions` with comments and replies | every sweep |
| GitHub issues and their comments | `gh issue list -R Soushi888/holochain-agent-skills --state all`, then `gh issue view N --comments` | every sweep |
| Review comments by anyone but the maintainer | `gh api repos/Soushi888/holochain-agent-skills/pulls/N/comments` and `/reviews` | when an outside PR is open |
| Mentions in other repositories | `gh search code`, `gh search issues`, `gh search prs` for `holochain-agent-skills` and `holochain-agent-skill` | every sweep |
| holochain/ai-tools | `gh search issues --repo holochain/ai-tools` and its code search for the skill | every sweep |
| Flowsta / YourOwnAI add-ons directory | `gh api repos/WeAreFlowsta/your-own-ai-add-ons/contents/skills/holochain/manifest.json` (pinned commit, `claimed`) | monthly |
| Skill directories | WebFetch on skills.sh (both names), skills.cat, awesomeskills.dev; `gh` on sudosubin/agents.nix, jonslimak/omgskills, findscripter/everything-skills | monthly, to catch stale pins and copies under other accounts |
| Holochain blog and docs | WebFetch blog.holochain.org; `gh search` in holochain/docs-pages | monthly |
| Hacker News | Algolia API `hn.algolia.com/api/v1/search?query=holochain-agent-skills` | monthly |
| npm | `registry.npmjs.org/holochain-agent-skills` (not published as of 2026-11-16) | once published |

## Read through the maintainer's Chrome

| Platform | How to read it | Check |
|---|---|---|
| X | the maintainer's X skill: notifications and mentions since the last sweep, replies and quotes on posts about the skill, and a search for `holochain skill`, `holochain agent skill`, `holochain-agent-skills` | every sweep |
| Holochain Discord | the maintainer's Discord skill, read-only; channels in § Holochain Discord channels | every sweep |
| Reddit | browser only (the JSON API answers 403) | quarterly |

## Holochain Discord channels

Server DEV.HC (guild 919686143581253632), mapped on 2026-11-16.

| Channel | Why | Check |
|---|---|---|
| #dev-chat (1040658791831703632) | where the skill is announced and the Foundation replies | every sweep |
| #general (919686143581253637) | newcomers asking how to build with agents | every sweep |
| #announcements (919686143581253635) | Foundation amplification of releases | every sweep |
| #project-updates (1465915154649710714) | where each release is reposted with a ping to @Notify - Ecosystem Updates | after each release |
| #introductions (928589998071119912) | new builders | monthly |
| #gig-matching, #events (forum channels) | the reader cannot open forum channels; read by hand | monthly |

Recurring voices: pauldaoust, zippy, SamTurner.
Flowsta's own server is where Your Own AI ships the skill; not yet mapped.

## Not reachable from the maintainer's machine

- forum.holochain.org: no DNS answer on 2026-11-16. Retry each sweep; report it as not read.

## Numbers

Recorded every sweep, since GitHub keeps traffic for 14 days only.

| Number | Command |
|---|---|
| Stars, with dates | `gh api repos/Soushi888/holochain-agent-skills/stargazers -H "Accept: application/vnd.github.star+json" --paginate` |
| Forks | `gh api repos/Soushi888/holochain-agent-skills/forks` |
| Views and clones, 14 days | `gh api repos/Soushi888/holochain-agent-skills/traffic/views`, `traffic/clones` |
| Referrers, 14 days | `gh api repos/Soushi888/holochain-agent-skills/traffic/popular/referrers` |
| Release asset downloads | `gh api repos/Soushi888/holochain-agent-skills/releases --jq '.[] \| {tag: .tag_name, assets: [.assets[] \| {name, download_count}]}'` |
