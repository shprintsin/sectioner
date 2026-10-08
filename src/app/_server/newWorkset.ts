// Adding a working set from the app: preview what a definition finds, then append it to
// `worksets.json`. Server-only.
//
// The manifest is the one file every page hangs from, so the writer is narrow: it only
// appends a new entry, never edits or removes one; it re-reads the file just before writing
// and copies it to `_archive/worksets.<date>.<sha>.json` first; and it writes back with the
// file's own formatting (two-space JSON, its line endings), so the diff is the new entry.

import { createHash } from "node:crypto";
import { stat } from "node:fs/promises";
import { join, resolve } from "node:path";

import { readIfPresent, writeUtf8 } from "~/server/store";

import type { Kind } from "../_lib/types";
import { SAFE_ID, defaultDiscover, exists, imageSize, listPages, manifestPath, pageFile, readCorpus, rootDir, sectionerRoot, type FileKey, type Manifest, type WorksetDef } from "./worksets";

/** What the form sends: one template per file, `{id}` standing for the page id. */
export interface NewWorksetInput {
  id: string;
  label: string;
  kind: Kind;
  root: string;
  files: Partial<Record<FileKey, string>>;
  /** Which template to glob for the page ids; defaults as the reader does. */
  discover?: FileKey;
  labels?: boolean;
}

export interface WorksetPreview {
  ok: boolean;
  errors: string[];
  root: string;
  nPages: number;
  sample: string[];
  /** For the first page: whether each named file is there, and the scan's size. */
  firstPage: { id: string; files: Partial<Record<FileKey, boolean>>; width: number | null; height: number | null } | null;
}

const KEYS: FileKey[] = ["image", "layout", "proposal", "ocr", "existing", "text", "corpus"];

/** The definition the manifest will hold, or the reasons it cannot. */
export function toDef(input: NewWorksetInput, manifest: Manifest | null): { def: WorksetDef | null; errors: string[] } {
  const errors: string[] = [];
  if (!SAFE_ID.test(input.id ?? "")) errors.push("id: letters, digits, - _ . only (up to 80)");
  if (manifest?.worksets.some((w) => w.id === input.id)) errors.push(`a working set ${input.id} already exists`);
  if (!input.label?.trim()) errors.push("the working set needs a name");
  if (!["newspaper", "book", "text"].includes(input.kind)) errors.push("kind must be book, newspaper or text");
  if (!input.root?.trim()) errors.push("root is required (\".\" is the data folder)");
  const files: Partial<Record<FileKey, string>> = {};
  for (const k of KEYS) {
    const t = input.files?.[k]?.trim();
    if (!t) continue;
    if (t.includes("..")) errors.push(`${k}: a template may not climb out of the root`);
    files[k] = t.replaceAll("\\", "/");
  }
  if (input.kind === "text") {
    if (!files.text && !files.corpus) errors.push("a text set needs a text file pattern ({id}.txt) or a corpus JSONL");
    if (files.text && files.corpus) errors.push("give a text pattern or a corpus file, not both");
  } else if (!files.image) errors.push("the image template is required");
  if (input.kind === "newspaper" && !files.layout) errors.push("a newspaper set needs the layout template (eynollah JSON)");
  const discover = input.discover ?? defaultDiscover(input.kind);
  const t = input.kind === "text" && files.corpus ? undefined : files[discover];
  if (t && (!t.includes("{id}") || t.split("{id}").length !== 2 || t.slice(0, t.indexOf("{id}")).includes("{id}"))) errors.push(`${discover}: the template must contain {id} exactly once`);
  if (t?.includes("{id}") && t.slice(0, t.indexOf("{id}")).split("/").length !== t.split("/").length) errors.push(`${discover}: {id} must be in the file name, not a folder`);
  if (errors.length) return { def: null, errors };
  const def: WorksetDef = { id: input.id, kind: input.kind, label: input.label.trim(), root: input.root.trim().replaceAll("\\", "/"), files };
  if (input.discover) def.discover = input.discover;
  if (input.labels === false) def.labels = false;
  return { def, errors };
}

async function readManifestRaw(): Promise<{ raw: string | null; manifest: Manifest | null }> {
  const raw = await readIfPresent(manifestPath());
  return { raw, manifest: raw === null ? null : (JSON.parse(raw) as Manifest) };
}

