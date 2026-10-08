// The responsa page as a value, and every act the reviewer can perform on it.
//
// The three layers of `docs/otzar-layout-classification.md` stay separate here:
// geometry (a region's box, the containers), semantic role (one per region), and
// structure (streams, within-stream order, relations). A box may be right while its role
// is wrong, so an act on one layer never silently rewrites another — except that a role
// change moves a region to that role's default stream when it had none, because a region
// with a role and no stream is not a state the output can express.
//
// Detector proposals are suggestions. Every region a human did not draw starts
// `verified: false`, and the page is not done until each has been looked at.

import { bookReadingOrder, center, contains, cutBox, intersection, union } from "../geometry";
import type { Axis } from "../geometry";
import type {
  BBox,
  BookAnn,
  BookBundle,
  BookConfidence,
  BookContainer,
  BookGroup,
  BookRegion,
  BookRole,
  DateEvidence,
  Presence,
  RelationType,
  Rotation,
  StyleTag,
} from "../types";
import { BOOK_ROLES, STYLE_TAGS } from "../types";

export interface Move {
  cur?: number;
  sel?: string[] | null;
  active?: string | null;
}

export interface Result {
  ann: BookAnn;
  move: Move;
  note: string;
}

/** The stream a role goes to when nothing says otherwise — the structure module's rule. */
export const DEFAULT_STREAM: Record<BookRole, string | null> = {
  main_text: "main",
  title: "main",
  subtitle: "main",
  auxiliary_text: "auxiliary",
  signature: "main",
  page_footer: "paratext",
  summary: "main",
  date: "main",
  commentary: "commentary",
  footnote: "footnotes",
  running_header: "header",
  page_number: "page_number",
  unknown: "aux_unknown",
  separator: null,
  table: null,
  noise: null,
  figure: null,
};

/** A separator, a figure, noise and a table area belong to no stream and to no reading
 *  order: a table is drawn around lines that keep their own regions, roles and places. */
export function isStreamless(role: BookRole): boolean {
  return role === "separator" || role === "table" || role === "noise" || role === "figure";
}

/** Streams walk in this order; anything not listed comes after, alphabetically. */
const STREAM_RANK = ["header", "page_number", "main", "auxiliary", "commentary", "footnotes", "references", "paratext", "aux_unknown", "decoration"];

export function streamRank(s: string): number {
  const i = STREAM_RANK.indexOf(s);
  return i < 0 ? STREAM_RANK.length : i;
}

export function emptyPresence(): Record<BookRole, Presence> {
  const p = {} as Record<BookRole, Presence>;
  for (const r of BOOK_ROLES) p[r] = "not_observed";
  return p;
}

export function emptyBook(): BookAnn {
  return {
    kind: "book",
    regions: {},
    containers: [],
    order: {},
    relations: [],
    groups: [],
    cuts: [],
    date_evidence: { status: "not_found_on_selected_page", text_he: "", region_id: null, basis: "" },
    layout_notes: [],
    uncertainties: [],
    layout_tags: [],
    class_presence: emptyPresence(),
    mode: "empty",
    done: false,
    flag: null,
    ops: 0,
    seconds: 0,
  };
}

/** Where a page starts: the session if there is one, else the annotation already on
 *  disk, else the detector proposal, else empty. */
export function initBook(bundle: BookBundle): BookAnn {
  if (bundle.session) return sanitize(bundle.session);
  if (bundle.existing) return sanitize({ ...bundle.existing, mode: "existing" });
  if (bundle.proposal) return loadProposal(emptyBook(), bundle.proposal).ann;
  return emptyBook();
}

function clone(ann: BookAnn): BookAnn {
  return structuredClone(ann);
}

function tick(ann: BookAnn): BookAnn {
  ann.ops += 1;
  return ann;
}

function nextId(ann: BookAnn, prefix: string): string {
  const used = new Set([...Object.keys(ann.regions), ...ann.containers.map((c) => c.id)]);
  let n = 1;
  while (used.has(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}

export function streams(ann: BookAnn): string[] {
  const set = new Set<string>(Object.keys(ann.order));
  for (const r of Object.values(ann.regions)) if (r.stream_id) set.add(r.stream_id);
  return [...set].sort((a, b) => streamRank(a) - streamRank(b) || a.localeCompare(b));
}

/** Every region once, in the order the cursor walks them: stream by stream in reading
 *  order, then regions that have a stream but no place in its order, then separators. */
export function walk(ann: BookAnn): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of streams(ann)) {
    for (const id of ann.order[s] ?? []) {
      if (ann.regions[id] && !seen.has(id)) {
        seen.add(id);
        out.push(id);
      }
    }
  }
  const rest = Object.values(ann.regions).filter((r) => !seen.has(r.id));
  const loose = rest.filter((r) => !isStreamless(r.role));
  const seps = rest.filter((r) => isStreamless(r.role));
  for (const r of bookReadingOrder(loose)) out.push(r);
  for (const r of seps.sort((a, b) => a.bbox[1] - b.bbox[1])) out.push(r.id);
  return out;
}

/** Regions a human has not confirmed yet, in walk order. */
export function unverified(ann: BookAnn): string[] {
  return walk(ann).filter((id) => !ann.regions[id].verified);
}

