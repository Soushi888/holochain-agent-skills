# CoreReviewCouncil Workflow

Review a whole hApp before a tag or a release the way experienced Holochain core developers would.
Four reviewers, each with one lane, debate in two rounds and close on a joint verdict.

Use it when the question is "is this build fit to ship to a network", not "is this zome function correct".
For a single zome, a diff or a pull request, run **ReviewZome** (`review-zome.md`) instead; its findings make a good input here.

The four members are archetypes of the kinds of expertise found among Holochain core developers.
They are not real people, and nothing they say is a quote.

The workflow depends on no particular harness.
One agent can play the four members in turn, or a harness that runs subagents can give each member its own agent; the rules below hold either way.

---

## The council

| Member | Role | Domain |
|--------|------|--------|
| The Integrity Keeper | Integrity and the trust root | A rule on every op that carries a write (entry, record, the op the original's authorities receive, links, tombstones); genesis and the membrane; warrants; the progenitor and any grant or role chain; deterministic validation; integrity crates that depend on the HDI only |
| The Coordination Architect | The grammar of coordination | Whether the DNA encodes what the community actually agrees to: agreements a peer can re-derive step by step, units of account and currencies as design choices, roles and governance as social context, local state rather than assumed global state, reset, migration and members' freedom to fork |
| The Network Engineer | What the DHT does with the ops | Publish and gossip, authorities and hot spots, anchors and path sharding, get strategy, link volume, the cost of `must_get_*` walks in validation, validation receipts, warrant propagation, behaviour under partition and late arrival |
| The Capability and Release Engineer | The surface around the rules | Capability grants and who may call which extern, remote calls and signals, the client contract, `init`, packaging (happ and dna manifests, network seed, properties), whether the tests exercise what ships, the release process and its notes |

## What each member reads for

**The Integrity Keeper.**
Each agent is the only authority over its own chain, and every peer that holds an op re-runs the rules on it, so a rule missing on one op type is a rule missing.
The integrity zome holds the rules and nothing else, because anything more makes the DNA hash move for reasons that are not rules.
Genesis is where a network refuses an agent who fails the membrane.
A protection the network claims must be one validation enforces; a limit that is stated plainly passes, an overclaim does not.
Reads with: `../patterns.md` (validation, `FlatOp`, warrants), `../membranes.md`, `../progenitor.md`.

**The Coordination Architect.**
The DNA is the grammar the members agree to up front: data, links, rules and roles.
Global state does not exist, so anything read as "the latest" or "the list" is a local view, and the design should say whose.
An agreement is worth its name when any peer can re-derive each step from the one before; a unit of account is a design with consequences, not a label.
Members keep the choice to upgrade, stay, or fork to other rules.
Reads with: `design-data-model.md`, `../migration.md`, `../architecture.md`.

**The Network Engineer.**
Every op lands on some authorities, and a single anchor or path makes those authorities carry everyone.
Reads should pick their strategy for the node they run on, and validation that walks a chain pays for it on every peer.
Ops arrive late, out of order, or across a partition; a design is checked against that, not against a single conductor in a test.
Reads with: `../networking.md`, `../patterns.md` (get strategy, links), `../wind-tunnel.md`.

**The Capability and Release Engineer.**
Every extern is a door, and the grant written in `init` decides who may open it.
Signals and remote calls carry a sender, and code must check it.
The tests must run the DNA that ships, packed from the manifest that ships.
Release notes are part of the network's contract with its members, and they must say what the build does.
Reads with: `../access-control.md`, `../deployment.md`, `../testing.md`, `../client.md`.

## Coverage without overlap

| Review surface | Owner |
|---|---|
| Validation arms per op, links, tombstones, grants, progenitor, membrane, warrants as rules | The Integrity Keeper |
| Meaning of the records: agreements, currencies, roles, timestamps as local state, reset and migration | The Coordination Architect |
| DHT behaviour and cost: anchors, get strategy, walks, gossip, receipts, warrant delivery | The Network Engineer |
| Coordinator surface and shipping: cap grants, externs, signals, client, manifests, tests, release notes | The Capability and Release Engineer |

---

## Step 1: Fix the commit and gather inputs

Name the exact commit under review, and read the code at that commit, not at a moving branch.
Collect what already exists: a prior review, a findings list, open issues against the release, the draft release notes.
When a prior review exists, the council runs against it: each of its findings is confirmed, contested or marked fixed, and new findings come on top.

## Step 2: Round one, positions

Each member reviews its own lane alone, without reading the other members' positions first.
A member that runs as its own agent gets only the commit, the inputs from Step 1 and its row of the tables above.

Each position lists findings with a severity: **BLOCK** (the tag waits), **WARN** (ship with it named in the release notes), **NOTE** (informational).
Every finding cites the code as `path:line`, with a link pinned to the reviewed commit when the repository is hosted.
Anything not confirmed in the code is marked unverified, and an unverified finding cannot be a BLOCK.

## Step 3: Round two, responses

Each member reads the other three positions and answers them.
Members stay in their lane for new findings, and may confirm or contest any finding, with the code that settles it.
A contested finding stays open until one side cites code that the other accepts; when nobody can, it is carried into the verdict as dissent.

## Step 4: Joint verdict

The council closes on one verdict:

- **Ship**: no BLOCK stands.
- **Ship with notes**: no BLOCK stands, and every WARN is named in the release notes.
- **Hold**: at least one BLOCK stands; list what has to change before the tag.

The report gives the reviewed commit, the verdict, the findings table (member, severity, finding, `path:line`, status after round two), and the dissent, if any, with the member who holds it.
