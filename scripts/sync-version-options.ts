#!/usr/bin/env bun
/**
 * sync-version-options.ts - regenerates the "Skill version" dropdown of the
 * discussion forms from the repository's GitHub releases.
 *
 * GitHub reads a form's dropdown options as a fixed list: nothing in the form
 * schema can ask the API which releases exist. This script stands in for that.
 * It lists the releases, keeps the ones worth offering a reporter, and
 * rewrites the options in place. The release workflow runs it after every tag,
 * and the sync workflow runs it when a release is published, edited or deleted
 * by hand.
 *
 * Which releases are offered: for each Holochain line, the newest stable
 * release, plus the newest pre-release newer than it (or the newest pre-release
 * when the line has no stable release yet). A superseded candidate drops out,
 * and a reporter still on it picks the form's free-text entry.
 *
 *   bun scripts/sync-version-options.ts                      rewrite the forms
 *   bun scripts/sync-version-options.ts --check              exit 1 when a form is stale
 *   bun scripts/sync-version-options.ts --releases <file>    read releases from JSON
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const FORMS = [
  ".github/DISCUSSION_TEMPLATE/field-reports.yml",
  ".github/DISCUSSION_TEMPLATE/q-a.yml",
];

const FIELD_ID = "skill-version";
const RELEASE_OPTION = /^v\d/;

export interface Release {
  tag: string;
  prerelease: boolean;
  /** The Holochain line the release targets, "0.7", or null when no pin was found. */
  line: string | null;
}

interface Semver {
  core: [number, number, number];
  pre: string[];
}

function parseSemver(tag: string): Semver | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(tag);
  if (!m) return null;
  return {
    core: [Number(m[1]), Number(m[2]), Number(m[3])],
    pre: m[4] ? m[4].split(".") : [],
  };
}

/** Semver precedence: positive when a is newer than b. */
export function compareTags(a: string, b: string): number {
  const x = parseSemver(a);
  const y = parseSemver(b);
  if (!x || !y) throw new Error(`not a semver tag: ${!x ? a : b}`);
  for (let i = 0; i < 3; i++) {
    if (x.core[i] !== y.core[i]) return x.core[i] - y.core[i];
  }
  if (x.pre.length === 0 || y.pre.length === 0) return y.pre.length - x.pre.length;
  for (let i = 0; i < Math.min(x.pre.length, y.pre.length); i++) {
    const p = x.pre[i];
    const q = y.pre[i];
    if (p === q) continue;
    const pn = /^\d+$/.test(p);
    const qn = /^\d+$/.test(q);
    if (pn && qn) return Number(p) - Number(q);
    if (pn !== qn) return pn ? -1 : 1;
    return p < q ? -1 : 1;
  }
  return x.pre.length - y.pre.length;
}

/**
 * Groups of releases to offer, newest Holochain line first, each group ordered
 * newest first. Tags that are not semver are ignored.
 */
export function selectVersions(releases: Release[]): Release[][] {
  const byLine = new Map<string, Release[]>();
  for (const r of releases) {
    if (!parseSemver(r.tag)) continue;
    const key = r.line ?? "unknown";
    byLine.set(key, [...(byLine.get(key) ?? []), r]);
  }

  const groups: Release[][] = [];
  for (const members of byLine.values()) {
    const sorted = [...members].sort((a, b) => compareTags(b.tag, a.tag));
    const stable = sorted.find((r) => !r.prerelease);
    const candidate = sorted.find((r) => r.prerelease && (!stable || compareTags(r.tag, stable.tag) > 0));
    groups.push([candidate, stable].filter((r): r is Release => r !== undefined));
  }
  return groups.sort((a, b) => compareTags(b[0].tag, a[0].tag));
}

export function label(r: Release): string {
  const notes = [r.prerelease ? "pre-release" : null, r.line ? `Holochain ${r.line}` : null].filter(Boolean);
  return notes.length ? `${r.tag} (${notes.join(", ")})` : r.tag;
}

/**
 * The full option list: the newest line's releases, then `main (unreleased)`
 * when the form offers it, then older lines, then the form's other fixed
 * entries in their existing order.
 */
export function buildOptions(groups: Release[][], existing: string[]): string[] {
  const fixed = existing.filter((o) => !RELEASE_OPTION.test(o));
  const main = fixed.filter((o) => o.startsWith("main"));
  const rest = fixed.filter((o) => !o.startsWith("main"));
  const [newest = [], ...older] = groups;
  return [...newest.map(label), ...main, ...older.flat().map(label), ...rest];
}

