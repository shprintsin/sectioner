import { describe, expect, it } from "vitest";

import { seedCounter } from "./ids";
import {
  SIZE_MAX,
  SIZE_MIN,
  UNDO_DEPTH,
  activeAnn,
  makeInitial,
  proposals,
  reducer,
  section,
  sections,
  visibleAnns,
  volAnns,
} from "./state";
import type { Action, State } from "./state";
import type { Ann } from "./types";

const DOC = "responsa/eynyitzchak/12866655";

/** Run a list of actions from a starting state. */
function run(s: State, ...actions: Action[]): State {
  return actions.reduce(reducer, s);
}

const init = () => makeInitial();

/** A selection over a real slice of the fixture's first section. */
function selectFirst(s: State, start: number, end: number): State {
  return reducer(s, { type: "select", sel: { doc: DOC, start, end }, rect: null });
}

describe("makeInitial", () => {
  it("opens the responsa project on its first volume", () => {
    const s = init();
    expect(s.projectId).toBe("p-responsa");
    expect(s.volId).toBe("v-eyn");
    expect(s.focusDoc).toBe(DOC);
    expect(sections(s).some((x) => x.doc_id === DOC)).toBe(true);
  });

  it("materialises the fixture annotations and seeds the id counter past them", () => {
    const s = init();
    expect(s.anns).toHaveLength(84);
    expect(s.nextId).toBe(seedCounter(s.anns));
    expect(s.nextId).toBeGreaterThan(84);
  });

  it("starts clean — nothing selected, nothing dirty, no history", () => {
    const s = init();
    expect([s.sel, s.activeId, s.dirty, s.undo.length, s.redo.length]).toEqual([
      null,
      null,
      false,
      0,
      0,
    ]);
  });

  it("takes overrides, which is how a test states its own premise", () => {
    expect(makeInitial({ review: true }).review).toBe(true);
  });
});

describe("selection", () => {
  it("records the selection and focuses its section", () => {
    const s = selectFirst(init(), 10, 20);
    expect(s.sel).toEqual({ doc: DOC, start: 10, end: 20 });
    expect(s.focusDoc).toBe(DOC);
    expect(s.tab).toBe("tags");
  });

  it("clears any active annotation, because the two are alternatives", () => {
    const s = run(init(), { type: "setActive", id: "a1" });
    expect(selectFirst(s, 10, 20).activeId).toBeNull();
  });

  it("returns the identical state when clearing a selection that is already clear", () => {
    // The bail-out that stops mouseup from re-rendering the reader on every click.
    const s = init();
    expect(reducer(s, { type: "clearSelection" })).toBe(s);
  });

  it("does clear a live selection", () => {
    const s = selectFirst(init(), 10, 20);
    const out = reducer(s, { type: "clearSelection" });
    expect(out).not.toBe(s);
    expect(out.sel).toBeNull();
  });
});

