// The shapes shared by both annotation modes and by the server that feeds them.
//
// Two corpora, one shell. A newspaper page arrives as pixel-exact blocks the annotator
// groups into sections (`docs/newspaper/`); a book page arrives as detector proposals (or
// nothing) the annotator repairs, roles and orders (`docs/formats.md`). What
// they share is the frame: a scan, rectangles on it, a cursor walking them in reading
// order, a working set of pages, and a session that autosaves after every act.

import type { ResolvedProject } from "./project";

/** `[x0, y0, x1, y1]` in page-image pixels, origin top-left, x rightwards. Reading
 *  direction never touches the coordinate system: `x0` is always the smaller x. */
export type BBox = [number, number, number, number];

/** The engines: `book` (regions on any scanned page), `newspaper` (eynollah blocks grouped
 *  into articles), `text` (spans in plain text, exported as TEI). */
export type Kind = "newspaper" | "book" | "text";

/**
 * One split, recorded as it happened. The ledger lives in the annotation, so undo takes
 * an entry back with the act that wrote it, and the exported record carries the whole
 * history of a page: which unit was cut, where the line fell, and what came out of it.
 *
 * `kind` is the honest part. `line` means the cut fell between two known printed lines,
 * so both halves are still the ink's own rectangles; `free` means the reviewer drew the
 * line with the cut tool, so the halves tile the parent but no edge is ink-exact.
 */
export interface CutRecord<Id extends string | number = string | number> {
  /** 1-based, in the order the cuts were made on this page. */
  seq: number;
  kind: "line" | "free";
  /** `h` cuts into top and bottom, `v` into right and left. */
  axis: "h" | "v";
  /** Page pixels: where the line fell. */
  at: number;
  from: Id;
  from_bbox: BBox;
  /** The two units it became, the one that reads first named first. */
  into: [Id, Id];
  into_bboxes: [BBox, BBox];
  /** `line` cuts only: the printed line the cut sat above. */
  line_index?: number;
}

/** A unit's backlink to the cut that made it — the other half of {@link CutRecord}. */
export interface CutOrigin<Id extends string | number = string | number> {
  parent: Id;
  seq: number;
  kind: "line" | "free";
  axis: "h" | "v";
  at: number;
  /** Which part of the parent this is, geometrically. */
  side: "top" | "bottom" | "left" | "right";
  sibling: Id;
}

/** A project's custom tag on a unit, and the base value it was given for. It counts only
 *  while the unit still has that base — a later change of role or type silently drops it,
 *  so a stale tag never reaches the record. Built-in tags are never stored. */
export interface TagRef<B extends string = string> {
  id: string;
  base: B;
}

/* ── the working set, as the server describes it ─────────────────────────────────── */

export type PageStatus = "new" | "wip" | "done" | "flagged";

export interface PageSummary {
  id: string;
  status: PageStatus;
  /** Sections (newspaper) or regions (book). */
  n_units: number;
  /** Content blocks not yet placed (newspaper) or regions not yet verified (book). */
  n_open: number;
  /** Newspaper sections explicitly approved or formed by the annotator. */
  n_verified?: number;
  flag: string | null;
  seconds: number;
}

export interface WorksetSummary {
  id: string;
  kind: Kind;
  label: string;
  writable: boolean;
  pages: PageSummary[];
  /** The project the set belongs to: its schema and key map (`_lib/project.ts`). */
  project?: ResolvedProject;
}

/* ── newspaper ────────────────────────────────────────────────────────────────────── */

export const NEWS_TYPES = [
  "ARTICLE",
  "ADVERTISEMENT",
  "MASTHEAD",
  "RUNNING_HEAD",
  "SECTION",
  "TABLE_OF_CONTENTS",
  "IMPRINT",
  "ILLUSTRATION",
  "NOISE",
  "PUBLICATION_INFO",
] as const;
export type NewsType = (typeof NEWS_TYPES)[number];

