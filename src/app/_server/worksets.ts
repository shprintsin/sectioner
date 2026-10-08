// The working sets: where a page's scan, layout, proposal and output live. Server-only.
//
// The app is pointed at a manifest, `worksets.json` in the data folder (`~/server/store`),
// and works through it; it assumes no absolute path of its own.
// Every file of a page is named by a template with `{id}` (and `{dir}` for per-page
// folders) resolved against the workset's `root`. A workset either lists its pages or
// discovers them by globbing one template. Schema in `docs/configuration.md`.

import { readdir, readFile, stat } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve, sep } from "node:path";

import { dataRoot, readIfPresent, worksetBase } from "~/server/store";

import type { Kind, NewsAnn, PageStatus, PageSummary, RoleSpec, WorksetSummary } from "../_lib/types";
import { BOOK_ROLES } from "../_lib/types";

export type FileKey = "image" | "layout" | "proposal" | "ocr" | "existing" | "text" | "corpus";

export interface WorksetPage {
  id: string;
  dir?: string;
  files?: Partial<Record<FileKey, string>>;
  /** Shared storage with the original workset; combined views never copy labels. */
  sessionWorkset?: string;
  output?: string;
}

export interface WorksetDef {
  id: string;
  kind: Kind;
  label?: string;
  root: string;
  pages?: WorksetPage[];
  /** Preserve bookmarked routes while removing an old entry from the picker. */
  hidden?: boolean;
  /** Which template to glob for page ids when `pages` is absent. */
  discover?: FileKey;
  files: Partial<Record<FileKey, string>>;
  /** Template for the contract output, `{id}` required. Defaults to
   *  `output/<workset>/{id}.json` in the data folder. */
  output?: string;
  /** `false` opens every page with the region labels hidden (the Labels toggle still
   *  shows them): on a line-segmentation set a label covers the line it names. */
  labels?: boolean;
  /** Book: the block types the page offers, in order, each `{role, title?, key?}` with
   *  `role` one of BOOK_ROLES. Only the menu, palette and hotkeys change. */
  roles?: RoleSpec[];
}

export interface Manifest {
  worksets: WorksetDef[];
}

export const SAFE_ID = /^[A-Za-z0-9_.-]{1,80}$/;

export function sectionerRoot(): string {
  return dataRoot();
}

export function manifestPath(): string {
  return join(sectionerRoot(), "worksets.json");
}

export async function readManifest(): Promise<Manifest | null> {
  const raw = await readIfPresent(manifestPath());
  if (raw === null) return null;
  const m = JSON.parse(raw) as Manifest;
  if (!Array.isArray(m.worksets)) throw new Error("worksets.json: `worksets` must be an array");
  for (const w of m.worksets) {
    if (!SAFE_ID.test(w.id)) throw new Error(`worksets.json: bad workset id ${JSON.stringify(w.id)}`);
    if (!["newspaper", "book", "text"].includes(w.kind)) throw new Error(`worksets.json: ${w.id}: unsupported kind`);
    if (typeof w.root !== "string") throw new Error(`worksets.json: ${w.id}: root is required`);
    if (!w.files || typeof w.files !== "object") throw new Error(`worksets.json: ${w.id}: files is required`);
    if (w.roles !== undefined) {
      if (!Array.isArray(w.roles)) throw new Error(`worksets.json: ${w.id}: roles must be an array`);
      for (const r of w.roles) {
        if (!r || !(BOOK_ROLES as readonly string[]).includes(r.role)) throw new Error(`worksets.json: ${w.id}: unknown role ${JSON.stringify(r?.role)}`);
        if (r.key !== undefined && !/^[A-Za-z0-9]$/.test(r.key)) throw new Error(`worksets.json: ${w.id}: key for ${r.role} must be one letter or digit`);
      }
    }
    for (const p of w.pages ?? []) {
      if (p.sessionWorkset !== undefined && !SAFE_ID.test(p.sessionWorkset)) throw new Error(`worksets.json: ${w.id}: bad session workset`);
    }
  }
  return m;
}

export async function findWorkset(id: string): Promise<WorksetDef | null> {
  const m = await readManifest();
  return m?.worksets.find((w) => w.id === id) ?? null;
}

/** `root` is relative to the working-set base (`SECTIONER_ROOT`, else the data folder)
 *  unless absolute; a page's own files may not escape it — a template is a local path,
 *  but "local" is not a security model. */