describe("applyTag — a new annotation", () => {
  it("creates it from the selection, with the quote taken from the text", () => {
    const s = run(init(), { type: "select", sel: { doc: DOC, start: 10, end: 20 }, rect: null },
      { type: "applyTag", tagId: "place" });
    const a = activeAnn(s)!;
    expect(a.tag).toBe("place");
    expect(a.start).toBe(10);
    expect(a.end).toBe(20);
    expect(a.quote).toBe(section(s, DOC).text.slice(10, 20));
    expect([a.layer, a.prov, a.status]).toEqual(["gold", "human", "accepted"]);
  });

  it("mints a fresh id each time rather than one per millisecond", () => {
    // The design uses `'n' + Date.now()`; two tags applied in the same tick collide.
    let s = init();
    s = run(s, { type: "select", sel: { doc: DOC, start: 10, end: 20 }, rect: null },
      { type: "applyTag", tagId: "place" });
    const first = s.activeId;
    s = run(s, { type: "select", sel: { doc: DOC, start: 30, end: 40 }, rect: null },
      { type: "applyTag", tagId: "place" });
    expect(s.activeId).not.toBe(first);
    expect(new Set(s.anns.map((a) => a.id)).size).toBe(s.anns.length);
  });

  it("fills the tag's enum attributes with their first value", () => {
    const s = run(init(), { type: "select", sel: { doc: DOC, start: 10, end: 20 }, rect: null },
      { type: "applyTag", tagId: "ruling" });
    expect(activeAnn(s)!.attrs.rule).toBe("permit");
  });

  it("consumes the selection and opens the tag's group in the track", () => {
    const s = run(init(), { type: "select", sel: { doc: DOC, start: 10, end: 20 }, rect: null },
      { type: "applyTag", tagId: "place" });
    expect(s.sel).toBeNull();
    expect(s.expanded.place).toBe(true);
  });

  it("remembers the tag and its attributes, so Enter can repeat it", () => {
    const s = run(init(), { type: "select", sel: { doc: DOC, start: 10, end: 20 }, rect: null },
      { type: "applyTag", tagId: "ruling" });
    expect(s.lastTag).toEqual({
      tag: "ruling",
      attrs: { rule: "permit", intensity: "low", temporal: "past" },
    });
  });

  it("computes the new annotation's parent, and updates one it now contains", () => {
    // Recomputed across the whole set: a span that swallows an existing annotation makes
    // that older row a child, so patching only the new one would leave the old parent
    // pointing at nothing.
    let s = run(init(), { type: "select", sel: { doc: DOC, start: 10, end: 20 }, rect: null },
      { type: "applyTag", tagId: "place" });
    const inner = s.activeId!;
    s = run(s, { type: "select", sel: { doc: DOC, start: 5, end: 40 }, rect: null },
      { type: "applyTag", tagId: "person" });
    const outer = s.activeId!;
    expect(s.anns.find((a) => a.id === inner)!.parent).toBe(outer);
  });

  it("says so when there is nothing to tag", () => {
    const s = reducer(init(), { type: "applyTag", tagId: "place" });
    expect(s.toast).toBe("highlight a passage first");
    expect(s.anns).toHaveLength(84);
  });
});

describe("applyTag — document scope and retagging", () => {
  it("creates a rangeless annotation for a document-scope tag, with no selection", () => {
    const s = reducer(init(), { type: "applyTag", tagId: "doctype" });
    const a = s.anns[s.anns.length - 1];
    expect([a.start, a.end, a.quote]).toEqual([null, null, null]);
    expect(a.doc).toBe(DOC);
  });

  it("gives a document-scope tag its defaults too", () => {
    // The design passes `attrs || {}` here and `defaults(t)` on the ranged path, so the
    // same tag came out with different attributes depending on how it was applied.
    const s = reducer(init(), { type: "applyTag", tagId: "doctype" });
    expect(s.anns[s.anns.length - 1].attrs.value).toBe("responsum");
  });

  it("retags in place when something is active and nothing is selected", () => {
    let s = run(init(), { type: "setActive", id: "a1" });
    const before = s.anns.length;
    s = reducer(s, { type: "applyTag", tagId: "term" });
    expect(s.anns).toHaveLength(before);
    expect(s.anns.find((a) => a.id === "a1")!.tag).toBe("term");
    expect(s.toast).toContain("retagged");
  });

  it("gives the retagged row the new tag's defaults, not the old tag's attributes", () => {
    let s = run(init(), { type: "setActive", id: "a1" });
    s = reducer(s, { type: "applyTag", tagId: "ruling" });
    expect(s.anns.find((a) => a.id === "a1")!.attrs).toEqual({
      rule: "permit",
      intensity: "low",
      temporal: "past",
    });
  });
});

