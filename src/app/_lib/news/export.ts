// One annotation `Page` per page, based on docs/annotation-app-brief/schema/schema.py.
// Optional review fields retain source spans, uncertain geometry and issue-wide
// article identity. This annotation export is not itself an American Stories export.

import { union } from "../geometry";
import type { BBox, Block, CutOrigin, CutRecord, Lang, NewsAnn, NewsBundle, NewsRole, NewsType } from "../types";
import { assignMap, isContent, orderOf, titleText, unassigned } from "./model";

interface JBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface PageSection {
  section_id: string;
  type: NewsType;
  title: string | null;
  subtitle: string | null;
  body_text: string;
  block_ids: number[];
  bbox: JBox | null;
  block_bboxes: (JBox | null)[];
  column_span: number;
  continues_from_previous_page: boolean;
  continues_to_next_page: boolean;
  lang: Lang;
  confidence: number | null;
  issue_article_key?: string;
  reading_order_status?: "unresolved" | "specified";
  /** The project's custom tag, when the section has one; `type` stays canonical. */
  tag?: string;
}

export interface PageBlock {
  block_id: number;
  role: NewsRole;
  bbox: JBox | null;
  /** Source context is not a located rectangle for this text unit. */
  context_bbox?: JBox;
  line_bboxes: JBox[];
  text: string;
  lang: Lang;
  section_id: string | null;
  source: "layout" | "op" | "added";
  ocr_conf: number | null;
  input_block_ids?: number[];
  geometry_basis?: string;
  original_bbox?: JBox;
  /** Present on both halves of every split: which block this was cut out of, where the
   *  line fell, and which half of it this is. `cuts` at the page level is the same
   *  history read the other way round. */
  cut_from?: CutOrigin<number>;
  /** The printed text is turned this many degrees clockwise from upright (90: letter
   *  tops point right, 270: left, 180: upside down). Absent when upright. */
  text_rotation?: 90 | 180 | 270;
  /** Flagged by the reviewer as needing another look; `note` says why when given. */
  review_flag?: { note: string | null };
  /** "center" when the reviewer marked the printed lines as centred. */
  text_align?: "center";
}

export interface Page {
  page_id: string;
  source_image: string;
  width: number;
  height: number;
  reading_direction: "rtl" | "ltr";
  n_columns: number;
  column_bounds: number[];
  languages: Lang[];
  sections: PageSection[];
  blocks: PageBlock[];
  provenance: {
    route: "manual";
    layout_model: string;
    ocr_engine: string | null;
    llm_provider: null;
    llm_model: null;
    thinking_level: null;
    input_tokens: 0;
    output_tokens: 0;
    thought_tokens: 0;
    cost_usd: 0;
    cache_hit: false;
    seconds: number;
    ops_applied: number;
    created_utc: string;
    reviewed_by_human: boolean;
    model_proposal_shown?: boolean;
  };
  notes: string | null;
  /** Every split made on this page, oldest first — a `line` cut fell between two printed
   *  lines and is ink-exact, a `free` cut is where the reviewer drew the separator. */
  cuts: CutRecord<number>[];
  source_units?: { input_block_id: number; evidence: NonNullable<NewsBundle["blocks"][number]["inputEvidence"]> }[];
}

const jbox = (b: BBox): JBox => ({ x0: b[0], y0: b[1], x1: b[2], y1: b[3] });
const contextOnly = (b: Block): boolean => !b.geometryEdit && b.inputEvidence?.geometryStatus === "source_parent_context_only";

/** The role written for a block: the annotator's when set, else what its place in the
 *  page implies — the title block is a headline (ad headline in an advertisement), a
 *  skipped block a separator or noise, everything else body (ad body in an ad). */
