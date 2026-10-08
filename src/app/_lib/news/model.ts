// The newspaper page as a value, and every act the annotator can perform on it.
//
// Pure functions: each act takes the annotation and returns a new one plus where the
// cursor should go next. The component owns undo (a snapshot per act), autosave and the
// keyboard; nothing here touches the DOM. Tested in model.test.ts against the three
// example pages of the brief.
//
// Two rules the brief makes non-negotiable live here: a repair keeps coordinates exact
// (a split cuts between two known printed lines, a merge is the union of known boxes),
// and every content block ends in exactly one section — `place` removes a block from
// wherever it was before adding it, so the invariant cannot be broken by any act.

import { cutBox, readingOrder, union } from "../geometry";
import type { Axis } from "../geometry";
import { nextGroupHue } from "./display";
import type { BBox, Block, CutRecord, NewsAnn, NewsBundle, NewsSection, NewsType, Rotation } from "../types";

export interface Move {
  /** Index into the reading order to put the cursor on, when the act moves it. */
  cur?: number;
  sel?: number[] | null;
  active?: string | null;
}

export interface Result {
  ann: NewsAnn;
  move: Move;
  note: string;
}

export function isContent(b: Block): boolean {
  return b.label !== "separator";
}

export function initNews(bundle: NewsBundle): NewsAnn {
  const blocks: Record<number, Block> = {};
  for (const b of bundle.blocks) blocks[b.id] = { ...b, lines: b.lines.map((l) => [...l] as BBox) };
  const ann: NewsAnn = {
    kind: "newspaper",
    blocks,
    sections: [],
    skip: {},
    cuts: [],
    mode: "empty",
    done: false,
    flag: null,
    ops: 0,
    seconds: 0,
  };
  return bundle.startWithProposal ? { ...loadProposal(ann, bundle.proposal, orderOf(ann, bundle.columnBounds, bundle.width)).ann, ops: 0 } : ann;
}

/** Content block ids in right-to-left, column-major reading order. */
export function orderOf(ann: NewsAnn, cols: readonly number[], pageW: number): number[] {
  return readingOrder(Object.values(ann.blocks).filter(isContent), cols, pageW);
}

export function assignMap(ann: NewsAnn): Record<number, string> {
  const m: Record<number, string> = {};
  for (const s of ann.sections) for (const b of s.blockIds) m[b] = s.id;
  return m;
}

/** Content blocks in neither a section nor the skip list, in reading order. */
export function unassigned(ann: NewsAnn, order: readonly number[]): number[] {
  const m = assignMap(ann);
  return order.filter((id) => !m[id] && !ann.skip[id]);
}

export function sectionOf(ann: NewsAnn, id: string | null): NewsSection | undefined {
  return id == null ? undefined : ann.sections.find((s) => s.id === id);
}

/** The first OCR line of the title block, which is what the schema's `title` carries. */
export function titleText(ann: NewsAnn, s: NewsSection): string | null {
  if (s.titleText?.trim()) return s.titleText.trim();
  const b = s.titleBlockId != null ? ann.blocks[s.titleBlockId] : undefined;
  if (!b) return null;
  const t = (b.text || "").split("\n")[0].trim();
  return t || null;
}

function clone(ann: NewsAnn): NewsAnn {
  return structuredClone(ann);
}

/** A fresh section id, never one used before on this page: a reused id would make a
 *  new group look like the one that was dissolved or merged away. */
function nextSectionId(ann: NewsAnn): string {
  const numbers = ann.sections.map((s) => Number(/^s([0-9]+)$/.exec(s.id)?.[1] ?? 0));
  const n = Math.max(ann.sectionSeq ?? 0, ...numbers) + 1;
  ann.sectionSeq = n;
  return `s${n}`;
}

function nextBlockId(ann: NewsAnn): number {
  const ids = Object.keys(ann.blocks).map(Number);
  return (ids.length ? Math.max(...ids) : 0) + 1;
}

function sortByOrder(ids: number[], order: readonly number[]): number[] {
  const pos = new Map(order.map((id, i) => [id, i]));
  return ids.slice().sort((a, b) => (pos.get(a) ?? 1e9) - (pos.get(b) ?? 1e9));
}

/** Put `ids` in section `sid`, removing them from anywhere else; drops sections left
 *  empty (except the target). The one place the "exactly one section" rule is enforced. */
function place(ann: NewsAnn, ids: readonly number[], sid: string, order: readonly number[]): void {
  for (const s of ann.sections) s.blockIds = s.blockIds.filter((b) => !ids.includes(b));
  const t = ann.sections.find((s) => s.id === sid);
  if (!t) return;
  for (const b of ids) {
    delete ann.skip[b];
    if (!t.blockIds.includes(b)) t.blockIds.push(b);
  }
  t.blockIds = sortByOrder(t.blockIds, order);
  if (t.titleBlockId != null && t.blockIds.includes(t.titleBlockId)) {
    t.blockIds = [t.titleBlockId, ...t.blockIds.filter((b) => b !== t.titleBlockId)];
  }
  ann.sections = ann.sections.filter((s) => s.blockIds.length || s.id === sid);
}

function newSection(ann: NewsAnn, ids: readonly number[], type: NewsType | null, order: readonly number[]): NewsSection {
  const s: NewsSection = {
    id: nextSectionId(ann),
    type: type ?? "ARTICLE",
    blockIds: [],
    titleBlockId: null,
    titleText: null,
    verified: true,
    continuesFrom: false,
    continuesTo: false,
  };
  ann.sections.push(s);
  place(ann, ids, s.id, order);
  return s;
}

/** Where the cursor goes after acting on `ids`: the block after the last of them. */
function advance(ids: readonly number[], order: readonly number[]): Move {
  const last = Math.max(-1, ...ids.map((id) => order.indexOf(id)));
  return { cur: Math.min(order.length - 1, last + 1), sel: null };
}

function tick(ann: NewsAnn): NewsAnn {
  ann.ops += 1;
  return ann;
}

/* ── the core loop ───────────────────────────────────────────────────────────────── */