describe("attributes", () => {
  it("sets one without disturbing the others", () => {
    let s = run(init(), { type: "select", sel: { doc: DOC, start: 10, end: 20 }, rect: null },
      { type: "applyTag", tagId: "ruling" });
    const id = s.activeId!;
    s = reducer(s, { type: "setAttr", id, key: "rule", value: "defer" });
    const a = s.anns.find((x) => x.id === id)!;
    expect(a.attrs.rule).toBe("defer");
    expect(a.attrs.intensity).toBe("low");
  });

  it("picks the nth value of the tag's first enum with a number key", () => {
    let s = run(init(), { type: "select", sel: { doc: DOC, start: 10, end: 20 }, rect: null },
      { type: "applyTag", tagId: "ruling" });
    s = reducer(s, { type: "pickEnum", index: 2 });
    expect(activeAnn(s)!.attrs.rule).toBe("forbid");
  });

  it("ignores a number past the end of the enum", () => {
    const s = run(init(), { type: "select", sel: { doc: DOC, start: 10, end: 20 }, rect: null },
      { type: "applyTag", tagId: "ruling" });
    expect(reducer(s, { type: "pickEnum", index: 9 })).toBe(s);
  });

  it("ignores a number key when the active tag has no enum at all", () => {
    const s = run(init(), { type: "select", sel: { doc: DOC, start: 10, end: 20 }, rect: null },
      { type: "applyTag", tagId: "topic" });
    expect(reducer(s, { type: "pickEnum", index: 1 })).toBe(s);
  });
});

describe("proposals", () => {
  const withReview = () => reducer(makeInitial(), { type: "toggleReview" });

  it("hides proposals until review mode is on", () => {
    const s = makeInitial();
    expect(visibleAnns(s).some((a) => a.status === "proposed")).toBe(false);
    expect(visibleAnns(withReview()).some((a) => a.status === "proposed")).toBe(true);
  });

  it("selects the first proposal and asks the reader to scroll to it", () => {
    const s = withReview();
    expect(s.activeId).toBe(proposals(makeInitial())[0].id);
    expect(s.scrollIntent?.doc).toBe(proposals(makeInitial())[0].doc);
  });

  it("accepting moves the row into the gold layer and takes authorship", () => {
    const s = withReview();
    const id = s.activeId!;
    const out = reducer(s, { type: "decide", id, ok: true });
    const a = out.anns.find((x) => x.id === id)!;
    expect([a.status, a.layer, a.prov]).toEqual(["accepted", "gold", "human"]);
  });

  it("rejecting keeps the row, its layer and its provenance", () => {
    // A rejection is evidence about the model that made the claim (SPEC §3.5). Deleting
    // it would destroy the only record that the model proposed something wrong here.
    const s = withReview();
    const id = s.activeId!;
    const out = reducer(s, { type: "decide", id, ok: false });
    const a = out.anns.find((x) => x.id === id)!;
    expect(a.status).toBe("rejected");
    expect(a.layer).toBe("agent:run-14");
    expect(a.prov).toBe("agent");
    expect(out.anns).toHaveLength(84);
  });

  it("advances to the next proposal after a decision", () => {
    const s = withReview();
    const queue = proposals(s);
    const out = reducer(s, { type: "decide", id: queue[0].id, ok: true });
    expect(out.activeId).toBe(queue[1].id);
  });

  it("clears the active row when the queue empties", () => {
    let s = withReview();
    for (const p of proposals(s)) s = reducer(s, { type: "decide", id: p.id, ok: true });
    expect(s.activeId).toBeNull();
    expect(proposals(s)).toEqual([]);
  });

  it("accepts the whole queue at once", () => {
    const s = withReview();
    const n = proposals(s).length;
    const out = reducer(s, { type: "decideAll", ok: true });
    expect(proposals(out)).toEqual([]);
    expect(out.toast).toBe("accepted " + n);
  });

  it("rejects the whole queue without losing a row", () => {
    const s = withReview();
    const out = reducer(s, { type: "decideAll", ok: false });
    expect(out.anns).toHaveLength(84);
    expect(out.anns.filter((a) => a.status === "rejected").length).toBeGreaterThan(0);
  });

  it("steps through the queue and wraps", () => {
    const s = withReview();
    const q = proposals(s);
    expect(reducer(s, { type: "stepProposal", dir: 1 }).activeId).toBe(q[1].id);
    expect(reducer(s, { type: "stepProposal", dir: -1 }).activeId).toBe(q[q.length - 1].id);
  });
});