/** The order position of a region, or null when it is in no stream order. */
export function orderPos(ann: BookAnn, id: string): { stream: string; index: number } | null {
  for (const [stream, ids] of Object.entries(ann.order)) {
    const i = ids.indexOf(id);
    if (i >= 0) return { stream, index: i };
  }
  return null;
}

/** The smallest container whose box contains the region's centre — a column before its
 *  zone, because a column is smaller. */
export function containerFor(ann: BookAnn, bbox: BBox): string | null {
  const [cx, cy] = center(bbox);
  let best: BookContainer | null = null;
  let bestArea = Infinity;
  for (const c of ann.containers) {
    const b = c.bbox;
    if (cx < b[0] || cx > b[2] || cy < b[1] || cy > b[3]) continue;
    const a = (b[2] - b[0]) * (b[3] - b[1]);
    if (a < bestArea) {
      best = c;
      bestArea = a;
    }
  }
  return best?.id ?? null;
}

function removeFromOrders(ann: BookAnn, id: string): void {
  for (const s of Object.keys(ann.order)) ann.order[s] = ann.order[s].filter((x) => x !== id);
}

/** Put a region into its stream's order at the place reading order suggests, keeping
 *  the existing manual order of the others. */
function insertInOrder(ann: BookAnn, id: string): void {
  const r = ann.regions[id];
  removeFromOrders(ann, id);
  if (!r.stream_id) return;
  const cur = (ann.order[r.stream_id] ?? []).filter((x) => ann.regions[x]);
  const members = [...cur.map((x) => ann.regions[x]), r];
  const spatial = bookReadingOrder(members);
  const k = spatial.indexOf(id);
  // The nearest predecessor in the spatial order that already has a place decides.
  let at = 0;
  for (let i = k - 1; i >= 0; i--) {
    const j = cur.indexOf(spatial[i]);
    if (j >= 0) {
      at = j + 1;
      break;
    }
  }
  cur.splice(at, 0, id);
  ann.order[r.stream_id] = cur;
}

function dropEmptyOrders(ann: BookAnn): void {
  for (const s of Object.keys(ann.order)) if (!ann.order[s].length) delete ann.order[s];
}

/* ── groups ──────────────────────────────────────────────────────────────────────── */

export function groupOf(ann: BookAnn, id: string): BookGroup | undefined {
  return ann.groups?.find((g) => g.region_ids.includes(id));
}

/** The hue farthest from every hue already in use on the page. */
function nextGroupHue(groups: BookGroup[]): number {
  let best = 20, distance = -1;
  for (let hue = 0; hue < 360; hue++) {
    const gap = Math.min(180, ...groups.map((g) => Math.min(Math.abs(hue - g.colorHue), 360 - Math.abs(hue - g.colorHue))));
    if (gap > distance) { best = hue; distance = gap; }
  }
  return best;
}

function nextGroupId(ann: BookAnn): string {
  const top = Math.max(ann.groupSeq ?? 0, ...(ann.groups ?? []).map((g) => Number(g.id.slice(1)) || 0));
  ann.groupSeq = top + 1;
  return `g${top + 1}`;
}

/** A region belongs to one group, a group holds at least two regions that exist. */
function tidyGroups(ann: BookAnn): void {
  if (!ann.groups) return;
  const seen = new Set<string>();
  ann.groups = ann.groups
    .map((g) => ({ ...g, region_ids: g.region_ids.filter((id) => { if (!ann.regions[id] || seen.has(id)) return false; seen.add(id); return true; }) }))
    .filter((g) => g.region_ids.length >= 2);
}

/** Ctrl+G: the selection becomes one group. A group that any selected region already
 *  belongs to is taken whole, so grouping extends a group rather than tearing it; the
 *  earliest of those keeps its id and colour. Members are kept in reading order (`order`).
 *  Nothing changes when the selection already is exactly one group. */
export function groupRegions(ann0: BookAnn, ids: string[], order: string[]): Result | null {
  const live = [...new Set(ids.filter((i) => ann0.regions[i]))];
  if (live.length < 2) return null;
  const ann = clone(ann0);
  ann.groups ??= [];
  const touched = ann.groups.filter((g) => g.region_ids.some((i) => live.includes(i)));
  const members = new Set(live);
  for (const g of touched) for (const i of g.region_ids) members.add(i);
  const sorted = [...members].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  if (touched.length === 1 && touched[0].region_ids.length === sorted.length) return null;
  const host = touched[0];
  ann.groups = ann.groups.filter((g) => !touched.includes(g));
  const id = host?.id ?? nextGroupId(ann);
  ann.groups.push({ id, colorHue: host?.colorHue ?? nextGroupHue(ann.groups), region_ids: sorted });
  const joined = touched.length > 1 ? ` (${touched.slice(1).map((g) => g.id).join(", ")} joined it)` : "";
  return { ann: tick(ann), move: { sel: sorted }, note: `${sorted.length} regions grouped → ${id}${joined} · Ctrl+⇧G ungroups` };
}

