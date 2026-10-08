// Assemble what the client needs for one page from the files on disk. Server-only.

import { isAbsolute, relative, resolve } from "node:path";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { worksetBase } from "~/server/store";

import { fromGrid, roundBox } from "../_lib/geometry";
import type {
  BBox,
  Block,
  BookAnn,
  BookBundle,
  BookContainer,
  BookRegion,
  BookRole,
  Lang,
  NewsAnn,
  NewsBundle,
  NewsType,
} from "../_lib/types";
import { BOOK_ROLES, LANGS, NEWS_TYPES } from "../_lib/types";
import { emptyBook, normStyle, sanitize as sanitizeBook } from "../_lib/book/model";
import { sanitize as sanitizeNews } from "../_lib/news/model";
import { exists, imageSize, listPages, pageFile, readJson, rootDir, sessionFile, type WorksetDef } from "./worksets";

/* ── newspaper input files ───────────────────────────────────────────────────────── */

interface EynollahRegion {
  label: string;
  level: "block" | "line";
  block: number;
  bbox: number[];
  score?: number | null;
  reading_order?: number | null;
  inputEvidence?: Block["inputEvidence"];
}
interface EynollahLayout {
  model?: string;
  page?: string;
  width: number;
  height: number;
  regions: EynollahRegion[];
}

/** A Page-schema file: the proposal, or the OCR carrier (any Page carries block text). */
interface PageFile {
  width?: number;
  height?: number;
  n_columns?: number;
  column_bounds?: number[];
  languages?: string[];
  sections?: NewsBundle["proposal"];
  startWithProposal?: boolean;
  pageContextNote?: string;
  blocks?: { block_id: number; role?: string; text?: string; ocr_conf?: number | null }[];
  provenance?: { layout_model?: string | null; ocr_engine?: string | null };
}

export async function pageOf(w: WorksetDef, id: string): Promise<{ id: string; dir?: string } | null> {
  const pages = await listPages(w);
  return pages.find((p) => p.id === id) ?? null;
}

export async function newsBundle(w: WorksetDef, page: { id: string; dir?: string }): Promise<NewsBundle> {
  const layout = await readJson<EynollahLayout>(pageFile(w, page, "layout"));
  if (!layout) throw new Error(`no layout file for ${page.id}`);
  const proposal = await readJson<PageFile>(pageFile(w, page, "proposal"));
  const ocr = await readJson<PageFile>(pageFile(w, page, "ocr"));
  const textOf = new Map<number, { text: string; role: string | undefined; conf: number | null }>();
  for (const src of [proposal, ocr]) {
    for (const b of src?.blocks ?? []) {
      textOf.set(b.block_id, { text: b.text ?? "", role: b.role, conf: b.ocr_conf ?? null });
    }
  }
  const blocks = new Map<number, Block>();
  for (const r of layout.regions) {
    if (r.level !== "block") continue;
    const t = textOf.get(r.block);
    blocks.set(r.block, {
      id: r.block,
      label: r.label || "text",
      bbox: roundBox(r.bbox),
      lines: [],
      text: t?.text ?? "",
      conf: t?.conf ?? null,
      // The OCR file's role is a machine guess too; it is a starting point the export
      // overrides from the section structure unless the annotator retypes the block.
      role: null,
      source: "layout",
      inputBlockIds: [r.block],
      inputEvidence: r.inputEvidence,
    });
  }
  for (const r of layout.regions) {
    if (r.level === "line") blocks.get(r.block)?.lines.push(roundBox(r.bbox));
  }
  for (const b of blocks.values()) b.lines.sort((a, c) => a[1] - c[1]);
  const langs = (proposal?.languages ?? ocr?.languages ?? ["yid"]).filter((l): l is Lang => (LANGS as readonly string[]).includes(l));
  const cols = proposal?.column_bounds?.length ? proposal.column_bounds : ocr?.column_bounds?.length ? ocr.column_bounds : [0, layout.width];
  const session = await readJson<NewsAnn>(sessionFile(w, page.id));
  return {
    kind: "newspaper",
    id: page.id,
    width: layout.width,
    height: layout.height,
    imageUrl: `/api/image?ws=${encodeURIComponent(w.id)}&id=${encodeURIComponent(page.id)}`,
    columnBounds: cols,
    nColumns: proposal?.n_columns ?? ocr?.n_columns ?? Math.max(1, cols.length - 1),
    languages: langs.length ? langs : ["yid"],
    blocks: [...blocks.values()].sort((a, b) => a.id - b.id),
    proposal: (proposal?.sections ?? [])
      .filter((s) => (NEWS_TYPES as readonly string[]).includes(s.type))
      .map((s) => ({ ...s, type: s.type })),
    startWithProposal: proposal?.startWithProposal,
    pageContextNote: proposal?.pageContextNote,
    layoutModel: layout.model ?? proposal?.provenance?.layout_model ?? "eynollah",
    ocrEngine: ocr?.provenance?.ocr_engine ?? proposal?.provenance?.ocr_engine ?? null,
    session: session?.kind === "newspaper" ? sanitizeNews(session) : null,
  };
}

