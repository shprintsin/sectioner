// The newspaper model against the brief's own example pages: a fluent user re-annotating
// each page from scratch must reproduce `annotated.expected.json`. That is the most
// direct usability test the brief offers, so it is the first test here.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { newsBundle } from "../../_server/bundle";
import type { WorksetDef } from "../../_server/worksets";
import { union } from "../geometry";
import type { NewsBundle, NewsType } from "../types";
import { buildPage, validate, isComplete } from "./export";
import * as M from "./model";

const EXAMPLES = fileURLToPath(new URL("../../../../fixtures/newspaper-brief/", import.meta.url));

const WS: WorksetDef = {
  id: "t",
  kind: "newspaper",
  root: EXAMPLES,
  files: { image: "{dir}/scan.png", layout: "{dir}/layout.eynollah.json", proposal: "{dir}/model_proposal.json", ocr: "{dir}/annotated.expected.json" },
};

interface Expected {
  sections: { section_id: string; type: NewsType; title: string | null; block_ids: number[] }[];
  blocks: { block_id: number; role: string; section_id: string | null }[];
}

async function load(dir: string, id: string): Promise<{ bundle: NewsBundle; expected: Expected }> {
  const bundle = await newsBundle(WS, { id, dir });
  const expected = JSON.parse(readFileSync(`${EXAMPLES}${dir}/annotated.expected.json`, "utf8")) as Expected;
  return { bundle, expected };
}

/** Annotate the page the way the keyboard would: N at the first block of each section,
 *  the type, Space for the rest, T on the title block, X on what is left. */
function reannotate(bundle: NewsBundle, expected: Expected) {
  let ann = M.initNews(bundle);
  const order = () => M.orderOf(ann, bundle.columnBounds, bundle.width);
  let active: string | null = null;
  for (const s of expected.sections) {
    const ids = s.block_ids.filter((b) => ann.blocks[b] && M.isContent(ann.blocks[b]));
    if (!ids.length) continue;
    const r = M.startSection(ann, [ids[0]], s.type, order());
    ann = r.ann;
    active = r.move.active ?? null;
    for (const b of ids.slice(1)) ann = M.assignSame(ann, [b], active, order()).ann;
    if (s.title) {
      const first = s.title.split("\n")[0].trim();
      const firstLine = (b: number) => (ann.blocks[b].text || "").split("\n")[0].trim();
      const holder = ids.find((b) => firstLine(b) === first);
      if (holder != null) ann = M.setTitle(ann, holder, active, order())!.ann;
      else ann = M.setTitleText(ann, active!, first)!.ann;
    }
  }
  const left = M.unassigned(ann, order());
  if (left.length) ann = M.skip(ann, left, order()).ann;
  return ann;
}

describe("re-annotating the example pages reproduces the expected sections", () => {
  for (const [dir, id] of [
    ["easy_MAD", "MAD_19050210_01-001"],
    ["dense_HNT", "HNT_19111025_01-000"],
    ["ads_YIDHSH", "YIDHSH19230418_01-000"],
  ] as const) {
    it(`${dir}`, async () => {
      const { bundle, expected } = await load(dir, id);
      const draft = reannotate(bundle, expected);
      expect(buildPage(draft, bundle).provenance.reviewed_by_human).toBe(false);
      const ann = M.markDone(draft, true).ann;
      const page = buildPage(ann, bundle, new Date("2026-09-21T00:00:00Z"));
      const got = new Map(page.sections.map((s) => [s.block_ids.slice().sort().join(","), s]));
      for (const s of expected.sections) {
        const key = s.block_ids.slice().sort().join(",");
        expect(got.has(key), `section ${s.section_id} (${s.type}) missing`).toBe(true);
        expect(got.get(key)!.type).toBe(s.type);
        if (s.title) expect(got.get(key)!.title).toBe(s.title.split("\n")[0].trim());
      }
      expect(page.sections.length).toBe(expected.sections.filter((s) => s.block_ids.some((b) => ann.blocks[b] && M.isContent(ann.blocks[b]))).length);
      // every content block in exactly one section
      const inSec = page.blocks.filter((b) => b.section_id).length;
      expect(new Set(page.sections.flatMap((s) => s.block_ids)).size).toBe(page.sections.flatMap((s) => s.block_ids).length);
      expect(inSec).toBe(page.sections.flatMap((s) => s.block_ids).length);
      expect(page.provenance.route).toBe("manual");
      expect(page.provenance.reviewed_by_human).toBe(true);
      expect(page.width).toBe(bundle.width);
      expect(page.blocks.length).toBe(Object.keys(ann.blocks).length);
      const checks = validate(ann, bundle);
      expect(isComplete(checks)).toBe(true);
    });
  }
});

