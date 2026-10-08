// The book model against a canonical v10 page: loading it, walking it, repairing it and
// writing it back must give the pipeline the same record shape it already reads.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { bookBundle } from "../../_server/bundle";
import type { WorksetDef } from "../../_server/worksets";
import type { BookBundle } from "../types";
import { buildBookPage, isComplete, validateBook } from "./export";
import * as M from "./model";

const ROOT = fileURLToPath(new URL("../../../../fixtures/book/", import.meta.url));
const V10 = "v10/";
const PAGE = "610245_p0090";

const WS: WorksetDef = { id: "t", kind: "book", root: ROOT, files: { existing: `${V10}{id}.json` } };

interface Canonical {
  width: number;
  height: number;
  regions: { id: string; role: string; bbox: number[]; stream_id: string; container_id: string | null }[];
  containers: { id: string; bbox: number[] }[];
  reading_order: Record<string, string[]>;
  relations: unknown[];
}

async function load(): Promise<{ bundle: BookBundle; canon: Canonical }> {
  const bundle = await bookBundle(WS, { id: PAGE });
  const canon = JSON.parse(readFileSync(`${ROOT}${V10}${PAGE}.json`, "utf8")) as Canonical;
  return { bundle, canon };
}

describe("loading a canonical page", () => {
  it("brings every region, container, order and relation across in pixels", async () => {
    const { bundle, canon } = await load();
    expect(bundle.existing).not.toBeNull();
    const ann = M.initBook(bundle);
    expect(ann.mode).toBe("existing");
    expect(Object.keys(ann.regions).length).toBe(canon.regions.length);
    expect(ann.containers.length).toBe(canon.containers.length);
    expect(ann.order).toEqual(canon.reading_order);
    expect(ann.relations.length).toBe(canon.relations.length);
    for (const r of canon.regions) {
      const px = ann.regions[r.id].bbox;
      expect(px[0]).toBeCloseTo((r.bbox[0] / 1000) * canon.width, 0);
      expect(ann.regions[r.id].verified).toBe(false);
      expect(ann.regions[r.id].source).toBe("existing");
    }
    expect(M.walk(ann).length).toBe(canon.regions.length);
    expect(M.unverified(ann).length).toBe(canon.regions.length);
  });

  it("round-trips to the grid within rounding, and keeps the record shape", async () => {
    const { bundle, canon } = await load();
    // `reviewed_by_human` is the page being marked done, not merely every region accepted.
    const ann = M.markDone(M.acceptAll(M.initBook(bundle))!.ann, true).ann;
    const out = buildBookPage(ann, bundle, new Date("2026-09-21T00:00:00Z"));
    expect(out.schema_version).toBe("0.1");
    expect(out.bbox_coordinate_system).toBe("xyxy_0_1000");
    expect(out.width).toBe(canon.width);
    expect(out.reading_order).toEqual(canon.reading_order);
    const by = new Map(out.regions.map((r) => [r.id, r]));
    for (const r of canon.regions) {
      const g = by.get(r.id)!;
      for (let i = 0; i < 4; i++) expect(Math.abs(g.bbox[i] - r.bbox[i])).toBeLessThan(0.6);
      expect(g.stream_id).toBe(r.stream_id);
      expect(g.container_id).toBe(r.container_id);
      expect(g.bbox_pixels).toEqual(ann.regions[r.id].bbox);
    }
    expect(out.provenance.route).toBe("manual");
    expect(out.provenance.reviewed_by_human).toBe(true);
    expect(out.class_presence.main_text).toBe("present");
    expect(isComplete(validateBook(ann))).toBe(true);
  });
});