export function rootDir(w: WorksetDef): string {
  return isAbsolute(w.root) ? resolve(w.root) : resolve(worksetBase(), w.root);
}

function inside(parent: string, child: string): boolean {
  const p = resolve(parent);
  const c = resolve(child);
  return c === p || c.startsWith(p + sep);
}

export function fill(template: string, page: { id: string; dir?: string }): string {
  return template.replaceAll("{id}", page.id).replaceAll("{dir}", page.dir ?? page.id);
}

/** The absolute path of one of a page's files, or null when the workset has no
 *  template for it or the path would leave the root. */
export function pageFile(w: WorksetDef, page: { id: string; dir?: string }, key: FileKey): string | null {
  const t = w.pages?.find((p) => p.id === page.id)?.files?.[key] ?? w.files[key];
  if (!t) return null;
  const path = resolve(rootDir(w), fill(t, page));
  return inside(rootDir(w), path) ? path : null;
}

/** The contract output path: `output/<workset>/{id}.json` in the data folder by default;
 *  an explicit template is relative to the working-set base and may not leave it (or the
 *  working set's root, or the data folder). */
export function outputFile(w: WorksetDef, id: string): string {
  const page = w.pages?.find((p) => p.id === id);
  const t = page?.output ?? w.output;
  if (!t) return join(dataRoot(), "output", page?.sessionWorkset ?? w.id, `${id}.json`);
  const path = isAbsolute(t) ? resolve(fill(t, { id })) : resolve(worksetBase(), fill(t, { id }));
  if (!inside(worksetBase(), path) && !inside(rootDir(w), path) && !inside(dataRoot(), path)) throw new Error(`output path leaves the data: ${path}`);
  return path;
}

export function sessionDir(w: WorksetDef, id?: string): string {
  const owner = w.pages?.find((p) => p.id === id)?.sessionWorkset ?? w.id;
  return join(sectionerRoot(), "sessions", owner);
}

export function sessionFile(w: WorksetDef, id: string): string {
  return join(sessionDir(w, id), `${id}.json`);
}

export function indexFile(w: WorksetDef, id?: string): string {
  return join(sessionDir(w, id), "_index.json");
}

/**
 * The pages of a workset. Listed explicitly, or discovered by globbing the template of
 * `discover` (default: `layout` for newspapers, `text` for texts, `image` for books) with
 * `{id}` as the
 * only wildcard, one path segment.
 */
export async function listPages(w: WorksetDef): Promise<{ id: string; dir?: string }[]> {
  if (w.pages?.length) return w.pages.filter((p) => SAFE_ID.test(p.id));
  if (w.kind === "text" && w.files.corpus) return (await readCorpus(w)).map((d) => ({ id: d.id }));
  const key = w.discover ?? defaultDiscover(w.kind);
  const t = w.files[key];
  if (!t?.includes("{id}")) return [];
  const abs = resolve(rootDir(w), t);
  const dir = dirname(abs);
  const pattern = basename(abs);
  if (dir.includes("{id}") || pattern.split("{id}").length !== 2) return [];
  const [pre, post] = pattern.split("{id}");
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }
  return names
    .filter((n) => n.startsWith(pre) && n.endsWith(post) && n.length > pre.length + post.length)
    .map((n) => n.slice(pre.length, n.length - post.length))
    .filter((id) => SAFE_ID.test(id))
    .sort()
    .map((id) => ({ id }));
}

export function defaultDiscover(kind: Kind): FileKey {
  return kind === "newspaper" ? "layout" : kind === "text" ? "text" : "image";
}

/** One document of a text working set's corpus file. */
export interface CorpusDoc {
  id: string;
  text: string;
  title?: string;
  part?: string;
}

/**
 * A text working set's `corpus` file: JSONL, one `{"id", "text", "title"?, "part"?}` per
 * line. A line that does not parse, lacks an id or a text, or repeats an id is an error
 * naming its line — a corpus that silently lost documents would look complete.
 */