/** Space: the target blocks join the active section, or open one when there is none. */
export function assignSame(ann0: NewsAnn, ids: number[], active: string | null, order: number[]): Result {
  const ann = clone(ann0);
  const act = sectionOf(ann, active);
  if (!act) {
    const s = newSection(ann, ids, null, order);
    return { ann: tick(ann), move: { active: s.id, ...advance(ids, order) }, note: "opened a section" };
  }
  place(ann, ids, act.id, order);
  return {
    ann: tick(ann),
    move: { active: act.id, ...advance(ids, order) },
    note: `${ids.length} block${ids.length > 1 ? "s" : ""} → ${act.id}`,
  };
}

/** N / Enter: a new section starting at the target blocks. */
export function startSection(ann0: NewsAnn, ids: number[], type: NewsType | null, order: number[]): Result {
  const ann = clone(ann0);
  const s = newSection(ann, ids, type, order);
  return {
    ann: tick(ann),
    move: { active: s.id, ...advance(ids, order) },
    note: `new section${type ? ` · ${type}` : ""} — 1–9 sets the type`,
  };
}

/** 1–9: retype the active section; with no active section, start one of that type. */
export function setType(ann0: NewsAnn, active: string | null, type: NewsType, ids: number[], order: number[]): Result {
  if (!sectionOf(ann0, active)) return startSection(ann0, ids, type, order);
  const ann = clone(ann0);
  const s = sectionOf(ann, active)!;
  s.type = type;
  return { ann: tick(ann), move: {}, note: `${s.id} → ${type}` };
}

/** T: the current block is the printed headline of its section (or of the active one). */
export function setTitle(ann0: NewsAnn, id: number, active: string | null, order: number[]): Result | null {
  const sid = assignMap(ann0)[id] ?? active;
  if (!sid || !sectionOf(ann0, sid)) return null;
  const ann = clone(ann0);
  const s = sectionOf(ann, sid)!;
  if (!s.blockIds.includes(id)) place(ann, [id], sid, order);
  s.titleBlockId = s.titleBlockId === id ? null : id;
  if (s.titleBlockId != null) s.blockIds = [id, ...s.blockIds.filter((b) => b !== id)];
  else s.blockIds = sortByOrder(s.blockIds, order);
  return { ann: tick(ann), move: {}, note: s.titleBlockId != null ? `title of ${sid} ← block ${id}` : `${sid} has no title block now` };
}

/** H1 is unique within a section; classification does not reorder its blocks. */
export function markHeadline(ann0: NewsAnn, id: number, order: number[]): Result | null {
  if (!ann0.blocks[id]) return null;
  const ann = clone(ann0);
  let section = sectionOf(ann, assignMap(ann)[id] ?? null);
  if (!section) section = newSection(ann, [id], "ARTICLE", order);
  const block = ann.blocks[id];
  const already = section.titleBlockId === id || block.role === "headline" || block.role === "ad_headline";
  if (already) {
    if (section.titleBlockId === id) { section.titleBlockId = null; section.titleText = null; }
    block.role = section.type === "ADVERTISEMENT" ? "ad_body" : "body";
  } else {
    for (const member of section.blockIds) {
      const previous = ann.blocks[member];
      if (member !== id && (previous?.role === "headline" || previous?.role === "ad_headline")) previous.role = "subhead";
    }
    section.titleBlockId = id;
    section.titleText = null;
    block.role = section.type === "ADVERTISEMENT" ? "ad_headline" : "headline";
  }
  ann.done = false;
  return { ann: tick(ann), move: { active: section.id, cur: order.indexOf(id), sel: null }, note: already ? "Headline removed" : "Headline marked; membership and reading order preserved" };
}

/** Block roles a toggle applies: the section title (a department heading above the
 *  articles' H1s), H2, footnotes and separators. None is a section boundary. */
export type StructuralRole = "section_title" | "subhead" | "byline" | "toc_list" | "footnote" | "separator";
const ROLE_NAME: Record<StructuralRole, string> = { section_title: "section title", subhead: "H2 subheading", byline: "author", toc_list: "table of contents", footnote: "footnote", separator: "visual separator" };

/** H2, footnotes and separators are block roles, not automatic section boundaries. */
export function markStructuralRole(ann0: NewsAnn, id: number, role: StructuralRole): Result | null {
  if (!ann0.blocks[id]) return null;
  const ann = clone(ann0);
  const block = ann.blocks[id];
  const section = sectionOf(ann, assignMap(ann)[id] ?? null);
  const removing = block.role === role;
  block.role = removing ? (section?.type === "ADVERTISEMENT" ? "ad_body" : "body") : role;
  if (!removing && role === "separator" && !section) ann.skip[id] = true;
  else delete ann.skip[id];
  if (section?.titleBlockId === id) { section.titleBlockId = null; section.titleText = null; }
  ann.done = false;
  const name = ROLE_NAME[role];
  return { ann: tick(ann), move: { sel: null }, note: `${removing ? "Removed" : "Marked"} ${name}; section membership preserved` };
}

/** Apply or remove a role across the current selection as one undoable action. */
export function markStructuralRoles(ann0: NewsAnn, ids: number[], role: StructuralRole): Result | null {
  ids = [...new Set(ids)];
  if (!ids.length || ids.some(id => !ann0.blocks[id])) return null;
  const removing = ids.every(id => ann0.blocks[id].role === role);
  let ann = ann0;
  for (const id of ids) {
    if (removing || ann.blocks[id].role !== role) ann = markStructuralRole(ann, id, role)!.ann;
  }
  ann.ops = ann0.ops + 1;
  return { ann, move: { sel: ids }, note: `${removing ? "Removed" : "Applied"} ${ROLE_NAME[role]} on ${ids.length} selected boxes` };
}

/** C: the target blocks' text is centred, or no longer marked so when every one was. */
export function toggleCentered(ann0: NewsAnn, ids: number[]): Result | null {
  ids = [...new Set(ids)];
  if (!ids.length || ids.some((id) => !ann0.blocks[id])) return null;
  const clear = ids.every((id) => ann0.blocks[id].align === "center");
  const ann = clone(ann0);
  for (const id of ids) {
    if (clear) delete ann.blocks[id].align;
    else ann.blocks[id].align = "center";
  }
  return { ann: tick(ann), move: { sel: ids.length > 1 ? ids : null }, note: `${ids.length} block${ids.length > 1 ? "s" : ""} ${clear ? "no longer marked centred" : "marked centred"}` };
}

