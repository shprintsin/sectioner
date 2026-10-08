// Whole-box style marks (bold / centred / spaced) on a book region: a pure act with undo,
// inherited by both halves of a split, OR-ed by a merge, written to the record as the
// additive `style_tags`, and invisible to every session or output that predates them.

import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { bookBundle } from "../../_server/bundle";
import type { WorksetDef } from "../../_server/worksets";
import type { BookAnn, BookBundle } from "../types";
import { STYLE_TAGS } from "../types";
import { buildBookPage } from "./export";
import * as M from "./model";

function page(): { ann: BookAnn; ids: string[] } {
  let ann = M.emptyBook();
  const ids: string[] = [];
  for (const box of [[100, 100, 900, 160], [100, 200, 900, 260], [100, 300, 900, 600]] as const) {
    ann = M.addRegion(ann, [...box]).ann;
    ids.push(Object.keys(ann.regions).at(-1)!);
  }
  return { ann, ids };
}

function bundle(): BookBundle {
  return {
    kind: "book", id: "t_p0001", otzarId: "t", width: 1000, height: 1000, imageUrl: "", proposal: null, existing: null, session: null,
    source: { image: "t.png", image_sha256: null, source_pdf_page_1based: null, source_pdf_sha256: null, work_ids: [], pdf: null },
  };
}