/* ── book input files ────────────────────────────────────────────────────────────── */

interface CanonicalRegion {
  id: string;
  role: string;
  bbox: number[];
  bbox_pixels?: number[];
  container_id?: string | null;
  stream_id?: string | null;
  text_hint?: string;
  confidence?: string | number;
  basis?: string;
  subtype?: string;
  ambiguity_reason?: string;
  source?: string;
  detector_role?: string;
  detector_confidence?: number;
  review_flags?: string[];
  responsum_id?: string | null;
  responsum_boundary?: BookRegion["responsum_boundary"];
  text_rotation?: number;
  style_tags?: string[];
}
interface CanonicalContainer {
  id: string;
  kind: "zone" | "column";
  bbox: number[];
  bbox_pixels?: number[];
  parent_id: string | null;
}
interface CanonicalPage {
  page_id?: string;
  otzar_id?: string;
  image?: string;
  render_image?: string;
  image_sha256?: string;
  width: number;
  height: number;
  source_pdf_page_1based?: number | null;
  source_pdf_sha256?: string | null;
  work_ids?: string[];
  date_evidence?: BookAnn["date_evidence"];
  layout_notes?: string[] | string;
  containers?: CanonicalContainer[];
  regions?: CanonicalRegion[];
  relations?: BookAnn["relations"];
  reading_order?: Record<string, string[]>;
  uncertainties?: string[];
  layout_tags?: string[];
  class_presence?: BookAnn["class_presence"];
  pdf?: unknown;
  provenance?: { image_sha256?: string };
  pages?: CanonicalPage[];
}

const asRole = (r: string | undefined): BookRole => ((BOOK_ROLES as readonly string[]).includes(r ?? "") ? (r as BookRole) : "unknown");

function pixelBox(r: { bbox: number[]; bbox_pixels?: number[] }, w: number, h: number): BBox {
  return roundBox(r.bbox_pixels?.length === 4 ? r.bbox_pixels : fromGrid(r.bbox, w, h));
}

function confOf(c: string | number | undefined): BookRegion["confidence"] {
  if (c === "high" || c === "medium" || c === "low") return c;
  if (typeof c === "number") return c >= 0.8 ? "high" : c >= 0.5 ? "medium" : "low";
  return "high";
}

function regionFrom(r: CanonicalRegion, w: number, h: number, source: BookRegion["source"]): BookRegion {
  return {
    id: r.id,
    role: asRole(r.role),
    bbox: pixelBox(r, w, h),
    container_id: r.container_id ?? null,
    stream_id: r.stream_id ?? null,
    text_hint: r.text_hint ?? "",
    confidence: confOf(r.confidence),
    basis: r.basis ?? "",
    ambiguity_reason: r.ambiguity_reason ?? "",
    subtype: r.subtype ?? null,
    responsum_id: r.responsum_id ?? null,
    responsum_boundary: r.responsum_boundary ?? "unknown",
    source: (r.source === "human" || r.source === "op" || r.source === "detector" || r.source === "existing") ? r.source : source,
    detector_role: r.detector_role ? asRole(r.detector_role) : source === "detector" ? asRole(r.role) : null,
    detector_confidence: r.detector_confidence ?? (source === "detector" && typeof r.confidence === "number" ? r.confidence : null),
    verified: false,
    ...(r.text_rotation === 90 || r.text_rotation === 180 || r.text_rotation === 270 ? { rotation: r.text_rotation } : {}),
    ...(normStyle(r.style_tags) ? { style_tags: normStyle(r.style_tags) } : {}),
  };
}

function containersFrom(cs: CanonicalContainer[] | undefined, w: number, h: number): BookContainer[] {
  return (cs ?? []).map((c) => ({ id: c.id, kind: c.kind === "column" ? "column" : "zone", bbox: pixelBox(c, w, h), parent_id: c.parent_id ?? null }));
}

