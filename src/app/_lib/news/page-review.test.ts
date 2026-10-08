import { describe, expect, it } from "vitest";
import type { NewsBundle } from "../types";
import * as M from "./model";
import { articleColor, blockTag, sectionTag } from "./display";
import { buildPage, effectiveRole } from "./export";

function bundle(): NewsBundle {
  return { kind: "newspaper", id: "page1", width: 100, height: 200, imageUrl: "/test.png", columnBounds: [0, 100], nColumns: 1, languages: ["heb"], layoutModel: "fixture", ocrEngine: "fixture", session: null,
    blocks: [1, 2, 3].map(id => ({ id, label: "text", bbox: [0, id * 40, 80, id * 40 + 30], lines: [], text: `block ${id}`, conf: null, role: null, source: "layout", inputBlockIds: [id], inputEvidence: { unitId: `u${id}`, parentBlockId: `p${id}`, textSpan: [0, 7], geometryStatus: id === 3 ? "source_parent_context_only" : "source" } })),
    startWithProposal: true, proposal: [{ id: "s17", articleKey: "A17", type: "ARTICLE", title: null, titleBlockId: null, block_ids: [2, 1], preserveOrder: true, orderUncertain: false, continuesTo: true }, { id: "s20", articleKey: "A20", type: "ARTICLE", title: null, block_ids: [3], preserveOrder: true, orderUncertain: true }] };
}

