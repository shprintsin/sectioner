import { describe, expect, it } from "vitest";

import { PROJECTS, allSections } from "./corpus";
import { materialise } from "./seeds";
import { makeInitial, projectSections, reducer } from "./state";
import { TAG_DEFS } from "./tagset";
import {
  csvCell,
  escapeAttr,
  escapeXml,
  exportInline,
  exportStandoff,
  exportVariablesCsv,
  teiElement,
  teiPredicate,
} from "./tei";
import type { ExportInput } from "./tei";
import type { Ann, Section } from "./types";

const S = makeInitial();
const INPUT: ExportInput = {
  project: PROJECTS[0],
  sections: projectSections(S),
  anns: S.anns,
  tags: TAG_DEFS,
  version: "1.3.0",
};

function ann(over: Partial<Ann>): Ann {
  return {
    id: "x", doc: "d1", tag: "place", start: 0, end: 4, quote: "abcd", attrs: {},
    layer: "gold", origin: "gold", prov: "human", status: "accepted", conf: null,
    uncertain: false, parent: null, ...over,
  };
}

/** The paragraph separator, written once (it is two newlines). */
const BR = "\n\n";

function section(text: string, doc = "d1"): Section {
  return { doc_id: doc, part: "p", title: "t", segs: [text], text, seeds: [] };
}

const bare = (anns: Ann[], secs: Section[]): ExportInput => ({
  project: { ...PROJECTS[0], volumes: [] },
  sections: secs,
  anns,
  tags: TAG_DEFS,
  version: "1.0.0",
});

describe("escaping", () => {
  it("escapes the three characters that can end a text node", () => {
    expect(escapeXml("a & b < c > d")).toBe("a &amp; b &lt; c &gt; d");
  });

  it("leaves an apostrophe alone, because a gershayim is two of them", () => {
    // `תרנ''ה` must survive byte for byte. Escaping the apostrophe would change the
    // character count and silently invalidate every offset in the standoff file.
    expect(escapeXml("תרנ''ה")).toBe("תרנ''ה");
    expect(escapeXml("תרנ''ה")).toHaveLength(6);
  });

  it("escapes a double quote only in an attribute value", () => {
    expect(escapeXml('שו"ת')).toBe('שו"ת');
    expect(escapeAttr('שו"ת')).toBe("שו&quot;ת");
  });
});