/** !: flag the target blocks for review, or clear the flag when every one has it. */
export function toggleBlockFlag(ann0: NewsAnn, ids: number[]): Result | null {
  ids = [...new Set(ids)];
  if (!ids.length || ids.some((id) => !ann0.blocks[id])) return null;
  const clear = ids.every((id) => ann0.blocks[id].flag);
  const ann = clone(ann0);
  for (const id of ids) {
    if (clear) delete ann.blocks[id].flag;
    else ann.blocks[id].flag ??= { note: null };
  }
  return { ann: tick(ann), move: { sel: ids.length > 1 ? ids : null }, note: `${ids.length} block${ids.length > 1 ? "s" : ""} ${clear ? "unflagged" : "flagged — add a note in the inspector if it helps"}` };
}

/** The note on a flagged block; writing a note flags the block, an empty one keeps the flag. */
export function setBlockFlagNote(ann0: NewsAnn, id: number, note: string): Result | null {
  if (!ann0.blocks[id]) return null;
  const ann = clone(ann0);
  ann.blocks[id].flag = { note: note.trim() || null };
  return { ann: tick(ann), move: {}, note: `flag note on block ${id} ${note.trim() ? "saved" : "cleared"}` };
}

/** Flag the printed text of the target blocks as rotated (degrees clockwise), or clear
 *  it. Setting the value every target already has clears it: the buttons toggle. */
export function setRotation(ann0: NewsAnn, ids: number[], rotation: Rotation | null): Result | null {
  ids = [...new Set(ids)];
  if (!ids.length || ids.some((id) => !ann0.blocks[id])) return null;
  const clear = rotation == null || ids.every((id) => ann0.blocks[id].rotation === rotation);
  const ann = clone(ann0);
  for (const id of ids) {
    if (clear) delete ann.blocks[id].rotation;
    else ann.blocks[id].rotation = rotation;
  }
  const what = clear ? "rotation flag cleared" : rotation === 180 ? "flagged upside down (180°)" : `flagged rotated 90° ${rotation === 90 ? "clockwise" : "counter-clockwise"}`;
  return { ann: tick(ann), move: { sel: ids.length > 1 ? ids : null }, note: `${ids.length} block${ids.length > 1 ? "s" : ""} ${what}` };
}

/** X: not content — a rule, an ornament, noise. Removed from any section. */
export function skip(ann0: NewsAnn, ids: number[], order: number[]): Result {
  const ann = clone(ann0);
  for (const s of ann.sections) s.blockIds = s.blockIds.filter((b) => !ids.includes(b));
  ann.sections = ann.sections.filter((s) => s.blockIds.length);
  for (const b of ids) ann.skip[b] = true;
  return { ann: tick(ann), move: advance(ids, order), note: `${ids.length} skipped (rule / noise)` };
}

/** Undo a skip without placing the block anywhere. */
export function unskip(ann0: NewsAnn, ids: number[]): Result {
  const ann = clone(ann0);
  for (const b of ids) delete ann.skip[b];
  return { ann: tick(ann), move: {}, note: `${ids.length} back to unassigned` };
}

/** D: the section goes away, its blocks become loose. */
export function dissolve(ann0: NewsAnn, sid: string): Result | null {
  if (!sectionOf(ann0, sid)) return null;
  const ann = clone(ann0);
  ann.sections = ann.sections.filter((s) => s.id !== sid);
  return { ann: tick(ann), move: { active: null }, note: `${sid} dissolved back into loose blocks` };
}

/** M: the section under the cursor joins the active one. */
export function mergeSections(ann0: NewsAnn, keepId: string, dropId: string, order: number[]): Result | null {
  if (keepId === dropId || !sectionOf(ann0, keepId) || !sectionOf(ann0, dropId)) return null;
  const ann = clone(ann0);
  const keep = sectionOf(ann, keepId)!;
  const drop = sectionOf(ann, dropId)!;
  keep.blockIds = sortByOrder(keep.blockIds.concat(drop.blockIds), order);
  if (keep.titleBlockId == null && drop.titleBlockId != null) keep.titleBlockId = drop.titleBlockId;
  if (keep.titleBlockId != null) keep.blockIds = [keep.titleBlockId, ...keep.blockIds.filter((b) => b !== keep.titleBlockId)];
  ann.sections = ann.sections.filter((s) => s.id !== dropId);
  return { ann: tick(ann), move: { active: keepId }, note: `${dropId} merged into ${keepId}` };
}

/** ⇧S: the section is cut before the current block; the tail becomes a new section. */
export function splitSection(ann0: NewsAnn, id: number): Result | null {
  const sid = assignMap(ann0)[id];
  if (!sid) return null;
  const ann = clone(ann0);
  const s = sectionOf(ann, sid)!;
  const i = s.blockIds.indexOf(id);
  if (i <= 0) return null;
  const tail = s.blockIds.slice(i);
  s.blockIds = s.blockIds.slice(0, i);
  const ns: NewsSection = {
    id: nextSectionId(ann),
    type: s.type,
    blockIds: tail,
    titleBlockId: null,
    titleText: null,
    verified: true,
    continuesFrom: false,
    continuesTo: s.continuesTo,
  };
  s.continuesTo = false;
  ann.sections.push(ns);
  return { ann: tick(ann), move: { active: ns.id }, note: `section split at block ${id} → ${ns.id}` };
}

/** `, .`: move the block one step earlier or later in its section's reading order. */
export function reorder(ann0: NewsAnn, id: number, dir: -1 | 1): Result | null {
  const sid = assignMap(ann0)[id];
  if (!sid) return null;
  const ann = clone(ann0);
  const s = sectionOf(ann, sid)!;
  const i = s.blockIds.indexOf(id);
  const j = i + dir;
  if (j < 0 || j >= s.blockIds.length) return null;
  s.blockIds.splice(j, 0, s.blockIds.splice(i, 1)[0]);
  return { ann: tick(ann), move: {}, note: `reading order in ${sid} adjusted` };
}