/** Ctrl+⇧G: every group that any of these regions belongs to is dissolved. */
export function ungroupRegions(ann0: BookAnn, ids: string[]): Result | null {
  const touched = (ann0.groups ?? []).filter((g) => g.region_ids.some((i) => ids.includes(i)));
  if (!touched.length) return null;
  const ann = clone(ann0);
  ann.groups = (ann.groups ?? []).filter((g) => !touched.some((t) => t.id === g.id));
  return { ann: tick(ann), move: {}, note: `${touched.map((g) => g.id).join(", ")} ungrouped` };
}

/** The given regions step out of their groups; a group left with one region dissolves. */
export function leaveGroup(ann0: BookAnn, ids: string[]): Result | null {
  if (!ids.some((i) => groupOf(ann0, i))) return null;
  const ann = clone(ann0);
  for (const g of ann.groups ?? []) g.region_ids = g.region_ids.filter((i) => !ids.includes(i));
  tidyGroups(ann);
  return { ann: tick(ann), move: {}, note: `${ids.length} region${ids.length > 1 ? "s" : ""} left their group` };
}

/* ── regions ─────────────────────────────────────────────────────────────────────── */

export function addRegion(ann0: BookAnn, box: BBox, role: BookRole = "main_text"): Result {
  const ann = clone(ann0);
  const id = nextId(ann, "r");
  const bbox = box.map(Math.round) as BBox;
  ann.regions[id] = {
    id,
    role,
    bbox,
    container_id: containerFor(ann, bbox),
    stream_id: DEFAULT_STREAM[role],
    text_hint: "",
    confidence: "high",
    basis: "Drawn by the reviewer on the full page image.",
    ambiguity_reason: "",
    subtype: null,
    source: "human",
    detector_role: null,
    detector_confidence: null,
    verified: true,
  };
  insertInOrder(ann, id);
  return { ann: tick(ann), move: { cur: walk(ann).indexOf(id), sel: null }, note: `${id} drawn — 1–9 sets its role` };
}

export function setBox(ann0: BookAnn, id: string, box: BBox): Result | null {
  const r0 = ann0.regions[id];
  if (!r0) return null;
  const ann = clone(ann0);
  const r = ann.regions[id];
  r.bbox = box.map(Math.round) as BBox;
  if (r.source === "detector" || r.source === "existing") r.source = "op";
  r.container_id = containerFor(ann, r.bbox);
  r.verified = true;
  return { ann: tick(ann), move: {}, note: `${id} geometry adjusted` };
}

export function deleteRegions(ann0: BookAnn, ids: string[]): Result | null {
  const live = ids.filter((i) => ann0.regions[i]);
  if (!live.length) return null;
  const at = walk(ann0).indexOf(live[0]);
  const ann = clone(ann0);
  for (const id of live) {
    delete ann.regions[id];
    removeFromOrders(ann, id);
  }
  ann.relations = ann.relations.filter((x) => !live.includes(x.from) && !live.includes(x.to));
  if (ann.date_evidence.region_id && live.includes(ann.date_evidence.region_id)) ann.date_evidence.region_id = null;
  dropEmptyOrders(ann);
  tidyGroups(ann);
  const w = walk(ann);
  return { ann: tick(ann), move: { cur: Math.max(0, Math.min(w.length - 1, at)), sel: null }, note: `${live.length} region${live.length > 1 ? "s" : ""} deleted` };
}

/** ⇧M: the selection becomes one region, the union of the boxes; the first member's
 *  role, stream and place in the order survive; relations are rewired to the survivor. */
export function mergeRegions(ann0: BookAnn, ids: string[]): Result | null {
  const live = ids.filter((i) => ann0.regions[i]);
  if (live.length < 2) return null;
  const ann = clone(ann0);
  const first = ann.regions[live[0]];
  const id = nextId(ann, "r");
  const bbox = union(live.map((i) => ann.regions[i].bbox));
  const pos = orderPos(ann, first.id);
  // the merged region takes the place of its members in the first group any of them was in
  const host = live.map((i) => groupOf(ann, i)).find((g) => g);
  const hostAt = host ? host.region_ids.findIndex((i) => live.includes(i)) : -1;
  ann.regions[id] = {
    ...first,
    responsum_id: live.every((i) => ann.regions[i].responsum_id === first.responsum_id) ? first.responsum_id : null,
    responsum_boundary: "unknown",
    id,
    bbox,
    container_id: containerFor(ann, bbox),
    text_hint: live.map((i) => ann.regions[i].text_hint).filter(Boolean).join(" "),
    basis: `Merged from ${live.join(", ")} by the reviewer.`,
    source: "op",
    verified: true,
  };
  // A merged region keeps a rotation only when every member carries the same one.
  const rot = first.rotation;
  if (!rot || !live.every((i) => ann.regions[i].rotation === rot)) delete ann.regions[id].rotation;
  // Style marks are a union: a merged region is bold, centred or spaced if any member was.
  const styles = normStyle(live.flatMap((i) => ann.regions[i].style_tags ?? []));
  if (styles) ann.regions[id].style_tags = styles;
  else delete ann.regions[id].style_tags;
  for (const i of live) {
    delete ann.regions[i];
    removeFromOrders(ann, i);
  }
  if (pos && ann.order[pos.stream]) ann.order[pos.stream].splice(Math.min(pos.index, ann.order[pos.stream].length), 0, id);
  else insertInOrder(ann, id);
  for (const g of ann.groups ?? []) g.region_ids = g.region_ids.filter((i) => !live.includes(i));
  if (host) host.region_ids.splice(Math.min(hostAt, host.region_ids.length), 0, id);
  tidyGroups(ann);
  ann.relations = ann.relations
    .map((x) => ({ ...x, from: live.includes(x.from) ? id : x.from, to: live.includes(x.to) ? id : x.to }))
    .filter((x) => x.from !== x.to);
  ann.relations = ann.relations.filter((x, i, arr) => arr.findIndex((y) => y.type === x.type && y.from === x.from && y.to === x.to) === i);
  if (ann.date_evidence.region_id && live.includes(ann.date_evidence.region_id)) ann.date_evidence.region_id = id;
  dropEmptyOrders(ann);
  return { ann: tick(ann), move: { cur: walk(ann).indexOf(id), sel: null }, note: `${live.length} regions merged → ${id}` };
}