export function effectiveRole(ann: NewsAnn, id: number): NewsRole {
  const b = ann.blocks[id];
  if (b.role) return b.role;
  if (b.label === "separator") return "separator";
  if (ann.skip[id]) return "noise";
  const sid = assignMap(ann)[id];
  const s = ann.sections.find((x) => x.id === sid);
  if (s?.type === "MASTHEAD") return "masthead";
  if (s?.type === "RUNNING_HEAD") return "running_head";
  if (s?.type === "PUBLICATION_INFO") return "publication_info";
  if (b.label === "image") return "illustration";
  if (!s) return "body";
  const isAd = s.type === "ADVERTISEMENT";
  if (s.titleBlockId === id) return isAd ? "ad_headline" : "headline";
  if (s.type === "IMPRINT") return "imprint";
  if (s.type === "TABLE_OF_CONTENTS") return "toc_list";
  if (s.type === "NOISE") return "noise";
  if (b.label === "text:drop-capital") return "drop_capital";
  if (b.label === "text:heading") return isAd ? "ad_headline" : "subhead";
  return isAd ? "ad_body" : "body";
}

export function columnSpan(ann: NewsAnn, ids: readonly number[], cols: readonly number[]): number {
  const set = new Set<number>();
  for (const i of ids) {
    const b = ann.blocks[i];
    if (!b) continue;
    for (let c = 0; c < cols.length - 1; c++) if (b.bbox[2] > cols[c] && b.bbox[0] < cols[c + 1]) set.add(c);
  }
  return set.size || 1;
}

export function buildPage(ann: NewsAnn, bundle: NewsBundle, now: Date = new Date()): Page {
  const lang: Lang = bundle.languages[0] ?? "unknown";
  const m = assignMap(ann);
  const order = orderOf(ann, bundle.columnBounds, bundle.width);
  const sections: PageSection[] = ann.sections
    .slice()
    .sort((p, q) => {
      const ip = order.indexOf(p.blockIds[0]);
      const iq = order.indexOf(q.blockIds[0]);
      return (ip < 0 ? 1e9 : ip) - (iq < 0 ? 1e9 : iq);
    })
    .map((s) => {
      const bs = s.blockIds.map((i) => ann.blocks[i]).filter(Boolean);
      return {
        section_id: s.id,
        type: s.type,
        title: titleText(ann, s),
        subtitle: null,
        body_text: bs.map((b) => b.text).filter(Boolean).join("\n\n"),
        block_ids: s.blockIds.slice(),
        bbox: bs.length && !bs.some(contextOnly) ? jbox(union(bs.map((b) => b.bbox))) : null,
        block_bboxes: bs.map((b) => contextOnly(b) ? null : jbox(b.bbox)),
        column_span: columnSpan(ann, s.blockIds, bundle.columnBounds),
        continues_from_previous_page: s.continuesFrom,
        continues_to_next_page: s.continuesTo,
        lang,
        confidence: null,
        issue_article_key: s.articleKey,
        reading_order_status: s.orderUncertain ? "unresolved" : "specified",
        // A project's custom tag rides beside the canonical type, never instead of it.
        ...(s.tag?.base === s.type ? { tag: s.tag.id } : {}),
      };
    });
  const blocks: PageBlock[] = Object.values(ann.blocks)
    .sort((a, b) => a.id - b.id)
    .map((b) => ({
      block_id: b.id,
      role: effectiveRole(ann, b.id),
      bbox: contextOnly(b) ? null : jbox(b.bbox),
      context_bbox: contextOnly(b) ? jbox(b.bbox) : undefined,
      line_bboxes: b.lines.map(jbox),
      text: b.text,
      lang,
      section_id: m[b.id] ?? null,
      source: b.source,
      ocr_conf: b.conf,
      input_block_ids: b.inputBlockIds ?? (b.source === "added" ? [] : [b.id]),
      geometry_basis: b.geometryEdit?.basis ?? b.inputEvidence?.geometryStatus ?? (b.source === "layout" ? "layout" : "human_operation"),
      original_bbox: b.geometryEdit ? jbox(b.geometryEdit.originalBBox) : undefined,
      cut_from: b.cutFrom ? { ...b.cutFrom } : undefined,
      text_rotation: b.rotation,
      review_flag: b.flag ? { ...b.flag } : undefined,
      text_align: b.align,
    }));
  return {
    page_id: bundle.id,
    source_image: `${bundle.id}.png`,
    width: bundle.width,
    height: bundle.height,
    reading_direction: "rtl",
    n_columns: bundle.nColumns,
    column_bounds: bundle.columnBounds.slice(),
    languages: bundle.languages.slice(),
    sections,
    blocks,
    provenance: {
      route: "manual",
      layout_model: bundle.layoutModel,
      ocr_engine: bundle.ocrEngine,
      llm_provider: null,
      llm_model: null,
      thinking_level: null,
      input_tokens: 0,
      output_tokens: 0,
      thought_tokens: 0,
      cost_usd: 0,
      cache_hit: false,
      seconds: Math.round(ann.seconds * 10) / 10,
      ops_applied: ann.ops,
      created_utc: now.toISOString(),
      reviewed_by_human: ann.done && isComplete(validate(ann, bundle)),
      model_proposal_shown: ann.mode === "proposal" || !!bundle.startWithProposal,
    },
    notes: ann.flag,
    cuts: (ann.cuts ?? []).map((c) => ({ ...c, from_bbox: [...c.from_bbox] as BBox, into: [...c.into] as [number, number], into_bboxes: [[...c.into_bboxes[0]] as BBox, [...c.into_bboxes[1]] as BBox] })),
    source_units: bundle.blocks.filter(b => b.inputEvidence).map(b => ({ input_block_id: b.id, evidence: b.inputEvidence! })),
  };
}