describe("acts", () => {
  it("a role change moves the region to the role's default stream and its order", async () => {
    const { bundle } = await load();
    const ann0 = M.initBook(bundle);
    const id = ann0.order.main[0];
    const r = M.setRole(ann0, [id], "footnote")!;
    expect(r.ann.regions[id].stream_id).toBe("footnotes");
    expect(r.ann.order.main).not.toContain(id);
    expect(M.orderPos(r.ann, id)?.stream).toBe("footnotes");
    expect(r.ann.regions[id].verified).toBe(true);
    expect(ann0.regions[id].stream_id).toBe("main"); // immutable
    const sep = M.setRole(r.ann, [id], "separator")!.ann;
    expect(sep.regions[id].stream_id).toBeNull();
    expect(M.orderPos(sep, id)).toBeNull();
  });

  it("unknown needs a reason before the page is complete", async () => {
    const { bundle } = await load();
    const ann0 = M.acceptAll(M.initBook(bundle))!.ann;
    const id = ann0.order.main[0];
    const a1 = M.setRole(ann0, [id], "unknown")!.ann;
    expect(isComplete(validateBook(a1))).toBe(false);
    const a2 = M.setField(a1, id, { ambiguity_reason: "cropped at the gutter" })!.ann;
    expect(isComplete(validateBook(a2))).toBe(true);
    const out = buildBookPage(a2, bundle);
    expect(out.regions.find((r) => r.id === id)!.ambiguity_reason).toBe("cropped at the gutter");
    expect(out.regions.find((r) => r.id !== id)!.ambiguity_reason).toBeUndefined();
  });

  it("a table area stays out of every stream while the lines inside it keep theirs", async () => {
    const { bundle } = await load();
    const ann0 = M.acceptAll(M.initBook(bundle))!.ann;
    const lines = ann0.order.main.slice(0, 3);
    const box = lines.map((id) => ann0.regions[id].bbox).reduce((a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])]);
    const drawn = M.addRegion(ann0, box, "table");
    const t = Object.keys(drawn.ann.regions).find((id) => !ann0.regions[id])!;
    expect(drawn.ann.regions[t].stream_id).toBeNull();
    expect(M.orderPos(drawn.ann, t)).toBeNull();
    expect(drawn.ann.order).toEqual(ann0.order);
    expect(M.walk(drawn.ann)).toContain(t);
    expect(M.setStream(drawn.ann, [t], "main")).toBeNull();
    expect(isComplete(validateBook(drawn.ann))).toBe(true);
    // a proposal line relabelled as a table leaves its stream; relabelled back, it returns
    const re = M.setRole(ann0, [lines[0]], "table")!.ann;
    expect(re.regions[lines[0]].stream_id).toBeNull();
    expect(re.order.main).not.toContain(lines[0]);
    expect(M.orderPos(M.setRole(re, [lines[0]], "main_text")!.ann, lines[0])?.stream).toBe("main");
    const out = buildBookPage(drawn.ann, bundle);
    const reg = out.regions.find((r) => r.id === t)!;
    expect(reg.role).toBe("table");
    expect(reg.stream_id).toBeNull();
    expect(out.class_presence.table).toBe("present");
    expect(Object.values(out.reading_order).flat()).not.toContain(t);
  });

  it("turning the view never changes an exported box or text_rotation", async () => {
    const { bundle } = await load();
    let ann = M.acceptAll(M.initBook(bundle))!.ann;
    ann = M.setRotation(ann, [ann.order.main[0]], 90)!.ann;
    const upright = buildBookPage(ann, bundle);
    let turned = ann;
    for (const deg of [90, 180, 270]) {
      turned = M.turnView(turned).ann;
      expect(turned.view_rotation).toBe(deg);
      const out = buildBookPage(turned, bundle);
      expect(out.regions.map((r) => [r.id, r.bbox, r.bbox_pixels, r.text_rotation])).toEqual(upright.regions.map((r) => [r.id, r.bbox, r.bbox_pixels, r.text_rotation]));
    }
  });

  it("figure is a role of its own, in no stream, and exports as figure", async () => {
    const { bundle } = await load();
    const ann0 = M.acceptAll(M.initBook(bundle))!.ann;
    const id = ann0.order.main[0];
    const a = M.setRole(ann0, [id], "figure")!.ann;
    expect(a.regions[id].stream_id).toBeNull();
    expect(M.orderPos(a, id)).toBeNull();
    expect(isComplete(validateBook(a))).toBe(true);
    const out = buildBookPage(a, bundle);
    expect(out.regions.find((r) => r.id === id)!.role).toBe("figure");
    expect(out.class_presence.figure).toBe("present");
  });

  it("noise is a role of its own, in no stream, and exports as noise", async () => {
    const { bundle } = await load();
    const ann0 = M.acceptAll(M.initBook(bundle))!.ann;
    const id = ann0.order.main[0];
    const a = M.setRole(ann0, [id], "noise")!.ann;
    expect(a.regions[id].stream_id).toBeNull();
    expect(M.orderPos(a, id)).toBeNull();
    expect(isComplete(validateBook(a))).toBe(true);
    const out = buildBookPage(a, bundle);
    expect(out.regions.find((r) => r.id === id)!.role).toBe("noise");
    expect(out.class_presence.noise).toBe("present");
    expect(M.setRole(a, [id], "main_text")!.ann.regions[id].stream_id).toBe("main");
  });

  it("merge unions the boxes, keeps the first's place and rewires relations", async () => {
    const { bundle } = await load();
    const ann0 = M.initBook(bundle);
    const [a, b] = ann0.order.main.slice(0, 2);
    const posA = M.orderPos(ann0, a)!.index;
    const r = M.mergeRegions(ann0, [a, b])!;
    const nid = Object.keys(r.ann.regions).find((k) => !ann0.regions[k])!;
    expect(r.ann.regions[a]).toBeUndefined();
    expect(r.ann.regions[nid].bbox[0]).toBe(Math.min(ann0.regions[a].bbox[0], ann0.regions[b].bbox[0]));
    expect(r.ann.regions[nid].bbox[3]).toBe(Math.max(ann0.regions[a].bbox[3], ann0.regions[b].bbox[3]));
    expect(r.ann.order.main[posA]).toBe(nid);
    expect(r.ann.order.main.filter((x) => x === nid).length).toBe(1);
    for (const x of r.ann.relations) {
      expect([a, b]).not.toContain(x.from);
      expect([a, b]).not.toContain(x.to);
    }
    expect(r.ann.regions[nid].source).toBe("op");
  });

  it("split makes two regions at the cut, in the same place of the order", async () => {
    const { bundle } = await load();
    const ann0 = M.initBook(bundle);
    const id = ann0.order.main[1];
    const b = ann0.regions[id].bbox;
    const y = Math.round((b[1] + b[3]) / 2);
    const r = M.splitRegion(ann0, id, y)!;
    const i = ann0.order.main.indexOf(id);
    const [top, bot] = r.ann.order.main.slice(i, i + 2);
    expect(r.ann.regions[top].bbox).toEqual([b[0], b[1], b[2], y]);
    expect(r.ann.regions[bot].bbox).toEqual([b[0], y, b[2], b[3]]);
    expect(r.ann.order.main.length).toBe(ann0.order.main.length + 1);
    expect(M.splitRegion(ann0, id, b[1])).toBeNull();
  });

  it("a vertical cut gives the right part the order slot and the relations", async () => {
    const { bundle } = await load();
    const ann0 = M.initBook(bundle);
    const id = ann0.order.main[1];
    const b = ann0.regions[id].bbox;
    const x = Math.round((b[0] + b[2]) / 2);
    const withRel = M.addRelation(ann0, "continues", id, ann0.order.main[0], "")!.ann;
    const r = M.splitRegion(withRel, id, x, "v")!;
    const i = withRel.order.main.indexOf(id);
    const [first, second] = r.ann.order.main.slice(i, i + 2);
    // Right first: a Hebrew page reads the right column before the left.
    expect(r.ann.regions[first].bbox).toEqual([x, b[1], b[2], b[3]]);
    expect(r.ann.regions[second].bbox).toEqual([b[0], b[1], x, b[3]]);
    expect(r.ann.regions[first].source).toBe("op");
    expect(r.ann.regions[first].verified).toBe(true);
    expect(r.ann.relations.some((rel) => rel.from === first)).toBe(true);
    expect(r.ann.relations.some((rel) => rel.from === id || rel.to === id)).toBe(false);
    expect(M.splitRegion(ann0, id, b[0] + 1, "v")).toBeNull();
  });

  it("every split is written to the page's cut ledger and into the record", async () => {
    const { bundle } = await load();
    const ann0 = M.initBook(bundle);
    expect(ann0.cuts).toEqual([]);
    const id = ann0.order.main[1];
    const box = ann0.regions[id].bbox;
    const y = Math.round((box[1] + box[3]) / 2);
    const a1 = M.splitRegion(ann0, id, y)!.ann;
    expect(a1.cuts.length).toBe(1);
    expect(a1.cuts[0]).toMatchObject({ seq: 1, kind: "free", axis: "h", at: y, from: id, from_bbox: box });
    const [top, bot] = a1.cuts[0].into;
    expect(a1.regions[top].cut_from).toMatchObject({ parent: id, seq: 1, side: "top", sibling: bot });
    expect(a1.regions[bot].cut_from).toMatchObject({ parent: id, seq: 1, side: "bottom", sibling: top });
    expect(a1.cuts[0].into_bboxes).toEqual([a1.regions[top].bbox, a1.regions[bot].bbox]);
    // Cut the lower half again, the other way: the ledger keeps both, in order.
    const lower = a1.regions[bot].bbox;
    const x = Math.round((lower[0] + lower[2]) / 2);
    const a2 = M.markDone(M.acceptAll(M.splitRegion(a1, bot, x, "v")!.ann)!.ann, true).ann;
    expect(a2.cuts.map((c) => [c.seq, c.axis, c.from])).toEqual([[1, "h", id], [2, "v", bot]]);
    expect(a2.regions[a2.cuts[1].into[0]].cut_from!.side).toBe("right");
    const out = buildBookPage(a2, bundle);
    expect(out.cuts).toEqual(a2.cuts);
    const rec = out.regions.find((r) => r.id === a2.cuts[1].into[0])!;
    expect(rec.cut_from).toMatchObject({ parent: bot, seq: 2, side: "right", axis: "v", at: x });
    expect(out.regions.find((r) => r.id === top)!.cut_from!.parent).toBe(id);
    expect(out.regions.some((r) => !r.cut_from)).toBe(true);
  });

  it("autoOrder reads right column then left inside a zone", async () => {
    const { bundle, canon } = await load();
    const ann0 = M.initBook(bundle);
    const r = M.autoOrder(ann0, "main")!;
    // The canonical order was set by hand on the same rule; the geometry must agree.
    expect(r.ann.order.main).toEqual(canon.reading_order.main);
  });

  it("a drawn region lands in its container and its stream's order", async () => {
    const { bundle } = await load();
    const ann0 = M.initBook(bundle);
    const col = ann0.containers.find((c) => c.kind === "column")!;
    const box: [number, number, number, number] = [col.bbox[0] + 5, col.bbox[1] + 5, col.bbox[2] - 5, col.bbox[1] + 40];
    const r = M.addRegion(ann0, box, "main_text");
    const nid = Object.keys(r.ann.regions).find((k) => !ann0.regions[k])!;
    expect(r.ann.regions[nid]).toMatchObject({ container_id: col.id, stream_id: "main", verified: true, source: "human" });
    expect(r.ann.order.main).toContain(nid);
  });

  it("relations: no self, no duplicate, removed with the region", async () => {
    const { bundle } = await load();
    const ann0 = M.initBook(bundle);
    const [a, b] = ann0.order.main.slice(0, 2);
    expect(M.addRelation(ann0, "continues", a, a, "")).toBeNull();
    const a1 = M.addRelation(ann0, "continues", a, b, "")!.ann;
    expect(M.addRelation(a1, "continues", a, b, "")).toBeNull();
    const a2 = M.deleteRegions(a1, [b])!.ann;
    expect(a2.relations.some((x) => x.to === b || x.from === b)).toBe(false);
    expect(M.orderPos(a2, b)).toBeNull();
  });

  it("containers: a column outside every zone gets its own; deleting a zone takes its columns", async () => {
    const { bundle } = await load();
    const ann0 = M.dropProposal(M.initBook(bundle)).ann;
    const a1 = M.addContainer(ann0, "column", [100, 100, 400, 800]).ann;
    expect(a1.containers.length).toBe(2);
    const zone = a1.containers.find((c) => c.kind === "zone")!;
    const a2 = M.deleteContainer(a1, zone.id)!.ann;
    expect(a2.containers.length).toBe(0);
  });

  it("sanitize drops dangling references", async () => {
    const { bundle } = await load();
    const ann0 = M.initBook(bundle);
    ann0.order.main.push("ghost");
    ann0.relations.push({ type: "heads", from: "ghost", to: ann0.order.main[0], basis: "" });
    ann0.date_evidence.region_id = "ghost";
    const a = M.sanitize(ann0);
    expect(a.order.main).not.toContain("ghost");
    expect(a.relations.some((x) => x.from === "ghost")).toBe(false);
    expect(a.date_evidence.region_id).toBeNull();
  });
});

