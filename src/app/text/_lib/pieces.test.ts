import { describe, expect, it } from "vitest";

import { PROJECTS, allSections } from "./corpus";
import { piecesIn } from "./pieces";
import { materialise } from "./seeds";
import type { Ann, Sel } from "./types";

function mark(id: string, start: number, end: number, doc = "d1"): Ann {
  return {
    id,
    doc,
    tag: "place",
    start,
    end,
    quote: "x",
    attrs: {},
    layer: "gold",
    origin: "gold",
    prov: "human",
    status: "accepted",
    conf: null,
    uncertain: false,
    parent: null,
  };
}

const DOC = "d1";
const ids = (p: { cov: Ann[] }) => p.cov.map((a) => a.id);

describe("piecesIn", () => {
  it("returns one piece when nothing is marked", () => {
    const p = piecesIn(DOC, 0, 20, [], null);
    expect(p).toEqual([{ s: 0, e: 20, cov: [], selHit: false }]);
  });

  it("cuts a mark strictly inside into three pieces", () => {
    const p = piecesIn(DOC, 0, 20, [mark("a", 5, 10)], null);
    expect(p.map((x) => [x.s, x.e])).toEqual([
      [0, 5],
      [5, 10],
      [10, 20],
    ]);
    expect(ids(p[1])).toEqual(["a"]);
    expect(ids(p[0])).toEqual([]);
  });

  it("cuts a mark flush with the start into two pieces", () => {
    const p = piecesIn(DOC, 0, 20, [mark("a", 0, 10)], null);
    expect(p.map((x) => [x.s, x.e])).toEqual([
      [0, 10],
      [10, 20],
    ]);
    expect(ids(p[0])).toEqual(["a"]);
  });

  it("leaves one covered piece when a mark spans the whole paragraph and beyond", () => {
    const p = piecesIn(DOC, 10, 20, [mark("a", 0, 40)], null);
    expect(p).toHaveLength(1);
    expect(ids(p[0])).toEqual(["a"]);
  });

  it("makes no zero-width piece where two marks abut", () => {
    const p = piecesIn(DOC, 0, 20, [mark("a", 0, 10), mark("b", 10, 20)], null);
    expect(p.map((x) => [x.s, x.e])).toEqual([
      [0, 10],
      [10, 20],
    ]);
    expect(p.every((x) => x.e > x.s)).toBe(true);
  });

  it("gives the shared middle of two overlapping marks both of them", () => {
    const p = piecesIn(DOC, 0, 20, [mark("a", 0, 10), mark("b", 5, 15)], null);
    expect(p.map((x) => [x.s, x.e])).toEqual([
      [0, 5],
      [5, 10],
      [10, 15],
      [15, 20],
    ]);
    expect(ids(p[0])).toEqual(["a"]);
    expect(ids(p[1]).sort()).toEqual(["a", "b"]);
    expect(ids(p[2])).toEqual(["b"]);
    expect(ids(p[3])).toEqual([]);
  });

  it("sorts coverage innermost first, so the smallest mark decides the piece", () => {
    const outer = mark("outer", 0, 20);
    const inner = mark("inner", 5, 10);
    const p = piecesIn(DOC, 0, 20, [outer, inner], null);
    expect(ids(p[1])).toEqual(["inner", "outer"]);
  });

  it("keeps corpus order between two marks of identical length", () => {
    const first = mark("first", 5, 10);
    const second = mark("second", 5, 10);
    const p = piecesIn(DOC, 0, 20, [first, second], null);
    expect(ids(p[1])).toEqual(["first", "second"]);
  });

  it("ignores a mark that ends exactly where the paragraph starts", () => {
    expect(piecesIn(DOC, 10, 20, [mark("a", 0, 10)], null)).toHaveLength(1);
  });

  it("ignores a mark that starts exactly where the paragraph ends", () => {
    expect(piecesIn(DOC, 0, 10, [mark("a", 10, 20)], null)).toHaveLength(1);
  });

  it("cuts at a zero-length mark but gives it no coverage", () => {
    // A zero-length mark cannot arise from the UI — the selection handler rejects an
    // empty range — but it contributes a boundary all the same, so the run splits and
    // neither piece is covered. Locked because the extra split is harmless and the
    // tiling invariant still holds; an "optimisation" that skips it changes the DOM.
    const p = piecesIn(DOC, 0, 20, [mark("a", 5, 5)], null);
    expect(p.map((x) => [x.s, x.e])).toEqual([
      [0, 5],
      [5, 20],
    ]);
    expect(p.flatMap(ids)).toEqual([]);
    expect(p.every((x) => x.e > x.s)).toBe(true);
  });

  it("cuts at the live selection and flags the pieces inside it", () => {
    const sel: Sel = { doc: DOC, start: 5, end: 10 };
    const p = piecesIn(DOC, 0, 20, [], sel);
    expect(p.map((x) => [x.s, x.e])).toEqual([
      [0, 5],
      [5, 10],
      [10, 20],
    ]);
    expect(p.map((x) => x.selHit)).toEqual([false, true, false]);
  });

  it("ignores a selection in another document", () => {
    const sel: Sel = { doc: "other", start: 5, end: 10 };
    const p = piecesIn(DOC, 0, 20, [], sel);
    expect(p).toHaveLength(1);
    expect(p[0].selHit).toBe(false);
  });
});

