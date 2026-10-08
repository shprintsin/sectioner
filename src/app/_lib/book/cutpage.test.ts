// A cut on an empty page cuts the page itself: the halves span it, in one act.

import { describe, expect, it } from "vitest";

import * as M from "./model";

const empty = () => M.initBook({
  kind: "book", id: "synthetic", otzarId: "test", width: 1000, height: 1600,
  imageUrl: "", source: { image: "test.png", image_sha256: null, source_pdf_page_1based: 1, source_pdf_sha256: null, work_ids: [], pdf: null },
  proposal: null, existing: null, session: null,
});

describe("cutEmptyPage", () => {
  it("a cut across gives two full-width regions that tile the page", () => {
    const ann0 = empty();
    const res = M.cutEmptyPage(ann0, 1000, 1600, 400, "h")!;
    const boxes = Object.values(res.ann.regions).map((r) => r.bbox).sort((a, b) => a[1] - b[1]);
    expect(boxes).toEqual([[0, 0, 1000, 400], [0, 400, 1000, 1600]]);
    expect(res.ann.ops).toBe(ann0.ops + 1);
    expect(res.ann.cuts).toHaveLength(1);
  });

  it("a cut down gives two full-height regions, the right one first in reading order", () => {
    const res = M.cutEmptyPage(empty(), 1000, 1600, 600, "v")!;
    const [first, second] = res.ann.order.main.map((id) => res.ann.regions[id].bbox);
    expect(first).toEqual([600, 0, 1000, 1600]);
    expect(second).toEqual([0, 0, 600, 1600]);
  });

  it("does nothing on a page that already has regions", () => {
    const one = M.addRegion(empty(), [10, 10, 200, 200]).ann;
    expect(M.cutEmptyPage(one, 1000, 1600, 100, "h")).toBeNull();
  });
});