/** Write one split into the page's ledger and back-link both halves to it. `first` is
 *  the half that reads first; `side` names where each half sat in the parent. */
function recordCut(ann: BookAnn, spec: { axis: "h" | "v"; at: number; from: BookRegion; first: BookRegion; second: BookRegion }): void {
  const { axis, at, from, first, second } = spec;
  ann.cuts ??= [];
  const seq = ann.cuts.length + 1;
  const cut = Math.round(at);
  const sides: ["top" | "right", "bottom" | "left"] = axis === "h" ? ["top", "bottom"] : ["right", "left"];
  ann.cuts.push({
    seq,
    kind: "free",
    axis,
    at: cut,
    from: from.id,
    from_bbox: [...from.bbox] as BBox,
    into: [first.id, second.id],
    into_bboxes: [[...first.bbox] as BBox, [...second.bbox] as BBox],
  });
  first.cut_from = { parent: from.id, seq, kind: "free", axis, at: cut, side: sides[0], sibling: second.id };
  second.cut_from = { parent: from.id, seq, kind: "free", axis, at: cut, side: sides[1], sibling: first.id };
}

/** S, or a click with the cut tool: a straight cut through the region at page
 *  coordinate `at` — `h` cuts it into top and bottom, `v` into right and left. Both
 *  halves keep the role and stream; the half that reads first (the upper one, or the
 *  right one on a Hebrew page) keeps the id's place in the order and its relations, and
 *  the other follows it. The halves tile the original box exactly. */
/** A cut on a page with no regions yet: the page itself is the region cut, so the
 *  halves span it — full width for a cut across, full height for a cut down. One act. */
export function cutEmptyPage(ann0: BookAnn, width: number, height: number, at: number, axis: Axis = "h"): Result | null {
  if (Object.keys(ann0.regions).length) return null;
  const page = addRegion(ann0, [0, 0, width, height]).ann;
  const id = Object.keys(page.regions)[0];
  page.regions[id].basis = "The whole page, taken as one region by the reviewer's first cut.";
  page.ops = ann0.ops;
  return splitRegion(page, id, at, axis);
}

export function splitRegion(ann0: BookAnn, id: string, at: number, axis: Axis = "h"): Result | null {
  const r = ann0.regions[id];
  if (!r) return null;
  const halves = cutBox(r.bbox, at, axis, 2);
  if (!halves) return null;
  // Geometric order is top→bottom / left→right; reading order on a Hebrew page puts the
  // right half first, so a vertical cut hands the order slot to the second half.
  const [firstBox, secondBox] = axis === "v" ? [halves[1], halves[0]] : halves;
  const ann = clone(ann0);
  const cut = Math.round(at);
  const a = nextId(ann, "r");
  const where = axis === "v" ? ["Right", "Left", `x=${cut}`] : ["Upper", "Lower", `y=${cut}`];
  ann.regions[a] = { ...r, responsum_boundary: "unknown", id: a, bbox: firstBox, container_id: containerFor(ann, firstBox), source: "op", verified: true, basis: `${where[0]} part of ${id}, split by the reviewer.`, ...(r.style_tags?.length ? { style_tags: [...r.style_tags] } : {}) };
  const b = nextId(ann, "r");
  ann.regions[b] = { ...r, responsum_boundary: "unknown", id: b, bbox: secondBox, container_id: containerFor(ann, secondBox), source: "op", verified: true, basis: `${where[1]} part of ${id}, split by the reviewer.`, text_hint: "", ...(r.style_tags?.length ? { style_tags: [...r.style_tags] } : {}) };
  delete ann.regions[id];
  for (const g of ann.groups ?? []) {
    const k = g.region_ids.indexOf(id);
    if (k >= 0) g.region_ids.splice(k, 1, a, b);
  }
  recordCut(ann, { axis, at: cut, from: r, first: ann.regions[a], second: ann.regions[b] });
  const pos = orderPos(ann, id);
  removeFromOrders(ann, id);
  if (pos && ann.order[pos.stream]) ann.order[pos.stream].splice(pos.index, 0, a, b);
  else {
    insertInOrder(ann, a);
    insertInOrder(ann, b);
  }
  ann.relations = ann.relations.map((x) => ({ ...x, from: x.from === id ? a : x.from, to: x.to === id ? a : x.to }));
  if (ann.date_evidence.region_id === id) ann.date_evidence.region_id = a;
  return { ann: tick(ann), move: { cur: walk(ann).indexOf(a), sel: null }, note: `${id} split into ${a} + ${b} at ${where[2]}` };
}