describe("full newspaper page review", () => {
  it("keeps display labels to section identity alone", () => {
    expect(sectionTag({ ...M.initNews(bundle()).sections[0] })).toBe("A17");
    expect(sectionTag(undefined)).toBe("—");
  });
  it("distinguishes a unique H1, internal H2 and separator without moving article boundaries", () => {
    const b = bundle(); const ann = M.initNews(b);
    const h1 = M.markHeadline(ann, 2, [1, 2, 3])!.ann;
    expect(h1.sections[0].titleBlockId).toBe(2);
    expect(h1.blocks[2].role).toBe("headline");
    const h2 = M.markStructuralRole(h1, 1, "subhead")!.ann;
    expect(h2.sections[0].titleBlockId).toBe(2);
    expect(h2.blocks[1].role).toBe("subhead");
    const switched = M.markHeadline(h2, 1, [1, 2, 3])!.ann;
    expect(switched.blocks[2].role).toBe("subhead");
    expect(switched.sections[0].titleBlockId).toBe(1);
    const separator = M.markStructuralRole(switched, 1, "separator")!.ann;
    expect(separator.sections[0].titleBlockId).toBeNull();
    expect(separator.sections.map(s => s.blockIds)).toEqual(ann.sections.map(s => s.blockIds));
    expect(separator.blocks[1].text).toBe(ann.blocks[1].text);
    expect(buildPage(separator, b).blocks.find(x => x.block_id === 1)!.role).toBe("separator");
    expect(M.markStructuralRole(separator, 1, "separator")!.ann.blocks[1].role).toBe("body");
  });
  it("tags a footnote within its article and exports the role", () => {
    const b = bundle();
    const ann = M.initNews(b);
    const tagged = M.markStructuralRoles(ann, [1, 3], "footnote")!.ann;
    expect(tagged.sections.map(s => s.blockIds)).toEqual(ann.sections.map(s => s.blockIds));
    expect(tagged.blocks[1].role).toBe("footnote");
    expect(tagged.blocks[3].role).toBe("footnote");
    expect(buildPage(tagged, b).blocks.filter(x => x.role === "footnote").map(x => x.block_id)).toEqual([1, 3]);
    const removed = M.markStructuralRoles(tagged, [1, 3], "footnote")!.ann;
    expect(removed.blocks[1].role).toBe("body");
    expect(removed.blocks[3].role).toBe("body");
  });
  it("groups exactly selected blocks, retains OCR and geometry, and removes stale title references", () => {
    const ann = M.initNews(bundle());
    ann.sections[0].titleBlockId = 1;
    const result = M.groupBlocks(ann, [1, 3], [1, 2, 3])!;
    const group = result.ann.sections.find(s => s.id === result.move.active)!;
    // A20 is swallowed whole, so the group continues it: same id, key and colour.
    expect(group.id).toBe("s20");
    expect(group.articleKey).toBe("A20");
    expect(articleColor(group)).toBe(articleColor(ann.sections[1]));
    expect(group.blockIds).toEqual([1, 3]);
    expect(group.orderUncertain).toBe(true);
    expect(group.verified).toBe(false);
    expect(result.ann.blocks).toEqual(ann.blocks);
    expect(result.ann.sections.find(s => s.id === "s17")!.blockIds).toEqual([2]);
    expect(result.ann.sections.find(s => s.id === "s17")!.titleBlockId).toBeNull();
    expect(ann.sections[0].blockIds).toEqual([2, 1]);
    expect(result.move.sel).toEqual([1, 3]);
    const same = M.groupBlocks(ann, [1, 2], [1, 2, 3])!;
    expect(same.ann.sections.find(s => s.id === same.move.active)!.blockIds).toEqual([2, 1]);
    expect(same.move.active).toBe("s17");
  });
  it("grouping whole articles keeps the id of the one that reads first; the others join it", () => {
    const ann = M.initNews(bundle());
    const result = M.groupBlocks(ann, [1, 2, 3], [1, 2, 3])!;
    expect(result.ann.sections).toHaveLength(1);
    const group = result.ann.sections[0];
    expect(group.articleKey).toBe("A17");
    // A17's own order (2 before 1) survives; A20's block is inserted by reading order.
    expect(group.blockIds).toEqual([2, 1, 3]);
    expect(group.continuesTo).toBe(true);
  });
  it("a new group never reuses an id, and a page-local group is never continued", () => {
    const ann = M.initNews(bundle());
    const a = M.groupBlocks(ann, [3], [1, 2, 3], true)!.ann;
    const newId = a.sections.find(s => s.blockIds.includes(3))!.id;
    expect(["s17", "s20"]).not.toContain(newId);
    const b = M.dissolve(a, newId)!.ann;
    const c = M.groupBlocks(b, [3], [1, 2, 3])!;
    expect(c.move.active).not.toBe(newId);
    // Swallowing the unkeyed group whole plus another block still makes a new section.
    const d = M.groupBlocks(c.ann, [1, 3], [1, 2, 3])!;
    expect(d.move.active).not.toBe(c.move.active);
    expect(d.ann.sections.find(s => s.id === d.move.active)!.articleKey).toBeUndefined();
  });
  it("an article plus a loose block keeps the article's id; a part carved out gets a new one", () => {
    const ann = M.initNews(bundle());
    const loose = M.dissolve(ann, "s20")!.ann;
    const joined = M.groupBlocks(loose, [1, 2, 3], [1, 2, 3])!;
    expect(joined.ann.sections.map(s => s.articleKey)).toEqual(["A17"]);
    expect(joined.ann.sections[0].blockIds).toEqual([2, 1, 3]);
    const fresh1 = M.groupBlocks(loose, [1, 2, 3], [1, 2, 3], true)!;
    expect(fresh1.ann.sections).toHaveLength(1);
    expect(fresh1.ann.sections[0].articleKey).toBeUndefined();
    const carved = M.groupBlocks(loose, [1], [1, 2, 3])!;
    const fresh = carved.ann.sections.find(s => s.id === carved.move.active)!;
    expect(fresh.articleKey).toBeUndefined();
    expect(carved.ann.sections.find(s => s.articleKey === "A17")!.blockIds).toEqual([2]);
  });
  it("bulk classification partitions partial sections without changing unselected blocks or merging articles", () => {
    const b = bundle(); const ann = M.initNews(b);
    ann.sections[0].titleBlockId = 1;
    const result = M.classifyBlocks(ann, [1, 3], "MASTHEAD", [1, 2, 3])!;
    expect(result.ann.blocks).toEqual(ann.blocks);
    expect(result.ann.sections.find(s => s.id === "s17")!.type).toBe("ARTICLE");
    expect(result.ann.sections.find(s => s.id === "s17")!.blockIds).toEqual([2]);
    expect(result.ann.sections.find(s => s.id === "s17")!.titleBlockId).toBeNull();
    const typed = result.ann.sections.filter(s => s.type === "MASTHEAD");
    expect(typed).toHaveLength(2);
    expect(typed.flatMap(s => s.blockIds).sort()).toEqual([1, 3]);
    expect(buildPage(result.ann, b).blocks.find(x => x.block_id === 1)!.role).toBe("masthead");
    expect(result.move.sel).toEqual([1, 3]);
    expect(ann.sections.every(s => s.type === "ARTICLE")).toBe(true);
  });
  it("resizes within the page without changing OCR, source evidence or article order", () => {
    const b = bundle(); const ann = M.initNews(b);
    ann.done = true;
    const result = M.resizeBlock(ann, 3, [-8, 80, 130, 300], [0, 100], 100, 200)!;
    const next = result.ann;
    expect(next.blocks[3].bbox).toEqual([0, 80, 100, 200]);
    expect(next.blocks[3].geometryEdit?.originalBBox).toEqual(ann.blocks[3].bbox);
    expect(next.blocks[3].text).toBe(ann.blocks[3].text);
    expect(next.blocks[3].inputEvidence).toEqual(ann.blocks[3].inputEvidence);
    expect(next.sections).toEqual(ann.sections);
    expect(next.done).toBe(false);
    expect(ann.blocks[3].geometryEdit).toBeUndefined();
    const twice = M.resizeBlock(next, 3, [10, 90, 90, 180], [0, 100], 100, 200)!.ann;
    expect(twice.blocks[3].geometryEdit?.originalBBox).toEqual(ann.blocks[3].bbox);
    const out = buildPage(twice, b).blocks.find(x => x.block_id === 3)!;
    expect(out.geometry_basis).toBe("human_adjusted");
    expect(out.original_bbox).toEqual({ x0: 0, y0: 120, x1: 80, y1: 150 });
    expect(M.resizeBlock(next, 3, [0, 0, NaN, 5], [0, 100], 100, 200)).toBeNull();
    expect(M.resizeBlock(next, 3, [0, 0, 0, 5], [0, 100], 100, 200)).toBeNull();
  });
  it("exports a newspaper logo as masthead even when detected as an image or title", () => {
    const ann = M.initNews(bundle());
    ann.blocks[2].label = "image";
    ann.sections[0].type = "MASTHEAD";
    ann.sections[0].titleBlockId = 2;
    expect(effectiveRole(ann, 2)).toBe("masthead");
    ann.sections[0].type = "RUNNING_HEAD";
    expect(effectiveRole(ann, 2)).toBe("running_head");
    ann.blocks[2].role = "dateline_bar";
    expect(effectiveRole(ann, 2)).toBe("dateline_bar");
  });
  it("opens colored proposals without claiming human actions or silently sorting them", () => {
    const b = bundle(); const ann = M.initNews(b);
    expect(ann.ops).toBe(0);
    expect(ann.sections[0].blockIds).toEqual([2, 1]);
    expect(ann.sections[0].articleKey).toBe("A17");
    expect(ann.sections[0].continuesTo).toBe(true);
    expect(ann.sections.every(s => !s.verified)).toBe(true);
    expect(buildPage(ann, b).provenance.reviewed_by_human).toBe(false);
  });
  it("approves all proposed articles in one action without changing their contents or marking the page done", () => {
    const ann = M.initNews(bundle());
    const approved = M.acceptAll(ann)!.ann;
    expect(approved.sections.every(s => s.verified)).toBe(true);
    expect(approved.sections.map(({ verified, ...rest }) => rest)).toEqual(ann.sections.map(({ verified, ...rest }) => rest));
    expect(approved.blocks).toEqual(ann.blocks);
    expect(approved.ops).toBe(ann.ops + 1);
    expect(approved.done).toBe(false);
    expect(ann.sections.every(s => !s.verified)).toBe(true);
    expect(M.acceptAll(approved)).toBeNull();
  });
  it("uses the same article color across pages and different colors within one content type", () => {
    expect(articleColor({ id: "s1", articleKey: "A17" })).toBe(articleColor({ id: "s9", articleKey: "A17" }));
    expect(articleColor({ id: "s1", articleKey: "A17" })).not.toBe(articleColor({ id: "s2", articleKey: "A20" }));
    const ann=M.initNews(bundle());
    expect(blockTag(ann.sections[0], 1)).toBe("A17.2 · B1");
    expect(blockTag(ann.sections[1], 3)).toBe("A20.? · B3");
  });
  it("changes membership without erasing an established order, then requires order confirmation", () => {
    const ann=M.initNews(bundle());
    const next=M.assignMembership(ann,[3],"s17")!.ann;
    expect(next.sections).toHaveLength(1);
    expect(next.sections[0].blockIds).toEqual([2,1,3]);
    expect(next.sections[0].orderUncertain).toBe(true);
    expect(ann.sections[0].blockIds).toEqual([2,1]);
    const confirmed=M.confirmOrder(next,"s17")!.ann;
    expect(confirmed.sections[0].orderUncertain).toBe(false);
  });
  it("exports source identities, unresolved geometry and issue-wide article identifiers", () => {
    const b=bundle();const ann=M.initNews(b);const output=buildPage(ann,b);
    expect(output.source_units).toHaveLength(3);
    expect(output.blocks.find(b=>b.block_id===3)?.geometry_basis).toBe("source_parent_context_only");
    expect(output.sections.find(s=>s.section_id==="s17")?.issue_article_key).toBe("A17");
    expect(output.sections.find(s=>s.section_id==="s20")?.reading_order_status).toBe("unresolved");
    expect(output.provenance.model_proposal_shown).toBe(true);
  });
});