/** A typed title — only for a headline no block carries; empty returns to the block. */
export function setTitleText(ann0: NewsAnn, sid: string, text: string): Result | null {
  if (!sectionOf(ann0, sid)) return null;
  const ann = clone(ann0);
  sectionOf(ann, sid)!.titleText = text.trim() || null;
  return { ann: tick(ann), move: {}, note: text.trim() ? `title of ${sid} typed` : `${sid}: title back to the block` };
}

/** Toggle the continuation flags on a section. */
export function setContinues(ann0: NewsAnn, sid: string, which: "from" | "to"): Result | null {
  if (!sectionOf(ann0, sid)) return null;
  const ann = clone(ann0);
  const s = sectionOf(ann, sid)!;
  if (which === "from") s.continuesFrom = !s.continuesFrom;
  else s.continuesTo = !s.continuesTo;
  const on = which === "from" ? s.continuesFrom : s.continuesTo;
  return { ann: tick(ann), move: {}, note: `${sid} continues ${which === "from" ? "from previous" : "to next"} page: ${on ? "yes" : "no"}` };
}

/* ── proposals ───────────────────────────────────────────────────────────────────── */

export function loadProposal(ann0: NewsAnn, proposal: NewsBundle["proposal"], order: number[]): Result {
  const ann = clone(ann0);
  ann.mode = "proposal";
  ann.sections = [];
  ann.skip = {};
  let n = 0;
  for (const p of proposal) {
    const valid = p.block_ids.filter((b) => ann.blocks[b] && isContent(ann.blocks[b]));
    const ids = p.preserveOrder ? valid : sortByOrder(valid, order);
    if (!ids.length) continue;
    n += 1;
    ann.sections.push({
      id: p.id ?? `s${n}`,
      type: p.type,
      blockIds: ids,
      titleBlockId: p.titleBlockId !== undefined ? p.titleBlockId : p.title ? ids[0] : null,
      titleText: null,
      verified: false,
      continuesFrom: p.continuesFrom ?? false,
      continuesTo: p.continuesTo ?? false,
      articleKey: p.articleKey,
      orderUncertain: p.orderUncertain,
    });
  }
  return {
    ann: tick(ann),
    move: { active: ann.sections[0]?.id ?? null, cur: 0, sel: null },
    note: "proposal loaded — dashed outlines are unverified; ⇧A approves them all, A approves and moves on",
  };
}

export function dropProposal(ann0: NewsAnn): Result {
  const ann = clone(ann0);
  ann.mode = "empty";
  ann.sections = [];
  return { ann: tick(ann), move: { active: null }, note: "proposal dropped — starting empty" };
}

/** A: the proposed section is right as it stands. Cursor moves to the next unverified. */
export function accept(ann0: NewsAnn, sid: string, order: number[]): Result | null {
  if (!sectionOf(ann0, sid)) return null;
  const ann = clone(ann0);
  sectionOf(ann, sid)!.verified = true;
  const next = ann.sections.find((s) => !s.verified);
  const move: Move = { active: sid };
  if (next) move.cur = order.indexOf(next.blockIds[0]);
  return { ann: tick(ann), move, note: `${sid} accepted` };
}

/** Confirm every remaining section on this page as one undoable action. */
export function acceptAll(ann0: NewsAnn): Result | null {
  const pending = ann0.sections.filter((s) => !s.verified).length;
  if (!pending) return null;
  const ann = clone(ann0);
  for (const section of ann.sections) section.verified = true;
  return { ann: tick(ann), move: {}, note: `${pending} sections approved on this page` };
}

/* ── repairs — coordinates stay exact ────────────────────────────────────────────── */

/** Geometry repair only: article membership, reading order and OCR stay untouched. */
export function resizeBlock(ann0: NewsAnn, id: number, box: BBox, cols: number[], pageW: number, pageH: number): Result | null {
  const original = ann0.blocks[id];
  if (!original || !box.every(Number.isFinite)) return null;
  const next = box.map((v, i) => Math.round(Math.max(0, Math.min(i % 2 ? pageH : pageW, v)))) as BBox;
  if (next[2] - next[0] < 2 || next[3] - next[1] < 2 || next.every((v, i) => v === original.bbox[i])) return null;
  const ann = clone(ann0);
  const b = ann.blocks[id];
  b.geometryEdit ??= { originalBBox: [...b.bbox] as BBox, basis: "human_adjusted" };
  b.bbox = next;
  // Line coordinates remain source evidence, not a scaled synthetic OCR result.
  ann.done = false;
  return { ann: tick(ann), move: { cur: orderOf(ann, cols, pageW).indexOf(id), sel: null }, note: `block ${id} resized — OCR and article order unchanged` };
}

/** Insert `extra` into `base` by reading order without disturbing `base`'s own order:
 *  each incoming block goes before the first block that reads after it. A title at the
 *  head of the section stays the head. */
function mergeByOrder(base: number[], extra: number[], order: readonly number[], titleId: number | null): number[] {
  const pos = new Map(order.map((id, i) => [id, i]));
  const out = base.slice();
  for (const id of sortByOrder(extra, order)) {
    const p = pos.get(id) ?? 1e9;
    let at = out.findIndex((b) => (pos.get(b) ?? 1e9) > p);
    if (at < 0) at = out.length;
    if (at === 0 && titleId != null && out[0] === titleId) at = 1;
    out.splice(at, 0, id);
  }
  return out;
}

/** Ctrl+G: the selected blocks become one section, exactly them, with every source
 *  rectangle and text kept separately. When the selection swallows an article with an
 *  article key (A15) whole, the group continues it — id, key, colour, title and
 *  continuation flags — because that key is how the other pages of the issue name it;
 *  with several, the one that reads first wins and the others end. A page-local group
 *  (no key) is never continued, and `fresh` (Ctrl+Shift+G) never continues anything:
 *  otherwise the group is a new section with a never-used id. */