/** A detector `predictions.json` holds many pages; a per-page file holds one. */
function pickPage(doc: CanonicalPage | null, id: string): CanonicalPage | null {
  if (!doc) return null;
  if (Array.isArray(doc.pages)) return doc.pages.find((p) => p.page_id === id) ?? null;
  return doc;
}

function fromCanonical(doc: CanonicalPage, w: number, h: number): BookAnn {
  const ann = emptyBook();
  for (const r of doc.regions ?? []) ann.regions[r.id] = regionFrom(r, w, h, "existing");
  ann.containers = containersFrom(doc.containers, w, h);
  ann.order = { ...(doc.reading_order ?? {}) };
  ann.relations = (doc.relations ?? []).map((x) => ({ type: x.type, from: x.from, to: x.to, basis: x.basis ?? "" }));
  if (doc.date_evidence) ann.date_evidence = { ...ann.date_evidence, ...doc.date_evidence };
  ann.layout_notes = Array.isArray(doc.layout_notes) ? doc.layout_notes : doc.layout_notes ? [doc.layout_notes] : [];
  ann.uncertainties = doc.uncertainties ?? [];
  ann.layout_tags = doc.layout_tags ?? [];
  if (doc.class_presence) ann.class_presence = { ...ann.class_presence, ...doc.class_presence };
  ann.mode = "existing";
  return sanitizeBook(ann);
}

/** Where a book page's image is: the template, else what the canonical record or the
 *  detector says (relative to the working set's root, then to the working-set base, or absolute). */
export async function bookImagePath(w: WorksetDef, page: { id: string; dir?: string }): Promise<string | null> {
  const t = pageFile(w, page, "image");
  if (await exists(t)) return t;
  for (const key of ["existing", "proposal"] as const) {
    const doc = pickPage(await readJson<CanonicalPage>(pageFile(w, page, key)), page.id);
    for (const cand of [doc?.image, doc?.render_image]) {
      if (!cand) continue;
      for (const p of isAbsolute(cand) ? [cand] : [resolve(rootDir(w), cand), resolve(worksetBase(), cand)]) {
        if (await exists(p)) return p;
      }
    }
  }
  return null;
}

export async function bookBundle(w: WorksetDef, page: { id: string; dir?: string }): Promise<BookBundle> {
  const existingDoc = pickPage(await readJson<CanonicalPage>(pageFile(w, page, "existing")), page.id);
  const proposalDoc = pickPage(await readJson<CanonicalPage>(pageFile(w, page, "proposal")), page.id);
  const imagePath = await bookImagePath(w, page);
  const dims = existingDoc ?? proposalDoc ?? (imagePath ? await imageSize(imagePath) : null);
  if (!dims) throw new Error(`no image, annotation or proposal for ${page.id}`);
  const { width, height } = dims;
  const src = existingDoc ?? proposalDoc;
  const session = await readJson<BookAnn>(sessionFile(w, page.id));
  const sessionRevision = session ? createHash("sha256").update(await readFile(sessionFile(w, page.id))).digest("hex") : null;
  return {
    kind: "book",
    id: page.id,
    otzarId: src?.otzar_id ?? page.id.split("_")[0],
    width,
    height,
    imageUrl: `/api/image?ws=${encodeURIComponent(w.id)}&id=${encodeURIComponent(page.id)}`,
    ...(w.labels === false ? { labels: false } : {}),
    ...(w.roles?.length ? { roles: w.roles } : {}),
    source: {
      image: existingDoc?.image ?? (imagePath ? relative(rootDir(w), imagePath).split("\\").join("/") : ""),
      image_sha256: existingDoc?.image_sha256 ?? proposalDoc?.image_sha256 ?? existingDoc?.provenance?.image_sha256 ?? null,
      source_pdf_page_1based: src?.source_pdf_page_1based ?? null,
      source_pdf_sha256: src?.source_pdf_sha256 ?? null,
      work_ids: src?.work_ids ?? [],
      pdf: proposalDoc?.pdf ?? existingDoc?.pdf ?? null,
    },
    proposal: proposalDoc
      ? {
          regions: (proposalDoc.regions ?? []).map((r) => regionFrom(r, width, height, "detector")),
          containers: containersFrom(proposalDoc.containers, width, height),
          order: proposalDoc.reading_order ?? {},
          relations: (proposalDoc.relations ?? []).map((x) => ({ type: x.type, from: x.from, to: x.to, basis: x.basis ?? "" })),
        }
      : null,
    existing: existingDoc ? fromCanonical(existingDoc, width, height) : null,
    session: session?.kind === "book" ? sanitizeBook(session) : null,
    sessionRevision,
  };
}
