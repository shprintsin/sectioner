// The one place the in-memory names and the on-disk names meet.
//
// In memory an annotation is `{id, doc, prov, …}` — the design's vocabulary, kept so the
// port stays diffable against its source. On disk it is `{ann_id, doc_id, provenance, …}`
// — SPEC §4.2's vocabulary, kept because the file outlives this app and has to be
// readable by the Python and R that will consume it.
//
// Format is JSONL: one annotation per line, keys in a fixed order, UTF-8 without a BOM.
// That makes a change to one annotation a one-line git diff, which is the whole point —
// the diff *is* the review. (The parent repo's `.gitattributes` sets `*.jsonl -diff`,
// right for a 4,900-row corpus dump and wrong here, so `annotations/.gitattributes`
// re-enables it.)

import type { Ann, AnnStatus, AttrValues, Provenance } from "./types";

/** One annotation as it is written to disk. Key order here is key order in the file. */
export interface AnnRecord {
  ann_id: string;
  doc_id: string;
  tag: string;
  start: number | null;
  end: number | null;
  quote: string | null;
  attrs: AttrValues;
  layer: string;
  origin: string;
  provenance: Provenance;
  status: AnnStatus;
  confidence: number | null;
  uncertain: boolean;
  parent: string | null;
}

export function toRecord(a: Ann): AnnRecord {
  return {
    ann_id: a.id,
    doc_id: a.doc,
    tag: a.tag,
    start: a.start,
    end: a.end,
    quote: a.quote,
    attrs: sortKeys(a.attrs),
    layer: a.layer,
    origin: a.origin,
    provenance: a.prov,
    status: a.status,
    confidence: a.conf,
    uncertain: a.uncertain,
    parent: a.parent,
  };
}

export function fromRecord(r: AnnRecord): Ann {
  return {
    id: r.ann_id,
    doc: r.doc_id,
    tag: r.tag,
    start: r.start,
    end: r.end,
    quote: r.quote,
    attrs: r.attrs ?? {},
    layer: r.layer,
    // A file written before `origin` existed loads as having originated where it sits.
    origin: r.origin || r.layer,
    prov: r.provenance,
    status: r.status,
    conf: r.confidence ?? null,
    uncertain: r.uncertain === true,
    parent: r.parent ?? null,
  };
}

/**
 * Attribute keys sorted, so the same annotation always serialises to the same bytes.
 * Without this, re-saving an unchanged file can produce a diff that says nothing.
 */
function sortKeys(attrs: AttrValues): AttrValues {
  const out: AttrValues = {};
  for (const k of Object.keys(attrs).sort()) out[k] = attrs[k];
  return out;
}

/** Annotations → JSONL. Ends with a newline, so appending is safe. */
export function toJsonl(anns: Ann[]): string {
  return anns.map((a) => JSON.stringify(toRecord(a))).join("\n") + (anns.length ? "\n" : "");
}

export interface ParseResult {
  anns: Ann[];
  /** 1-based line numbers that did not parse, with why. Never silently skipped. */
  errors: { line: number; reason: string }[];
}

/**
 * JSONL → annotations.
 *
 * A bad line is reported, not thrown on: one corrupt row must not make the other 4,899
 * unreadable. Blank lines are ignored — a trailing newline is not an error.
 */
export function fromJsonl(text: string): ParseResult {
  const anns: Ann[] = [];
  const errors: ParseResult["errors"] = [];
  text.split(/\r?\n/).forEach((line, i) => {
    if (line.trim() === "") return;
    try {
      const r = JSON.parse(line) as AnnRecord;
      if (typeof r.ann_id !== "string" || typeof r.doc_id !== "string") {
        errors.push({ line: i + 1, reason: "missing ann_id or doc_id" });
        return;
      }
      anns.push(fromRecord(r));
    } catch (e) {
      errors.push({ line: i + 1, reason: e instanceof Error ? e.message : "unparseable" });
    }
  });
  return { anns, errors };
}

/**
 * Annotations whose `quote` no longer matches the text under their offsets.
 *
 * The check SPEC §3.2 requires, and the reason a store must never re-find its quotes on
 * load: silently re-anchoring would repair the symptom and hide the fact that the text
 * under an annotation changed.
 */
export function findStale(anns: Ann[], textOf: (docId: string) => string | undefined): Ann[] {
  return anns.filter((a) => {
    if (a.start === null || a.end === null) return false;
    const text = textOf(a.doc);
    if (text === undefined) return false;
    return text.slice(a.start, a.end) !== a.quote;
  });
}