describe("delete and the uncertain flag", () => {
  it("deletes the active annotation and clears the selection", () => {
    const s = run(makeInitial(), { type: "setActive", id: "a1" }, { type: "remove", id: "a1" });
    expect(s.anns.find((a) => a.id === "a1")).toBeUndefined();
    expect(s.activeId).toBeNull();
  });

  it("re-parents the orphans of a deleted span rather than leaving dangling ids", () => {
    let s = makeInitial();
    const child = s.anns.find((a) => a.parent !== null)!;
    const parentId = child.parent!;
    s = reducer(s, { type: "remove", id: parentId });
    const now = s.anns.find((a) => a.id === child.id)!;
    expect(now.parent).not.toBe(parentId);
    const ids = new Set(s.anns.map((a) => a.id));
    for (const a of s.anns) if (a.parent) expect(ids.has(a.parent), a.id).toBe(true);
  });

  it("toggles the uncertain flag on the active annotation", () => {
    let s = run(makeInitial(), { type: "setActive", id: "a1" }, { type: "toggleUncertain" });
    expect(s.anns.find((a) => a.id === "a1")!.uncertain).toBe(true);
    s = reducer(s, { type: "toggleUncertain" });
    expect(s.anns.find((a) => a.id === "a1")!.uncertain).toBe(false);
  });

  it("does nothing when nothing is active", () => {
    const s = makeInitial();
    expect(reducer(s, { type: "toggleUncertain" })).toBe(s);
  });
});

describe("span boundaries", () => {
  it("grows the active span by a word and rewrites its quote", () => {
    let s = run(makeInitial(), { type: "setActive", id: "a1" });
    const before = s.anns.find((a) => a.id === "a1")!;
    s = reducer(s, { type: "stepBoundary", dir: 1 });
    const after = s.anns.find((a) => a.id === "a1")!;
    expect(after.end!).toBeGreaterThan(before.end!);
    expect(after.quote).toBe(section(s, after.doc).text.slice(after.start!, after.end!));
  });

  it("refuses to shrink a span into nothing", () => {
    // `stepEnd` returns null and the reducer bails out identically, so the row survives.
    let s = run(makeInitial(), { type: "setActive", id: "a1" });
    for (let i = 0; i < 12; i++) s = reducer(s, { type: "stepBoundary", dir: -1 });
    const a = s.anns.find((x) => x.id === "a1")!;
    expect(a.end!).toBeGreaterThan(a.start!);
  });

  it("does nothing at document scope, where there is no boundary to move", () => {
    const doc = makeInitial().anns.find((a) => a.start === null)!;
    const s = run(makeInitial(), { type: "setActive", id: doc.id });
    expect(reducer(s, { type: "stepBoundary", dir: 1 })).toBe(s);
  });
});