export function groupBlocks(ann0: NewsAnn, ids: number[], order: number[], fresh = false): Result | null {
  ids = [...new Set(ids)];
  if (!ids.length || ids.some(id => !ann0.blocks[id])) return null;
  const ann = clone(ann0);
  const selected = new Set(ids);
  const pos = new Map(order.map((id, i) => [id, i]));
  const first = (sec: NewsSection) => Math.min(...sec.blockIds.map(id => pos.get(id) ?? 1e9));
  const sources = ann.sections.filter(s => s.blockIds.some(id => selected.has(id)));
  const whole = sources.filter(s => s.blockIds.every(id => selected.has(id)));
  const keyed = fresh ? [] : whole.filter(s => s.articleKey?.trim());
  const host = keyed.slice().sort((a, b) => first(a) - first(b))[0] ?? null;
  const sameSource = sources.length === 1 && ids.every(id => sources[0].blockIds.includes(id));
  const sourceTitles = sources.map(s => s.titleBlockId).filter((t): t is number => t != null && selected.has(t));
  const type = sources.length && sources.every(s => s.type === sources[0].type) ? sources[0].type : host?.type ?? "ARTICLE";

  let section: NewsSection;
  let incoming: number[];
  if (host) {
    section = host;
    incoming = ids.filter(id => !host.blockIds.includes(id));
    const title = host.titleBlockId ?? (sourceTitles.length === 1 ? sourceTitles[0] : null);
    for (const s of whole) {
      if (s === host) continue;
      section.continuesFrom ||= s.continuesFrom;
      section.continuesTo ||= s.continuesTo;
    }
    for (const s of ann.sections) if (s !== host) s.blockIds = s.blockIds.filter(id => !selected.has(id));
    for (const id of ids) delete ann.skip[id];
    section.blockIds = mergeByOrder(host.blockIds, incoming, order, title);
    section.titleBlockId = title;
    section.type = type;
    if (incoming.length) section.orderUncertain = true;
    ann.sections = ann.sections.filter(s => s.blockIds.length);
  } else {
    const ordered = sameSource ? sources[0].blockIds.filter(id => selected.has(id)) : sortByOrder(ids, order);
    const colorHue = nextGroupHue(ann.sections);
    section = newSection(ann, ids, type, order);
    section.blockIds = ordered;
    section.titleBlockId = sourceTitles.length === 1 ? sourceTitles[0] : null;
    section.colorHue = colorHue;
    section.orderUncertain = sameSource ? sources[0].orderUncertain : ids.length > 1;
    incoming = ids;
  }
  section.verified = false;
  for (const s of ann.sections) {
    if (sources.some(source => source.id === s.id)) s.verified = false;
    if (s !== section && s.titleBlockId != null && !s.blockIds.includes(s.titleBlockId)) { s.titleBlockId = null; s.titleText = null; }
  }
  ann.done = false;
  const name = section.articleKey || section.id;
  const note = host
    ? `${ids.length} blocks grouped into ${name}${whole.length > 1 ? ` (${whole.filter(s => s !== host).map(s => s.articleKey || s.id).join(", ")} joined it)` : ""}; rectangles and text preserved.${incoming.length ? " Check reading order." : ""}`
    : `${ids.length} blocks grouped → new section ${name}; rectangles and text preserved. Check reading order.`;
  return { ann: tick(ann), move: { active: section.id, cur: order.indexOf(section.blockIds[0]), sel: ids }, note };
}

/** Bulk type applies exactly to the selected blocks, never their unselected neighbours.
 *  Partial sections are partitioned; independent source sections are not merged. */
export function classifyBlocks(ann0: NewsAnn, ids: number[], type: NewsType, order: number[]): Result | null {
  ids = [...new Set(ids)];
  if (!ids.length || ids.some(id => !ann0.blocks[id])) return null;
  const ann = clone(ann0);
  const selected = new Set(ids);
  const owned = new Set<number>();
  for (const source of [...ann.sections]) {
    const hit = source.blockIds.filter(id => selected.has(id));
    hit.forEach(id => owned.add(id));
    if (!hit.length) continue;
    if (hit.length === source.blockIds.length || source.type === type) {
      source.type = type;
      continue;
    }
    const title = source.titleBlockId != null && selected.has(source.titleBlockId) ? source.titleBlockId : null;
    const split = newSection(ann, hit, type, order);
    split.blockIds = hit;
    split.titleBlockId = title;
    split.orderUncertain = source.orderUncertain;
    split.verified = false;
    source.verified = false;
    split.colorHue = nextGroupHue(ann.sections.filter(s => s.id !== split.id));
    if (title != null) { source.titleBlockId = null; source.titleText = null; }
  }
  for (const id of ids.filter(id => !owned.has(id))) newSection(ann, [id], type, order);
  ann.done = false;
  return { ann: tick(ann), move: { sel: ids, active: assignMap(ann)[ids[0]] ?? null }, note: `${ids.length} selected blocks → ${type}; unselected blocks keep their classification` };
}

/** ⇧M: several blocks become one, the union of their boxes; lines and text follow. */
export function mergeBlocks(ann0: NewsAnn, ids: number[], cols: number[], pageW: number): Result | null {
  if (ids.length < 2 || ids.some((i) => !ann0.blocks[i])) return null;
  const ann = clone(ann0);
  const bs = ids.map((i) => ann.blocks[i]);
  const nid = nextBlockId(ann);
  ann.blocks[nid] = {
    id: nid,
    label: bs[0].label,
    bbox: union(bs.map((b) => b.bbox)),
    lines: bs.flatMap((b) => b.lines).sort((a, b) => a[1] - b[1]),
    text: bs.map((b) => b.text).filter(Boolean).join("\n"),
    conf: null,
    role: bs[0].role,
    source: "op",
    inputBlockIds: [...new Set(bs.flatMap(b => b.inputBlockIds ?? [b.id]))],
    ...(bs[0].rotation && bs.every((b) => b.rotation === bs[0].rotation) ? { rotation: bs[0].rotation } : {}),
    ...(bs.some((b) => b.flag) ? { flag: { note: bs.map((b) => b.flag?.note).filter(Boolean).join(" · ") || null } } : {}),
    ...(bs.every((b) => b.align === "center") ? { align: "center" as const } : {}),
  };
  for (const i of ids) {
    delete ann.blocks[i];
    delete ann.skip[i];
  }
  const order = orderOf(ann, cols, pageW);
  for (const s of ann.sections) {
    const had = s.blockIds.some((b) => ids.includes(b));
    s.blockIds = s.blockIds.filter((b) => !ids.includes(b));
    if (had) s.blockIds.push(nid);
    s.blockIds = sortByOrder(s.blockIds, order);
    if (s.titleBlockId != null && ids.includes(s.titleBlockId)) {
      s.titleBlockId = nid;
      s.blockIds = [nid, ...s.blockIds.filter((b) => b !== nid)];
    }
  }
  ann.sections = ann.sections.filter((s) => s.blockIds.length);
  return {
    ann: tick(ann),
    move: { sel: null, cur: Math.max(0, order.indexOf(nid)) },
    note: `${ids.length} blocks merged → block ${nid} (source: op)`,
  };
}

