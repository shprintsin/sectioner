// The wire and in-memory shapes, named as the design names them.
//
// These are the *in-memory* field names from `TEI Annotation Workbench.dc.html`
// (`id`, `doc`, `prov`, ...), not the longer on-disk names SPEC §4.2 specifies
// (`ann_id`, `doc_id`, `provenance`, ...). Keeping the design's names is what lets this
// port stay diffable against its source line by line, which is the same discipline
// /ocr-comparison was built under. The two vocabularies meet in one place — the
// serialiser — when persistence lands; nothing else may know about the difference.

import type { CSSProperties } from "react";

/** Which project a tag belongs to. `both` means it is offered in either. */
export type ProjKey = "both" | "p-responsa" | "p-press";

/** How an attribute is edited, which decides its control in the inspector. */
export type AttrKind = "text" | "number" | "enum" | "vocab";

export interface AttrDef {
  id: string;
  kind: AttrKind;
  label: string;
  /** Where this attribute lands in the TEI export: `@type`, `@ref`, `bibl`, `element`. */
  tei: string;
  /** Present for `kind: "enum"` only, and never empty when it is. */
  values?: string[];
}

export interface TagDef {
  id: string;
  en: string;
  he: string;
  color: string;
  /** Single character, or "" for a tag reachable only through the palette. */
  key: string;
  /** The TEI target — an element name, sometimes with an attribute predicate. */
  tei: string;
  proj: ProjKey;
  /** Shown in the floating menu at the selection. At most six are used. */
  popular?: boolean;
  /** A structural tag frames the text and is never painted as an inline mark. */
  structural?: boolean;
  /** `"document"` means the tag carries no range: it classifies the whole document. */
  scope?: "document";
  /** Tag ids (or the pseudo-id "doc") this tag may sit inside. */
  contain: string[];
  /** Human-readable note on what fills this tag automatically. Display only. */
  auto: string;
  attrs: AttrDef[];
}

export type AttrValues = Record<string, string | number>;

export type Provenance = "human" | "rule" | "agent";

/**
 * `stale` is not in the design — it is SPEC §3.2's fourth state, for an annotation whose
 * `quote` no longer matches the text under its offsets. It exists in the type from the
 * start so the reducer and the sidebar never have to grow a new branch later.
 */
export type AnnStatus = "proposed" | "accepted" | "rejected" | "stale";

export interface Ann {
  id: string;
  /** `doc_id` of the section this annotation lives in. */
  doc: string;
  /** `TagDef.id`. May name a tag absent from the current tag set — see orphans. */
  tag: string;
  /** null,null together mean document scope. Never one without the other. */
  start: number | null;
  end: number | null;
  /** Must equal `text.slice(start, end)`. Null only at document scope. */
  quote: string | null;
  attrs: AttrValues;
  /** "gold" | "rule" | "agent:<run>" */
  layer: string;
  /**
   * The layer this annotation was **first** asserted in, never rewritten.
   *
   * Accepting a proposal promotes `layer` to "gold", which is right — the gold set is
   * what a human stands behind — but it also erases the only record that a machine
   * proposed it. `origin` keeps that record, and it is what makes "how much of the gold
   * set came from the agent" answerable at all. The design's Analysis panel asks exactly
   * that question and, reading `layer`, always answers zero.
   */
  origin: string;
  prov: Provenance;
  status: AnnStatus;
  /** 0..1 for a machine proposal; null for anything a human or a rule asserted. */
  conf: number | null;
  uncertain: boolean;
  /** Id of the smallest strictly-containing annotation in the same doc, or null. */
  parent: string | null;
}

/**
 * A declarative annotation in the fixture corpus, resolved to offsets at load.
 * Exactly one of `q`, `from`+`to`, or `doc` is set.
 */
export interface Seed {
  tag: string;
  /** Quote to locate by string search. */
  q?: string;
  /** Which occurrence of `q` to take, 1-based. Defaults to 1. */
  nth?: number;
  /** Start of a span located by its first and last phrase. */
  from?: string;
  to?: string;
  /** True for a document-scope annotation. */
  doc?: boolean;
  attrs?: AttrValues;
  prov?: Provenance;
  status?: AnnStatus;
  conf?: number;
  uncertain?: boolean;
}

export interface Section {
  doc_id: string;
  /** The band this section sits under in the reader: "אורח חיים", "עמוד 1". */
  part: string;
  title: string;
  /** The paragraphs, in order. `text` is exactly `segs.join("\n\n")`. */
  segs: string[];
  text: string;
  seeds: Seed[];
}

export interface Volume {
  id: string;
  title: string;
  sub: string;
  slug: string;
  /** Total units in the source book — the denominator in "4 of 412 units loaded". */
  units: number;
  /** Percent of the book tagged, as shown in the Library tab. */
  pct: number;
  /** Count flagged for review, as shown in the Library tab. */
  review: number;
  sections: Section[];
}

export interface Project {
  id: string;
  name: string;
  path: string;
  corpusLabel: string;
  tagsetPath: string;
  volumes: Volume[];
}

/** Which side-panel tab is showing. */
export type Tab = "tags" | "tagset" | "library" | "analysis";

/** How inline marks are drawn. */
export type SpanMode = "underline" | "highlight";

/** Scope of the tag track in the Tags panel. */
export type TrackScope = "section" | "volume";

/** The status filter chip in the Tags panel, cycled in this order. */
export type StatusFilter = "all" | "proposals" | "uncertain";

/** A live text selection, in absolute character offsets into the section's `text`. */
export interface Sel {
  doc: string;
  start: number;
  end: number;
}

/**
 * The selection's viewport rectangle, kept raw. The design bakes the floating menu's
 * final x/y at mouseup from `window.innerWidth`; storing the rect instead keeps `window`
 * out of the reducer and lets a resize re-clamp without invalidating the view model.
 */
export interface SelRect {
  left: number;
  top: number;
  width: number;
}

/** A style object handed to a component. Components never build one themselves. */
export type Style = CSSProperties;

/** The three pieces of state that decide how a mark is painted. */
export interface MarkOpts {
  mode: SpanMode;
  /** Hide the annotation layer entirely — the text as it would be read. */
  cleanRead: boolean;
  activeId: string | null;
}