export function setRole(ann0: BookAnn, ids: string[], role: BookRole): Result | null {
  const live = ids.filter((i) => ann0.regions[i]);
  if (!live.length) return null;
  const ann = clone(ann0);
  for (const id of live) {
    const r = ann.regions[id];
    const wasDefault = r.stream_id === DEFAULT_STREAM[r.role] || r.stream_id == null;
    r.role = role;
    r.verified = true;
    if (isStreamless(role)) {
      r.stream_id = null;
      removeFromOrders(ann, id);
    } else if (wasDefault) {
      r.stream_id = DEFAULT_STREAM[role];
      insertInOrder(ann, id);
    }
    if (role !== "unknown") r.ambiguity_reason = "";
  }
  dropEmptyOrders(ann);
  const note = role === "unknown" ? `${live.length} → unknown — U to give the reason` : `${live.length} region${live.length > 1 ? "s" : ""} → ${role}`;
  return { ann: tick(ann), move: {}, note };
}

export function setStream(ann0: BookAnn, ids: string[], stream: string | null): Result | null {
  const live = ids.filter((i) => ann0.regions[i] && !isStreamless(ann0.regions[i].role));
  if (!live.length) return null;
  const s = stream?.trim() ? stream.trim() : null;
  const ann = clone(ann0);
  for (const id of live) {
    ann.regions[id].stream_id = s;
    ann.regions[id].verified = true;
    insertInOrder(ann, id);
  }
  dropEmptyOrders(ann);
  return { ann: tick(ann), move: {}, note: `${live.length} → stream ${s ?? "none"}` };
}

/** L: the text in these regions is turned (see `BookRegion.rotation`). Setting the value
 *  every target already has clears it, as on a newspaper block. The box, role and
 *  review state are untouched: a rotation is a fact about the print, not a repair. */
export function setRotation(ann0: BookAnn, ids: string[], rotation: Rotation | null): Result | null {
  ids = [...new Set(ids)];
  if (!ids.length || ids.some((id) => !ann0.regions[id])) return null;
  const clear = rotation == null || ids.every((id) => ann0.regions[id].rotation === rotation);
  const ann = clone(ann0);
  for (const id of ids) {
    if (clear) delete ann.regions[id].rotation;
    else ann.regions[id].rotation = rotation;
  }
  const what = clear ? "rotation flag cleared" : rotation === 180 ? "flagged upside down (180°)" : `flagged rotated 90° ${rotation === 90 ? "clockwise" : "counter-clockwise"}`;
  return { ann: tick(ann), move: { sel: ids.length > 1 ? ids : null }, note: `${ids.length} region${ids.length > 1 ? "s" : ""} ${what}` };
}

/** Valid style marks, deduplicated, in `STYLE_TAGS` order; undefined when there are none. */
export function normStyle(tags: readonly unknown[] | undefined): StyleTag[] | undefined {
  const out = STYLE_TAGS.filter((t) => tags?.includes(t));
  return out.length ? [...out] : undefined;
}

export function hasStyle(r: Pick<BookRegion, "style_tags"> | undefined, tag: StyleTag): boolean {
  return !!r?.style_tags?.includes(tag);
}

/** ⇧1 bold, ⇧2 centred, ⇧3 spaced: a whole-box typographic mark, independent of the role
 *  and of the other two. Like a rotation it is a fact about the print, not a repair, so the
 *  box, role and review state are untouched. If every target already has the mark it is
 *  taken off them all; otherwise it is put on them all. */
export function toggleStyle(ann0: BookAnn, ids: string[], tag: StyleTag): Result | null {
  ids = [...new Set(ids)];
  if (!ids.length || ids.some((id) => !ann0.regions[id]) || !STYLE_TAGS.includes(tag)) return null;
  const off = ids.every((id) => hasStyle(ann0.regions[id], tag));
  const ann = clone(ann0);
  for (const id of ids) {
    const r = ann.regions[id];
    const next = normStyle(off ? (r.style_tags ?? []).filter((t) => t !== tag) : [...(r.style_tags ?? []), tag]);
    if (next) r.style_tags = next;
    else delete r.style_tags;
  }
  return { ann: tick(ann), move: { sel: ids.length > 1 ? ids : null }, note: `${ids.length} region${ids.length > 1 ? "s" : ""}: ${tag} ${off ? "off" : "on"}` };
}

export function accept(ann0: BookAnn, ids: string[]): Result | null {
  const live = ids.filter((i) => ann0.regions[i] && !ann0.regions[i].verified);
  if (!live.length) return null;
  const ann = clone(ann0);
  for (const id of live) ann.regions[id].verified = true;
  const w = walk(ann);
  const next = w.findIndex((x, i) => !ann.regions[x].verified && i > w.indexOf(live[live.length - 1]));
  const move: Move = { sel: null };
  if (next >= 0) move.cur = next;
  return { ann: tick(ann), move, note: `${live.length} accepted` };
}

export function acceptAll(ann0: BookAnn, stream?: string): Result | null {
  const ids = Object.values(ann0.regions)
    .filter((r) => !r.verified && (stream == null || r.stream_id === stream))
    .map((r) => r.id);
  if (!ids.length) return null;
  const res = accept(ann0, ids)!;
  return { ...res, note: `${ids.length} accepted${stream ? ` in ${stream}` : ""}` };
}

