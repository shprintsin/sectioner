import { describe, expect, it } from "vitest";

import type { KeyInput } from "./keys";
import { bindings, chordOf, defaultTags, formatChord, isBuiltin, keysOf, normalizeChord, projectOf, slugTag, tagFor, tagLibrary, tagsFromRoles, validateProject, validateTags, withDerived, type ProjectDef } from "./project";
import { BOOK_ROLES } from "./types";

const key = (code: string, k: string, mods: Partial<KeyInput> = {}): KeyInput => ({ key: k, code, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, ...mods });

describe("chords", () => {
  it("reads letters and digits by the physical key, whatever the layout", () => {
    expect(chordOf(key("KeyM", "צ"))).toBe("M");
    expect(chordOf(key("KeyM", "m", { shiftKey: true }))).toBe("Shift+M"); // Caps Lock + Shift
    expect(chordOf(key("Digit1", "!", { shiftKey: true }))).toBe("Shift+1");
    expect(chordOf(key("KeyG", "g", { metaKey: true, shiftKey: true }))).toBe("Ctrl+Shift+G");
    expect(chordOf(key("Slash", "?", { shiftKey: true }))).toBe("Shift+/");
    expect(chordOf(key("Comma", "ת"))).toBe(",");
    expect(chordOf(key("Space", " "))).toBe("Space");
    expect(chordOf(key("ArrowDown", "ArrowDown"))).toBe("ArrowDown");
    expect(chordOf(key("ShiftLeft", "Shift", { shiftKey: true }))).toBeNull();
  });
  it("normalises what a config says to what a key press is", () => {
    expect(normalizeChord("m")).toBe("M");
    expect(normalizeChord("shift+m")).toBe("Shift+M");
    expect(normalizeChord("Shift+Ctrl+g")).toBe("Ctrl+Shift+G");
    expect(normalizeChord("?")).toBe("Shift+/");
    expect(normalizeChord("!")).toBe("Shift+1");
    expect(normalizeChord("+")).toBe("Shift+=");
    expect(normalizeChord("Shift++")).toBe("Shift+=");
    expect(normalizeChord("esc")).toBe("Escape");
    expect(normalizeChord("del")).toBe("Delete");
    expect(normalizeChord("arrowdown")).toBe("ArrowDown");
    expect(normalizeChord("")).toBeNull();
    expect(normalizeChord("Ctrl+")).toBeNull();
    expect(normalizeChord("Banana")).toBeNull();
    expect(normalizeChord("M+N")).toBeNull();
  });
  it("prints compactly", () => {
    expect(formatChord("Ctrl+Shift+G")).toBe("Ctrl+⇧G");
    expect(formatChord("ArrowDown")).toBe("↓");
    expect(formatChord("Alt+E")).toBe("Alt+E");
  });
});

describe("bindings", () => {
  const cmds = [
    { id: "accept", defaultKeys: ["A"] },
    { id: "delete", defaultKeys: ["X", "Delete"] },
    { id: "merge", defaultKeys: ["Shift+M"] },
  ];
  it("defaults stand until the key map moves them", () => {
    const b = bindings(cmds, {});
    expect(b.byChord.get("A")).toBe("accept");
    expect(b.byChord.get("Delete")).toBe("delete");
    expect(b.released.size).toBe(0);
  });
  it("a rebound default is released, an unbound command answers to nothing", () => {
    const b = bindings(cmds, { delete: ["D"], merge: [] });
    expect(b.byChord.get("D")).toBe("delete");
    expect(b.byChord.has("X")).toBe(false);
    expect([...b.released].sort()).toEqual(["Delete", "Shift+M", "X"]);
    expect(keysOf(cmds[2], { merge: [] })).toEqual([]);
  });
  it("a chord two commands want goes to the first and is reported", () => {
    const b = bindings(cmds, { merge: ["a"] });
    expect(b.byChord.get("A")).toBe("accept");
    expect(b.conflicts.get("A")).toEqual(["accept", "merge"]);
  });
});