describe("acts keep the hard invariant and stay immutable", () => {
  it("place removes a block from its previous section; empty sections vanish", async () => {
    const { bundle } = await load("easy_MAD", "MAD_19050210_01-001");
    const ann0 = M.initNews(bundle);
    const order = M.orderOf(ann0, bundle.columnBounds, bundle.width);
    const a1 = M.startSection(ann0, [order[0]], "ARTICLE", order).ann;
    const a2 = M.startSection(a1, [order[1]], "ADVERTISEMENT", order).ann;
    expect(a2.sections.map((s) => s.id)).toEqual(["s1", "s2"]);
    const a3 = M.assignSame(a2, [order[1]], "s1", order).ann;
    expect(a3.sections.map((s) => s.id)).toEqual(["s1"]);
    expect(a3.sections[0].blockIds).toEqual([order[0], order[1]]);
    expect(a2.sections.length).toBe(2); // the earlier value is untouched
    expect(ann0.sections.length).toBe(0);
  });

  it("skip takes a block out of its section; a skipped block is not unassigned", async () => {
    const { bundle } = await load("easy_MAD", "MAD_19050210_01-001");
    const ann0 = M.initNews(bundle);
    const order = M.orderOf(ann0, bundle.columnBounds, bundle.width);
    const a1 = M.startSection(ann0, order.slice(0, 3), "ARTICLE", order).ann;
    const a2 = M.skip(a1, [order[1]], order).ann;
    expect(a2.sections[0].blockIds).toEqual([order[0], order[2]]);
    expect(M.unassigned(a2, order)).not.toContain(order[1]);
    const a3 = M.assignSame(a2, [order[1]], "s1", order).ann;
    expect(a3.skip[order[1]]).toBeUndefined();
  });

  it("proposal load marks sections unverified; accept clears it", async () => {
    const { bundle } = await load("easy_MAD", "MAD_19050210_01-001");
    const ann0 = M.initNews(bundle);
    const order = M.orderOf(ann0, bundle.columnBounds, bundle.width);
    const a1 = M.loadProposal(ann0, bundle.proposal, order).ann;
    expect(a1.mode).toBe("proposal");
    expect(a1.sections.length).toBe(bundle.proposal.length);
    expect(a1.sections.every((s) => !s.verified)).toBe(true);
    expect(isComplete(validate(a1, bundle))).toBe(false);
    let a = a1;
    for (const s of a1.sections) a = M.accept(a, s.id, order)!.ann;
    expect(a.sections.every((s) => s.verified)).toBe(true);
  });

  it("title moves the block first; setting it again clears it", async () => {
    const { bundle } = await load("easy_MAD", "MAD_19050210_01-001");
    const ann0 = M.initNews(bundle);
    const order = M.orderOf(ann0, bundle.columnBounds, bundle.width);
    const a1 = M.startSection(ann0, order.slice(0, 3), "ARTICLE", order).ann;
    const a2 = M.setTitle(a1, order[2], "s1", order)!.ann;
    expect(a2.sections[0].blockIds[0]).toBe(order[2]);
    expect(a2.sections[0].titleBlockId).toBe(order[2]);
    const a3 = M.setTitle(a2, order[2], "s1", order)!.ann;
    expect(a3.sections[0].titleBlockId).toBeNull();
    expect(a3.sections[0].blockIds).toEqual(order.slice(0, 3));
  });
});