describe("undo and redo", () => {
  const tagged = () =>
    run(makeInitial(), { type: "select", sel: { doc: DOC, start: 10, end: 20 }, rect: null },
      { type: "applyTag", tagId: "place" });

  it("puts the annotations back", () => {
    const s = tagged();
    const out = reducer(s, { type: "undo" });
    expect(out.anns).toHaveLength(84);
    expect(out.redo).toHaveLength(1);
  });

  it("round-trips through redo", () => {
    const s = tagged();
    const out = run(s, { type: "undo" }, { type: "redo" });
    expect(out.anns).toEqual(s.anns);
  });

  it("clears the redo stack on a new edit", () => {
    let s = run(tagged(), { type: "undo" });
    expect(s.redo).toHaveLength(1);
    s = run(s, { type: "select", sel: { doc: DOC, start: 30, end: 40 }, rect: null },
      { type: "applyTag", tagId: "place" });
    expect(s.redo).toHaveLength(0);
  });

  it("does nothing at the bottom of the stack, identically", () => {
    const s = makeInitial();
    expect(reducer(s, { type: "undo" })).toBe(s);
    expect(reducer(s, { type: "redo" })).toBe(s);
  });

  it("caps the history at forty sets", () => {
    let s = makeInitial();
    for (let i = 0; i < UNDO_DEPTH + 8; i++) {
      s = run(s, { type: "select", sel: { doc: DOC, start: 10 + i, end: 20 + i }, rect: null },
        { type: "applyTag", tagId: "place" });
    }
    expect(s.undo).toHaveLength(UNDO_DEPTH);
  });

  it("keeps the oldest entries out and the newest in", () => {
    let s = makeInitial();
    for (let i = 0; i < UNDO_DEPTH + 5; i++) {
      s = run(s, { type: "select", sel: { doc: DOC, start: 10 + i, end: 20 + i }, rect: null },
        { type: "applyTag", tagId: "place" });
    }
    // The very first set — the untouched 84 — has fallen off the bottom.
    expect(s.undo[0].length).toBeGreaterThan(84);
  });
});

describe("navigation", () => {
  it("steps to the next section and asks for a scroll", () => {
    const s = reducer(makeInitial(), { type: "stepSection", dir: 1 });
    expect(s.focusDoc).toBe(sections(makeInitial())[1].doc_id);
    expect(s.scrollIntent?.doc).toBe(s.focusDoc);
  });

  it("wraps backwards from the first section to the last", () => {
    const secs = sections(makeInitial());
    const s = reducer(makeInitial(), { type: "stepSection", dir: -1 });
    expect(s.focusDoc).toBe(secs[secs.length - 1].doc_id);
  });

  it("bumps the scroll sequence so asking twice scrolls twice", () => {
    const a = reducer(makeInitial(), { type: "stepSection", dir: 1 });
    const b = reducer(a, { type: "stepSection", dir: -1 });
    expect(b.scrollIntent!.seq).toBe(a.scrollIntent!.seq + 1);
  });

  it("tabs through visible annotations and wraps", () => {
    const s = makeInitial();
    const list = visibleAnns(s).filter((a) => a.start !== null);
    const first = reducer(s, { type: "stepAnnotation", dir: 1 });
    expect(first.activeId).toBe(list[0].id);
    const back = reducer(s, { type: "stepAnnotation", dir: -1 });
    expect(back.activeId).toBe(list[list.length - 1].id);
  });

  it("never tabs onto a document-scope annotation, which has nothing to scroll to", () => {
    let s = makeInitial();
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) {
      s = reducer(s, { type: "stepAnnotation", dir: 1 });
      seen.add(s.activeId!);
    }
    for (const id of seen) expect(s.anns.find((a) => a.id === id)!.start).not.toBeNull();
  });

  it("opens a volume on its first section", () => {
    const s = reducer(makeInitial(), { type: "openVolume", volId: "v-ach" });
    expect(s.volId).toBe("v-ach");
    expect(s.focusDoc).toBe(sections(s)[0].doc_id);
    expect(volAnns(s).every((a) => a.doc.startsWith("responsa/achiezer/"))).toBe(true);
  });

  it("ignores an unknown volume rather than crashing the reader", () => {
    const s = makeInitial();
    expect(reducer(s, { type: "openVolume", volId: "nope" })).toBe(s);
  });
});

describe("switching project", () => {
  const press = () => reducer(makeInitial(), { type: "openProject", id: "p-press" });

  it("opens its first volume and section", () => {
    const s = press();
    expect(s.projectId).toBe("p-press");
    expect(s.focusDoc.startsWith("nli-press/")).toBe(true);
  });

  it("leaves review mode, because the queue belongs to the other volume", () => {
    const s = reducer(reducer(makeInitial(), { type: "toggleReview" }), {
      type: "openProject",
      id: "p-press",
    });
    expect(s.review).toBe(false);
  });

  it("moves the tag-set editor onto a tag this project actually has", () => {
    const s = press();
    const t = s.tags.find((x) => x.id === s.editTag)!;
    expect(t.proj === "both" || t.proj === "p-press").toBe(true);
  });

  it("keeps the other project's annotations in memory, just out of view", () => {
    const s = press();
    expect(s.anns).toHaveLength(84);
    expect(volAnns(s).every((a) => a.doc.startsWith("nli-press/"))).toBe(true);
  });
});

