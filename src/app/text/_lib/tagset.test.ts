// Integrity of the transcribed tag set. These do not test behaviour — they test that
// 15 hand-copied definitions came across without a typo, before anything depends on them.
import { describe, expect, it } from "vitest";

import { TAG_DEFS, inProject, tagById } from "./tagset";
import type { TagDef } from "./types";

const PROJECTS = ["p-responsa", "p-press"] as const;

describe("TAG_DEFS", () => {
  it("has the 15 tags the design defines", () => {
    expect(TAG_DEFS).toHaveLength(15);
  });

  it("has unique ids", () => {
    const ids = TAG_DEFS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every tag a colour, a label in both languages and a TEI target", () => {
    for (const t of TAG_DEFS) {
      expect(t.color, t.id).toMatch(/^#[0-9a-f]{6}$/);
      expect(t.en.length, t.id).toBeGreaterThan(0);
      expect(t.he.length, t.id).toBeGreaterThan(0);
      expect(t.tei.length, t.id).toBeGreaterThan(0);
    }
  });

  it("uses at most one character for a hotkey", () => {
    for (const t of TAG_DEFS) expect(t.key.length, t.id).toBeLessThanOrEqual(1);
  });

  // The design shows an `editKeyWarn` badge for a key that collides with an app command,
  // but never checks tag-against-tag. Two tags sharing a key in one project would make
  // one of them permanently unreachable from the keyboard.
  it.each(PROJECTS)("has no duplicate hotkey within %s", (proj) => {
    const keys = TAG_DEFS.filter((t) => inProject(t, proj))
      .map((t) => t.key)
      .filter((k) => k !== "");
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("only nests inside a known tag, or the pseudo-container 'doc'", () => {
    const known = new Set<string>([...TAG_DEFS.map((t) => t.id), "doc"]);
    // The design's `contain` lists also name the four structural parts, which are
    // values of the `structure` tag's `part` attribute rather than tags of their own.
    const parts = new Set(
      TAG_DEFS.find((t) => t.id === "structure")?.attrs.find((a) => a.id === "part")
        ?.values ?? [],
    );
    for (const t of TAG_DEFS) {
      for (const c of t.contain) {
        expect(known.has(c) || parts.has(c), `${t.id} may be contained in ${c}`).toBe(
          true,
        );
      }
    }
  });

  it("gives every enum attribute at least one value, and every other kind none", () => {
    for (const t of TAG_DEFS) {
      for (const a of t.attrs) {
        if (a.kind === "enum") {
          expect(a.values, `${t.id}.${a.id}`).toBeDefined();
          expect(a.values!.length, `${t.id}.${a.id}`).toBeGreaterThan(0);
        } else {
          expect(a.values, `${t.id}.${a.id}`).toBeUndefined();
        }
      }
    }
  });

  it("gives every attribute a unique id within its tag", () => {
    for (const t of TAG_DEFS) {
      const ids = t.attrs.map((a) => a.id);
      expect(new Set(ids).size, t.id).toBe(ids.length);
    }
  });

  it("offers at most six popular tags per project — the floating menu holds six", () => {
    for (const proj of PROJECTS) {
      const popular = TAG_DEFS.filter(
        (t) => inProject(t, proj) && t.popular && t.key,
      );
      expect(popular.length, proj).toBeLessThanOrEqual(6);
    }
  });

  it("marks exactly one tag as document scope, and gives it no hotkey", () => {
    const docScope = TAG_DEFS.filter((t) => t.scope === "document");
    expect(docScope.map((t) => t.id)).toEqual(["doctype"]);
    // No `!` needed: the app sets noUncheckedIndexedAccess: false, so an index access
    // is already typed as TagDef. Adding one is an error under no-unnecessary-type-assertion.
    expect(docScope[0].key).toBe("");
  });

  it("marks exactly one tag structural", () => {
    expect(TAG_DEFS.filter((t) => t.structural).map((t) => t.id)).toEqual([
      "structure",
    ]);
  });
});

describe("inProject", () => {
  const only = (id: string) => TAG_DEFS.find((t) => t.id === id)!;

  it("admits a 'both' tag into either project", () => {
    expect(inProject(only("place"), "p-responsa")).toBe(true);
    expect(inProject(only("place"), "p-press")).toBe(true);
  });

  it("keeps a project-specific tag out of the other project", () => {
    expect(inProject(only("ruling"), "p-responsa")).toBe(true);
    expect(inProject(only("ruling"), "p-press")).toBe(false);
    expect(inProject(only("advertisement"), "p-press")).toBe(true);
    expect(inProject(only("advertisement"), "p-responsa")).toBe(false);
  });
});

describe("tagById", () => {
  it("finds a defined tag", () => {
    expect(tagById(TAG_DEFS, "ruling").en).toBe("Ruling");
  });

  // An annotation can outlive the tag that made it — a tag-set edit, or a file from
  // another project. It must render as itself rather than crash the reader.
  it("returns a grey placeholder for an unknown tag rather than throwing", () => {
    const orphan: TagDef = tagById(TAG_DEFS, "no-such-tag");
    expect(orphan.id).toBe("no-such-tag");
    expect(orphan.en).toBe("no-such-tag");
    expect(orphan.attrs).toEqual([]);
    expect(orphan.color).toMatch(/^#[0-9a-f]{6}$/);
  });
});