describe("one article id across the issue", () => {
  it("an unkeyed group gets the next id no page of the issue uses", () => {
    const ann = M.initNews(bundle());
    const carved = M.groupBlocks(ann, [1], [1, 2, 3])!.ann;
    const keyed = M.keySections(carved, new Set(["A30", "A21"]), [1, 2, 3]);
    const fresh = keyed.sections.find(s => s.blockIds.includes(1))!;
    expect(fresh.articleKey).toBe("A31");
    expect(keyed.sections.map(s => s.articleKey).sort()).toEqual(["A17", "A20", "A31"]);
    // Already keyed: nothing to do, same object.
    expect(M.keySections(keyed, new Set(), [1, 2, 3])).toBe(keyed);
  });
  it("linking takes the facing page's id, or merges into the section that already has it", () => {
    const ann = M.initNews(bundle());
    const linked = M.linkArticle(ann, "s20", "A40", "previous", [1, 2, 3])!;
    const s20 = linked.ann.sections.find(s => s.id === "s20")!;
    expect(s20.articleKey).toBe("A40");
    expect(s20.continuesFrom).toBe(true);
    const merged = M.linkArticle(ann, "s20", "A17", "next", [1, 2, 3])!;
    expect(merged.ann.sections).toHaveLength(1);
    expect(merged.ann.sections[0].articleKey).toBe("A17");
    expect(merged.ann.sections[0].blockIds.sort()).toEqual([1, 2, 3]);
    expect(merged.ann.sections[0].continuesTo).toBe(true);
  });
});

