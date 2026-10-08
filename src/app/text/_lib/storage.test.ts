import { describe, expect, it, vi } from "vitest";

import { PROJECTS, allSections } from "./corpus";
import { fromJsonl, findStale, toJsonl, toRecord } from "./serialise";
import { makeInitial, reducer } from "./state";
import { MemoryStorage, debounceSave } from "./storage";
import type { ProjectData } from "./storage";
import type { Ann } from "./types";

const S = makeInitial();

function ann(over: Partial<Ann> = {}): Ann {
  return {
    id: "n1", doc: "d1", tag: "place", start: 5, end: 9, quote: "efgh", attrs: {},
    layer: "gold", origin: "gold", prov: "human", status: "accepted", conf: null,
    uncertain: false, parent: null, ...over,
  };
}

describe("the on-disk record", () => {
  it("uses SPEC's names, not the design's", () => {
    // The two vocabularies meet here and nowhere else. The file outlives this app and
    // has to be readable by the Python and R that will consume it.
    const r = toRecord(ann());
    expect(Object.keys(r)).toEqual([
      "ann_id", "doc_id", "tag", "start", "end", "quote", "attrs",
      "layer", "origin", "provenance", "status", "confidence", "uncertain", "parent",
    ]);
  });

  it("round-trips every annotation in the corpus without losing a field", () => {
    const back = fromJsonl(toJsonl(S.anns));
    expect(back.errors).toEqual([]);
    expect(back.anns).toEqual(S.anns);
  });

  it("writes one line per annotation, ending in a newline", () => {
    const text = toJsonl(S.anns);
    expect(text.trimEnd().split("\n")).toHaveLength(S.anns.length);
    expect(text.endsWith("\n")).toBe(true);
  });

  it("writes nothing at all for an empty set, not a lone newline", () => {
    expect(toJsonl([])).toBe("");
  });

  it("sorts attribute keys, so re-saving an unchanged file produces no diff", () => {
    const a = toJsonl([ann({ attrs: { b: 2, a: 1 } })]);
    const b = toJsonl([ann({ attrs: { a: 1, b: 2 } })]);
    expect(a).toBe(b);
  });

  it("keeps a gershayim as two characters through the round trip", () => {
    const heb = ann({ quote: "תרנ''ה", start: 0, end: 6 });
    const back = fromJsonl(toJsonl([heb])).anns[0];
    expect(back.quote).toBe("תרנ''ה");
    expect(back.quote).toHaveLength(6);
    expect(back.end! - back.start!).toBe(6);
  });

  it("keeps a confidence of exactly zero", () => {
    expect(fromJsonl(toJsonl([ann({ conf: 0 })])).anns[0].conf).toBe(0);
  });

  it("reports a corrupt line instead of throwing, and keeps the rest", () => {
    // One bad row must not make the other 4,899 unreadable.
    const good = toJsonl([ann({ id: "n1" }), ann({ id: "n2" })]);
    const text = good.split("\n")[0] + "\n{not json\n" + good.split("\n")[1] + "\n";
    const out = fromJsonl(text);
    expect(out.anns.map((a) => a.id)).toEqual(["n1", "n2"]);
    expect(out.errors).toHaveLength(1);
    expect(out.errors[0].line).toBe(2);
  });

  it("reports a line missing its identity rather than loading a half-annotation", () => {
    const out = fromJsonl('{"tag":"place"}\n');
    expect(out.anns).toEqual([]);
    expect(out.errors[0].reason).toContain("ann_id");
  });

  it("reads a file written with CRLF, since the repo never rewrites line endings", () => {
    const text = toJsonl([ann({ id: "n1" }), ann({ id: "n2" })]).replace(/\n/g, "\r\n");
    expect(fromJsonl(text).anns).toHaveLength(2);
  });

  it("loads a file written before `origin` existed", () => {
    const legacy = JSON.stringify({ ...toRecord(ann({ layer: "agent:run-3" })), origin: undefined });
    expect(fromJsonl(legacy).anns[0].origin).toBe("agent:run-3");
  });
});