/** Field edits on one region. Each marks it verified: a human looked at it. */
export function setField(
  ann0: BookAnn,
  id: string,
  patch: Partial<Pick<BookRegion, "text_hint" | "basis" | "ambiguity_reason" | "subtype" | "responsum_id" | "responsum_boundary">> & { confidence?: BookConfidence },
): Result | null {
  if (!ann0.regions[id]) return null;
  const ann = clone(ann0);
  Object.assign(ann.regions[id], patch);
  ann.regions[id].verified = true;
  const k = Object.keys(patch)[0] ?? "field";
  return { ann: tick(ann), move: {}, note: `${id}: ${k} set` };
}

/* ── order ───────────────────────────────────────────────────────────────────────── */

export function reorder(ann0: BookAnn, id: string, dir: -1 | 1): Result | null {
  const pos = orderPos(ann0, id);
  if (!pos) return null;
  const j = pos.index + dir;
  if (j < 0 || j >= ann0.order[pos.stream].length) return null;
  const ann = clone(ann0);
  const list = ann.order[pos.stream];
  list.splice(j, 0, list.splice(pos.index, 1)[0]);
  return { ann: tick(ann), move: {}, note: `${id} moved ${dir < 0 ? "earlier" : "later"} in ${pos.stream}` };
}

/** Move a region to a given index of its stream — the members list's drag target. */
export function moveTo(ann0: BookAnn, id: string, index: number): Result | null {
  const pos = orderPos(ann0, id);
  if (!pos) return null;
  const ann = clone(ann0);
  const list = ann.order[pos.stream];
  list.splice(pos.index, 1);
  list.splice(Math.max(0, Math.min(list.length, index)), 0, id);
  return { ann: tick(ann), move: {}, note: `${id} placed at ${index + 1} in ${pos.stream}` };
}

/**
 * ⇧O: recompute a stream's order from the geometry. Members group by zone (a column's
 * parent), zones read top to bottom; inside a zone the right column reads before the
 * left and a spanning region comes where its top falls. Members outside every container
 * form their own group at their own y.
 */
export function autoOrder(ann0: BookAnn, stream: string): Result | null {
  const members = Object.values(ann0.regions).filter((r) => r.stream_id === stream);
  if (!members.length) return null;
  const ann = clone(ann0);
  const zoneOf = (r: BookRegion): { key: string; y: number } => {
    const c = ann.containers.find((x) => x.id === r.container_id);
    const z = c?.kind === "column" ? ann.containers.find((x) => x.id === c.parent_id) ?? c : c;
    return z ? { key: z.id, y: z.bbox[1] } : { key: `_${r.id}`, y: r.bbox[1] };
  };
  const groups = new Map<string, { y: number; items: BookRegion[] }>();
  for (const r of members) {
    const z = zoneOf(r);
    const g = groups.get(z.key) ?? { y: z.y, items: [] };
    g.items.push(r);
    groups.set(z.key, g);
  }
  const out: string[] = [];
  for (const g of [...groups.values()].sort((a, b) => a.y - b.y)) out.push(...bookReadingOrder(g.items));
  ann.order[stream] = out;
  return { ann: tick(ann), move: {}, note: `${stream} reordered from the geometry (${out.length})` };
}

/* ── containers ──────────────────────────────────────────────────────────────────── */

export function addContainer(ann0: BookAnn, kind: "zone" | "column", box: BBox): Result {
  const ann = clone(ann0);
  const bbox = box.map(Math.round) as BBox;
  let parent: string | null = null;
  if (kind === "column") {
    // The zone that contains most of the column; a column outside every zone gets one.
    const [cx, cy] = center(bbox);
    parent = ann.containers.find((c) => c.kind === "zone" && cx >= c.bbox[0] && cx <= c.bbox[2] && cy >= c.bbox[1] && cy <= c.bbox[3])?.id ?? null;
    if (!parent) {
      const zid = nextId(ann, "z");
      ann.containers.push({ id: zid, kind: "zone", bbox: [...bbox] as BBox, parent_id: null });
      parent = zid;
    }
  }
  const id = nextId(ann, kind === "zone" ? "z" : "c");
  ann.containers.push({ id, kind, bbox, parent_id: parent });
  for (const r of Object.values(ann.regions)) r.container_id = containerFor(ann, r.bbox);
  return { ann: tick(ann), move: {}, note: `${kind} ${id} drawn${parent ? ` in ${parent}` : ""}` };
}

export function setContainerBox(ann0: BookAnn, id: string, box: BBox): Result | null {
  if (!ann0.containers.some((c) => c.id === id)) return null;
  const ann = clone(ann0);
  const c = ann.containers.find((x) => x.id === id)!;
  c.bbox = box.map(Math.round) as BBox;
  for (const r of Object.values(ann.regions)) r.container_id = containerFor(ann, r.bbox);
  return { ann: tick(ann), move: {}, note: `${id} adjusted` };
}