export interface Check {
  key: string;
  ok: boolean;
  /** A warning, not a blocker. */
  soft?: boolean;
  label: string;
}

/** What stands between this page and "done". The first check is the hard invariant. */
export function validate(ann: NewsAnn, bundle: NewsBundle): Check[] {
  const order = orderOf(ann, bundle.columnBounds, bundle.width);
  const un = unassigned(ann, order);
  const m = assignMap(ann);
  const dup = new Set<number>();
  const seen = new Set<number>();
  for (const s of ann.sections) for (const b of s.blockIds) (seen.has(b) ? dup : seen).add(b);
  const nAds = ann.sections.filter((s) => s.type === "ADVERTISEMENT").length;
  const noTitle = ann.sections.filter((s) => s.titleBlockId == null && s.type !== "RUNNING_HEAD" && s.type !== "NOISE").length;
  const unverified = ann.sections.filter((s) => !s.verified).length;
  const content = Object.values(ann.blocks).filter(isContent).length;
  const checks: Check[] = [
    {
      key: "cov",
      ok: un.length === 0,
      label: un.length === 0 ? "✓ every content block is in exactly one section" : `✗ ${un.length} content blocks unassigned — G to find them`,
    },
    {
      key: "dup",
      ok: dup.size === 0,
      label: dup.size === 0 ? "✓ no block in two sections" : `✗ ${dup.size} blocks in two sections`,
    },
    {
      key: "typ",
      ok: true,
      label: `✓ ${ann.sections.length} sections · ${nAds} advertisements · ${content} content blocks`,
    },
    {
      key: "ver",
      ok: unverified === 0,
      label: unverified === 0 ? "✓ every section confirmed" : `✗ ${unverified} proposed sections not yet accepted — A`,
    },
    {
      key: "tit",
      ok: noTitle === 0,
      soft: true,
      label: noTitle === 0 ? "✓ all sections have a title block" : `! ${noTitle} sections without a title block`,
    },
    { key: "ord", ok: !ann.sections.some(s => s.orderUncertain), label: ann.sections.some(s => s.orderUncertain) ? "✗ reading order still unresolved in some sections" : "✓ section orders specified" },
    { key: "sch", ok: true, label: "✓ Page · UTF-8 · human review recorded only after finalization" },
  ];
  void m;
  return checks;
}

export function isComplete(checks: Check[]): boolean {
  return checks.every((c) => c.ok || c.soft);
}