/** Write one split into the page's ledger and back-link both halves to it. The two
 *  halves are given in reading order; `geom` is their geometric order (top→bottom,
 *  left→right), which is what the `side` of each half names. */
function recordCut(
  ann: NewsAnn,
  spec: { kind: CutRecord["kind"]; axis: "h" | "v"; at: number; from: Block; first: Block; second: Block; lineIndex?: number },
): void {
  const { kind, axis, at, from, first, second } = spec;
  ann.cuts ??= [];
  const seq = ann.cuts.length + 1;
  const sides: ["top" | "right", "bottom" | "left"] = axis === "h" ? ["top", "bottom"] : ["right", "left"];
  ann.cuts.push({
    seq,
    kind,
    axis,
    at: Math.round(at),
    from: from.id,
    from_bbox: [...from.bbox] as BBox,
    into: [first.id, second.id],
    into_bboxes: [[...first.bbox] as BBox, [...second.bbox] as BBox],
    ...(spec.lineIndex == null ? {} : { line_index: spec.lineIndex }),
  });
  first.cutFrom = { parent: from.id, seq, kind, axis, at: Math.round(at), side: sides[0], sibling: second.id };
  second.cutFrom = { parent: from.id, seq, kind, axis, at: Math.round(at), side: sides[1], sibling: first.id };
}

/** Both halves of a cut block take its place in its section, one after the other in
 *  reading order: the section keeps its membership and its established order, which is
 *  never re-sorted by geometry. The first half inherits the title; H1 is unique in a
 *  section, so the second half does not inherit a headline role. */
function replaceWithHalves(ann: NewsAnn, id: number, first: Block, second: Block): string | null {
  if (second.role === "headline" || second.role === "ad_headline") second.role = null;
  let sid: string | null = null;
  for (const s of ann.sections) {
    const i = s.blockIds.indexOf(id);
    if (i < 0) continue;
    s.blockIds.splice(i, 1, first.id, second.id);
    if (s.titleBlockId === id) s.titleBlockId = first.id;
    sid = s.id;
  }
  return sid;
}

/** S then Enter: the block is cut between printed lines k-1 and k. Both halves are the
 *  union of their own lines, so both stay pixel-exact. */
export function splitBlock(ann0: NewsAnn, id: number, k: number, cols: number[], pageW: number): Result | null {
  const b = ann0.blocks[id];
  if (!b || k < 1 || k >= b.lines.length) return null;
  if (b.inputEvidence && b.lines.length !== b.text.split("\n").length) return null;
  const ann = clone(ann0);
  const top = b.lines.slice(0, k);
  const bot = b.lines.slice(k);
  let nid = nextBlockId(ann);
  const tLines = b.text.split("\n");
  const a1: Block = { id: nid++, label: b.label, bbox: union(top), lines: top, text: tLines.slice(0, k).join("\n"), conf: b.conf, role: b.role, source: "op", inputBlockIds: b.inputBlockIds ?? [b.id], ...(b.rotation ? { rotation: b.rotation } : {}), ...(b.flag ? { flag: { ...b.flag } } : {}), ...(b.align ? { align: b.align } : {}) };
  const a2: Block = { id: nid++, label: b.label, bbox: union(bot), lines: bot, text: tLines.slice(k).join("\n"), conf: b.conf, role: b.role, source: "op", inputBlockIds: b.inputBlockIds ?? [b.id], ...(b.rotation ? { rotation: b.rotation } : {}), ...(b.flag ? { flag: { ...b.flag } } : {}), ...(b.align ? { align: b.align } : {}) };
  ann.blocks[a1.id] = a1;
  ann.blocks[a2.id] = a2;
  delete ann.blocks[id];
  recordCut(ann, { kind: "line", axis: "h", at: (bot[0][1] + top[top.length - 1][3]) / 2, from: b, first: a1, second: a2, lineIndex: k });
  const wasSkipped = !!ann.skip[id];
  delete ann.skip[id];
  if (wasSkipped) {
    ann.skip[a1.id] = true;
    ann.skip[a2.id] = true;
  }
  const sid = replaceWithHalves(ann, id, a1, a2);
  const order = orderOf(ann, cols, pageW);
  return {
    ann: tick(ann),
    move: { cur: order.indexOf(a1.id), sel: null },
    note: `block ${id} split into ${a1.id} + ${a2.id} between lines ${k}/${k + 1}${sid ? ` — both stay in ${sid}, in order` : ""}`,
  };
}

/**
 * A straight cut through a block's rectangle, the way a table editor draws a separator:
 * `h` cuts it into top and bottom, `v` into right and left. Unlike `splitBlock` the cut
 * falls where the reviewer put it rather than between two printed lines, so it is a
 * geometry edit: both halves keep the original rectangle in `geometryEdit`, and the
 * halves tile it exactly. Printed lines follow the half their centre falls in, and the
 * OCR text follows its lines when the two agree line for line; otherwise the whole text
 * stays with the half that reads first, which is the upper one, or the right one. Both
 * halves stay in the block's section, where it stood.
 */
