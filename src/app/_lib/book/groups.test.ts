// Groups (Ctrl+G) and the subtitle role, on small synthetic pages: a group survives the acts
// that rewrite its members — merge, split, delete — and reaches the exported record.

import { describe, expect, it } from "vitest";

import type { BookAnn, BookBundle } from "../types";
import { buildBookPage } from "./export";
import * as M from "./model";
import { roleMenu } from "./roles";

/** Four stacked regions r1..r4 (r1 on top), all main_text in the main stream. */
function page(): BookAnn {
  let ann = M.emptyBook();
  for (let i = 0; i < 4; i++) ann = M.addRegion(ann, [10, 10 + i * 100, 200, 90 + i * 100]).ann;
  return ann;
}
const ids = (ann: BookAnn) => M.walk(ann);
const bundle = { id: "t_p1", otzarId: "t", width: 1000, height: 1000, source: { image: "x.png", image_sha256: null, source_pdf_page_1based: null, source_pdf_sha256: null, work_ids: [], pdf: null } } as unknown as BookBundle;
const g = (ann: BookAnn, id: string) => ann.groups?.find((x) => x.id === id);

describe("grouping", () => {
  it("Ctrl+G makes one group of the selection, in reading order", () => {
    const ann = page();
    const r = M.groupRegions(ann, ["r3", "r1"], ids(ann))!;
    expect(r.ann.groups).toHaveLength(1);
    expect(r.ann.groups![0].id).toBe("g1");
    expect(r.ann.groups![0].region_ids).toEqual(["r1", "r3"]);
    expect(r.move.sel).toEqual(["r1", "r3"]);
  });

  it("needs two regions, and is a no-op on a selection that already is one group", () => {
    const ann = page();
    expect(M.groupRegions(ann, ["r1"], ids(ann))).toBeNull();
    const once = M.groupRegions(ann, ["r1", "r2"], ids(ann))!.ann;
    expect(M.groupRegions(once, ["r1", "r2"], ids(once))).toBeNull();
  });

  it("a group that a selected region belongs to is taken whole and keeps its id", () => {
    const ann = page();
    const g1 = M.groupRegions(ann, ["r1", "r2"], ids(ann))!.ann;
    const more = M.groupRegions(g1, ["r2", "r4"], ids(g1))!;
    expect(more.ann.groups).toHaveLength(1);
    expect(more.ann.groups![0].id).toBe("g1");
    expect(more.ann.groups![0].region_ids).toEqual(["r1", "r2", "r4"]);
  });

  it("two groups joined by one selection become one, the earlier id surviving; ids are never reused", () => {
    let ann = page();
    ann = M.groupRegions(ann, ["r1", "r2"], ids(ann))!.ann;
    ann = M.groupRegions(ann, ["r3", "r4"], ids(ann))!.ann;
    expect(ann.groups!.map((x) => x.id)).toEqual(["g1", "g2"]);
    const joined = M.groupRegions(ann, ["r2", "r3"], ids(ann))!.ann;
    expect(joined.groups!.map((x) => x.id)).toEqual(["g1"]);
    expect(joined.groups![0].region_ids).toEqual(["r1", "r2", "r3", "r4"]);
    const undone = M.ungroupRegions(joined, ["r1"])!.ann;
    const fresh = M.groupRegions(undone, ["r1", "r2"], ids(undone))!.ann;
    expect(fresh.groups![0].id).toBe("g3");
  });

  it("gives each group its own hue", () => {
    let ann = page();
    ann = M.groupRegions(ann, ["r1", "r2"], ids(ann))!.ann;
    ann = M.groupRegions(ann, ["r3", "r4"], ids(ann))!.ann;
    expect(g(ann, "g1")!.colorHue).not.toBe(g(ann, "g2")!.colorHue);
  });

  it("ungroup dissolves whole groups; leave-group removes only the named regions", () => {
    let ann = page();
    ann = M.groupRegions(ann, ["r1", "r2", "r3"], ids(ann))!.ann;
    expect(M.ungroupRegions(ann, ["r4"])).toBeNull();
    expect(M.ungroupRegions(ann, ["r2"])!.ann.groups).toEqual([]);
    const left = M.leaveGroup(ann, ["r2"])!.ann;
    expect(left.groups![0].region_ids).toEqual(["r1", "r3"]);
    expect(M.leaveGroup(left, ["r3"])!.ann.groups).toEqual([]);
  });
});

