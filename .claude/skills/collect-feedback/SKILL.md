---
name: collect-feedback
description: "Sweep every place feedback on the Holochain Agent Skill can arrive (GitHub Discussions, issues and PR reviews, X, the Holochain Discord, skill directories, mentions in other repos), turn each actionable point into a GitHub issue on its milestone, and report adoption numbers. Internal to this repository, never shipped in the skill. Use when: collect feedback, feedback sweep, what are people saying about the skill, field reports, any new feedback, check X and Discord for the skill, feedback since the last release, adoption numbers."
license: Apache-2.0
compatibility: "Needs gh authenticated as the maintainer. X and Discord need the maintainer's logged-in Chrome through the interceptor CLI (the X and Discord skills of the maintainer's own setup); without it, those two platforms are reported as not read."
metadata:
  scope: internal
---

# collect-feedback

Feedback on this skill arrives in many places and is lost in all of them unless someone goes and reads.
This skill is that reading, done the same way every time, ending in issues rather than in a chat.

The rule it serves is in `CLAUDE.md` § Every Piece of Feedback Becomes an Issue (Soushi, 2026-11-16).

## What done looks like

A sweep is finished when all of these hold:

- **Every platform in `references/platforms.md` was read, or is named as not read with the reason.**
  Zero results are reported as zero, never left out.
- **Every feedback item since the last sweep is listed** with platform, link, author, date in America/Toronto local time, a short verbatim quote, and its actionable point (bug, request, question, praise, adoption signal).
- **Every actionable point is tracked:** it either already has an issue (named by number), or it gets one.
  New issues follow `references/issue.md`: one point per issue, its source linked, a label, a milestone.
- **The source learns it was heard where the source is ours to answer:** a Discussion gets a reply linking its issue.
  Replies on X and Discord are drafted for the maintainer to post; they are never posted by the agent.
- **Adoption numbers are measured, not remembered**, each with the command that produced it (see `references/platforms.md` § Numbers).
  GitHub traffic only keeps 14 days, so the sweep records it every time.
- **The report is written** to `.local/feedback/sweep-YYYY-MM-DD.md` (gitignored), and the previous report's date bounds the next sweep.

## Boundaries

- **Read-only everywhere except this repository's issues and Discussions.**
  Nothing is posted, liked, replied to or sent on X, Discord or any directory.
- **Issues in this repository are standing work:** create them without asking, with the disclosure line from `references/issue.md`.
  A point that belongs to another repository (Holochain, ai-tools, a directory listing) is drafted, not filed.
- **Never invent a post.** If a page did not load, the platform is "not read", not "nothing found".
- **People are named by their public handle** and quoted verbatim, typos included.

## Gotchas

- Two repository names exist: `holochain-agent-skills` (current) and `holochain-agent-skill` (old). Search both; directories still index the old one.
- A copy of the skill under another account was reported as trojanized (ValiChord, 2026-06-13). A directory listing that does not point at `Soushi888/holochain-agent-skills` is a finding, not a mention.
- X search needs the maintainer's session; the public syndication endpoint only reads a tweet whose ID is already known.
- The Discord skill needs a community profile for the Holochain server; until it exists, the channels to read are listed in `references/platforms.md`.