describe("reading the tag set's TEI target", () => {
  it("takes the element name off a plain target", () => {
    expect(teiElement("placeName")).toBe("placeName");
    expect(teiPredicate("placeName")).toBe("");
  });

  it("splits an element with a predicate", () => {
    expect(teiElement('seg type="ruling"')).toBe("seg");
    expect(teiPredicate('seg type="ruling"')).toBe(' type="ruling"');
  });

  it("takes the first name when the target is described in prose", () => {
    // Two of the fifteen tags do this, because one annotation really does map to more
    // than one element depending on where it sits.
    expect(teiElement("opener / div / closer")).toBe("opener");
    expect(teiElement("quote + bibl")).toBe("quote");
  });

  it("finds no predicate in prose, so the open and close tags agree", () => {
    // Reading "everything after the first space" as a predicate produced the open tag
    // `<opener / div / closer>` against a close tag of `</opener>` — not XML at all.
    expect(teiPredicate("opener / div / closer")).toBe("");
    expect(teiPredicate("quote + bibl")).toBe("");
  });

  it("gives every tag in the set an open tag that matches its close tag", () => {
    for (const t of TAG_DEFS) {
      const open = `<${teiElement(t.tei)}${teiPredicate(t.tei)}>`;
      const close = `</${teiElement(t.tei)}>`;
      expect(open, t.id).toMatch(/^<[\w:.-]+( [\w:.-]+="[^"]*")*>$/);
      expect(close.slice(2, -1), t.id).toBe(open.slice(1).split(/[ >]/)[0]);
    }
  });
});

describe("standoff export", () => {
  const xml = exportStandoff(INPUT);

  it("is one span per annotation — nothing dropped", () => {
    // The export is per project, so it carries the annotations of *these* sections —
    // the other project's are not missing, they are simply not in this file.
    const mine = INPUT.anns.filter((a) => INPUT.sections.some((s) => s.doc_id === a.doc));
    expect(xml.split("<span ").length - 1).toBe(mine.length);
  });

  it("carries the tag-set version in the header", () => {
    expect(xml).toContain('version="1.3.0"');
  });

  it("keeps a rejection, marked as one", () => {
    const s = reducer(reducer(makeInitial(), { type: "toggleReview" }), { type: "decideAll", ok: false });
    const out = exportStandoff({ ...INPUT, anns: s.anns });
    expect(out).toContain('change="rejected"');
    const mine = s.anns.filter((a) => INPUT.sections.some((x) => x.doc_id === a.doc));
    expect(out.split("<span ").length - 1).toBe(mine.length);
  });

  it("records where an accepted proposal came from, after its layer turned gold", () => {
    const s = reducer(reducer(makeInitial(), { type: "toggleReview" }), { type: "decideAll", ok: true });
    const out = exportStandoff({ ...INPUT, anns: s.anns });
    expect(out).toContain('source="#agent:run-14" change="accepted"');
  });

  it("gives a document-scope annotation a type instead of a range", () => {
    expect(xml).toContain('type="document"');
  });

  it("writes offsets, not text, as the anchor", () => {
    expect(xml).toMatch(/from="#char\d+" to="#char\d+"/);
  });

  it("includes the full source text once per section, one <p> per paragraph, so the offsets resolve", () => {
    for (const sec of INPUT.sections) {
      expect(xml, sec.doc_id).toContain("<p>" + sec.segs.map(escapeXml).join(`</p>${BR}<p>`) + "</p>");
    }
  });

  it("emits a confidence only for a scored proposal", () => {
    const scored = ann({ id: "p1", status: "proposed", conf: 0.62 });
    const out = exportStandoff(bare([scored, ann({ id: "h1" })], [section("abcd efgh")]));
    expect(out).toContain('cert="0.62"');
    expect(out.split('cert="').length - 1).toBe(1);
  });
});

describe("inline export", () => {
  it("nests a mark inside its container", () => {
    const outer = ann({ id: "o", start: 0, end: 9, tag: "structure", quote: "abcd efgh" });
    const inner = ann({ id: "i", start: 5, end: 9, tag: "place", quote: "efgh" });
    const { xml, dropped } = exportInline(bare([outer, inner], [section("abcd efgh")]));
    expect(dropped).toEqual([]);
    expect(xml).toContain('<opener xml:id="o">abcd <placeName xml:id="i">efgh</placeName></opener>');
  });

  it("carries the tag set's predicate through", () => {
    const r = ann({ id: "r", tag: "ruling", start: 0, end: 4, attrs: { rule: "forbid" } });
    const { xml } = exportInline(bare([r], [section("abcd")]));
    expect(xml).toContain('<seg type="ruling" ana="forbid" xml:id="r">abcd</seg>');
  });

  it("marks an uncertain annotation with @cert", () => {
    const u = ann({ id: "u", uncertain: true });
    expect(exportInline(bare([u], [section("abcd")])).xml).toContain('cert="low"');
  });

  it("reports an overlap rather than dropping it in silence", () => {
    // XML is a tree; this pair is not. The export keeps the first and says what it lost
    // and what it lost it to — a lossy export that does not say so is worse than none.
    const a = ann({ id: "a", start: 0, end: 6, quote: "abcd e" });
    const b = ann({ id: "b", start: 4, end: 9, tag: "person", quote: "d efg" });
    const { xml, dropped } = exportInline(bare([a, b], [section("abcd efgh")]));
    expect(dropped).toEqual([{ id: "b", tag: "person", crosses: "a" }]);
    expect(xml).toContain('xml:id="a"');
    expect(xml).not.toContain('xml:id="b"');
  });

  it("keeps identical-range annotations, which nest even though neither contains the other", () => {
    const a = ann({ id: "a" });
    const b = ann({ id: "b", tag: "person" });
    expect(exportInline(bare([a, b], [section("abcd")])).dropped).toEqual([]);
  });

  it("drops nothing from the fixture corpus", () => {
    // Measured, and the reason the design's sample text is worth keeping: its four-deep
    // nesting is all containment, so the whole fixture round-trips through inline TEI.
    const { dropped } = exportInline(INPUT);
    expect(dropped).toEqual([]);
  });

  it("reproduces the source text exactly once the tags are stripped", () => {
    // The strongest test of the export: whatever the nesting did, the characters between
    // the tags must still be the document.
    const { xml } = exportInline(INPUT);
    for (const sec of INPUT.sections) {
      const start = xml.indexOf(`xml:id="${sec.doc_id}"`);
      const body = xml.slice(xml.indexOf("<body>", start) + 6, xml.indexOf("</body>", start));
      const text = body
        .replace(/<note [^>]*\/>/g, "")
        .replace(/<[^>]+>/g, "")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&");
      expect(text, sec.doc_id).toBe(sec.text);
    }
  });

  it("leaves a rejected annotation out of the inline text", () => {
    const r = ann({ id: "r", status: "rejected" });
    expect(exportInline(bare([r], [section("abcd")])).xml).not.toContain('xml:id="r"');
  });

  it("puts a document-scope tag on the text element, and its fields in a note", () => {
    const d = ann({ id: "d", tag: "doctype", start: null, end: null, quote: null });
    const xml = exportInline(bare([d], [section("abcd")])).xml;
    expect(xml).toContain('ana="#doctype"');
    expect(xml).toContain('<note type="doctype"');
  });

  it("opens a new <p> at a paragraph break, except inside an open element", () => {
    const sec = { ...section(`ab${BR}cd`), segs: ["ab", "cd"] };
    expect(exportInline(bare([], [sec])).xml).toContain(`<p>ab</p>${BR}<p>cd</p>`);
    const across = ann({ id: "x", start: 0, end: 6, quote: `ab${BR}cd` });
    expect(exportInline(bare([across], [sec])).xml).toContain(`ab${BR}cd</`);
  });

  it("writes a config predicate (seg[@type='ruling']) as an attribute", () => {
    expect(teiPredicate("seg[@type='ruling']")).toBe(' type="ruling"');
    expect(teiPredicate('seg type="x"')).toBe(' type="x"');
  });

  it("is deterministic — the same annotation is dropped every run", () => {
    const a = ann({ id: "a", start: 0, end: 6, quote: "abcd e" });
    const b = ann({ id: "b", start: 4, end: 9, tag: "person", quote: "d efg" });
    const one = exportInline(bare([a, b], [section("abcd efgh")]));
    const two = exportInline(bare([a, b], [section("abcd efgh")]));
    expect(one).toEqual(two);
  });
});

describe("variables.csv", () => {
  const csv = exportVariablesCsv(INPUT.sections, INPUT.anns);
  const lines = csv.trimEnd().split("\n");

  it("has a header and one row per section", () => {
    expect(lines).toHaveLength(INPUT.sections.length + 1);
  });

  it("leads with the join key and the Hebrew title", () => {
    expect(lines[0].startsWith("doc_id,title_he,")).toBe(true);
  });

  it("names every variable as a column", () => {
    expect(lines[0]).toContain("ruling_forbid_count");
    expect(lines[0]).toContain("place_distinct");
  });

  it("quotes a field containing a comma, and doubles an inner quote", () => {
    expect(csvCell("a,b")).toBe('"a,b"');
    // A double quote alone forces quoting under RFC 4180 — which matters here, because
    // a gershayim written `"` appears in almost every Hebrew title in this corpus.
    expect(csvCell('שו"ת')).toBe('"שו""ת"');
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
  });

  it("writes ∅ rather than an empty cell for a missing value", () => {
    // An empty cell reads as "not measured" in every stats package; ∅ reads as "measured,
    // and there is nothing there". They are different facts about a document.
    const secs = [section("שלום", "empty-doc")];
    const out = exportVariablesCsv(secs, []);
    expect(out.split("\n")[1]).toContain("∅");
  });

  it("carries the Hebrew title through unchanged", () => {
    const title = allSections(PROJECTS[0])[0].title;
    expect(csv).toContain(title);
  });

  it("returns nothing at all for no sections", () => {
    expect(exportVariablesCsv([], materialise(PROJECTS))).toBe("");
  });
});
