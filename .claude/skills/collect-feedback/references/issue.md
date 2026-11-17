# The issue a feedback point becomes

One actionable point, one issue.
A report that raises three points becomes three issues, each linking the same source.

## Body

```markdown
> **SoushAI analysis.** Drafted by Soushi's AI assistant, reviewed and posted by @Soushi888.

## Feedback

<author handle>, <platform>, <date, America/Toronto>: <link>

> <verbatim quote, typos kept>

## What it asks of the skill

<the actionable point in one or two sentences, in the skill's terms: which reference, workflow or check>

## Done when

<the observable change: a reference section that says X, a check that refuses Y, an example that compiles Z>
```

The disclosure line opens the body only when the agent drafted it.

## Labels

| Point | Label |
|---|---|
| A defect in what the skill says or does | `bug` |
| A run report from a Discussion field report | `field-report` |
| A request for new coverage | `enhancement` |
| A question the skill should answer | `question` |
| The skill lags a Holochain release | `stale-version` |
| Raised by a community member, not the maintainer | add `community` |

## Milestone

The open release-candidate milestone if the fix belongs in the next candidate, `v1.0.0` if it waits for the stable release, `v1.1.0` for anything after.
The release issue of that milestone lists the new issue under Content.

## Before creating

Search open and closed issues for the same point (`gh issue list --state all --search "<terms>"`).
A point already tracked gets a comment on the existing issue with the new source, not a second issue.
