import { describe, expect, test } from "bun:test";
import { compareTags, label, rewriteForm, selectVersions, type Release } from "./sync-version-options";

const r = (tag: string, line: string | null, prerelease = tag.includes("-")): Release => ({ tag, prerelease, line });

const offered = (releases: Release[]) => selectVersions(releases).map((g) => g.map(label));

describe("compareTags", () => {
  test("a release outranks its candidates, and candidates order numerically", () => {
    expect(compareTags("v1.0.0", "v1.0.0-rc.9")).toBeGreaterThan(0);
    expect(compareTags("v1.0.0-rc.10", "v1.0.0-rc.9")).toBeGreaterThan(0);
    expect(compareTags("v1.0.0-rc.1", "v0.2.0")).toBeGreaterThan(0);
    expect(compareTags("v0.10.0", "v0.9.0")).toBeGreaterThan(0);
  });
});

describe("selectVersions", () => {
  test("today: the candidate on 0.7, the newest stable on 0.6", () => {
    expect(offered([r("v1.0.0-rc.1", "0.7"), r("v0.2.0", "0.6"), r("v0.1.0", "0.6")])).toEqual([
      ["v1.0.0-rc.1 (pre-release, Holochain 0.7)"],
      ["v0.2.0 (Holochain 0.6)"],
    ]);
  });

  test("a stable release supersedes its candidates", () => {
    expect(offered([r("v1.0.0", "0.7"), r("v1.0.0-rc.2", "0.7"), r("v1.0.0-rc.1", "0.7"), r("v0.2.0", "0.6")])).toEqual([
      ["v1.0.0 (Holochain 0.7)"],
      ["v0.2.0 (Holochain 0.6)"],
    ]);
  });

  test("a candidate newer than the stable release sits beside it, and only the newest candidate", () => {
    expect(offered([r("v1.1.0-rc.2", "0.7"), r("v1.1.0-rc.1", "0.7"), r("v1.0.0", "0.7")])).toEqual([
      ["v1.1.0-rc.2 (pre-release, Holochain 0.7)", "v1.0.0 (Holochain 0.7)"],
    ]);
  });

  test("the newest line comes first whatever order the API returns", () => {
    expect(offered([r("v0.2.0", "0.6"), r("v2.0.0-beta.1", "0.8"), r("v1.0.0", "0.7")]).map((g) => g[0])).toEqual([
      "v2.0.0-beta.1 (pre-release, Holochain 0.8)",
      "v1.0.0 (Holochain 0.7)",
      "v0.2.0 (Holochain 0.6)",
    ]);
  });

  test("non-semver tags are ignored and an unknown line still gets offered", () => {
    expect(offered([r("nightly", "0.7"), r("v0.0.1", null)])).toEqual([["v0.0.1"]]);
  });
});

describe("rewriteForm", () => {
  const form = [
    "body:",
    "  - type: dropdown",
    "    id: skill-version",
    "    attributes:",
    "      label: Skill version",
    "      options:",
    "        - v1.0.0-rc.1",
    "        - main (unreleased)",
    "        - v0.2.0 (Holochain 0.6)",
    "        - Other (say which below)",
    "    validations:",
    "      required: true",
    "",
    "  - type: dropdown",
    "    id: harness",
    "    attributes:",
    "      options:",
    "        - v9 is not a release here",
    "",
  ].join("\n");

  const today = selectVersions([r("v1.0.0-rc.1", "0.7"), r("v0.2.0", "0.6")]);

  test("rewrites only the skill-version options, keeping main and the free-text entry", () => {
    const out = rewriteForm(form, today);
    expect(out).toContain(
      [
        "      options:",
        "        - v1.0.0-rc.1 (pre-release, Holochain 0.7)",
        "        - main (unreleased)",
        "        - v0.2.0 (Holochain 0.6)",
        "        - Other (say which below)",
        "    validations:",
      ].join("\n"),
    );
    expect(out.split("\n").slice(10)).toEqual(form.split("\n").slice(10));
  });

  test("is idempotent", () => {
    const once = rewriteForm(form, today);
    expect(rewriteForm(once, today)).toBe(once);
  });

  test("a form without the field is an error, not a silent no-op", () => {
    expect(() => rewriteForm("body:\n  - type: input\n    id: model\n", today)).toThrow("skill-version");
  });
});
