import { describe, expect, it } from "vitest";

import { PROJECTS, allSections } from "./corpus";
import {
  WORD_CHAR,
  menuHalfWidth,
  menuPosition,
  rangeFromAnchors,
  snapToWord,
  stepEnd,
} from "./offsets";
import { popularTags } from "./tagset";
import { TAG_DEFS } from "./tagset";
import type { RawAnchors } from "./offsets";

const raw = (o: Partial<RawAnchors> = {}): RawAnchors => ({
  docA: "d1",
  offA: 0,
  docB: "d1",
  offB: 4,
  rect: null,
  ...o,
});

describe("WORD_CHAR", () => {
  it("accepts Hebrew letters", () => {
    for (const c of "אבגדהוזחטיכלמנסעפצקרשת") expect(WORD_CHAR.test(c), c).toBe(true);
  });

  it("accepts a gershayim in both forms, and a geresh in both", () => {
    // The corpus writes `''` where the printed page has `״`. A word-snapper that knew
    // only the Unicode form would cut `תרנ''ה` at the apostrophes.
    for (const c of ["״", '"', "׳", "'"]) expect(WORD_CHAR.test(c), c).toBe(true);
  });

  it("accepts Latin and digits, which appear in ids and years", () => {
    for (const c of "aZ0 9".replace(" ", "")) expect(WORD_CHAR.test(c), c).toBe(true);
  });

  it("rejects a space and the punctuation that ends a word", () => {
    for (const c of [" ", "\n", ".", ",", ":", "(", ")", "!", "?", "-"]) {
      expect(WORD_CHAR.test(c), JSON.stringify(c)).toBe(false);
    }
  });

  it("accepts the maqaf, so a hyphenated Hebrew compound snaps as one word", () => {
    // U+05BE sits inside the Hebrew block the class covers, so `בית־יעקב` is one word
    // and not two. That is right for this material — the maqaf binds, it does not
    // separate — but it follows from the block range rather than from a decision, so
    // it is asserted here to keep it one.
    expect(WORD_CHAR.test("־")).toBe(true);
    expect(snapToWord("בבית־יעקב שם", 3, 4)).toEqual([0, 9]);
  });

  it("accepts niqqud and cantillation, which never split a word", () => {
    for (const c of ["ָ", "ִ", "֑"]) expect(WORD_CHAR.test(c), c).toBe(true);
  });
});

describe("snapToWord", () => {
  it("grows a mid-word selection out to the whole word", () => {
    const t = "שלום עולם גדול";
    expect(snapToWord(t, 6, 8)).toEqual([5, 9]);
  });

  it("leaves a selection that already sits on word boundaries alone", () => {
    expect(snapToWord("שלום עולם", 0, 4)).toEqual([0, 4]);
  });

  it("does not cut a gershayim word in half", () => {
    const t = "בשנת תרנ''ה לפרט";
    const [s, e] = snapToWord(t, 7, 8);
    expect(t.slice(s, e)).toBe("תרנ''ה");
    expect(e - s).toBe(6);
  });

  it("stops at both ends of the text rather than running past them", () => {
    const t = "שלום";
    expect(snapToWord(t, 1, 2)).toEqual([0, 4]);
  });

  it("does not swallow the space between two words", () => {
    const t = "aaa bbb";
    expect(snapToWord(t, 1, 2)).toEqual([0, 3]);
  });

  it("grows across a punctuation-free run only", () => {
    const t = "אבג, דהו";
    expect(snapToWord(t, 1, 2)).toEqual([0, 3]);
  });
});

describe("rangeFromAnchors", () => {
  it("builds a selection from two ordered anchors", () => {
    const r = rangeFromAnchors(raw({ offA: 2, offB: 6 }), "aaaa aaaa", false);
    expect(r).toEqual({ ok: true, sel: { doc: "d1", start: 2, end: 6 }, rect: null });
  });

  it("orders a backwards drag rather than rejecting it", () => {
    const r = rangeFromAnchors(raw({ offA: 6, offB: 2 }), "aaaa aaaa", false);
    expect(r.ok && r.sel).toEqual({ doc: "d1", start: 2, end: 6 });
  });

  it("rejects a collapsed selection", () => {
    const r = rangeFromAnchors(raw({ offA: 3, offB: 3 }), "abcdef", false);
    expect(r).toEqual({ ok: false, reason: "collapsed" });
  });

  it("rejects a drag across two sections", () => {
    // A span that crossed a document boundary could not be exported as TEI, joined to a
    // unit id, or re-anchored after an edit. It is refused, not clamped.
    const r = rangeFromAnchors(raw({ docB: "d2" }), "abcdef", false);
    expect(r).toEqual({ ok: false, reason: "cross-section" });
  });

  it("checks the section before it checks for a collapse", () => {
    const r = rangeFromAnchors(raw({ docB: "d2", offA: 3, offB: 3 }), "abcdef", false);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toBe("cross-section");
  });

  it("snaps when asked and leaves the range alone when not", () => {
    const t = "שלום עולם";
    expect(rangeFromAnchors(raw({ offA: 6, offB: 7 }), t, true).ok && true).toBe(true);
    const on = rangeFromAnchors(raw({ offA: 6, offB: 7 }), t, true);
    const off = rangeFromAnchors(raw({ offA: 6, offB: 7 }), t, false);
    expect(on.ok && on.sel).toEqual({ doc: "d1", start: 5, end: 9 });
    expect(off.ok && off.sel).toEqual({ doc: "d1", start: 6, end: 7 });
  });

  it("carries the rect through untouched", () => {
    const rect = { left: 100, top: 200, width: 40 };
    const r = rangeFromAnchors(raw({ rect }), "abcdef", false);
    expect(r.ok && r.rect).toBe(rect);
  });
});