describe("the tiling invariant, over the whole fixture corpus", () => {
  const anns = materialise(PROJECTS);

  // The single strongest test in the suite. If the boundary sweep ever drops, duplicates
  // or reorders a character, this fails — and it is the one bug class that would corrupt
  // both the reader and the TEI export at once, since they share this function.
  it("reassembles every paragraph character for character", () => {
    for (const p of PROJECTS) {
      for (const sec of allSections(p)) {
        const mine = anns.filter((a) => a.doc === sec.doc_id && a.start !== null);
        let cursor = 0;
        for (const seg of sec.segs) {
          const pStart = sec.text.indexOf(seg, cursor);
          const pEnd = pStart + seg.length;
          cursor = pEnd;

          const pieces = piecesIn(sec.doc_id, pStart, pEnd, mine, null);
          const rebuilt = pieces.map((x) => sec.text.slice(x.s, x.e)).join("");
          expect(rebuilt, `${sec.doc_id} :: ${seg.slice(0, 24)}`).toBe(seg);
        }
      }
    }
  });

  it("emits no empty piece anywhere in the corpus", () => {
    for (const p of PROJECTS) {
      for (const sec of allSections(p)) {
        const mine = anns.filter((a) => a.doc === sec.doc_id && a.start !== null);
        const pieces = piecesIn(sec.doc_id, 0, sec.text.length, mine, null);
        expect(pieces.every((x) => x.e > x.s), sec.doc_id).toBe(true);
      }
    }
  });

  it("also tiles in compact mode, where a section is one continuous run", () => {
    for (const p of PROJECTS) {
      for (const sec of allSections(p)) {
        const mine = anns.filter((a) => a.doc === sec.doc_id && a.start !== null);
        const pieces = piecesIn(sec.doc_id, 0, sec.text.length, mine, null);
        expect(pieces.map((x) => sec.text.slice(x.s, x.e)).join(""), sec.doc_id).toBe(
          sec.text,
        );
      }
    }
  });

  it("never nests deeper than the fixture is known to go", () => {
    // Four, measured: place inside org inside person inside structure. The mark renderer
    // draws at most three non-structural underlines, so this is the number that decides
    // whether that cap is ever reached.
    let deepest = 0;
    for (const p of PROJECTS) {
      for (const sec of allSections(p)) {
        const mine = anns.filter((a) => a.doc === sec.doc_id && a.start !== null);
        for (const x of piecesIn(sec.doc_id, 0, sec.text.length, mine, null)) {
          deepest = Math.max(deepest, x.cov.length);
        }
      }
    }
    expect(deepest).toBe(4);
  });
});