describe("text rotation, as on a newspaper block", () => {
  it("sets, clears on the same value, and leaves box, role and review state alone", async () => {
    const { bundle } = await load();
    const ann0 = M.initBook(bundle);
    const id = ann0.order.main[0];
    const set = M.setRotation(ann0, [id], 90)!;
    expect(set.ann.regions[id].rotation).toBe(90);
    expect(set.ann.regions[id].bbox).toEqual(ann0.regions[id].bbox);
    expect(set.ann.regions[id].role).toBe(ann0.regions[id].role);
    expect(set.ann.regions[id].verified).toBe(ann0.regions[id].verified);
    expect(M.setRotation(set.ann, [id], 90)!.ann.regions[id].rotation).toBeUndefined();
    expect(M.setRotation(set.ann, [id], 180)!.ann.regions[id].rotation).toBe(180);
    expect(M.setRotation(ann0, ["ghost"], 90)).toBeNull();
  });

  it("a split keeps it on both halves; a merge keeps it only when every member shares it", async () => {
    const { bundle } = await load();
    const ann0 = M.initBook(bundle);
    const [a, b] = ann0.order.main.slice(0, 2);
    const both = M.setRotation(ann0, [a, b], 270)!.ann;
    const bb = both.regions[a].bbox;
    const cut = M.splitRegion(both, a, Math.round((bb[1] + bb[3]) / 2))!.ann;
    const halves = Object.values(cut.regions).filter((r) => r.cut_from?.parent === a);
    expect(halves.length).toBe(2);
    for (const h of halves) expect(h.rotation).toBe(270);
    const same = M.mergeRegions(both, [a, b])!.ann;
    expect(Object.values(same.regions).find((r) => !both.regions[r.id])!.rotation).toBe(270);
    const mixed = M.setRotation(both, [b], 90)!.ann;
    const merged = M.mergeRegions(mixed, [a, b])!.ann;
    expect(Object.values(merged.regions).find((r) => !mixed.regions[r.id])!.rotation).toBeUndefined();
  });

  it("is exported as text_rotation and only where set", async () => {
    const { bundle } = await load();
    const ann0 = M.initBook(bundle);
    const id = ann0.order.main[0];
    const out = buildBookPage(M.setRotation(ann0, [id], 180)!.ann, bundle);
    expect(out.regions.find((r) => r.id === id)!.text_rotation).toBe(180);
    expect(out.regions.filter((r) => r.text_rotation != null).length).toBe(1);
  });
});