describe("assigning a selection to the facing page's article", () => {
  it("joins this page's section with the key, links an exact section, or opens a keyed one", () => {
    const ann = M.initNews(bundle());
    const joined = M.assignToArticle(ann, [3], "A17", "previous", [1, 2, 3])!;
    expect(joined.ann.sections.find(s => s.articleKey === "A17")!.blockIds.sort()).toEqual([1, 2, 3]);
    const exact = M.assignToArticle(ann, [3], "A9", "previous", [1, 2, 3])!;
    const s20 = exact.ann.sections.find(s => s.id === "s20")!;
    expect(s20.articleKey).toBe("A9");
    expect(s20.continuesFrom).toBe(true);
    const part = M.assignToArticle(ann, [1], "A9", "next", [1, 2, 3])!;
    const fresh = part.ann.sections.find(s => s.articleKey === "A9")!;
    expect(fresh.blockIds).toEqual([1]);
    expect(fresh.continuesTo).toBe(true);
    expect(part.ann.sections.find(s => s.articleKey === "A17")!.blockIds).toEqual([2]);
  });
});

describe("section titles, rotation and block flags", () => {
  it("a section title is a toggled role above H1 and is exported", () => {
    const b = bundle(); const ann = M.initNews(b);
    const on = M.markStructuralRoles(ann, [1], "section_title")!.ann;
    expect(on.blocks[1].role).toBe("section_title");
    expect(on.sections.map(s => s.blockIds)).toEqual(ann.sections.map(s => s.blockIds));
    expect(buildPage(on, b).blocks.find(x => x.block_id === 1)!.role).toBe("section_title");
    expect(M.markStructuralRoles(on, [1], "section_title")!.ann.blocks[1].role).toBe("body");
  });
  it("a rotation flag toggles, survives a cut and is exported", () => {
    const b = bundle(); const ann = M.initNews(b);
    const r = M.setRotation(ann, [1, 2], 90)!.ann;
    expect([r.blocks[1].rotation, r.blocks[2].rotation]).toEqual([90, 90]);
    expect(buildPage(r, b).blocks.find(x => x.block_id === 1)!.text_rotation).toBe(90);
    expect(M.setRotation(r, [1, 2], 90)!.ann.blocks[1].rotation).toBeUndefined();
    expect(M.setRotation(r, [1], 180)!.ann.blocks[1].rotation).toBe(180);
    const box = r.blocks[1].bbox;
    const cut = M.cutBlock(r, 1, (box[1] + box[3]) / 2, "h", b.columnBounds, b.width)!.ann;
    const [top, bot] = cut.cuts[0].into;
    expect([cut.blocks[top].rotation, cut.blocks[bot].rotation]).toEqual([90, 90]);
  });
  it("a block flag toggles, carries a note and is exported", () => {
    const b = bundle(); const ann = M.initNews(b);
    const f = M.toggleBlockFlag(ann, [2])!.ann;
    expect(f.blocks[2].flag).toEqual({ note: null });
    const n = M.setBlockFlagNote(f, 2, " OCR is from another column ")!.ann;
    expect(buildPage(n, b).blocks.find(x => x.block_id === 2)!.review_flag).toEqual({ note: "OCR is from another column" });
    expect(M.toggleBlockFlag(n, [2])!.ann.blocks[2].flag).toBeUndefined();
    expect(buildPage(ann, b).blocks.every(x => x.review_flag === undefined && x.text_rotation === undefined)).toBe(true);
  });
});