export function cutBlock(ann0: NewsAnn, id: number, at: number, axis: Axis, cols: number[], pageW: number): Result | null {
  const b = ann0.blocks[id];
  if (!b) return null;
  const halves = cutBox(b.bbox, at, axis, 2);
  if (!halves) return null;
  const [firstBox, secondBox] = axis === "v" ? [halves[1], halves[0]] : halves;
  const ann = clone(ann0);
  const inFirst = (l: BBox): boolean => {
    const c = axis === "h" ? (l[1] + l[3]) / 2 : (l[0] + l[2]) / 2;
    return axis === "h" ? c < firstBox[3] : c >= firstBox[0];
  };
  const tLines = b.text.split("\n");
  const aligned = b.lines.length > 0 && b.lines.length === tLines.length;
  const parts = b.lines.map((l, i) => ({ line: l, text: aligned ? tLines[i] : "", first: inFirst(l) }));
  const textOf = (first: boolean): string =>
    aligned ? parts.filter((x) => x.first === first).map((x) => x.text).join("\n") : first ? b.text : "";
  const origin = b.geometryEdit ?? { originalBBox: [...b.bbox] as BBox, basis: "human_adjusted" as const };
  let nid = nextBlockId(ann);
  const half = (box: BBox, first: boolean): Block => ({
    id: nid++,
    label: b.label,
    bbox: box,
    lines: parts.filter((x) => x.first === first).map((x) => [...x.line] as BBox),
    text: textOf(first),
    conf: b.conf,
    role: b.role,
    source: "op",
    inputBlockIds: b.inputBlockIds ?? [b.id],
    geometryEdit: { originalBBox: [...origin.originalBBox] as BBox, basis: "human_adjusted" },
    ...(b.rotation ? { rotation: b.rotation } : {}),
    ...(b.flag ? { flag: { ...b.flag } } : {}),
    ...(b.align ? { align: b.align } : {}),
  });
  const a1 = half(firstBox, true);
  const a2 = half(secondBox, false);
  ann.blocks[a1.id] = a1;
  ann.blocks[a2.id] = a2;
  delete ann.blocks[id];
  recordCut(ann, { kind: "free", axis, at: axis === "v" ? firstBox[0] : firstBox[3], from: b, first: a1, second: a2 });
  const wasSkipped = !!ann.skip[id];
  delete ann.skip[id];
  if (wasSkipped) {
    ann.skip[a1.id] = true;
    ann.skip[a2.id] = true;
  }
  const sid = replaceWithHalves(ann, id, a1, a2);
  const order = orderOf(ann, cols, pageW);
  ann.done = false;
  const where = axis === "v" ? `x=${firstBox[0]}` : `y=${firstBox[3]}`;
  return {
    ann: tick(ann),
    move: { cur: order.indexOf(a1.id), sel: null },
    note: `block ${id} cut at ${where} into ${a1.id} + ${a2.id}${sid ? ` — both stay in ${sid}, in order` : ""}${aligned ? "" : "; the OCR text stayed with " + a1.id}`,
  };
}

/** B-drag: a rectangle for content the layout model missed. Recorded as `added`. */
export function addBlock(ann0: NewsAnn, box: BBox, cols: number[], pageW: number): Result {
  const ann = clone(ann0);
  const nid = nextBlockId(ann);
  ann.blocks[nid] = { id: nid, label: "text", bbox: box.map(Math.round) as BBox, lines: [], text: "", conf: null, role: null, source: "added" };
  const order = orderOf(ann, cols, pageW);
  return { ann: tick(ann), move: { cur: order.indexOf(nid), sel: null }, note: `block ${nid} drawn (source: added)` };
}

/** Delete: the block is spurious — empty margin, bleed-through. */
export function deleteBlocks(ann0: NewsAnn, ids: number[], cols: number[], pageW: number): Result | null {
  if (!ids.length || ids.some((i) => !ann0.blocks[i])) return null;
  const ann = clone(ann0);
  for (const i of ids) {
    delete ann.blocks[i];
    delete ann.skip[i];
  }
  for (const s of ann.sections) {
    s.blockIds = s.blockIds.filter((b) => !ids.includes(b));
    if (s.titleBlockId != null && ids.includes(s.titleBlockId)) s.titleBlockId = null;
  }
  ann.sections = ann.sections.filter((s) => s.blockIds.length);
  const order = orderOf(ann, cols, pageW);
  const first = Math.min(...ids.map((i) => ann0.blocks[i] ? orderOf(ann0, cols, pageW).indexOf(i) : 0));
  return { ann: tick(ann), move: { cur: Math.max(0, Math.min(order.length - 1, first)), sel: null }, note: `${ids.length} block${ids.length > 1 ? "s" : ""} deleted` };
}

/** Retype a block's role — secondary to sectioning, but the headline role matters. */
export function setRole(ann0: NewsAnn, ids: number[], role: Block["role"]): Result | null {
  if (!ids.length) return null;
  const ann = clone(ann0);
  for (const i of ids) if (ann.blocks[i]) ann.blocks[i].role = role;
  return { ann: tick(ann), move: {}, note: `${ids.length} block${ids.length > 1 ? "s" : ""} → role ${role ?? "none"}` };
}

/** A quick fix of an obviously broken OCR line. Not transcription. */
export function setText(ann0: NewsAnn, id: number, text: string): Result | null {
  if (!ann0.blocks[id]) return null;
  const ann = clone(ann0);
  ann.blocks[id].text = text;
  return { ann: tick(ann), move: {}, note: `OCR text of block ${id} edited` };
}

/* ── session ─────────────────────────────────────────────────────────────────────── */

export function markDone(ann0: NewsAnn, done: boolean): Result {
  const ann = clone(ann0);
  ann.done = done;
  return { ann: tick(ann), move: {}, note: done ? "page marked done — ] for the next one" : "reopened" };
}

export function setArticleKey(ann0: NewsAnn, sid: string, key: string): Result | null {
  if (!sectionOf(ann0, sid)) return null;
  const ann = clone(ann0);
  sectionOf(ann, sid)!.articleKey = key.trim() || undefined;
  return { ann: tick(ann), move: {}, note: "Article id updated; the same id on another page marks the same article" };
}

/** Membership correction does not silently rewrite the target's established order. */
export function assignMembership(ann0: NewsAnn, ids: number[], sid: string): Result | null {
  const target = sectionOf(ann0, sid);
  if (!target || !ids.length || ids.some(id => !ann0.blocks[id])) return null;
  const ann = clone(ann0);
  const incoming = ids.filter(id => !target.blockIds.includes(id));
  for (const section of ann.sections) {
    if (section.id === sid) continue;
    section.blockIds = section.blockIds.filter(id => !ids.includes(id));
    if (section.titleBlockId != null && ids.includes(section.titleBlockId)) section.titleBlockId = null;
  }
  const next = sectionOf(ann, sid)!;
  next.blockIds.push(...incoming);
  if (incoming.length) next.orderUncertain = true;
  if (incoming.length) { next.verified = false; ann.done = false; }
  for (const id of ids) delete ann.skip[id];
  ann.sections = ann.sections.filter(section => section.blockIds.length);
  return { ann: tick(ann), move: { active: sid, sel: null }, note: "Assignment updated. The order of the existing blocks is kept; place and confirm the blocks that were added." };
}