export async function previewWorkset(input: NewWorksetInput): Promise<WorksetPreview> {
  const { manifest } = await readManifestRaw();
  const { def, errors } = toDef(input, manifest);
  const empty: WorksetPreview = { ok: false, errors, root: "", nPages: 0, sample: [], firstPage: null };
  if (!def) return empty;
  const root = rootDir(def);
  try {
    if (!(await stat(root)).isDirectory()) return { ...empty, root, errors: [`root is not a folder: ${root}`] };
  } catch {
    return { ...empty, root, errors: [`root does not exist: ${root}`] };
  }
  let pages: { id: string; dir?: string }[];
  try {
    pages = await listPages(def);
  } catch (e) {
    return { ...empty, root, errors: [(e as Error).message] };
  }
  if (!pages.length) return { ...empty, root, errors: [def.kind === "text" && def.files.corpus ? "the corpus file is missing or empty" : "no pages found: no file in that folder matches the template"] };
  if (def.kind === "text") {
    const docs = def.files.corpus ? await readCorpus(def) : null;
    const proposalOk = def.files.proposal ? await exists(resolve(root, def.files.proposal)) : null;
    const errs = proposalOk === false ? [`proposals file ${def.files.proposal} not found`] : [];
    return { ok: true, errors: errs, root, nPages: pages.length, sample: pages.slice(0, 8).map((x) => x.id), firstPage: { id: pages[0].id, files: docs ? { corpus: true } : { text: true }, width: null, height: null } };
  }
  const first = pages[0];
  const files: Partial<Record<FileKey, boolean>> = {};
  for (const k of KEYS) if (def.files[k]) files[k] = await exists(pageFile(def, first, k));
  const img = files.image ? pageFile(def, first, "image") : null;
  const size = img ? await imageSize(img) : null;
  const missing = Object.entries(files).filter(([, ok]) => !ok).map(([k]) => k);
  return {
    ok: !missing.includes("image") && !(def.kind === "newspaper" && missing.includes("layout")),
    errors: missing.length ? [`first page ${first.id} has no ${missing.join(", ")} file`] : [],
    root,
    nPages: pages.length,
    sample: pages.slice(0, 8).map((x) => x.id),
    firstPage: { id: first.id, files, width: size?.width ?? null, height: size?.height ?? null },
  };
}

/** Append the working set to the manifest. Refuses anything the preview would not accept. */
export async function addWorkset(input: NewWorksetInput): Promise<WorksetDef> {
  const preview = await previewWorkset(input);
  if (!preview.ok) throw new Error(preview.errors[0] ?? "the working set finds no pages");
  const { raw, manifest } = await readManifestRaw();
  const { def, errors } = toDef(input, manifest);
  if (!def) throw new Error(errors[0]);
  const next: Manifest = { ...(manifest ?? {}), worksets: [...(manifest?.worksets ?? []), def] };
  if (raw !== null) {
    const sha = createHash("sha256").update(raw).digest("hex").slice(0, 12);
    const day = new Date().toISOString().slice(0, 10);
    await writeUtf8(join(sectionerRoot(), "_archive", `worksets.${day}.${sha}.json`), raw);
  }
  // The file's own shape: two-space indent, its own line endings (CRLF today; the repo
  // never rewrites them, `* -text`) and its own final newline or none. Checked: the
  // current file re-serialises byte for byte this way.
  const eol = raw?.includes("\r\n") ? "\r\n" : "\n";
  const trailing = raw?.endsWith("\n") ? eol : "";
  await writeUtf8(manifestPath(), JSON.stringify(next, null, 2).replaceAll("\n", eol) + trailing);
  return def;
}

/**
 * Point an existing working set at a file of one kind (`proposal` is the case that
 * matters: a model's suggestions added after the set was made). The only edit the
 * manifest ever takes besides an append: one key of one entry's `files`, never its id or
 * root. The file is archived first and rewritten in its own formatting.
 */
export async function setWorksetFile(id: string, key: FileKey, template: string): Promise<WorksetDef> {
  const { raw, manifest } = await readManifestRaw();
  if (raw === null || !manifest) throw new Error("there is no worksets.json yet");
  const w = manifest.worksets.find((x) => x.id === id);
  if (!w) throw new Error(`no working set ${id}`);
  const t = template.replaceAll("\\", "/");
  if (t.includes("..")) throw new Error("the path may not climb out of the working set's root");
  w.files = { ...w.files, [key]: t };
  const sha = createHash("sha256").update(raw).digest("hex").slice(0, 12);
  const day = new Date().toISOString().slice(0, 10);
  await writeUtf8(join(sectionerRoot(), "_archive", `worksets.${day}.${sha}.json`), raw);
  const eol = raw.includes("\r\n") ? "\r\n" : "\n";
  const trailing = raw.endsWith("\n") ? eol : "";
  await writeUtf8(manifestPath(), JSON.stringify(manifest, null, 2).replaceAll("\n", eol) + trailing);
  return w;
}