export const NEWS_ROLES = [
  "masthead",
  "running_head",
  "dateline_bar",
  "section_title",
  "headline",
  "subhead",
  "kicker",
  "byline",
  "run_in_dateline",
  "body",
  "footnote",
  "caption",
  "illustration",
  "ad_frame",
  "ad_headline",
  "ad_body",
  "table",
  "toc_list",
  "drop_capital",
  "separator",
  "imprint",
  "publication_info",
  "noise",
] as const;
export type NewsRole = (typeof NEWS_ROLES)[number];

export const LANGS = ["yid", "heb", "rus", "pol", "deu", "eng", "lat", "mixed", "unknown"] as const;
export type Lang = (typeof LANGS)[number];

/** One layout block as the app holds it. `source` is the honest record of where the
 *  rectangle came from: `layout` straight from eynollah, `op` from a split or merge,
 *  `added` drawn by hand. */
export interface Block {
  id: number;
  /** eynollah's guess: `text`, `text:heading`, `text:drop-capital`, `image`, `separator`. */
  label: string;
  bbox: BBox;
  /** Printed lines, top to bottom — what makes a split exact. */
  lines: BBox[];
  text: string;
  conf: number | null;
  role: NewsRole | null;
  source: "layout" | "op" | "added";
  inputBlockIds?: number[];
  /** Original rectangle retained when a reviewer adjusts geometry; OCR is unchanged. */
  geometryEdit?: { originalBBox: BBox; basis: "human_adjusted" };
  /** Set on both halves of a split: which block this was cut out of, and how. */
  cutFrom?: CutOrigin<number>;
  /** The printed text is turned this many degrees clockwise from upright: 90 when the
   *  tops of the letters point right, 270 when they point left, 180 upside down. A flag
   *  for straightening later; the box and the OCR are left as they are. */
  rotation?: Rotation;
  /** A reviewer's flag on this block — something to come back to — with an optional note. */
  flag?: { note: string | null };
  /** The printed lines are centred (a feature of the typesetting, independent of the
   *  role: a centred headline, a centred signature). Absent means not marked. */
  align?: "center";
  inputEvidence?: { unitId: string; parentBlockId: string; textSpan: [number, number]; geometryStatus: string };
}

export const ROTATIONS = [90, 270, 180] as const;
export type Rotation = (typeof ROTATIONS)[number];

export interface NewsSection {
  id: string;
  /** Persisted display color for manually formed groups. */
  colorHue?: number;
  type: NewsType;
  /** In reading order: headline first. */
  blockIds: number[];
  titleBlockId: number | null;
  /** A typed title, for the section whose printed headline no block's OCR carries (a
   *  masthead cut as an illustration, display type OCR got wrong). Wins over the block. */
  titleText: string | null;
  /** False for a machine-proposed section the annotator has not yet confirmed. */
  verified: boolean;
  continuesFrom: boolean;
  continuesTo: boolean;
  articleKey?: string;
  orderUncertain?: boolean;
  /** The project's custom tag for this section (`_lib/project.ts`); exported as `tag`. */
  tag?: TagRef<NewsType>;
}

/** The persisted working state of one newspaper page. Blocks live here too, so that undo
 *  covers repairs — a split that cannot be un-split is a split nobody makes. */
export interface NewsAnn {
  kind: "newspaper";
  blocks: Record<number, Block>;
  sections: NewsSection[];
  /** Block ids the annotator declared not content: rules, ornaments, noise. */
  skip: Record<number, true>;
  /** Every split made on this page, oldest first. */
  cuts: CutRecord<number>[];
  mode: "empty" | "proposal";
  done: boolean;
  flag: string | null;
  ops: number;
  seconds: number;
  /** The highest section number ever issued on this page, so a new group never reuses the
   *  id of one that was dissolved or merged away. Absent in older sessions. */
  sectionSeq?: number;
}