describe("style marks", () => {
  it("toggles one mark on and off, in the fixed order, leaving box, role and review state alone", () => {
    const { ann, ids } = page();
    const [a] = ids;
    const before = ann.regions[a];
    let cur = M.toggleStyle(ann, [a], "spaced")!.ann;
    cur = M.toggleStyle(cur, [a], "bold")!.ann;
    expect(cur.regions[a].style_tags).toEqual(["bold", "spaced"]);
    expect(cur.regions[a].bbox).toEqual(before.bbox);
    expect(cur.regions[a].role).toBe(before.role);
    expect(cur.regions[a].verified).toBe(before.verified);
    cur = M.toggleStyle(cur, [a], "spaced")!.ann;
    expect(cur.regions[a].style_tags).toEqual(["bold"]);
    cur = M.toggleStyle(cur, [a], "bold")!.ann;
    expect("style_tags" in cur.regions[a]).toBe(false);
    // the input is never mutated: that is what makes undo a snapshot
    expect(ann.regions[a].style_tags).toBeUndefined();
  });

  it("is independent per mark and per region; on a selection it sets all unless all have it", () => {
    const { ann, ids } = page();
    let cur = M.toggleStyle(ann, [ids[0]], "centered")!.ann;
    cur = M.toggleStyle(cur, ids, "centered")!.ann; // mixed -> everything gets it
    for (const id of ids) expect(cur.regions[id].style_tags).toEqual(["centered"]);
    cur = M.toggleStyle(cur, ids, "centered")!.ann; // all have it -> everything loses it
    for (const id of ids) expect(cur.regions[id].style_tags).toBeUndefined();
    expect(M.toggleStyle(ann, [], "bold")).toBeNull();
    expect(M.toggleStyle(ann, ["nope"], "bold")).toBeNull();
    expect(M.toggleStyle(ann, ids, "italic" as never)).toBeNull();
  });

  it("counts as an act (ops) and carries nothing else", () => {
    const { ann, ids } = page();
    const res = M.toggleStyle(ann, [ids[0]], "bold")!;
    expect(res.ann.ops).toBe(ann.ops + 1);
    expect(res.ann.regions[ids[1]]).toEqual(ann.regions[ids[1]]);
  });

  it("both halves of a split inherit the marks, as copies", () => {
    const { ann, ids } = page();
    const marked = M.toggleStyle(M.toggleStyle(ann, [ids[2]], "bold")!.ann, [ids[2]], "spaced")!.ann;
    const cut = M.splitRegion(marked, ids[2], 450, "h")!.ann;
    const halves = Object.values(cut.regions).filter((r) => r.cut_from);
    expect(halves).toHaveLength(2);
    for (const h of halves) expect(h.style_tags).toEqual(["bold", "spaced"]);
    expect(halves[0].style_tags).not.toBe(halves[1].style_tags);
    // an unmarked region splits into unmarked halves with no empty field written
    const plain = M.splitRegion(ann, ids[2], 450, "h")!.ann;
    for (const h of Object.values(plain.regions).filter((r) => r.cut_from)) expect("style_tags" in h).toBe(false);
  });

  it("a merge takes the union and records nothing else", () => {
    const { ann, ids } = page();
    let cur = M.toggleStyle(ann, [ids[0]], "bold")!.ann;
    cur = M.toggleStyle(cur, [ids[1]], "centered")!.ann;
    const merged = M.mergeRegions(cur, [ids[0], ids[1]])!.ann;
    const r = Object.values(merged.regions).find((x) => x.basis.startsWith("Merged"))!;
    expect(r.style_tags).toEqual(["bold", "centered"]);
    // nothing marked -> nothing written
    const plain = M.mergeRegions(ann, [ids[0], ids[1]])!.ann;
    expect("style_tags" in Object.values(plain.regions).find((x) => x.basis.startsWith("Merged"))!).toBe(false);
  });

  it("is written to the record as style_tags only where set, never touching another field", () => {
    const { ann, ids } = page();
    const b = bundle();
    const none = buildBookPage(ann, b, new Date("2026-10-01T00:00:00Z"));
    for (const r of none.regions) expect("style_tags" in r).toBe(false);
    const marked = M.toggleStyle(M.toggleStyle(ann, [ids[0]], "spaced")!.ann, [ids[0]], "bold")!.ann;
    const out = buildBookPage(marked, b, new Date("2026-10-01T00:00:00Z"));
    const rec = out.regions.find((r) => r.id === ids[0])!;
    expect(rec.style_tags).toEqual(["bold", "spaced"]);
    // every other field of every region is what it was without the marks
    const strip = (r: object) => Object.fromEntries(Object.entries(r).filter(([k]) => k !== "style_tags"));
    expect(out.regions.map(strip)).toEqual(none.regions.map(strip));
    // the rest of the page, apart from the act count the two toggles added
    expect({ ...out, regions: 0, provenance: { ...out.provenance, ops_applied: 0 } }).toEqual({ ...none, regions: 0, provenance: { ...none.provenance, ops_applied: 0 } });
  });

  it("an older session or output without the field loads unchanged; junk in the field is cleaned", () => {
    const { ann } = page();
    const before = JSON.stringify(ann);
    expect(JSON.stringify(M.sanitize(structuredClone(ann)))).toBe(before);
    const dirty = structuredClone(ann);
    const [x, y] = Object.keys(dirty.regions);
    dirty.regions[x].style_tags = ["spaced", "bold", "bold", "italic"] as never;
    dirty.regions[y].style_tags = [] as never;
    const clean = M.sanitize(dirty);
    expect(clean.regions[x].style_tags).toEqual(["bold", "spaced"]);
    expect("style_tags" in clean.regions[y]).toBe(false);
  });

  it("a canonical record's style_tags are read back by the server when it is reopened", async () => {
    const dir = mkdtempSync(join(tmpdir(), "style-"));
    const rec = {
      page_id: "x_p0001", width: 1000, height: 1000,
      regions: [
        { id: "r1", role: "main_text", bbox: [0, 0, 500, 100], stream_id: "main", style_tags: ["centered", "bold", "weird"] },
        { id: "r2", role: "main_text", bbox: [0, 200, 500, 300], stream_id: "main" },
      ],
      containers: [], reading_order: { main: ["r1", "r2"] }, relations: [],
    };
    writeFileSync(join(dir, "x_p0001.json"), JSON.stringify(rec));
    const ws: WorksetDef = { id: "t", kind: "book", root: dir, files: { existing: "{id}.json" } };
    const bd = await bookBundle(ws, { id: "x_p0001" });
    const ann = M.initBook(bd);
    expect(ann.regions.r1.style_tags).toEqual(["bold", "centered"]);
    expect("style_tags" in ann.regions.r2).toBe(false);
  });

  it("the tag list is the three marks, in order", () => {
    expect([...STYLE_TAGS]).toEqual(["bold", "centered", "spaced"]);
  });
});