describe("repairs keep coordinates exact", () => {
  it("split cuts between printed lines: both halves are the union of their lines", async () => {
    const { bundle } = await load("easy_MAD", "MAD_19050210_01-001");
    const ann0 = M.initNews(bundle);
    const order = M.orderOf(ann0, bundle.columnBounds, bundle.width);
    const id = order.find((i) => ann0.blocks[i].lines.length >= 4)!;
    const b = ann0.blocks[id];
    const a1 = M.startSection(ann0, [id], "ARTICLE", order).ann;
    const r = M.splitBlock(a1, id, 2, bundle.columnBounds, bundle.width)!;
    const ids = Object.keys(r.ann.blocks).map(Number);
    expect(ids).not.toContain(id);
    const top = Math.max(...ids) - 1, bot = Math.max(...ids);
    expect(r.ann.blocks[top].bbox).toEqual(union(b.lines.slice(0, 2)));
    expect(r.ann.blocks[bot].bbox).toEqual(union(b.lines.slice(2)));
    expect(r.ann.blocks[top].source).toBe("op");
    expect(r.ann.blocks[top].lines.length + r.ann.blocks[bot].lines.length).toBe(b.lines.length);
    // both halves stay in the section, where the block stood, upper half first
    expect(r.ann.sections[0].blockIds).toEqual([top, bot]);
    expect(M.unassigned(r.ann, M.orderOf(r.ann, bundle.columnBounds, bundle.width))).not.toContain(bot);
    expect(M.splitBlock(a1, id, 0, bundle.columnBounds, bundle.width)).toBeNull();
    expect(M.splitBlock(a1, id, b.lines.length, bundle.columnBounds, bundle.width)).toBeNull();
  });

  it("a cut across tiles the box, keeps both halves in the section and records the original", async () => {
    const { bundle } = await load("easy_MAD", "MAD_19050210_01-001");
    const ann0 = M.initNews(bundle);
    const order = M.orderOf(ann0, bundle.columnBounds, bundle.width);
    const id = order.find((i) => ann0.blocks[i].lines.length >= 4)!;
    const b = ann0.blocks[id];
    const y = Math.round((b.bbox[1] + b.bbox[3]) / 2);
    const a1 = M.startSection(ann0, [id], "ARTICLE", order).ann;
    const r = M.cutBlock(a1, id, y, "h", bundle.columnBounds, bundle.width)!;
    const ids = Object.keys(r.ann.blocks).map(Number);
    expect(ids).not.toContain(id);
    const top = Math.max(...ids) - 1, bot = Math.max(...ids);
    expect(r.ann.blocks[top].bbox).toEqual([b.bbox[0], b.bbox[1], b.bbox[2], y]);
    expect(r.ann.blocks[bot].bbox).toEqual([b.bbox[0], y, b.bbox[2], b.bbox[3]]);
    expect(union([r.ann.blocks[top].bbox, r.ann.blocks[bot].bbox])).toEqual(b.bbox);
    expect(r.ann.blocks[top].source).toBe("op");
    // A cut is not ink-exact, so both halves carry the rectangle they came from.
    expect(r.ann.blocks[top].geometryEdit).toEqual({ originalBBox: b.bbox, basis: "human_adjusted" });
    expect(r.ann.blocks[bot].geometryEdit).toEqual({ originalBBox: b.bbox, basis: "human_adjusted" });
    // Every printed line lands in exactly one half.
    expect(r.ann.blocks[top].lines.length + r.ann.blocks[bot].lines.length).toBe(b.lines.length);
    expect(r.ann.sections[0].blockIds).toEqual([top, bot]);
    expect(M.unassigned(r.ann, M.orderOf(r.ann, bundle.columnBounds, bundle.width))).not.toContain(bot);
  });

  it("a cut down keeps both halves in the section, right first, and refuses a cut outside the box", async () => {
    const { bundle } = await load("easy_MAD", "MAD_19050210_01-001");
    const ann0 = M.initNews(bundle);
    const order = M.orderOf(ann0, bundle.columnBounds, bundle.width);
    const id = order[0];
    const b = ann0.blocks[id];
    const x = Math.round((b.bbox[0] + b.bbox[2]) / 2);
    const a1 = M.startSection(ann0, [id], "ARTICLE", order).ann;
    const r = M.cutBlock(a1, id, x, "v", bundle.columnBounds, bundle.width)!;
    const ids = Object.keys(r.ann.blocks).map(Number);
    const right = Math.max(...ids) - 1, left = Math.max(...ids);
    expect(r.ann.blocks[right].bbox).toEqual([x, b.bbox[1], b.bbox[2], b.bbox[3]]);
    expect(r.ann.blocks[left].bbox).toEqual([b.bbox[0], b.bbox[1], x, b.bbox[3]]);
    expect(r.ann.sections[0].blockIds).toEqual([right, left]);
    expect(M.cutBlock(a1, id, b.bbox[0], "v", bundle.columnBounds, bundle.width)).toBeNull();
    expect(M.cutBlock(a1, id, b.bbox[3] + 50, "h", bundle.columnBounds, bundle.width)).toBeNull();
    expect(M.cutBlock(a1, -1, x, "v", bundle.columnBounds, bundle.width)).toBeNull();
  });

  it("every split is written to the page's cut ledger and into the export", async () => {
    const { bundle } = await load("easy_MAD", "MAD_19050210_01-001");
    const ann0 = M.initNews(bundle);
    expect(ann0.cuts).toEqual([]);
    const order = M.orderOf(ann0, bundle.columnBounds, bundle.width);
    const id = order.find((i) => ann0.blocks[i].lines.length >= 4)!;
    const b = ann0.blocks[id];
    // A line split first, then a free cut of the half it produced.
    const a1 = M.splitBlock(ann0, id, 2, bundle.columnBounds, bundle.width)!.ann;
    expect(a1.cuts.length).toBe(1);
    expect(a1.cuts[0]).toMatchObject({ seq: 1, kind: "line", axis: "h", from: id, from_bbox: b.bbox, line_index: 2 });
    const [top, bot] = a1.cuts[0].into;
    expect(a1.blocks[top].cutFrom).toMatchObject({ parent: id, seq: 1, side: "top", sibling: bot, kind: "line" });
    expect(a1.blocks[bot].cutFrom).toMatchObject({ parent: id, seq: 1, side: "bottom", sibling: top });
    const tb = a1.blocks[bot].bbox;
    const a2 = M.cutBlock(a1, bot, Math.round((tb[0] + tb[2]) / 2), "v", bundle.columnBounds, bundle.width)!.ann;
    expect(a2.cuts.length).toBe(2);
    expect(a2.cuts[1]).toMatchObject({ seq: 2, kind: "free", axis: "v", from: bot });
    // Right half first, and the ledger's boxes are the boxes the blocks actually carry.
    const [right, left] = a2.cuts[1].into;
    expect(a2.blocks[right].cutFrom!.side).toBe("right");
    expect(a2.blocks[left].cutFrom!.side).toBe("left");
    expect(a2.cuts[1].into_bboxes).toEqual([a2.blocks[right].bbox, a2.blocks[left].bbox]);
    // The chain back to the block the layout model gave us survives both cuts.
    expect(a2.blocks[right].inputBlockIds).toEqual([id]);
    const page = buildPage(a2, bundle);
    expect(page.cuts).toEqual(a2.cuts);
    const byId = new Map(page.blocks.map((x) => [x.block_id, x]));
    expect(byId.get(right)!.cut_from).toMatchObject({ parent: bot, seq: 2, side: "right" });
    expect(byId.get(top)!.cut_from!.parent).toBe(id);
    // A block nobody cut says nothing.
    expect(page.blocks.find((x) => x.block_id !== top && !x.cut_from)).toBeDefined();
  });

  it("a split keeps the section's own reading order and its title", async () => {
    const { bundle } = await load("easy_MAD", "MAD_19050210_01-001");
    const ann0 = M.initNews(bundle);
    const order = M.orderOf(ann0, bundle.columnBounds, bundle.width);
    const [a, b, c] = order;
    const id = order.find((i) => ann0.blocks[i].lines.length >= 4 && ![a, b, c].includes(i))!;
    // The reviewer's order differs from the geometric one: the split must not re-sort it.
    let ann = M.startSection(ann0, [a, b, c, id], "ARTICLE", order).ann;
    ann = M.reorder(ann, id, -1)!.ann;
    ann = M.reorder(ann, id, -1)!.ann;
    ann = M.markHeadline(ann, id, order)!.ann;
    const before = ann.sections[0].blockIds;
    expect(before).toEqual([a, id, b, c]);
    const r = M.splitBlock(ann, id, 2, bundle.columnBounds, bundle.width)!;
    const [top, bot] = r.ann.cuts[0].into;
    expect(r.ann.sections.length).toBe(1);
    expect(r.ann.sections[0].blockIds).toEqual(before.flatMap((x) => (x === id ? [top, bot] : [x])));
    expect(r.ann.sections[0].titleBlockId).toBe(top);
    expect(r.ann.blocks[top].role).toBe("headline");
    expect(r.ann.blocks[bot].role).toBeNull();
    // A cut of a block in a section behaves the same way.
    const tb = r.ann.blocks[bot].bbox;
    const r2 = M.cutBlock(r.ann, bot, Math.round((tb[1] + tb[3]) / 2), "h", bundle.columnBounds, bundle.width)!;
    const [u, d] = r2.ann.cuts[1].into;
    expect(r2.ann.sections[0].blockIds).toEqual(r.ann.sections[0].blockIds.flatMap((x) => (x === bot ? [u, d] : [x])));
  });

  it("merge is the union of known boxes and carries the section and title", async () => {
    const { bundle } = await load("easy_MAD", "MAD_19050210_01-001");
    const ann0 = M.initNews(bundle);
    const order = M.orderOf(ann0, bundle.columnBounds, bundle.width);
    const [a, b] = order;
    const a1 = M.startSection(ann0, [a, b], "ARTICLE", order).ann;
    const a2 = M.setTitle(a1, a, "s1", order)!.ann;
    const r = M.mergeBlocks(a2, [a, b], bundle.columnBounds, bundle.width)!;
    const nid = Math.max(...Object.keys(r.ann.blocks).map(Number));
    expect(r.ann.blocks[nid].bbox).toEqual(union([ann0.blocks[a].bbox, ann0.blocks[b].bbox]));
    expect(r.ann.blocks[nid].source).toBe("op");
    expect(r.ann.sections[0].blockIds).toEqual([nid]);
    expect(r.ann.sections[0].titleBlockId).toBe(nid);
    expect(M.mergeBlocks(a2, [a], bundle.columnBounds, bundle.width)).toBeNull();
  });

  it("an added block is recorded as added and starts unassigned", async () => {
    const { bundle } = await load("easy_MAD", "MAD_19050210_01-001");
    const ann0 = M.initNews(bundle);
    const r = M.addBlock(ann0, [100.4, 200.6, 300, 400], bundle.columnBounds, bundle.width);
    const nid = Math.max(...Object.keys(r.ann.blocks).map(Number));
    expect(r.ann.blocks[nid]).toMatchObject({ source: "added", bbox: [100, 201, 300, 400], lines: [] });
    expect(M.unassigned(r.ann, M.orderOf(r.ann, bundle.columnBounds, bundle.width))).toContain(nid);
  });

  it("delete removes the block everywhere", async () => {
    const { bundle } = await load("easy_MAD", "MAD_19050210_01-001");
    const ann0 = M.initNews(bundle);
    const order = M.orderOf(ann0, bundle.columnBounds, bundle.width);
    const a1 = M.startSection(ann0, [order[0]], "ARTICLE", order).ann;
    const a2 = M.setTitle(a1, order[0], "s1", order)!.ann;
    const r = M.deleteBlocks(a2, [order[0]], bundle.columnBounds, bundle.width)!;
    expect(r.ann.blocks[order[0]]).toBeUndefined();
    expect(r.ann.sections.length).toBe(0);
  });
});