describe("view toggles", () => {
  it("clamps the reader size at both ends", () => {
    let s = makeInitial();
    for (let i = 0; i < 30; i++) s = reducer(s, { type: "nudgeSize", delta: 1 });
    expect(s.size).toBe(SIZE_MAX);
    for (let i = 0; i < 40; i++) s = reducer(s, { type: "nudgeSize", delta: -1 });
    expect(s.size).toBe(SIZE_MIN);
  });

  it("returns the identical state at the clamp, so the reader does not re-render", () => {
    const s = makeInitial({ size: SIZE_MAX });
    expect(reducer(s, { type: "nudgeSize", delta: 1 })).toBe(s);
  });

  it("cycles the status filter", () => {
    let s = makeInitial();
    s = reducer(s, { type: "cycleStatusFilter" });
    expect(s.statusFilter).toBe("proposals");
    s = run(s, { type: "cycleStatusFilter" }, { type: "cycleStatusFilter" });
    expect(s.statusFilter).toBe("all");
  });

  it("bails out identically on a no-op tab, mode or scope change", () => {
    const s = makeInitial();
    expect(reducer(s, { type: "setTab", tab: "tags" })).toBe(s);
    expect(reducer(s, { type: "setSpanMode", mode: "underline" })).toBe(s);
    expect(reducer(s, { type: "setTrackScope", scope: "volume" })).toBe(s);
    expect(reducer(s, { type: "setOpenMenu", label: null })).toBe(s);
    expect(reducer(s, { type: "setPaletteQ", q: "" })).toBe(s);
  });

  it("closes everything on Escape, and does nothing when nothing is open", () => {
    const s = makeInitial();
    expect(reducer(s, { type: "escape" })).toBe(s);
    const busy = run(s, { type: "openPalette" }, { type: "toggleHelp" }, { type: "setActive", id: "a1" });
    const out = reducer(busy, { type: "escape" });
    expect([out.palette, out.help, out.activeId, out.sel]).toEqual([false, false, null, null]);
  });
});

describe("the palette", () => {
  it("applies the first match on Enter and closes", () => {
    let s = run(makeInitial(), { type: "select", sel: { doc: DOC, start: 10, end: 20 }, rect: null });
    s = run(s, { type: "openPalette" }, { type: "setPaletteQ", q: "person" },
      { type: "acceptPaletteTop" });
    expect(s.palette).toBe(false);
    expect(activeAnn(s)!.tag).toBe("person");
  });

  it("closes without tagging when nothing matches", () => {
    let s = run(makeInitial(), { type: "select", sel: { doc: DOC, start: 10, end: 20 }, rect: null });
    s = run(s, { type: "openPalette" }, { type: "setPaletteQ", q: "zzzz" },
      { type: "acceptPaletteTop" });
    expect(s.palette).toBe(false);
    expect(s.anns).toHaveLength(84);
  });
});

describe("the tag-set editor", () => {
  it("edits a field and marks the set dirty", () => {
    const s = run(makeInitial(), { type: "setEditTag", id: "place" },
      { type: "editTagField", field: "en", value: "Location" });
    expect(s.tags.find((t) => t.id === "place")!.en).toBe("Location");
    expect(s.dirty).toBe(true);
  });

  it("bumps the patch version on save", () => {
    const s = run(makeInitial(), { type: "editTagField", field: "en", value: "x" },
      { type: "bumpVersion" });
    expect(s.version).toBe("1.3.1");
    expect(s.dirty).toBe(false);
  });

  it("renaming a tag does not orphan the annotations that use it", () => {
    const s = run(makeInitial(), { type: "setEditTag", id: "place" },
      { type: "editTagField", field: "en", value: "Location" });
    expect(s.anns.some((a) => a.tag === "place")).toBe(true);
  });
});