describe("findStale", () => {
  const text = "abcd efgh";
  const textOf = () => text;

  it("finds nothing when every quote matches", () => {
    expect(findStale([ann()], textOf)).toEqual([]);
  });

  it("finds an annotation whose text has moved under it", () => {
    // The one check that must never be a silent repair: re-finding the quote would fix
    // the symptom and destroy the evidence that the source text changed.
    expect(findStale([ann({ quote: "abcd" })], textOf).map((a) => a.id)).toEqual(["n1"]);
  });

  it("ignores a document-scope annotation, which has no text to drift from", () => {
    expect(findStale([ann({ start: null, end: null, quote: null })], textOf)).toEqual([]);
  });

  it("ignores an annotation whose document is not loaded", () => {
    expect(findStale([ann()], () => undefined)).toEqual([]);
  });

  it("finds nothing across the whole fixture corpus", () => {
    const byDoc = new Map(
      PROJECTS.flatMap((p) => allSections(p)).map((s) => [s.doc_id, s.text]),
    );
    expect(findStale(S.anns, (d) => byDoc.get(d))).toEqual([]);
  });

  it("finds the annotation that a boundary edit would have invalidated, if the quote lied", () => {
    const edited = reducer(reducer(S, { type: "setActive", id: "a1" }), {
      type: "stepBoundary", dir: 1,
    });
    const byDoc = new Map(
      PROJECTS.flatMap((p) => allSections(p)).map((s) => [s.doc_id, s.text]),
    );
    // The reducer rewrites the quote with the span, so nothing goes stale. This asserts
    // that it does — an edit that moved the offsets and left the quote would show here.
    expect(findStale(edited.anns, (d) => byDoc.get(d))).toEqual([]);
  });
});

describe("MemoryStorage", () => {
  it("round-trips a project", async () => {
    const s = new MemoryStorage();
    await s.save("p-responsa", { anns: [ann()], version: "1.0.0" });
    expect((await s.load("p-responsa"))?.anns).toEqual([ann()]);
  });

  it("returns null for a project never saved, which means 'keep the fixtures'", async () => {
    expect(await new MemoryStorage().load("nope")).toBeNull();
  });

  it("copies on save, so a later mutation cannot reach into what was saved", async () => {
    const s = new MemoryStorage();
    const a = ann();
    await s.save("p", { anns: [a] });
    a.tag = "person";
    expect((await s.load("p"))?.anns[0].tag).toBe("place");
  });

  it("refuses to write when read-only, and says why", async () => {
    const s = new MemoryStorage(false);
    const caps = await s.capabilities();
    expect(caps.writable).toBe(false);
    expect(caps.reason).toContain("fixtures");
    await expect(s.save("p", { anns: [] })).rejects.toThrow("read-only");
  });
});

describe("debounceSave", () => {
  const data = (n: number): ProjectData => ({ anns: Array.from({ length: n }, () => ann()) });

  it("writes once for a burst, with the last value", async () => {
    vi.useFakeTimers();
    const save = vi.fn().mockResolvedValue(undefined);
    const d = debounceSave(save, 250);
    d.queue(data(1));
    d.queue(data(2));
    d.queue(data(3));
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(300);
    expect(save).toHaveBeenCalledTimes(1);
    expect((save.mock.calls[0][0] as ProjectData).anns).toHaveLength(3);
    vi.useRealTimers();
  });

  it("flushes immediately, which is what closing the tab costs", async () => {
    vi.useFakeTimers();
    const save = vi.fn().mockResolvedValue(undefined);
    const d = debounceSave(save, 250);
    d.queue(data(1));
    await d.flush();
    expect(save).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("does not write twice when a flush lands after the timer would have", async () => {
    vi.useFakeTimers();
    const save = vi.fn().mockResolvedValue(undefined);
    const d = debounceSave(save, 250);
    d.queue(data(1));
    await d.flush();
    await vi.advanceTimersByTimeAsync(500);
    expect(save).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("writes nothing after a cancel", async () => {
    vi.useFakeTimers();
    const save = vi.fn().mockResolvedValue(undefined);
    const d = debounceSave(save, 250);
    d.queue(data(1));
    d.cancel();
    await vi.advanceTimersByTimeAsync(500);
    await d.flush();
    expect(save).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