export function deleteContainer(ann0: BookAnn, id: string): Result | null {
  if (!ann0.containers.some((c) => c.id === id)) return null;
  const ann = clone(ann0);
  const gone = new Set([id, ...ann.containers.filter((c) => c.parent_id === id).map((c) => c.id)]);
  ann.containers = ann.containers.filter((c) => !gone.has(c.id));
  for (const r of Object.values(ann.regions)) r.container_id = containerFor(ann, r.bbox);
  return { ann: tick(ann), move: {}, note: `${gone.size > 1 ? `${id} and its columns` : id} removed` };
}

/** Columns from the regions: a zone around everything in a stream and its two columns
 *  found at the gutter — a fast path for the common two-column page. */
export function autoColumns(ann0: BookAnn, stream = "main"): Result | null {
  const members = Object.values(ann0.regions).filter((r) => r.stream_id === stream);
  if (members.length < 2) return null;
  const zone = union(members.map((r) => r.bbox));
  const w = zone[2] - zone[0];
  const narrow = members.filter((r) => r.bbox[2] - r.bbox[0] < 0.6 * w);
  const right = narrow.filter((r) => (r.bbox[0] + r.bbox[2]) / 2 > (zone[0] + zone[2]) / 2);
  const left = narrow.filter((r) => (r.bbox[0] + r.bbox[2]) / 2 <= (zone[0] + zone[2]) / 2);
  const ann = clone(ann0);
  const zid = nextId(ann, "z");
  ann.containers.push({ id: zid, kind: "zone", bbox: zone, parent_id: null });
  if (right.length && left.length) {
    ann.containers.push({ id: nextId(ann, "c"), kind: "column", bbox: union(right.map((r) => r.bbox)), parent_id: zid });
    ann.containers.push({ id: nextId(ann, "c"), kind: "column", bbox: union(left.map((r) => r.bbox)), parent_id: zid });
  }
  for (const r of Object.values(ann.regions)) r.container_id = containerFor(ann, r.bbox);
  return { ann: tick(ann), move: {}, note: `zone ${zid} with ${right.length && left.length ? "two columns" : "one column"} from ${stream}` };
}

/* ── relations ───────────────────────────────────────────────────────────────────── */

export function addRelation(ann0: BookAnn, type: RelationType, from: string, to: string, basis: string): Result | null {
  if (from === to || !ann0.regions[from] || !ann0.regions[to]) return null;
  if (ann0.relations.some((x) => x.type === type && x.from === from && x.to === to)) return null;
  const ann = clone(ann0);
  ann.relations.push({ type, from, to, basis: basis.trim() || defaultBasis(type) });
  return { ann: tick(ann), move: {}, note: `${from} ${type} ${to}` };
}

function defaultBasis(type: RelationType): string {
  if (type === "heads") return "Visually separated heading introduces the following block in its stream.";
  if (type === "continues") return "Text continues across the column or zone boundary in reading order.";
  return "Auxiliary region comments on the target in the printed layout.";
}

export function removeRelation(ann0: BookAnn, index: number): Result | null {
  if (!ann0.relations[index]) return null;
  const ann = clone(ann0);
  const [x] = ann.relations.splice(index, 1);
  return { ann: tick(ann), move: {}, note: `removed ${x.from} ${x.type} ${x.to}` };
}

/* ── page and book level ─────────────────────────────────────────────────────────── */

export function setDateEvidence(ann0: BookAnn, patch: Partial<DateEvidence>): Result {
  const ann = clone(ann0);
  ann.date_evidence = { ...ann.date_evidence, ...patch };
  if (ann.date_evidence.region_id && !ann.regions[ann.date_evidence.region_id]) ann.date_evidence.region_id = null;
  return { ann: tick(ann), move: {}, note: "date evidence updated" };
}

export function setNotes(ann0: BookAnn, which: "layout_notes" | "uncertainties", lines: string[]): Result {
  const ann = clone(ann0);
  ann[which] = lines.map((l) => l.trim()).filter(Boolean);
  return { ann: tick(ann), move: {}, note: `${which.replace("_", " ")} updated` };
}

export function toggleTag(ann0: BookAnn, tag: string): Result {
  const ann = clone(ann0);
  ann.layout_tags = ann.layout_tags.includes(tag) ? ann.layout_tags.filter((t) => t !== tag) : [...ann.layout_tags, tag];
  return { ann: tick(ann), move: {}, note: `${tag}: ${ann.layout_tags.includes(tag) ? "on" : "off"}` };
}

export function setPresence(ann0: BookAnn, role: BookRole, p: Presence): Result {
  const ann = clone(ann0);
  ann.class_presence[role] = p;
  return { ann: tick(ann), move: {}, note: `${role}: ${p.replace("_", " ")}` };
}

/* ── proposals ───────────────────────────────────────────────────────────────────── */