function yamlScalar(value: string): string {
  return /^[\s\-?:,\[\]{}#&*!|>'"%@`]|: | #|:$|\s$/.test(value) ? JSON.stringify(value) : value;
}

function unquote(value: string): string {
  const v = value.trim();
  if (v.startsWith('"') && v.endsWith('"')) return JSON.parse(v);
  if (v.startsWith("'") && v.endsWith("'")) return v.slice(1, -1).replaceAll("''", "'");
  return v;
}

/**
 * Rewrites the options of the `skill-version` dropdown and touches no other
 * line. A YAML round-trip would reflow quoting and ordering across the whole
 * form, which is exactly the churn a generated edit must not produce.
 */
export function rewriteForm(text: string, groups: Release[][]): string {
  const lines = text.split("\n");
  const idLine = lines.findIndex((l) => new RegExp(`^\\s*id:\\s*${FIELD_ID}\\s*$`).test(l));
  if (idLine < 0) throw new Error(`no "id: ${FIELD_ID}" field`);

  let optionsLine = -1;
  for (let i = idLine + 1; i < lines.length && !/^\s*- type:/.test(lines[i]); i++) {
    if (/^\s*options:\s*$/.test(lines[i])) {
      optionsLine = i;
      break;
    }
  }
  if (optionsLine < 0) throw new Error(`the ${FIELD_ID} field has no options list`);

  const parentIndent = lines[optionsLine].search(/\S/);
  const existing: string[] = [];
  let indent = "";
  let end = optionsLine + 1;
  for (; end < lines.length; end++) {
    const m = /^(\s*)- (.*)$/.exec(lines[end]);
    if (!m || m[1].length <= parentIndent) break;
    indent = m[1];
    existing.push(unquote(m[2]));
  }
  if (existing.length === 0) throw new Error(`the ${FIELD_ID} options list is empty`);

  const options = buildOptions(groups, existing);
  const replacement = options.map((o) => `${indent}- ${yamlScalar(o)}`);
  lines.splice(optionsLine + 1, end - optionsLine - 1, ...replacement);
  return lines.join("\n");
}

function run(cmd: string[]): { code: number; stdout: string; stderr: string } {
  const p = Bun.spawnSync(cmd, { cwd: ROOT, stdout: "pipe", stderr: "pipe" });
  return { code: p.exitCode ?? 1, stdout: p.stdout.toString(), stderr: p.stderr.toString() };
}

/** The most frequent `holonix ref=main-0.X` pin in the tree at a tag. */
export function holochainLine(tag: string): string | null {
  const p = run(["git", "grep", "-hoE", "ref=main-0\\.[0-9]+", tag, "--", "*.md", "*.nix"]);
  if (p.code === 1) return null;
  if (p.code !== 0) throw new Error(`git grep at ${tag} failed: ${p.stderr.trim()}`);
  const counts = new Map<string, number>();
  for (const pin of p.stdout.split("\n").filter(Boolean)) {
    const line = pin.replace("ref=main-", "");
    counts.set(line, (counts.get(line) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

function releasesFromGitHub(): Release[] {
  const p = run(["gh", "release", "list", "--exclude-drafts", "--limit", "200", "--json", "tagName,isPrerelease"]);
  if (p.code !== 0) throw new Error(`gh release list failed: ${p.stderr.trim()}`);
  const rows = JSON.parse(p.stdout) as { tagName: string; isPrerelease: boolean }[];
  return rows.map((r) => ({ tag: r.tagName, prerelease: r.isPrerelease, line: holochainLine(r.tagName) }));
}

function releasesFromFile(path: string): Release[] {
  const rows = JSON.parse(readFileSync(path, "utf8")) as { tag: string; prerelease: boolean; line?: string | null }[];
  return rows.map((r) => ({ tag: r.tag, prerelease: r.prerelease, line: r.line === undefined ? holochainLine(r.tag) : r.line }));
}

function main(argv: string[]): number {
  const check = argv.includes("--check");
  const fileFlag = argv.indexOf("--releases");
  const releases = fileFlag >= 0 ? releasesFromFile(argv[fileFlag + 1]) : releasesFromGitHub();

  const groups = selectVersions(releases);
  if (groups.length === 0) {
    console.error("no semver releases found; refusing to strip every version from the forms");
    return 1;
  }

  let stale = 0;
  for (const form of FORMS) {
    const path = join(ROOT, form);
    const before = readFileSync(path, "utf8");
    const after = rewriteForm(before, groups);
    if (before === after) {
      console.log(`${form}: in sync`);
      continue;
    }
    stale++;
    if (check) {
      console.log(`${form}: stale`);
    } else {
      writeFileSync(path, after);
      console.log(`${form}: updated`);
    }
  }
  console.log(`offered: ${groups.flat().map(label).join(" | ")}`);
  return check && stale > 0 ? 1 : 0;
}

if (import.meta.main) process.exit(main(process.argv.slice(2)));
