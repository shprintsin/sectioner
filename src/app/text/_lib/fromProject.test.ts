import { describe, expect, it } from "vitest";

import { normalizeTag, tagLibrary, validateProject, validateTags, type ProjectDef } from "../../_lib/project";
import { canonical, oklchHex, paragraphs, plainKey, projectTags, resolveDirection, sectionOf, teiTags } from "./fromProject";
import { parseProposals, resolveProposals } from "./proposals";

describe("project tags ↔ workbench tags", () => {
  const tags = [
    normalizeTag({ id: "person", label: "Person", base: "persName", key: "P" }, 0),
    normalizeTag({ id: "ruling", label: "Ruling", base: "seg[@type='ruling']", key: "Shift+R", labelAlt: "פסק", attrs: [{ id: "rule", kind: "enum", label: "rule", tei: "@ana", values: ["permit", "forbid"] }] }, 1),
    normalizeTag({ id: "doctype", label: "Type", base: "classCode", scope: "document", color: "#123456" }, 2),
  ];

  it("maps id, label, element, colour and a one-character key", () => {
    const t = teiTags(tags);
    expect(t.map((x) => [x.id, x.en, x.tei, x.key])).toEqual([
      ["person", "Person", "persName", "p"],
      ["ruling", "Ruling", "seg[@type='ruling']", ""],
      ["doctype", "Type", "classCode", ""],
    ]);
    expect(t[0].color).toMatch(/^#[0-9a-f]{6}$/);
    expect(t[1].he).toBe("פסק");
    expect(t[2].scope).toBe("document");
    expect(t[2].color).toBe("#123456");
    expect(t[0].popular).toBe(true);
  });

  it("round-trips without a change, so autosave never rewrites projects.json", () => {
    expect(canonical(projectTags(teiTags(tags), tags))).toEqual(canonical(tags));
    for (const lib of [tagLibrary("text")]) expect(canonical(projectTags(teiTags(lib), lib))).toEqual(canonical(lib));
  });

  it("carries an edit made in the workbench back to the project", () => {
    const edited = teiTags(tags).map((t) => (t.id === "person" ? { ...t, en: "Personal name", color: "#aa0000", key: "n" } : t));
    const back = projectTags(edited, tags);
    expect(back[0]).toMatchObject({ id: "person", label: "Personal name", base: "persName", color: "#aa0000", key: "N", icon: "tag" });
    expect(back[1].key).toBe("Shift+R"); // a chord the workbench cannot show is kept
  });

  it("reads only plain letters and digits as workbench keys", () => {
    expect([plainKey("P"), plainKey("7"), plainKey("Shift+P"), plainKey(""), plainKey("Ctrl+K")]).toEqual(["p", "7", "", "", ""]);
  });

  it("converts oklch to sRGB hex, clamped", () => {
    expect(oklchHex(1, 0, 0)).toBe("#ffffff");
    expect(oklchHex(0, 0, 0)).toBe("#000000");
    expect(oklchHex(0.6, 0.4, 30)).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe("text project validation", () => {
  const base: ProjectDef = { id: "t", label: "T", kind: "text", worksets: [], keymap: {}, tags: [normalizeTag({ id: "person", label: "Person", base: "persName" }, 0)] };
  it("accepts a minimal project: id, label, base", () => {
    expect(validateProject(base)).toEqual([]);
  });
  it("rejects a base that is not a TEI name, a bad attribute and a bad colour", () => {
    const errs = validateTags([
      normalizeTag({ id: "a", label: "A", base: "two words" }, 0),
      normalizeTag({ id: "b", label: "B", base: "seg", attrs: [{ id: "x", kind: "enum", label: "x", tei: "@x" }] }, 1),
      normalizeTag({ id: "c", label: "C", base: "seg", color: "red" }, 2),
    ], "text");
    expect(errs.join("\n")).toMatch(/not a TEI element name/);
    expect(errs.join("\n")).toMatch(/an enum needs a list/);
    expect(errs.join("\n")).toMatch(/#rrggbb/);
  });
  it("rejects an unknown direction", () => {
    expect(validateProject({ ...base, direction: "up" as never })).toContain("direction must be rtl, ltr or auto");
  });
});

describe("documents", () => {
  it("splits paragraphs on blank lines and joins them with one blank line", () => {
    expect(paragraphs("a\r\nb\r\n\r\n\r\n  c  \n \n\nd\n")).toEqual(["a\nb", "c", "d"]);
    const s = sectionOf({ id: "x", text: "one\n\n\ntwo" });
    expect(s.text).toBe("one\n\ntwo");
    expect(s.title).toBe("x");
  });
  it("decides the direction from the letters unless told", () => {
    expect(resolveDirection("auto", ["שלום עולם", "hi"])).toBe("rtl");
    expect(resolveDirection(undefined, ["Hello world", "שלום"])).toBe("ltr");
    expect(resolveDirection("rtl", ["Hello"])).toBe("rtl");
  });
});

describe("machine proposals", () => {
  const sec = sectionOf({ id: "d1", text: "Vilna, 3 March 1887\n\nFrom Vilna to Warsaw." });
  const sections = new Map([["d1", sec]]);
  const tags = teiTags([normalizeTag({ id: "place", label: "Place", base: "placeName" }, 0), normalizeTag({ id: "kind", label: "Kind", base: "classCode", scope: "document" }, 1)]);
  const lines = [
    { doc: "d1", tag: "place", quote: "Vilna", nth: 2, confidence: 0.9 },
    { doc: "d1", tag: "place", start: 35, end: 41, quote: "Warsaw" },
    { doc: "d1", tag: "place", quote: "Kovno" },
    { doc: "d2", tag: "place", quote: "Vilna" },
    { doc: "d1", tag: "person", quote: "Vilna" },
    { doc: "d1", tag: "kind", attrs: { value: "letter" } },
  ].map((x) => JSON.stringify(x)).join("\n") + "\nnot json\n";

  it("places quotes and offsets, reports what it cannot place", () => {
    const { records, errors } = parseProposals(lines);
    expect(errors).toEqual(["line 7: not JSON"]);
    const r = resolveProposals(records, sections, tags, [], "agent:test", 1);
    expect(r.anns.map((a) => [a.id, a.quote, a.start, a.status, a.prov, a.layer])).toEqual([
      ["p1", "Vilna", 26, "proposed", "agent", "agent:test"],
      ["p2", "Warsaw", 35, "proposed", "agent", "agent:test"],
      ["p3", null, null, "proposed", "agent", "agent:test"],
    ]);
    expect(r.anns[0].conf).toBe(0.9);
    expect(r.errors).toEqual([
      "line 3: quote not found in d1",
      "line 4: no document d2 in this project",
      "line 5: no tag person in this project",
    ]);
  });

  it("never offers again what was already decided", () => {
    const { records } = parseProposals(lines);
    const first = resolveProposals(records, sections, tags, [], "agent:test", 1).anns;
    const rejected = first.map((a) => ({ ...a, status: "rejected" as const }));
    expect(resolveProposals(records, sections, tags, rejected, "agent:test", 10).anns).toEqual([]);
  });

  it("refuses offsets whose text is not the quote", () => {
    const { records } = parseProposals(JSON.stringify({ doc: "d1", tag: "place", start: 0, end: 5, quote: "Kovno" }));
    expect(resolveProposals(records, sections, tags, [], "agent:test", 1).errors).toEqual(["line 1: the quote is not the text at 0-5"]);
  });
});
