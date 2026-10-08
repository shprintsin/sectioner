import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { fill, imageSize, listPages, pageFile, statusOf, type WorksetDef } from "./worksets";

const EXAMPLES = fileURLToPath(new URL("../../../fixtures/newspaper-brief/", import.meta.url));

describe("templates", () => {
  it("fills {id} and {dir}, dir defaulting to id", () => {
    expect(fill("scans/{id}.png", { id: "A_1" })).toBe("scans/A_1.png");
    expect(fill("{dir}/scan.png", { id: "A_1", dir: "easy" })).toBe("easy/scan.png");
    expect(fill("{dir}/scan.png", { id: "A_1" })).toBe("A_1/scan.png");
  });
  it("a path that leaves the root is refused", () => {
    const w: WorksetDef = { id: "t", kind: "newspaper", root: EXAMPLES, files: { image: "{dir}/scan.png" } };
    expect(pageFile(w, { id: "x", dir: "easy_MAD" }, "image")).toMatch(/easy_MAD[\\/]scan\.png$/);
    expect(pageFile(w, { id: "x", dir: "../../secret" }, "image")).toBeNull();
    expect(pageFile(w, { id: "x" }, "layout")).toBeNull();
  });
});

describe("discovery", () => {
  it("lists explicit pages, filtering unsafe ids", async () => {
    const w: WorksetDef = { id: "t", kind: "newspaper", root: EXAMPLES, pages: [{ id: "ok-1" }, { id: "../bad" }], files: {} };
    expect(await listPages(w)).toEqual([{ id: "ok-1" }]);
  });
  it("globs the discover template with {id} as the one wildcard", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sectioner-"));
    writeFileSync(join(dir, "A_1.json"), "{}");
    writeFileSync(join(dir, "B_2.json"), "{}");
    writeFileSync(join(dir, "notes.txt"), "");
    const w: WorksetDef = { id: "t", kind: "book", root: dir, discover: "existing", files: { existing: "{id}.json" } };
    expect(await listPages(w)).toEqual([{ id: "A_1" }, { id: "B_2" }]);
    const w2: WorksetDef = { ...w, files: { existing: "{id}/page.json" } };
    expect(await listPages(w2)).toEqual([]);
  });
});

describe("imageSize", () => {
  it("reads a PNG header", async () => {
    expect(await imageSize(`${EXAMPLES}easy_MAD/scan.png`)).toEqual({ width: 2173, height: 3507 });
  });
  it("null for a missing file", async () => {
    expect(await imageSize(`${EXAMPLES}nope.png`)).toBeNull();
  });
});

describe("status", () => {
  it("flag beats done beats wip beats new", () => {
    expect(statusOf(true, "x", 3)).toBe("flagged");
    expect(statusOf(true, null, 3)).toBe("done");
    expect(statusOf(false, null, 3)).toBe("wip");
    expect(statusOf(false, null, 0)).toBe("new");
  });
});