describe("export roles", () => {
  it("derives roles from the section when the annotator set none", async () => {
    const { bundle } = await load("easy_MAD", "MAD_19050210_01-001");
    const ann0 = M.initNews(bundle);
    const order = M.orderOf(ann0, bundle.columnBounds, bundle.width);
    const a1 = M.startSection(ann0, order.slice(0, 2), "ADVERTISEMENT", order).ann;
    const a2 = M.setTitle(a1, order[0], "s1", order)!.ann;
    const page = buildPage(a2, bundle);
    const by = new Map(page.blocks.map((b) => [b.block_id, b]));
    expect(by.get(order[0])!.role).toBe("ad_headline");
    expect(by.get(order[1])!.role).toBe("ad_body");
    const sep = page.blocks.find((b) => !M.isContent(a2.blocks[b.block_id]));
    if (sep) expect(sep.role).toBe("separator");
    const loose = page.blocks.find((b) => b.section_id === null && M.isContent(a2.blocks[b.block_id]));
    if (loose) expect(loose.role).toBe("body");
  });
});

describe("a project's custom tag", () => {
  it("rides beside the canonical type, and is dropped once the type changes", async () => {
    const { bundle } = await load("easy_MAD", "MAD_19050210_01-001");
    let ann = M.initNews(bundle);
    const order = M.orderOf(ann, bundle.columnBounds, bundle.width);
    const first = order.find((b) => M.isContent(ann.blocks[b]))!;
    ann = M.startSection(ann, [first], "ADVERTISEMENT", order).ann;
    const sec = ann.sections[0];
    expect(buildPage(ann, bundle).sections[0].tag).toBeUndefined();
    sec.tag = { id: "shipping_notice", base: "ADVERTISEMENT" };
    expect(buildPage(ann, bundle).sections[0]).toMatchObject({ type: "ADVERTISEMENT", tag: "shipping_notice" });
    const retyped = M.setType(ann, sec.id, "ARTICLE", [first], order).ann;
    expect(buildPage(retyped, bundle).sections[0].tag).toBeUndefined();
  });
});