describe("stepEnd", () => {
  const t = "alpha beta gamma";

  it("grows by one word", () => {
    expect(stepEnd(t, 0, 5, 1)).toBe(10);
  });

  it("shrinks by one word, leaving the separating space inside the span", () => {
    // Not symmetric with growing, and deliberately transcribed that way: growing skips
    // leading whitespace then takes the word, shrinking takes the word and stops at the
    // space before it. So `]` then `[` returns 5→10→6, not 5→10→5. The span reads the
    // same on screen and the extra space is trimmed at export; asserted so that anyone
    // who "fixes" the asymmetry has to mean it.
    expect(stepEnd(t, 0, 10, -1)).toBe(6);
    expect(t.slice(0, 6)).toBe("alpha ");
  });

  it("does not return to where growing started, and that is the design's behaviour", () => {
    expect(stepEnd(t, 0, 5, 1)).toBe(10);
    expect(stepEnd(t, 0, stepEnd(t, 0, 5, 1)!, -1)).toBe(6);
  });

  it("stops at the end of the text", () => {
    expect(stepEnd(t, 0, 16, 1)).toBe(16);
  });

  it("refuses to collapse the span onto its own start", () => {
    expect(stepEnd(t, 0, 5, -1)).toBeNull();
  });

  it("crosses the paragraph break, which is whitespace like any other", () => {
    const two = "alpha\n\nbeta";
    expect(stepEnd(two, 0, 5, 1)).toBe(11);
  });

  it("treats a gershayim word as one word", () => {
    const heb = "בשנת תרנ''ה לפרט";
    expect(heb.slice(0, stepEnd(heb, 0, 4, 1)!)).toBe("בשנת תרנ''ה");
  });
});

describe("menuHalfWidth", () => {
  const pop = popularTags(TAG_DEFS, "p-responsa");

  it("is half the estimated menu width", () => {
    const items = pop.reduce((n, t) => n + t.en.length * 6.4 + 40, 0);
    expect(menuHalfWidth(pop, 1400)).toBeCloseTo((items + 104) / 2, 6);
  });

  it("never exceeds half the viewport", () => {
    expect(menuHalfWidth(pop, 320)).toBe(320 / 2 - 8);
  });

  it("is positive for an empty menu, so the clamp still works", () => {
    expect(menuHalfWidth([], 1400)).toBe(52);
  });
});

describe("menuPosition", () => {
  const half = 200;

  it("centres the menu over the selection", () => {
    expect(menuPosition({ left: 500, top: 300, width: 80 }, half, 1400)).toEqual({
      x: 540,
      y: 292,
    });
  });

  it("clamps to the left edge", () => {
    expect(menuPosition({ left: 0, top: 300, width: 10 }, half, 1400).x).toBe(208);
  });

  it("clamps to the right edge", () => {
    expect(menuPosition({ left: 1390, top: 300, width: 10 }, half, 1400).x).toBe(1192);
  });

  it("never rides up over the toolbar", () => {
    // 66px is the chrome above the reader. Without this the menu for a selection in the
    // first line would render behind the menu bar and be unclickable.
    expect(menuPosition({ left: 500, top: 10, width: 80 }, half, 1400).y).toBe(66);
  });
});

describe("snapping, over the fixture corpus", () => {
  it("never produces a span that starts or ends inside a word", () => {
    for (const p of PROJECTS) {
      for (const sec of allSections(p)) {
        const t = sec.text;
        for (let i = 0; i + 3 < t.length; i += 17) {
          const [s, e] = snapToWord(t, i, i + 3);
          expect(s === 0 || !WORD_CHAR.test(t[s - 1]), `${sec.doc_id}@${i}`).toBe(true);
          expect(e === t.length || !WORD_CHAR.test(t[e]), `${sec.doc_id}@${i}`).toBe(true);
        }
      }
    }
  });

  it("only ever grows a span", () => {
    for (const sec of allSections(PROJECTS[0])) {
      for (let i = 0; i + 5 < sec.text.length; i += 23) {
        const [s, e] = snapToWord(sec.text, i, i + 5);
        expect(s).toBeLessThanOrEqual(i);
        expect(e).toBeGreaterThanOrEqual(i + 5);
      }
    }
  });
});
