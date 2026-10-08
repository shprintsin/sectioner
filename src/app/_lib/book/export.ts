// The book output: the canonical page record (schema 0.1, `docs/formats.md`), first
// built for a layout pipeline over scanned books:
// boxes on the 0–1000 grid, containers, regions with role / container / stream / basis,
// relations, a reading order per stream, date evidence, notes and uncertainties.
//
// Beside every grid box the pixel box is written too (`bbox_pixels`, the detector's own
// convention), and the record carries what `docs/otzar-layout-classification.md` asks for
// on top: the source hash, the detector's original role and confidence per region, the
// ambiguity reason of every `unknown`, book-level layout tags and class presence, and a
// provenance block with the real review time.

import { toGrid } from "../geometry";
import type { BBox, BookAnn, BookBundle, BookRole, CutOrigin, CutRecord, Presence, ResponsumBoundary, StyleTag } from "../types";
import { BOOK_ROLES } from "../types";
import { isStreamless, normStyle, orderPos, streams, walk } from "./model";

export interface BookPage {
  schema_version: "0.1";
  annotation_profile: "blocks_responsa_v1";
  page_id: string;
  otzar_id: string;
  image: string;
  width: number;
  height: number;
  source_pdf_page_1based: number | null;
  source_pdf_sha256: string | null;
  work_ids: string[];
  annotation_status: string;
  reviewer: string;
  date_evidence: BookAnn["date_evidence"];
  layout_notes: string[];
  containers: {
    id: string;
    kind: "zone" | "column";
    bbox: number[];
    parent_id: string | null;
    bbox_pixels: number[];
  }[];
  regions: {
    id: string;
    role: BookRole;
    bbox: number[];
    container_id: string | null;
    stream_id: string | null;
    text_hint: string;
    confidence: string;
    basis: string;
    subtype?: string;
    responsum_id?: string | null;
    responsum_boundary?: ResponsumBoundary;
    ambiguity_reason?: string;
    bbox_pixels: number[];
    source: string;
    detector_role?: BookRole;
    detector_confidence?: number;
    /** Present on both halves of every split: which region this was cut out of. */
    cut_from?: CutOrigin<string>;
    /** Degrees clockwise the printed text is turned from upright, as on a newspaper block. */
    text_rotation?: 90 | 180 | 270;
    /** The project's custom tag, when the region has one; `role` stays canonical. */
    tag?: string;
    /** Whole-box typographic marks, in `STYLE_TAGS` order; absent when the region has none. */
    style_tags?: StyleTag[];
  }[];
  relations: BookAnn["relations"];
  /** Regions the reviewer grouped into one unit, each group's members in reading order. */
  groups: { id: string; region_ids: string[] }[];
  /** Every split made on this page, oldest first, in page pixels. */
  cuts: CutRecord<string>[];
  reading_order: Record<string, string[]>;
  uncertainties: string[];
  bbox_coordinate_system: "xyxy_0_1000";
  layout_tags: string[];
  class_presence: Record<BookRole, Presence>;
  provenance: {
    route: "manual";
    tool: "sectioner";
    image_sha256: string | null;
    pdf: unknown;
    ops_applied: number;
    seconds: number;
    created_utc: string;
    reviewed_by_human: boolean;
    started_from: BookAnn["mode"];
  };
  notes: string | null;
}

/** Class presence as written: a role with a region on the page is `present` whatever
 *  the reviewer set; the other two states are the reviewer's answer. */
export function effectivePresence(ann: BookAnn): Record<BookRole, Presence> {
  const out = { ...ann.class_presence };
  const seen = new Set(Object.values(ann.regions).map((r) => r.role));
  for (const r of BOOK_ROLES) if (seen.has(r)) out[r] = "present";
  return out;
}

