// Machine proposals for a text working set: what a model (or an agent) suggests, for a
// person to accept or reject. Pure.
//
// A proposal names its span by **quote**, not by offsets: a language model is reliable at
// copying a phrase and unreliable at counting characters. The quote is located in the
// document (the `nth` occurrence, 1-based); offsets are accepted too, and then the quote,
// when given, must be exactly the text they cover. A proposal that cannot be placed is
// reported with its line number and never guessed.
//
// A proposal already decided — the same tag on the same span, in any status — is not
// offered again, so re-running the model never resurrects a rejected suggestion.

import { find } from "./seeds";
import type { Ann, AttrValues, Section, TagDef } from "./types";

/** One line of a proposals file. */
export interface ProposalRecord {
  doc: string;
  tag: string;
  quote?: string;
  nth?: number;
  start?: number;
  end?: number;
  attrs?: AttrValues;
  /** 0..1, shown beside the proposal. */
  confidence?: number;
  /** The run that produced it, e.g. `agent:gpt-ner-2026-10`. Defaults to the file's. */
  layer?: string;
}

export interface ProposalResult {
  anns: Ann[];
  errors: string[];
}

/** Why a proposal's fields do not fit its tag, or null: an unknown field, a value outside
 *  an enum's list, a number field that is not a number. */
export function attrProblem(attrs: AttrValues, tag: TagDef): string | null {
  for (const [k, v] of Object.entries(attrs)) {
    const def = tag.attrs.find((a) => a.id === k);
    if (!def) return `tag ${tag.id} has no field ${k}${tag.attrs.length ? ` (it has ${tag.attrs.map((a) => a.id).join(", ")})` : ""}`;
    if (def.kind === "enum" && def.values && !def.values.includes(String(v))) return `${k} must be one of ${def.values.join(", ")}, not ${JSON.stringify(v)}`;
    if (def.kind === "number" && typeof v !== "number") return `${k} must be a number`;
  }
  return null;
}

export function parseProposals(text: string): { records: { line: number; rec: ProposalRecord }[]; errors: string[] } {
  const records: { line: number; rec: ProposalRecord }[] = [];
  const errors: string[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    if (!raw.trim()) return;
    try {
      const rec = JSON.parse(raw) as ProposalRecord;
      if (typeof rec.doc !== "string" || typeof rec.tag !== "string") errors.push(`line ${i + 1}: doc and tag are required`);
      else records.push({ line: i + 1, rec });
    } catch {
      errors.push(`line ${i + 1}: not JSON`);
    }
  });
  return { records, errors };
}

/**
 * Proposals as annotations, ready to merge into what is loaded. `nextId` is the first
 * counter value to mint from; ids are `p<n>`.
 */
export function resolveProposals(
  records: { line: number; rec: ProposalRecord }[],
  sections: Map<string, Section>,
  tags: TagDef[],
  existing: Ann[],
  defaultLayer: string,
  nextId: number,
): ProposalResult {
  const anns: Ann[] = [];
  const errors: string[] = [];
  const taken = new Set(existing.map((a) => `${a.doc}\u0000${a.tag}\u0000${a.start}\u0000${a.end}`));
  let n = nextId;
  for (const { line, rec } of records) {
    const sec = sections.get(rec.doc);
    if (!sec) { errors.push(`line ${line}: no document ${rec.doc} in this project`); continue; }
    const tag = tags.find((t) => t.id === rec.tag);
    if (!tag) { errors.push(`line ${line}: no tag ${rec.tag} in this project`); continue; }
    const attrs = rec.attrs && typeof rec.attrs === "object" ? rec.attrs : {};
    const badAttr = attrProblem(attrs, tag);
    if (badAttr) { errors.push(`line ${line}: ${badAttr}`); continue; }
    let start: number | null = null;
    let end: number | null = null;
    let quote: string | null = null;
    if (tag.scope === "document" && (rec.quote !== undefined || rec.start !== undefined)) { errors.push(`line ${line}: ${rec.tag} is a document-level tag; give no quote or offsets`); continue; }
    if (tag.scope !== "document") {
      if (typeof rec.start === "number" && typeof rec.end === "number") {
        if (!(rec.start >= 0 && rec.end > rec.start && rec.end <= sec.text.length)) { errors.push(`line ${line}: offsets ${rec.start}-${rec.end} are outside ${rec.doc}`); continue; }
        if (typeof rec.quote === "string" && sec.text.slice(rec.start, rec.end) !== rec.quote) { errors.push(`line ${line}: the quote is not the text at ${rec.start}-${rec.end}`); continue; }
        start = rec.start;
        end = rec.end;
      } else if (typeof rec.quote === "string" && rec.quote !== "") {
        const r = find(sec.text, rec.quote, rec.nth ?? 1);
        if (!r) { errors.push(`line ${line}: quote not found in ${rec.doc}${rec.nth ? ` (occurrence ${rec.nth})` : ""}`); continue; }
        start = r.start;
        end = r.end;
      } else { errors.push(`line ${line}: a span needs a quote or start and end`); continue; }
      quote = sec.text.slice(start, end);
    }
    const key = `${rec.doc}\u0000${rec.tag}\u0000${start}\u0000${end}`;
    if (taken.has(key)) continue;
    taken.add(key);
    const layer = typeof rec.layer === "string" && rec.layer ? rec.layer : defaultLayer;
    anns.push({
      id: `p${n++}`,
      doc: rec.doc,
      tag: rec.tag,
      start,
      end,
      quote,
      attrs: { ...attrs },
      layer,
      origin: layer,
      prov: "agent",
      status: "proposed",
      conf: typeof rec.confidence === "number" ? rec.confidence : null,
      uncertain: false,
      parent: null,
    });
  }
  return { anns, errors };
}