describe("author", () => {
  it("toggles the byline role on the selected blocks and exports it", () => {
    const b = bundle(); const ann = M.initNews(b);
    const on = M.markStructuralRoles(ann, [1, 2], "byline")!.ann;
    expect([on.blocks[1].role, on.blocks[2].role]).toEqual(["byline", "byline"]);
    expect(buildPage(on, b).blocks.find(x => x.block_id === 2)!.role).toBe("byline");
    expect(on.sections.map(s => s.blockIds)).toEqual(ann.sections.map(s => s.blockIds));
    expect(M.markStructuralRoles(on, [1, 2], "byline")!.ann.blocks[1].role).toBe("body");
  });
});

describe("table of contents", () => {
  it("is a character of blocks inside an article, exported as toc_list", () => {
    const b = bundle(); const ann = M.initNews(b);
    const on = M.markStructuralRoles(ann, [1], "toc_list")!.ann;
    expect(on.sections.map(s => [s.type, s.blockIds])).toEqual(ann.sections.map(s => [s.type, s.blockIds]));
    const out = buildPage(on, b);
    expect(out.blocks.find(x => x.block_id === 1)!.role).toBe("toc_list");
    expect(out.blocks.find(x => x.block_id === 1)!.section_id).toBe("s17");
    expect(M.markStructuralRoles(on, [1], "toc_list")!.ann.blocks[1].role).toBe("body");
  });
});

describe("centred text", () => {
  it("toggles on the selected blocks, keeps the role, survives a cut and is exported", () => {
    const b = bundle(); const ann = M.initNews(b);
    const h1 = M.markHeadline(ann, 2, [1, 2, 3])!.ann;
    const c = M.toggleCentered(h1, [1, 2])!.ann;
    expect([c.blocks[1].align, c.blocks[2].align]).toEqual(["center", "center"]);
    expect(c.blocks[2].role).toBe("headline");
    const out = buildPage(c, b).blocks.find(x => x.block_id === 2)!;
    expect(out.text_align).toBe("center");
    expect(out.role).toBe("headline");
    const box = c.blocks[1].bbox;
    const cut = M.cutBlock(c, 1, (box[1] + box[3]) / 2, "h", b.columnBounds, b.width)!.ann;
    expect(cut.cuts[0].into.map(id => cut.blocks[id].align)).toEqual(["center", "center"]);
    expect(M.toggleCentered(c, [1, 2])!.ann.blocks[1].align).toBeUndefined();
  });
});