export function buildBookPage(ann: BookAnn, bundle: BookBundle, now: Date = new Date()): BookPage {
  const { width: w, height: h } = bundle;
  const reviewed = ann.done && isComplete(validateBook(ann));
  const order = walk(ann);
  const regions = order.map((id) => {
    const r = ann.regions[id];
    const rec: BookPage["regions"][number] = {
      id: r.id,
      role: r.role,
      bbox: toGrid(r.bbox, w, h),
      container_id: r.container_id,
      stream_id: r.stream_id,
      text_hint: r.text_hint,
      confidence: r.confidence,
      basis: r.basis,
      bbox_pixels: r.bbox.slice(),
      source: r.source,
    };
    rec.responsum_id = r.responsum_id ?? null;
    rec.responsum_boundary = r.responsum_boundary ?? "unknown";
    if (r.subtype) rec.subtype = r.subtype;
    if (r.role === "unknown") rec.ambiguity_reason = r.ambiguity_reason;
    if (r.detector_role) rec.detector_role = r.detector_role;
    if (r.detector_confidence != null) rec.detector_confidence = r.detector_confidence;
    if (r.cut_from) rec.cut_from = { ...r.cut_from };
    if (r.rotation) rec.text_rotation = r.rotation;
    // A project's custom tag rides beside the canonical role, never instead of it.
    if (r.tag?.base === r.role) rec.tag = r.tag.id;
    const styles = normStyle(r.style_tags);
    if (styles) rec.style_tags = styles;
    return rec;
  });
  const reading_order: Record<string, string[]> = {};
  for (const s of streams(ann)) if (ann.order[s]?.length) reading_order[s] = ann.order[s].slice();
  return {
    schema_version: "0.1",
    annotation_profile: "blocks_responsa_v1",
    page_id: bundle.id,
    otzar_id: bundle.otzarId,
    image: bundle.source.image,
    width: w,
    height: h,
    source_pdf_page_1based: bundle.source.source_pdf_page_1based,
    source_pdf_sha256: bundle.source.source_pdf_sha256,
    work_ids: bundle.source.work_ids.slice(),
    annotation_status: reviewed ? "human_reviewed" : "draft",
    reviewer: "sectioner",
    date_evidence: { ...ann.date_evidence },
    layout_notes: ann.layout_notes.slice(),
    containers: ann.containers.map((c) => ({ id: c.id, kind: c.kind, bbox: toGrid(c.bbox, w, h), parent_id: c.parent_id, bbox_pixels: c.bbox.slice() })),
    regions,
    relations: ann.relations.map((x) => ({ ...x })),
    groups: (ann.groups ?? []).map((g) => ({ id: g.id, region_ids: g.region_ids.slice() })),
    cuts: (ann.cuts ?? []).map((c) => ({ ...c, from_bbox: [...c.from_bbox] as BBox, into: [...c.into] as [string, string], into_bboxes: [[...c.into_bboxes[0]] as BBox, [...c.into_bboxes[1]] as BBox] })),
    reading_order,
    uncertainties: ann.uncertainties.slice(),
    bbox_coordinate_system: "xyxy_0_1000",
    layout_tags: ann.layout_tags.slice(),
    class_presence: effectivePresence(ann),
    provenance: {
      route: "manual",
      tool: "sectioner",
      image_sha256: bundle.source.image_sha256,
      pdf: bundle.source.pdf ?? null,
      ops_applied: ann.ops,
      seconds: Math.round(ann.seconds * 10) / 10,
      created_utc: now.toISOString(),
      reviewed_by_human: reviewed,
      started_from: ann.mode,
    },
    notes: ann.flag,
  };
}

export interface Check {
  key: string;
  ok: boolean;
  soft?: boolean;
  label: string;
}

export function validateBook(ann: BookAnn): Check[] {
  const regions = Object.values(ann.regions);
  const unverified = regions.filter((r) => !r.verified).length;
  const textual = regions.filter((r) => !isStreamless(r.role));
  const noStream = textual.filter((r) => !r.stream_id).length;
  const noOrder = textual.filter((r) => r.stream_id && !orderPos(ann, r.id)).length;
  const wrongStream = textual.filter((r) => {
    const p = orderPos(ann, r.id);
    return p && p.stream !== r.stream_id;
  }).length;
  const twice = regions.filter((r) => Object.values(ann.order).reduce((n, ids) => n + ids.filter((x) => x === r.id).length, 0) > 1).length;
  const unknownNoReason = regions.filter((r) => r.role === "unknown" && !r.ambiguity_reason.trim()).length;
  const badRel = ann.relations.filter((x) => !ann.regions[x.from] || !ann.regions[x.to]).length;
  const orphanCols = ann.containers.filter((c) => c.kind === "column" && !ann.containers.some((z) => z.id === c.parent_id && z.kind === "zone")).length;
  const noBasis = regions.filter((r) => !r.basis.trim()).length;
  const roles = new Set(regions.map((r) => r.role));
  return [
    { key: "nonempty", ok: regions.length > 0, label: regions.length ? "✓ page contains regions" : "✗ add the visible regions before finalizing" },
    { key: "ver", ok: unverified === 0, label: unverified === 0 ? "✓ every region reviewed" : `✗ ${unverified} regions not yet reviewed — G finds them, A accepts` },
    {
      key: "str",
      ok: noStream + noOrder + wrongStream + twice === 0,
      label:
        noStream + noOrder + wrongStream + twice === 0
          ? "✓ every textual region is in exactly one stream order"
          : `✗ ${noStream} without a stream · ${noOrder} not in their stream's order · ${wrongStream} ordered under another stream · ${twice} listed twice`,
    },
    { key: "unk", ok: unknownNoReason === 0, label: unknownNoReason === 0 ? "✓ every unknown region states why" : `✗ ${unknownNoReason} unknown regions without an ambiguity reason — U` },
    { key: "rel", ok: badRel === 0 && orphanCols === 0, label: badRel === 0 && orphanCols === 0 ? `✓ ${ann.relations.length} relations · ${ann.containers.length} containers` : `✗ ${badRel} relations name a missing region · ${orphanCols} columns without a zone` },
    { key: "bas", ok: noBasis === 0, soft: true, label: noBasis === 0 ? "✓ every region has a basis" : `! ${noBasis} regions without a basis` },
    { key: "roles", ok: true, label: `✓ ${regions.length} regions · roles: ${[...roles].join(", ") || "none"}` },
    { key: "sch", ok: true, label: "✓ schema 0.1 · xyxy_0_1000 · route: manual · human review recorded only after finalization" },
  ];
}

export function isComplete(checks: Check[]): boolean {
  return checks.every((c) => c.ok || c.soft);
}
