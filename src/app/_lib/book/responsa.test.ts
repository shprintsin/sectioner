import { describe, expect, it } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { bookBundle } from "../../_server/bundle";
import { buildBookPage, isComplete, validateBook } from "./export";
import * as M from "./model";
import type { BookBundle } from "../types";

const bundle: BookBundle = {
  kind: "book", id: "synthetic", otzarId: "test", width: 100, height: 100,
  imageUrl: "", source: { image: "test.png", image_sha256: null,
    source_pdf_page_1based: 1, source_pdf_sha256: null, work_ids: [], pdf: null },
  proposal: null, existing: null, session: null,
};

describe("block and responsum review", () => {
  it("reloads exported responsum fields and auxiliary roles through the server", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sectioner-roundtrip-"));
    try {
      let ann = M.addRegion(M.emptyBook(), [0, 0, 80, 80], "auxiliary_text").ann;
      ann = M.setField(ann, "r1", { responsum_id: "III-3", responsum_boundary: "end" })!.ann;
      await writeFile(join(dir, "synthetic.json"), JSON.stringify(buildBookPage(ann, bundle)), "utf8");
      const loaded = await bookBundle({ id: "roundtrip-test", kind: "book", root: dir,
        files: { existing: "{id}.json" } }, { id: "synthetic" });
      expect(loaded.existing?.regions.r1).toMatchObject({ role: "auxiliary_text",
        responsum_id: "III-3", responsum_boundary: "end", verified: false });
    } finally {
      await rm(dir, { recursive: true });
    }
  });
  it("keeps unfinished exports distinct from human-reviewed outputs", () => {
    expect(isComplete(validateBook(M.emptyBook()))).toBe(false);
    const ann = M.addRegion(M.emptyBook(), [0, 0, 80, 80]).ann;
    expect(buildBookPage(ann, bundle).provenance.reviewed_by_human).toBe(false);
    const done = M.markDone(ann, true).ann;
    expect(buildBookPage(done, bundle).provenance.reviewed_by_human).toBe(true);
    done.regions.r1.verified = false;
    expect(buildBookPage(done, bundle).annotation_status).toBe("draft");
  });
  it("exports responsum identity and resets boundary claims after split/merge", () => {
    let ann = M.addRegion(M.emptyBook(), [0, 0, 80, 80]).ann;
    ann = M.setField(ann, "r1", { responsum_id: "siman-3", responsum_boundary: "whole" })!.ann;
    expect(buildBookPage(ann, bundle).regions[0].responsum_boundary).toBe("whole");
    const split = M.splitRegion(ann, "r1", 40)!.ann;
    expect(Object.values(split.regions).every(r => r.responsum_id === "siman-3" && r.responsum_boundary === "unknown")).toBe(true);
    const ids = Object.keys(split.regions);
    const other = M.setField(split, ids[1], { responsum_id: "siman-4" })!.ann;
    const merged = Object.values(M.mergeRegions(other, ids)!.ann.regions)[0];
    expect(merged.responsum_id).toBeNull();
    expect(merged.responsum_boundary).toBe("unknown");
  });
  it("moves shared auxiliary text out of main reading order", () => {
    const ann = M.addRegion(M.emptyBook(), [0, 0, 80, 80]).ann;
    const changed = M.setRole(ann, ["r1"], "auxiliary_text")!.ann;
    expect(changed.order.auxiliary).toEqual(["r1"]);
    expect(changed.order.main).toBeUndefined();
    expect(isComplete(validateBook(changed))).toBe(true);
  });
  it("keeps a responsum signature in the main stream and round-trips its role", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sectioner-signature-"));
    try {
      let ann = M.addRegion(M.emptyBook(), [10, 60, 75, 80], "signature").ann;
      ann = M.setField(ann, "r1", { responsum_id: "siman-9", responsum_boundary: "end" })!.ann;
      expect(ann.order.main).toEqual(["r1"]);
      const exported = buildBookPage(ann, bundle);
      expect(exported.regions[0]).toMatchObject({ role: "signature", stream_id: "main", responsum_id: "siman-9" });
      await writeFile(join(dir, "synthetic.json"), JSON.stringify(exported), "utf8");
      const loaded = await bookBundle({ id: "signature-roundtrip", kind: "book", root: dir,
        files: { existing: "{id}.json" } }, { id: "synthetic" });
      expect(loaded.existing?.regions.r1).toMatchObject({ role: "signature", stream_id: "main", responsum_id: "siman-9" });
    } finally {
      await rm(dir, { recursive: true });
    }
  });
  it("keeps page footers outside the responsum stream and exports their role", () => {
    let ann = M.addRegion(M.emptyBook(), [5, 85, 95, 95], "page_footer").ann;
    expect(ann.order.paratext).toEqual(["r1"]);
    expect(ann.order.main).toBeUndefined();
    ann = M.setField(ann, "r1", { subtype: "catchword" })!.ann;
    expect(buildBookPage(ann, bundle).regions[0]).toMatchObject({
      role: "page_footer", stream_id: "paratext", subtype: "catchword",
    });
  });
  it("keeps a printed summary distinct from its title in the responsum stream", () => {
    let ann = M.addRegion(M.emptyBook(), [5, 5, 95, 15], "title").ann;
    ann = M.addRegion(ann, [5, 17, 95, 35], "summary").ann;
    ann = M.setField(ann, "r1", { responsum_id: "siman-9" })!.ann;
    ann = M.setField(ann, "r2", { responsum_id: "siman-9" })!.ann;
    expect(ann.order.main).toEqual(["r1", "r2"]);
    expect(buildBookPage(ann, bundle).regions.map((r) => r.role)).toEqual(["title", "summary"]);
  });
  it("exports a separate printed dateline in its responsum stream", () => {
    let ann = M.addRegion(M.emptyBook(), [5, 10, 95, 20], "date").ann;
    ann = M.setField(ann, "r1", { responsum_id: "siman-9", text_hint: "יום ד׳" })!.ann;
    expect(ann.order.main).toEqual(["r1"]);
    expect(buildBookPage(ann, bundle).regions[0]).toMatchObject({
      role: "date", stream_id: "main", responsum_id: "siman-9", text_hint: "יום ד׳",
    });
  });
  it("adds suggested boxes after manual edits without replacing or duplicating them", () => {
    let ann = M.addRegion(M.emptyBook(), [2, 2, 38, 38], "main_text").ann;
    ann = M.setField(ann, "r1", { responsum_id: "siman-1", text_hint: "human reading" })!.ann;
    const manual = structuredClone(ann.regions.r1);
    const suggestions = {
      regions: [
        { ...manual, id: "d1", bbox: [0, 0, 40, 40] as [number, number, number, number], source: "detector" as const, verified: false },
        { ...manual, id: "d2", bbox: [50, 50, 90, 90] as [number, number, number, number], source: "detector" as const, verified: false },
      ],
      containers: [], order: { main: ["d1", "d2"] }, relations: [],
    };
    const merged = M.addProposalCandidates(ann, suggestions).ann;
    expect(merged.regions.r1).toEqual(manual);
    expect(Object.keys(merged.regions)).toEqual(["r1", "d2"]);
    expect(merged.regions.d2.verified).toBe(false);
    expect(merged.order.main).toContain("d2");
    expect(ann.regions.d2).toBeUndefined();
  });
  it("loads all six pilot pages as unreviewed and preserves round-trip fields", async () => {
    const pages = ["147376_p0035", "698274_p0033", "646759_p0094", "646759_p0033", "152229_p0053", "147376_p0030"];
    for (const id of pages) {
      const b = await bookBundle({ id: "isolated-test", kind: "book", root: fileURLToPath(new URL("../../../../fixtures/book/", import.meta.url)),
        files: { proposal: "pilot/{id}.json" } }, { id });
      const ann = M.initBook(b);
      expect(Object.keys(ann.regions).length).toBeGreaterThan(0);
      expect(M.unverified(ann).length).toBe(Object.keys(ann.regions).length);
      expect(b.source.image_sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(buildBookPage(ann, b).annotation_status).toBe("draft");
      expect(validateBook(ann).find(c => c.key === "str")?.ok).toBe(true);
      expect(validateBook(ann).find(c => c.key === "rel")?.ok).toBe(true);
    }
  });
});