describe("groups through the acts that rewrite regions", () => {
  it("deleting a member keeps the group, deleting down to one dissolves it", () => {
    let ann = page();
    ann = M.groupRegions(ann, ["r1", "r2", "r3"], ids(ann))!.ann;
    const one = M.deleteRegions(ann, ["r2"])!.ann;
    expect(one.groups![0].region_ids).toEqual(["r1", "r3"]);
    expect(M.deleteRegions(one, ["r3"])!.ann.groups).toEqual([]);
  });

  it("merging two members leaves the merged region in the group, in their place", () => {
    let ann = page();
    ann = M.groupRegions(ann, ["r1", "r2", "r3"], ids(ann))!.ann;
    const merged = M.mergeRegions(ann, ["r1", "r2"])!.ann;
    const id = Object.keys(merged.regions).find((x) => !["r3", "r4"].includes(x))!;
    expect(merged.groups![0].region_ids).toEqual([id, "r3"]);
  });

  it("merging a member with an outsider pulls the outsider's region into the group", () => {
    let ann = page();
    ann = M.groupRegions(ann, ["r1", "r2"], ids(ann))!.ann;
    const merged = M.mergeRegions(ann, ["r2", "r3"])!.ann;
    const id = Object.keys(merged.regions).find((x) => !["r1", "r4"].includes(x))!;
    expect(merged.groups![0].region_ids).toEqual(["r1", id]);
  });

  it("splitting a member keeps both halves in the group", () => {
    let ann = page();
    ann = M.groupRegions(ann, ["r1", "r2"], ids(ann))!.ann;
    const cut = M.splitRegion(ann, "r2", 150, "h")!.ann;
    expect(cut.groups![0].region_ids).toHaveLength(3);
    expect(cut.groups![0].region_ids[0]).toBe("r1");
    expect(cut.groups![0].region_ids.every((i) => !!cut.regions[i])).toBe(true);
  });

  it("sanitize drops missing members and groups that fall below two; older sessions get an empty list", () => {
    let ann = page();
    ann = M.groupRegions(ann, ["r1", "r2", "r3"], ids(ann))!.ann;
    const stale = structuredClone(ann);
    delete stale.regions.r2;
    delete stale.regions.r3;
    expect(M.sanitize(stale).groups).toEqual([]);
    const old = structuredClone(page());
    delete old.groups;
    expect(M.sanitize(old).groups).toEqual([]);
  });

  it("dropping the proposal clears groups", () => {
    let ann = page();
    ann = M.groupRegions(ann, ["r1", "r2"], ids(ann))!.ann;
    expect(M.dropProposal(ann).ann.groups).toEqual([]);
  });
});

describe("export", () => {
  it("writes each group's members in reading order, without the display colour", () => {
    let ann = page();
    ann = M.groupRegions(ann, ["r3", "r1"], ids(ann))!.ann;
    const out = buildBookPage(ann, bundle);
    expect(out.groups).toEqual([{ id: "g1", region_ids: ["r1", "r3"] }]);
  });

  it("writes an empty list when nothing is grouped", () => {
    expect(buildBookPage(page(), bundle).groups).toEqual([]);
  });
});

describe("subtitle role", () => {
  it("is offered in the menu, on key 6, and reads in the main stream like a title", () => {
    const e = roleMenu(undefined).find((x) => x.role === "subtitle");
    expect(e).toMatchObject({ role: "subtitle", key: "6" });
    expect(M.DEFAULT_STREAM.subtitle).toBe("main");
    const ann = M.setRole(page(), ["r1"], "subtitle")!.ann;
    expect(ann.regions.r1.role).toBe("subtitle");
    expect(ann.regions.r1.stream_id).toBe("main");
    expect(buildBookPage(ann, bundle).class_presence.subtitle).toBe("present");
  });
});
