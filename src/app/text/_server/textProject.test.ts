import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { loadTextProject, saveTextProject } from "./textProject";

// A whole text project on disk: a data folder made for the test, SECTIONER_DATA pointed
// at it, and the real loaders and writers run over it.
let dir: string;
const prev = process.env.SECTIONER_DATA;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "sectioner-text-"));
  process.env.SECTIONER_DATA = dir;
  await mkdir(join(dir, "corpus", "a"), { recursive: true });
  await writeFile(join(dir, "corpus", "a", "d1.txt"), "﻿Vilna, 3 March\r\n\r\nDear Sir,\r\nthanks.\r\n");
  await writeFile(join(dir, "corpus", "a", "d2.txt"), "From Warsaw.");
  await writeFile(join(dir, "corpus", "a", "proposals.jsonl"), JSON.stringify({ doc: "d1", tag: "place", quote: "Vilna" }) + "\n");
  await writeFile(join(dir, "corpus", "b.jsonl"), [{ id: "j1", text: "שלום מוילנא", title: "Hebrew" }, { id: "d2", text: "duplicate id" }].map((x) => JSON.stringify(x)).join("\n"));
  await writeFile(join(dir, "worksets.json"), JSON.stringify({ worksets: [
    { id: "a", kind: "text", root: "corpus/a", files: { text: "{id}.txt", proposal: "proposals.jsonl" } },
    { id: "b", kind: "text", root: "corpus", files: { corpus: "b.jsonl" } },
  ] }));
  await writeFile(join(dir, "projects.json"), JSON.stringify({ version: 1, projects: [
    { id: "letters", label: "Letters", kind: "text", worksets: ["a", "b"], tags: [{ id: "place", label: "Place", base: "placeName", key: "L" }], keymap: {} },
  ] }));
});

afterEach(async () => {
  process.env.SECTIONER_DATA = prev;
  await rm(dir, { recursive: true, force: true });
});

describe("a text project on disk", () => {
  it("loads both kinds of working set, the proposals, and reports a duplicate id", async () => {
    const d = (await loadTextProject("letters"))!;
    expect(d.project.volumes.map((v) => [v.id, v.sections.map((s) => s.doc_id)])).toEqual([["a", ["d1", "d2"]], ["b", ["j1"]]]);
    expect(d.project.volumes[0].sections[0].text).toBe("Vilna, 3 March\n\nDear Sir,\nthanks.");
    expect(d.project.volumes[1].sections[0].title).toBe("Hebrew");
    expect(d.anns.map((a) => [a.doc, a.tag, a.quote, a.status])).toEqual([["d1", "place", "Vilna", "proposed"]]);
    expect(d.errors).toEqual(["b: document d2 is already in a; skipped (document ids must be unique in a project)"]);
    expect(d.direction).toBe("ltr");
    expect(await loadTextProject("nope")).toBeNull();
  });

  it("saves per working set, keeps lines for vanished documents, and does not touch projects.json for an unchanged tag set", async () => {
    const d = (await loadTextProject("letters"))!;
    const accepted = d.anns.map((a) => ({ ...a, status: "accepted" as const, layer: "gold" }));
    const mine = { ...accepted[0], id: "n9", doc: "j1", start: 0, end: 4, quote: "שלום" };
    // a line for a document no longer in the corpus survives a save
    await mkdir(join(dir, "output", "a"), { recursive: true });
    await writeFile(join(dir, "output", "a", "annotations.jsonl"), JSON.stringify({ ann_id: "old1", doc_id: "gone", tag: "place", start: 0, end: 1, quote: "x", attrs: {}, layer: "gold", origin: "gold", provenance: "human", status: "accepted", confidence: null, uncertain: false, parent: null }) + "\n");
    const r = await saveTextProject("letters", { anns: [...accepted, mine], done: { d1: true }, tags: d.tags });
    expect(r.worksets.sort()).toEqual(["a", "b"]);
    const a = (await readFile(join(dir, "output", "a", "annotations.jsonl"), "utf8")).trim().split("\n").map((l) => JSON.parse(l) as { ann_id: string; status: string });
    expect(a.map((x) => [x.ann_id, x.status])).toEqual([["p1", "accepted"], ["old1", "accepted"]]);
    const b = (await readFile(join(dir, "output", "b", "annotations.jsonl"), "utf8")).trim().split("\n");
    expect(b).toHaveLength(1);
    const index = JSON.parse(await readFile(join(dir, "sessions", "a", "_index.json"), "utf8")) as Record<string, { status: string; n_units: number }>;
    expect(index.d1).toMatchObject({ status: "done", n_units: 1 });
    expect(index.d2).toMatchObject({ status: "new", n_units: 0 });
    expect(await readdir(dir)).not.toContain("_archive"); // projects.json was not rewritten

    const again = (await loadTextProject("letters"))!;
    expect(again.done).toEqual({ d1: true });
    // the accepted proposal is not offered a second time
    expect(again.anns.filter((x) => x.doc === "d1").map((x) => x.status)).toEqual(["accepted"]);
  });

  it("writes an edited tag set back to projects.json, archiving the old one", async () => {
    const d = (await loadTextProject("letters"))!;
    await saveTextProject("letters", { anns: d.anns, tags: d.tags.map((t) => ({ ...t, en: "Town" })) });
    const p = JSON.parse(await readFile(join(dir, "projects.json"), "utf8")) as { projects: { tags: { label: string }[] }[] };
    expect(p.projects[0].tags[0].label).toBe("Town");
    expect((await readdir(join(dir, "_archive"))).some((f) => f.startsWith("projects."))).toBe(true);
  });
});