describe("turning the page on screen", () => {
  it("cycles 0 → 90 → 180 → 270 → 0 and never touches a region", async () => {
    const { bundle } = await load();
    let ann = M.initBook(bundle);
    const before = JSON.stringify(ann.regions);
    const seen: (number | undefined)[] = [];
    for (let i = 0; i < 4; i++) {
      ann = M.turnView(ann).ann;
      seen.push(ann.view_rotation);
    }
    expect(seen).toEqual([90, 180, 270, undefined]);
    expect(JSON.stringify(ann.regions)).toBe(before);
  });
});

describe("a project's custom tag", () => {
  it("rides beside the canonical role, and is dropped once the role changes", async () => {
    const { bundle } = await load();
    const ann = M.initBook(bundle);
    const id = Object.keys(ann.regions)[0];
    const plain = buildBookPage(ann, bundle).regions.find((r) => r.id === id)!;
    expect(plain.tag).toBeUndefined();
    const titled = M.setRole(ann, [id], "title")!.ann;
    titled.regions[id].tag = { id: "responsum_heading", base: "title" };
    const rec = buildBookPage(titled, bundle).regions.find((r) => r.id === id)!;
    expect(rec.role).toBe("title");
    expect(rec.tag).toBe("responsum_heading");
    const moved = M.setRole(titled, [id], "main_text")!.ann;
    expect(buildBookPage(moved, bundle).regions.find((r) => r.id === id)!.tag).toBeUndefined();
  });
});