/** What the server hands the client for a newspaper page. */
export interface NewsBundle {
  kind: "newspaper";
  id: string;
  width: number;
  height: number;
  imageUrl: string;
  columnBounds: number[];
  nColumns: number;
  languages: Lang[];
  blocks: Block[];
  proposal: { type: NewsType; block_ids: number[]; title: string | null; id?: string; articleKey?: string; preserveOrder?: boolean; orderUncertain?: boolean; titleBlockId?: number | null; continuesFrom?: boolean; continuesTo?: boolean }[];
  startWithProposal?: boolean;
  pageContextNote?: string;
  layoutModel: string;
  ocrEngine: string | null;
  session: NewsAnn | null;
}

/* ── book ─────────────────────────────────────────────────────────────────────────── */

export const BOOK_ROLES = [
  "main_text",
  "title",
  "subtitle",
  "commentary",
  "footnote",
  "running_header",
  "page_number",
  "separator",
  "unknown",
  "auxiliary_text",
  "signature",
  "page_footer",
  "summary",
  "date",
  "table",
  "noise",
  "figure",
] as const;
export const RESPONSUM_BOUNDARIES = ["unknown", "start", "continuation", "end", "whole"] as const;
export type ResponsumBoundary = (typeof RESPONSUM_BOUNDARIES)[number];
export type BookRole = (typeof BOOK_ROLES)[number];
/** One entry of a working set's own block-type list (`roles` in worksets.json). */
export interface RoleSpec {
  role: BookRole;
  title?: string;
  key?: string;
}

/** Whole-box typographic marks, independent of the role and of each other: the printed
 *  lines of a region are set in bold type, centred, or letter-spaced (wide-tracked
 *  emphasis). A region carries any combination; exported as `style_tags`. In this order. */
export const STYLE_TAGS = ["bold", "centered", "spaced"] as const;
export type StyleTag = (typeof STYLE_TAGS)[number];

export const BOOK_CONFIDENCE = ["high", "medium", "low"] as const;
export type BookConfidence = (typeof BOOK_CONFIDENCE)[number];

/** The streams the canonical batches actually use, most frequent first. Any other name is
 *  allowed — a second commentary is `commentary_left`, a catchword is `catchword`. */
export const BOOK_STREAMS = [
  "main",
  "header",
  "page_number",
  "commentary",
  "footnotes",
  "auxiliary",
  "references",
  "aux_unknown",
  "decoration",
  "paratext",
] as const;

export const BOOK_LAYOUT_TAGS = [
  "plain_one_column",
  "plain_two_column",
  "numbered_footnotes",
  "named_commentary",
  "mixed_apparatus",
  "full_width_apparatus",
  "marginal_apparatus",
  "spanning_headings",
  "column_restart",
  "dense_small_type",
  "irregular_header",
  "damaged_or_irregular_scan",
] as const;

export type Presence = "present" | "confirmed_absent" | "not_observed";

export interface BookRegion {
  id: string;
  role: BookRole;
  bbox: BBox;
  container_id: string | null;
  /** Null only for a separator, which belongs to no reading stream. */
  stream_id: string | null;
  text_hint: string;
  confidence: BookConfidence;
  basis: string;
  /** Required whenever `role` is `unknown`. */
  ambiguity_reason: string;
  subtype: string | null;
  /** `detector` until a human touched it; `human` when drawn; `op` from a split or
   *  merge; `existing` when loaded from a canonical annotation file. */
  source: "detector" | "human" | "op" | "existing";
  detector_role: BookRole | null;
  detector_confidence: number | null;
  /** A human looked at this region and accepted its geometry and role. */
  verified: boolean;
  /** Set on both halves of a split: which region this was cut out of, and how. */
  cut_from?: CutOrigin<string>;
  /** As on a newspaper block: the printed text is turned this many degrees clockwise
   *  from upright (90 = tops of the letters point right, 270 = left, 180 = upside down).
   *  A flag for straightening later; the box and the text hint are left as they are.
   *  Exported as `text_rotation`. */
  rotation?: Rotation;
  responsum_id?: string | null;
  responsum_boundary?: ResponsumBoundary;
  /** The project's custom tag for this region (`_lib/project.ts`); exported as `tag`. */
  tag?: TagRef<BookRole>;
  /** Whole-box style marks (`STYLE_TAGS`), kept in that order; absent when none. Halves of a
   *  split inherit them, a merge takes their union. Exported as `style_tags`. */
  style_tags?: StyleTag[];
}

