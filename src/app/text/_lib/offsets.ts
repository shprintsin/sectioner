// Selection arithmetic. Pure — no DOM, no state, no `window`.
//
// The browser hands us two anchors, each a (piece, offset-into-that-piece) pair, plus a
// viewport rectangle. `domSelection.ts` reads exactly that and hands it here as plain
// data; everything after — ordering, word snapping, cross-section rejection, menu
// placement — happens in this file, where jsdom's lack of layout cannot reach it.
//
// The one hazard worth naming: **a gershayim written `''` is two characters.** Every
// offset here is a JS string index, so nothing may assume otherwise. The corpus and seed
// suites assert this from the other side.

import type { Sel, SelRect, TagDef } from "./types";

/**
 * What counts as inside a word when a selection is snapped outward.
 *
 * Hebrew letters, the geresh and gershayim in **both** their forms — the Unicode `׳`/`״`
 * and the ASCII `'`/`"` this project's own corpora use — plus Latin and digits. Dropping
 * the ASCII pair would cut `תרנ''ה` in half at the apostrophes, which is exactly the class
 * of bug `coding_scheme.GERSH` exists upstream to prevent.
 */
export const WORD_CHAR = /[֐-׿'"׳״A-Za-z0-9]/;

/** The raw anchors a DOM selection yields, before any arithmetic. */
export interface RawAnchors {
  /** `doc_id` of the piece the selection started in. */
  docA: string;
  /** Absolute offset of that piece, plus the offset within it. */
  offA: number;
  docB: string;
  offB: number;
  /** The selection's viewport rect, or null when the browser would not give one. */
  rect: SelRect | null;
}

export type SelResult =
  | { ok: true; sel: Sel; rect: SelRect | null }
  | { ok: false; reason: "collapsed" | "cross-section" };

/**
 * Grow `[start, end)` outward to whole words.
 *
 * Selecting by dragging is imprecise, and a span that begins mid-word is almost never
 * what was meant — but Alt suppresses this, because sometimes it is.
 */
export function snapToWord(text: string, start: number, end: number): [number, number] {
  let s = start;
  let e = end;
  while (s > 0 && WORD_CHAR.test(text[s - 1])) s--;
  while (e < text.length && WORD_CHAR.test(text[e])) e++;
  return [s, e];
}

/**
 * Turn raw anchors into a selection, or say why there is none.
 *
 * A backwards drag is ordered here rather than being rejected; a drag across two sections
 * is rejected outright, because a span that crossed a document boundary could not be
 * exported as TEI or joined to anything.
 */
export function rangeFromAnchors(
  raw: RawAnchors,
  text: string,
  snap: boolean,
): SelResult {
  if (raw.docA !== raw.docB) return { ok: false, reason: "cross-section" };
  let start = Math.min(raw.offA, raw.offB);
  let end = Math.max(raw.offA, raw.offB);
  if (start === end) return { ok: false, reason: "collapsed" };
  if (snap) [start, end] = snapToWord(text, start, end);
  return { ok: true, sel: { doc: raw.docA, start, end }, rect: raw.rect };
}

/**
 * Move a span's end by one word. `dir` is +1 to grow, -1 to shrink.
 *
 * Returns the new end, or null when the move would leave nothing — a span is never
 * allowed to collapse onto its own start.
 */
export function stepEnd(text: string, start: number, end: number, dir: 1 | -1): number | null {
  let e = end;
  if (dir === 1) {
    while (e < text.length && /\s/.test(text[e])) e++;
    while (e < text.length && !/\s/.test(text[e])) e++;
  } else {
    while (e > start && /\s/.test(text[e - 1])) e--;
    while (e > start && !/\s/.test(text[e - 1])) e--;
  }
  return e <= start ? null : e;
}

/* ── the floating selection menu ───────────────────────────────────────────────────── */

/**
 * Half the menu's width, estimated from its labels.
 *
 * An estimate rather than a measurement on purpose: the menu is positioned in the same
 * frame it appears in, so there is nothing to measure yet, and a measure-then-move would
 * be visible as a jump. 6.4px per character is the design's figure for 11px IBM Plex Sans.
 */
export function menuHalfWidth(popular: TagDef[], viewportWidth: number): number {
  const items = popular.reduce((n, t) => n + t.en.length * 6.4 + 40, 0);
  return Math.min(viewportWidth / 2 - 8, (items + 104) / 2);
}

/**
 * Where to put the menu: centred over the selection, clamped inside the viewport, and
 * never above the toolbar. It is rendered `translate(-50%,-100%)`, so this is its bottom
 * centre.
 */
export function menuPosition(
  rect: SelRect,
  half: number,
  viewportWidth: number,
): { x: number; y: number } {
  return {
    x: Math.max(half + 8, Math.min(viewportWidth - half - 8, rect.left + rect.width / 2)),
    y: Math.max(66, rect.top - 8),
  };
}