describe("schemas", () => {
  it("the book library is every role with its old key; the default schema is all of it", () => {
    const lib = tagLibrary("book");
    expect(lib.map((t) => t.id)).toEqual([...BOOK_ROLES]);
    expect(lib.find((t) => t.id === "main_text")?.key).toBe("M");
    expect(lib.every((t) => isBuiltin(t, "book"))).toBe(true);
    expect(validateTags(defaultTags("book"), "book")).toEqual([]);
  });
  it("the newspaper default keeps the old digits and leaves the retired types out", () => {
    const tags = defaultTags("newspaper");
    expect(tags.find((t) => t.base === "ARTICLE")?.key).toBe("1");
    expect(tags.find((t) => t.base === "ILLUSTRATION")?.key).toBe("8");
    expect(tags.some((t) => t.base === "SECTION" || t.base === "IMPRINT" || t.base === "TABLE_OF_CONTENTS")).toBe(false);
    expect(validateTags(tags, "newspaper")).toEqual([]);
  });
  it("a legacy roles list becomes a schema with the same titles and keys", () => {
    const tags = tagsFromRoles([{ role: "main_text", title: "Text line", key: "M" }, { role: "separator", title: "Not text", key: "d" }, { role: "main_text" }]);
    expect(tags.map((t) => [t.id, t.label, t.key])).toEqual([["main_text", "Text line", "M"], ["separator", "Not text", "D"]]);
  });
  it("a custom tag must stand for a real base and may not reuse a key", () => {
    const tags = [...defaultTags("book"), { id: "responsum_head", label: "Responsum heading", base: "title", icon: "star", hue: 300, chroma: 0.12, key: "M" } as const];
    expect(validateTags(tags.map((t) => ({ ...t })), "book")).toEqual(["tag responsum_head: key M is already main_text"]);
    expect(validateTags([{ id: "x", label: "X", base: "ARTICLE", icon: "star", hue: 1, chroma: 0.1, key: "" }], "book")[0]).toMatch(/not a book role/);
  });
  it("a unit shows its own tag only while it still stands for the unit's base", () => {
    const tags = [...defaultTags("book"), { id: "responsum_head", label: "Responsum heading", base: "title", icon: "star" as const, hue: 300, chroma: 0.12, key: "" }];
    expect(tagFor(tags, "book", "title", "responsum_head").id).toBe("responsum_head");
    expect(tagFor(tags, "book", "main_text", "responsum_head").id).toBe("main_text");
    expect(tagFor(tags, "book", "title").id).toBe("title");
    // a role the schema left out is still drawn
    expect(tagFor([tags[0]], "book", "figure").id).toBe("figure");
  });
  it("tag ids are slugs, unique", () => {
    expect(slugTag("Responsum heading", [])).toBe("responsum_heading");
    expect(slugTag("Responsum heading", ["responsum_heading"])).toBe("responsum_heading_2");
    expect(slugTag("כותרת", [])).toBe("tag");
  });
});

describe("projects", () => {
  const ws = [
    { id: "news-a", kind: "newspaper" as const },
    { id: "book-a", kind: "book" as const },
    { id: "ads", kind: "book" as const, label: "Ads", roles: [{ role: "main_text" as const, title: "Text line", key: "M" }] },
  ];
  it("with no projects file every working set lands in a derived project of its kind", () => {
    const all = withDerived([], ws);
    expect(all.map((p) => [p.id, p.worksets, p.synthesized])).toEqual([
      ["newspaper-sections", ["news-a"], true],
      ["page-regions", ["book-a"], true],
      ["ads", ["ads"], true],
    ]);
    expect(projectOf(all, ws[2]).tags.map((t) => t.label)).toEqual(["Text line"]);
  });
  it("a persisted project owns its working sets; derived ids never collide with it", () => {
    const mine: ProjectDef = { id: "page-regions", label: "Mine", kind: "book", worksets: ["ads"], tags: defaultTags("book"), keymap: { accept: ["Enter"] } };
    const all = withDerived([mine], ws);
    expect(all.map((p) => p.id)).toEqual(["page-regions", "newspaper-sections", "page-regions-2"]);
    const r = projectOf(all, ws[2]);
    expect(r.id).toBe("page-regions");
    expect(r.synthesized).toBe(false);
    expect(r.keymap).toEqual({ accept: ["Enter"] });
  });
  it("validates the whole definition", () => {
    const bad: ProjectDef = { id: "Bad Id", label: "", kind: "book", worksets: [], tags: [], keymap: { x: ["Nope+Q"] } };
    expect(validateProject(bad)).toHaveLength(4);
  });
});