export interface BookContainer {
  id: string;
  kind: "zone" | "column";
  bbox: BBox;
  parent_id: string | null;
}

/** Blocks the reviewer put together as one unit (Ctrl+G): a paragraph broken across two
 *  columns, a heading with its topic line, a responsum's parts. A region is in at most one
 *  group; `region_ids` are in reading order; a group has at least two regions. */
export interface BookGroup {
  id: string;
  region_ids: string[];
  /** Display colour only; never exported. */
  colorHue: number;
}

export type RelationType = "heads" | "continues" | "annotates";

export interface BookRelation {
  type: RelationType;
  from: string;
  to: string;
  basis: string;
}

export interface DateEvidence {
  status: "visually_verified" | "cached_probe_only" | "not_found_on_selected_page" | "uncertain";
  text_he: string;
  region_id: string | null;
  basis: string;
}

export interface BookAnn {
  kind: "book";
  /** How far the reviewer turned the page on screen to read it, clockwise. The view only
   *  (kept with the session so a reopened page opens the same way); every coordinate
   *  stays in the page's own frame, and a line's print rotation is its own `rotation`. */
  view_rotation?: 0 | 90 | 180 | 270;
  regions: Record<string, BookRegion>;
  containers: BookContainer[];
  /** stream → region ids in reading order. Every non-separator region is in exactly one. */
  order: Record<string, string[]>;
  relations: BookRelation[];
  /** Regions grouped into one unit by the reviewer (Ctrl+G). Absent in older sessions. */
  groups?: BookGroup[];
  /** The highest group number ever issued, so a new group never reuses a dissolved id. */
  groupSeq?: number;
  /** Every split made on this page, oldest first. */
  cuts: CutRecord<string>[];
  date_evidence: DateEvidence;
  layout_notes: string[];
  uncertainties: string[];
  /** Book-level layout tags — sampling guidance, never a region label. */
  layout_tags: string[];
  /** Per role: seen on the reviewed pages, shown absent, or simply not observed. */
  class_presence: Record<BookRole, Presence>;
  mode: "empty" | "proposal" | "existing";
  done: boolean;
  flag: string | null;
  ops: number;
  seconds: number;
}

export interface BookBundle {
  kind: "book";
  id: string;
  otzarId: string;
  width: number;
  height: number;
  imageUrl: string;
  /** The working set's `labels` option: `false` opens the page with labels hidden. */
  labels?: boolean;
  /** The working set's `roles`: the block types the page offers, in order. Absent = all. */
  roles?: RoleSpec[];
  /** Provenance copied through to the output untouched. */
  source: {
    image: string;
    image_sha256: string | null;
    source_pdf_page_1based: number | null;
    source_pdf_sha256: string | null;
    work_ids: string[];
    pdf: unknown;
  };
  proposal: { regions: BookRegion[]; containers: BookContainer[]; order: Record<string, string[]>; relations: BookRelation[] } | null;
  /** A canonical annotation already on disk, loaded as the starting point when present. */
  existing: BookAnn | null;
  session: BookAnn | null;
  /** SHA256 of the saved session bytes when this bundle was read; null if absent. */
  sessionRevision?: string | null;
}

export type Bundle = NewsBundle | BookBundle;
export type Ann = NewsAnn | BookAnn;