/* ── the issue: one article id across its pages ─────────────────────────────────── */

/** The next `A<n>` not in `used`: one past the highest number the issue has issued. */
export function nextArticleKey(used: Iterable<string>): string {
  let n = 0;
  for (const k of used) n = Math.max(n, Number(/^A([0-9]+)$/.exec(k.trim())?.[1] ?? 0));
  return `A${n + 1}`;
}

/** Give every section without an article key a fresh one, unique across the issue
 *  (`reserved`: the keys the issue's other pages hold). A page-local id (`s1`) is not an
 *  identity — every page has an s1 — so an unkeyed group would share a label with an
 *  unrelated group on the facing page. Sections are keyed in reading order. Returns the
 *  same object when every section already has a key. */
export function keySections(ann0: NewsAnn, reserved: ReadonlySet<string>, order: readonly number[]): NewsAnn {
  if (ann0.sections.every((s) => s.articleKey?.trim())) return ann0;
  const ann = clone(ann0);
  const used = new Set<string>(reserved);
  for (const s of ann.sections) if (s.articleKey?.trim()) used.add(s.articleKey.trim());
  const pos = new Map(order.map((id, i) => [id, i]));
  const first = (s: NewsSection) => Math.min(1e9, ...s.blockIds.map((id) => pos.get(id) ?? 1e9));
  for (const s of ann.sections.filter((x) => !x.articleKey?.trim()).sort((a, b) => first(a) - first(b))) {
    const key = nextArticleKey(used);
    s.articleKey = key;
    s.colorHue = undefined;
    used.add(key);
  }
  return ann;
}

/** The section `sid` is the same article as one on the facing page, whose key is `key`:
 *  it takes that key and is marked as continuing across the fold (`side` is the facing
 *  page's side: "previous" means this section continues from it). If a section of this
 *  page already carries the key, the two are one article here too and are merged. */
export function linkArticle(ann0: NewsAnn, sid: string, key: string, side: "previous" | "next", order: number[]): Result | null {
  const target = sectionOf(ann0, sid);
  if (!target || !key.trim()) return null;
  const other = ann0.sections.find((s) => s.id !== sid && s.articleKey?.trim() === key.trim());
  const merged = other ? mergeSections(ann0, other.id, sid, order) : null;
  const ann = merged ? merged.ann : clone(ann0);
  const s = sectionOf(ann, other ? other.id : sid)!;
  s.articleKey = key.trim();
  s.colorHue = undefined;
  if (side === "previous") s.continuesFrom = true;
  else s.continuesTo = true;
  s.verified = false;
  ann.done = false;
  if (!merged) tick(ann);
  return {
    ann,
    move: { active: s.id },
    note: other
      ? `${sid} merged into ${key}: the same article as ${key} on the ${side} page`
      : `${sid} is now ${key}, continuing ${side === "previous" ? "from the previous" : "to the next"} page`,
  };
}

/** The selected blocks are article `key` of the facing page, continuing across the fold:
 *  they join this page's section with that key when there is one; a selection that is
 *  exactly one section is linked whole; otherwise they become a new section with the key. */
export function assignToArticle(ann0: NewsAnn, ids: number[], key: string, side: "previous" | "next", order: number[]): Result | null {
  ids = [...new Set(ids)];
  key = key.trim();
  if (!ids.length || !key || ids.some((id) => !ann0.blocks[id])) return null;
  const existing = ann0.sections.find((s) => s.articleKey?.trim() === key);
  const selected = new Set(ids);
  const exact = ann0.sections.find((s) => s.blockIds.length === ids.length && s.blockIds.every((id) => selected.has(id)));
  let res: Result | null;
  let sid: string;
  if (existing) {
    res = assignMembership(ann0, ids, existing.id);
    sid = existing.id;
  } else if (exact) {
    return linkArticle(ann0, exact.id, key, side, order);
  } else {
    res = groupBlocks(ann0, ids, order, true);
    sid = res?.move.active ?? "";
  }
  if (!res) return null;
  const s = sectionOf(res.ann, sid);
  if (!s) return null;
  s.articleKey = key;
  s.colorHue = undefined;
  if (side === "previous") s.continuesFrom = true;
  else s.continuesTo = true;
  res.ann.ops = ann0.ops + 1;
  return { ann: res.ann, move: { active: sid, sel: null }, note: `${ids.length} block${ids.length > 1 ? "s" : ""} → ${key}, the same article as on the ${side} page` };
}

export function confirmOrder(ann0: NewsAnn, sid: string): Result | null {
  if (!sectionOf(ann0, sid)) return null;
  const ann = clone(ann0);
  sectionOf(ann, sid)!.orderUncertain = false;
  return { ann: tick(ann), move: {}, note: "The order shown is confirmed" };
}

export function setFlag(ann0: NewsAnn, flag: string | null): Result {
  const ann = clone(ann0);
  ann.flag = flag?.trim() ? flag.trim() : null;
  return { ann: tick(ann), move: {}, note: ann.flag ? `flagged: ${ann.flag}` : "flag cleared" };
}

/** Drop references to blocks that no longer exist — a session saved against an older
 *  layout file. Never throws away a section that still has members. */
export function sanitize(ann: NewsAnn): NewsAnn {
  ann.cuts ??= [];
  const has = (id: number | null | undefined): id is number => id != null && !!ann.blocks[id];
  ann.sections = ann.sections
    .map((s) => ({ ...s, titleText: s.titleText ?? null, blockIds: s.blockIds.filter(has), titleBlockId: has(s.titleBlockId) ? s.titleBlockId : null }))
    .filter((s) => s.blockIds.length);
  const skip: Record<number, true> = {};
  for (const k of Object.keys(ann.skip)) if (has(Number(k))) skip[Number(k)] = true;
  ann.skip = skip;
  return ann;
}