export function loadProposal(ann0: BookAnn, proposal: NonNullable<BookBundle["proposal"]>): Result {
  const ann = clone(ann0);
  ann.mode = "proposal";
  ann.regions = {};
  ann.containers = proposal.containers.map((c) => ({ ...c, bbox: [...c.bbox] as BBox }));
  ann.order = {};
  ann.relations = [];
  ann.groups = [];
  for (const r of proposal.regions) {
    ann.regions[r.id] = { ...r, bbox: [...r.bbox] as BBox, source: "detector", verified: false };
    ann.regions[r.id].container_id = containerFor(ann, r.bbox);
  }
  for (const [s, ids] of Object.entries(proposal.order)) {
    const live = ids.filter((i) => ann.regions[i]?.stream_id === s);
    if (live.length) ann.order[s] = live;
  }
  for (const r of Object.values(ann.regions)) if (r.stream_id && !orderPos(ann, r.id)) insertInOrder(ann, r.id);
  ann.relations = proposal.relations.filter((x) => ann.regions[x.from] && ann.regions[x.to]);
  return {
    ann: tick(ann),
    move: { cur: 0, sel: null },
    note: "detector proposal loaded — dashed = unverified · A accepts, 1–9 retypes, X deletes",
  };
}

/** Add only suggestions that do not cover an existing human-edited region. This lets a
 * reviewer request help after beginning a page without losing their saved work. */
export function addProposalCandidates(ann0: BookAnn, proposal: NonNullable<BookBundle["proposal"]>): Result {
  const ann = clone(ann0);
  const area = (b: BBox) => (b[2] - b[0]) * (b[3] - b[1]);
  let added = 0;
  if (!ann.containers.length) ann.containers = proposal.containers.map((c) => ({ ...c, bbox: [...c.bbox] as BBox }));
  for (const suggestion of proposal.regions) {
    const overlaps = Object.values(ann.regions).some((existing) =>
      intersection(suggestion.bbox, existing.bbox) / Math.max(1, Math.min(area(suggestion.bbox), area(existing.bbox))) > 0.55);
    if (overlaps) continue;
    const id = ann.regions[suggestion.id] ? nextId(ann, "r") : suggestion.id;
    const region = { ...suggestion, id, bbox: [...suggestion.bbox] as BBox, source: "detector" as const, verified: false };
    region.container_id = containerFor(ann, region.bbox);
    ann.regions[id] = region;
    insertInOrder(ann, id);
    added += 1;
  }
  ann.mode = "proposal";
  ann.done = false;
  return { ann: tick(ann), move: {}, note: `${added} suggested boxes added; existing edits preserved · check the whole scan` };
}

export function dropProposal(ann0: BookAnn): Result {
  const ann = clone(ann0);
  ann.mode = "empty";
  ann.regions = {};
  ann.containers = [];
  ann.order = {};
  ann.relations = [];
  ann.groups = [];
  ann.date_evidence.region_id = null;
  return { ann: tick(ann), move: { cur: 0, sel: null }, note: "proposal dropped — starting empty" };
}

/* ── session ─────────────────────────────────────────────────────────────────────── */

/** ⇧L: turn the page on screen a quarter clockwise (0 → 90 → 180 → 270 → 0). */
export function turnView(ann0: BookAnn): Result {
  const ann = clone(ann0);
  const next = (((ann0.view_rotation ?? 0) + 90) % 360) as 0 | 90 | 180 | 270;
  if (next) ann.view_rotation = next;
  else delete ann.view_rotation;
  return { ann: tick(ann), move: {}, note: next ? `page shown turned ${next}° clockwise — ⇧L turns it on` : "page shown upright" };
}

export function markDone(ann0: BookAnn, done: boolean): Result {
  const ann = clone(ann0);
  ann.done = done;
  return { ann: tick(ann), move: {}, note: done ? "page marked done — ] for the next one" : "reopened" };
}

export function setFlag(ann0: BookAnn, flag: string | null): Result {
  const ann = clone(ann0);
  ann.flag = flag?.trim() ? flag.trim() : null;
  return { ann: tick(ann), move: {}, note: ann.flag ? `flagged: ${ann.flag}` : "flag cleared" };
}

/** Orders, relations and date evidence may only name regions that exist. */
export function sanitize(ann: BookAnn): BookAnn {
  ann.cuts ??= [];
  const has = (id: string | null | undefined): id is string => id != null && !!ann.regions[id];
  for (const s of Object.keys(ann.order)) ann.order[s] = ann.order[s].filter(has);
  dropEmptyOrders(ann);
  ann.relations = ann.relations.filter((x) => has(x.from) && has(x.to));
  ann.groups ??= [];
  tidyGroups(ann);
  for (const g of ann.groups) if (typeof g.colorHue !== "number") g.colorHue = nextGroupHue(ann.groups.filter((o) => o !== g && typeof o.colorHue === "number"));
  if (!has(ann.date_evidence.region_id)) ann.date_evidence.region_id = null;
  for (const r of Object.values(ann.regions)) if (r.container_id && !ann.containers.some((c) => c.id === r.container_id)) r.container_id = null;
  ann.class_presence = { ...emptyPresence(), ...ann.class_presence };
  if (!ann.layout_tags) ann.layout_tags = [];
  // Style marks: keep the valid ones, once each, in order. A session saved before they
  // existed has none and is returned as it was.
  for (const r of Object.values(ann.regions)) {
    if (r.style_tags === undefined) continue;
    const t = normStyle(Array.isArray(r.style_tags) ? r.style_tags : []);
    if (t) r.style_tags = t;
    else delete r.style_tags;
  }
  return ann;
}

/** Confirm the geometry a region has after a drag: the box must contain something. */
export function validBox(b: BBox): boolean {
  return b[2] - b[0] >= 3 && b[3] - b[1] >= 3;
}

export { contains };
