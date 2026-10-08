import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { previewWorkset, toDef } from "./newWorkset";

// a 2×3 PNG header is all imageSize reads
const PNG = Buffer.from("89504e470d0a1a0a0000000d4948445200000002000000030806000000", "hex");

describe("a new working set's definition", () => {
  const base = { id: "hzf-typo-v1", label: "Front pages", kind: "book" as const, root: ".", files: { image: "pages/{id}.png" } };
  it("accepts a folder and a pattern", () => {
    expect(toDef(base, null)).toEqual({ def: { id: "hzf-typo-v1", kind: "book", label: "Front pages", root: ".", files: { image: "pages/{id}.png" } }, errors: [] });
  });
  it("refuses a taken id, a missing scan, a climbing path and an {id} in a folder", () => {
    expect(toDef(base, { worksets: [{ id: "hzf-typo-v1", kind: "book", root: ".", files: {} }] }).errors).toContain("a working set hzf-typo-v1 already exists");
    expect(toDef({ ...base, files: {} }, null).errors).toContain("the image template is required");
    expect(toDef({ ...base, files: { image: "../x/{id}.png" } }, null).errors[0]).toMatch(/climb/);
    expect(toDef({ ...base, files: { image: "{id}/scan.png" } }, null).errors[0]).toMatch(/file name/);
    expect(toDef({ ...base, kind: "newspaper" }, null).errors[0]).toMatch(/layout template/);
  });
});

describe("previewing what it finds", () => {
  it("counts the pages and checks the first one's files", async () => {
    const root = mkdtempSync(join(tmpdir(), "sectioner-ws-"));
    mkdirSync(join(root, "pages"));
    for (const id of ["a1", "a2", "a3"]) writeFileSync(join(root, "pages", `${id}.png`), PNG);
    writeFileSync(join(root, "pages", "notes.txt"), "not a page");
    const p = await previewWorkset({ id: "t-preview-unique", label: "T", kind: "book", root, files: { image: "pages/{id}.png", proposal: "props/{id}.json" } });
    expect(p.nPages).toBe(3);
    expect(p.sample).toEqual(["a1", "a2", "a3"]);
    expect(p.firstPage).toMatchObject({ id: "a1", files: { image: true, proposal: false }, width: 2, height: 3 });
    // a missing optional file is reported, not fatal
    expect(p.ok).toBe(true);
    expect(p.errors[0]).toMatch(/no proposal file/);
  });
  it("finds nothing in an empty folder and says so", async () => {
    const root = mkdtempSync(join(tmpdir(), "sectioner-ws-"));
    const p = await previewWorkset({ id: "t-empty-unique", label: "T", kind: "book", root, files: { image: "{id}.png" } });
    expect(p.ok).toBe(false);
    expect(p.errors[0]).toMatch(/no pages found/);
  });
});