export async function readCorpus(w: WorksetDef): Promise<CorpusDoc[]> {
  const t = w.files.corpus;
  if (!t) return [];
  const path = resolve(rootDir(w), t);
  if (!inside(rootDir(w), path)) throw new Error(`${w.id}: the corpus file leaves the root`);
  const raw = await readIfPresent(path);
  if (raw === null) return [];
  const out: CorpusDoc[] = [];
  const seen = new Set<string>();
  raw.split(/\r?\n/).forEach((line, i) => {
    if (!line.trim()) return;
    let d: CorpusDoc;
    try {
      d = JSON.parse(line) as CorpusDoc;
    } catch {
      throw new Error(`${w.id}: corpus line ${i + 1} is not JSON`);
    }
    if (typeof d.id !== "string" || !SAFE_ID.test(d.id)) throw new Error(`${w.id}: corpus line ${i + 1}: id must be letters, digits, - _ . (up to 80)`);
    if (typeof d.text !== "string") throw new Error(`${w.id}: corpus line ${i + 1}: text must be a string`);
    if (seen.has(d.id)) throw new Error(`${w.id}: corpus line ${i + 1}: id ${d.id} appears twice`);
    seen.add(d.id);
    out.push({ id: d.id, text: d.text, title: typeof d.title === "string" ? d.title : undefined, part: typeof d.part === "string" ? d.part : undefined });
  });
  return out;
}

async function readIndexPath(path: string): Promise<Record<string, PageSummary>> {
  const raw = await readIfPresent(path);
  if (raw === null) return {};
  try {
    return JSON.parse(raw) as Record<string, PageSummary>;
  } catch {
    return {};
  }
}

export async function readIndex(w: WorksetDef, id?: string): Promise<Record<string, PageSummary>> {
  // A save updates only the owning issue's index, including through an old tab.
  if (id !== undefined) return readIndexPath(indexFile(w, id));
  if (!w.pages?.some((p) => p.sessionWorkset)) return readIndexPath(indexFile(w));
  const indexes = new Map<string, Record<string, PageSummary>>();
  for (const path of new Set(w.pages.map((p) => indexFile(w, p.id)))) {
    indexes.set(path, await readIndexPath(path));
  }
  const result: Record<string, PageSummary> = {};
  for (const p of w.pages) {
    const summary = indexes.get(indexFile(w, p.id))?.[p.id];
    if (summary) result[p.id] = summary;
  }
  return result;
}

export async function summarise(w: WorksetDef, writable: boolean): Promise<WorksetSummary> {
  const pages = await listPages(w);
  const index = await readIndex(w);
  const summaries = await Promise.all(pages.map(async p => {
    const summary = index[p.id] ?? blank(p.id);
    if (w.kind !== "newspaper" || summary.n_verified !== undefined || summary.n_units === 0) return summary;
    // Older indexes predate n_verified. Read the saved session once for an accurate
    // count; n_open also includes loose blocks and cannot be used as its inverse.
    try {
      const raw = await readIfPresent(sessionFile(w, p.id));
      const session = raw ? JSON.parse(raw) as NewsAnn : null;
      return session?.kind === "newspaper" && Array.isArray(session.sections)
        ? { ...summary, n_verified: session.sections.filter(section => section.verified).length }
        : summary;
    } catch { return summary; }
  }));
  return {
    id: w.id,
    kind: w.kind,
    label: w.label ?? w.id,
    writable,
    pages: summaries,
  };
}

export function blank(id: string): PageSummary {
  return { id, status: "new", n_units: 0, n_open: 0, flag: null, seconds: 0 };
}

export function statusOf(done: boolean, flag: string | null, nUnits: number): PageStatus {
  if (flag) return "flagged";
  if (done) return "done";
  return nUnits ? "wip" : "new";
}

export async function exists(path: string | null): Promise<boolean> {
  if (!path) return false;
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export async function readJson<T>(path: string | null): Promise<T | null> {
  if (!path) return null;
  const raw = await readIfPresent(path);
  return raw === null ? null : (JSON.parse(raw) as T);
}

/** Width and height from a PNG or JPEG header, without decoding the image. */
export async function imageSize(path: string): Promise<{ width: number; height: number } | null> {
  let buf: Buffer;
  try {
    buf = await readFile(path);
  } catch {
    return null;
  }
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) return null;
      const marker = buf[i + 1];
      const len = buf.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
      }
      i += 2 + len;
    }
  }
  return null;
}

export function contentType(path: string): string {
  const ext = path.toLowerCase().split(".").pop();
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "webp") return "image/webp";
  return "application/octet-stream";
}