describe("loading from storage", () => {
  it("replaces the set, recomputes parents and reseeds the counter", () => {
    const loaded: Ann[] = [
      { id: "n7", doc: DOC, tag: "structure", start: 0, end: 50, quote: "x", attrs: {},
        layer: "gold", origin: "gold", prov: "human", status: "accepted", conf: null, uncertain: false, parent: "bogus" },
      { id: "n9", doc: DOC, tag: "place", start: 10, end: 20, quote: "y", attrs: {},
        layer: "gold", origin: "gold", prov: "human", status: "accepted", conf: null, uncertain: false, parent: null },
    ];
    const s = reducer(makeInitial(), { type: "loaded", anns: loaded });
    expect(s.anns).toHaveLength(2);
    expect(s.anns[0].parent).toBeNull();
    expect(s.anns[1].parent).toBe("n7");
    expect(s.nextId).toBe(10);
    expect(s.dirty).toBe(false);
    expect(s.undo).toEqual([]);
  });

  it("never mints an id that a loaded annotation already holds", () => {
    const loaded: Ann[] = [
      { id: "n41", doc: DOC, tag: "place", start: 0, end: 5, quote: "x", attrs: {},
        layer: "gold", origin: "gold", prov: "human", status: "accepted", conf: null, uncertain: false, parent: null },
    ];
    let s = reducer(makeInitial(), { type: "loaded", anns: loaded });
    s = run(s, { type: "select", sel: { doc: DOC, start: 10, end: 20 }, rect: null },
      { type: "applyTag", tagId: "place" });
    expect(new Set(s.anns.map((a) => a.id)).size).toBe(s.anns.length);
    expect(s.activeId).toBe("n42");
  });
});

describe("the toast", () => {
  it("carries a sequence number, so the same message twice restarts the timer", () => {
    const a = reducer(makeInitial(), { type: "flash", msg: "hello" });
    const b = reducer(a, { type: "flash", msg: "hello" });
    expect(b.toast).toBe("hello");
    expect(b.toastSeq).toBe(a.toastSeq + 1);
  });

  it("clears identically when already empty", () => {
    const s = makeInitial();
    expect(reducer(s, { type: "clearToast" })).toBe(s);
  });
});

describe("every action leaves the store consistent", () => {
  it("never produces a duplicate id, a dangling parent or a quote that lies", () => {
    // One sweep over a long, mixed session. Each of these three invariants has its own
    // targeted test above; this is the one that would catch an interaction between them.
    let s = makeInitial();
    const script: Action[] = [
      { type: "toggleReview" },
      { type: "decideAll", ok: true },
      { type: "select", sel: { doc: DOC, start: 10, end: 30 }, rect: null },
      { type: "applyTag", tagId: "person" },
      { type: "stepBoundary", dir: 1 },
      { type: "select", sel: { doc: DOC, start: 5, end: 60 }, rect: null },
      { type: "applyTag", tagId: "structure" },
      { type: "applyTag", tagId: "doctype" },
      { type: "undo" },
      { type: "redo" },
      { type: "setActive", id: "a1" },
      { type: "remove", id: "a1" },
      { type: "openVolume", volId: "v-ach" },
      { type: "openProject", id: "p-press" },
    ];
    for (const a of script) {
      s = reducer(s, a);
      const ids = new Set(s.anns.map((x) => x.id));
      expect(ids.size, a.type).toBe(s.anns.length);
      for (const x of s.anns) {
        if (x.parent) expect(ids.has(x.parent), `${a.type}/${x.id}`).toBe(true);
        expect(x.parent, `${a.type}/${x.id}`).not.toBe(x.id);
        if (x.start !== null && x.end !== null) {
          expect(section(s, x.doc).text.slice(x.start, x.end), `${a.type}/${x.id}`).toBe(x.quote);
        }
      }
    }
  });
});
