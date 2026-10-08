// Rectangle arithmetic and the reading-order rule. Pure; tested in geometry.test.ts.

import type { BBox } from "./types";

export const R = (n: number): number => Math.round(n);

export function roundBox(b: readonly number[]): BBox {
  return [R(b[0]), R(b[1]), R(b[2]), R(b[3])];
}

/** The smallest rectangle containing every box. */
export function union(boxes: readonly BBox[]): BBox {
  if (!boxes.length) return [0, 0, 0, 0];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const b of boxes) {
    if (b[0] < x0) x0 = b[0];
    if (b[1] < y0) y0 = b[1];
    if (b[2] > x1) x1 = b[2];
    if (b[3] > y1) y1 = b[3];
  }
  return [x0, y0, x1, y1];
}

export function area(b: BBox): number {
  return Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);
}

export function intersection(a: BBox, b: BBox): number {
  const ox = Math.min(a[2], b[2]) - Math.max(a[0], b[0]);
  const oy = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
  return ox > 0 && oy > 0 ? ox * oy : 0;
}

/** The share of `b` covered by `box` — the lasso test: a block counts as inside when
 *  more than `min` of it is. */
export function coveredShare(b: BBox, box: BBox): number {
  const a = area(b);
  return a ? intersection(b, box) / a : 0;
}

export function iou(a: BBox, b: BBox): number {
  const i = intersection(a, b);
  const u = area(a) + area(b) - i;
  return u ? i / u : 0;
}

export function contains(outer: BBox, inner: BBox): boolean {
  return inner[0] >= outer[0] && inner[1] >= outer[1] && inner[2] <= outer[2] && inner[3] <= outer[3];
}

export function center(b: BBox): [number, number] {
  return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
}

/** Normalise a dragged rectangle so x0<x1, y0<y1. */
export function normBox(x0: number, y0: number, x1: number, y1: number): BBox {
  return [Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1)];
}

/** Which way a cut runs: "h" is a horizontal line (top / bottom halves), "v" a vertical
 *  one (left / right halves) — the two separators of a table editor. */
export type Axis = "h" | "v";

/**
 * Cut a box in two at page coordinate `at`. Returns the halves in geometric order (top
 * then bottom, left then right), or null when the cut falls outside the box or would
 * leave a half thinner than `min`. The halves tile the original exactly: no pixel is
 * lost and none is invented.
 */
export function cutBox(b: BBox, at: number, axis: Axis, min = 2): [BBox, BBox] | null {
  const cut = Math.round(at);
  const [lo, hi] = axis === "h" ? [b[1], b[3]] : [b[0], b[2]];
  if (!Number.isFinite(cut) || cut - lo < min || hi - cut < min) return null;
  return axis === "h"
    ? [[b[0], b[1], b[2], cut], [b[0], cut, b[2], b[3]]]
    : [[b[0], b[1], cut, b[3]], [cut, b[1], b[2], b[3]]];
}

export function clampBox(b: BBox, w: number, h: number): BBox {
  return [
    Math.max(0, Math.min(w, b[0])),
    Math.max(0, Math.min(h, b[1])),
    Math.max(0, Math.min(w, b[2])),
    Math.max(0, Math.min(h, b[3])),
  ];
}

/**
 * Which column a box sits in, given the column rules `bounds` (x positions, left to
 * right, first and last being the page edges). A box wider than `wideShare` of the page
 * is a spanning element and gets column 999 so it sorts before everything.
 */
export function columnOf(b: BBox, bounds: readonly number[], pageW: number, wideShare = 0.45): number {
  const cx = (b[0] + b[2]) / 2;
  if (b[2] - b[0] > wideShare * pageW) return 999;
  for (let i = 0; i < bounds.length - 1; i++) if (cx >= bounds[i] && cx < bounds[i + 1]) return i;
  return cx < bounds[0] ? 0 : Math.max(0, bounds.length - 2);
}

/**
 * Right-to-left, column-major reading order: rightmost column first, top to bottom
 * inside a column, and for equal tops the box further right first. Spanning boxes
 * (column 999) lead. `items` carry their own id so the caller decides what is content.
 */
export function readingOrder<T extends { id: number | string; bbox: BBox }>(
  items: readonly T[],
  bounds: readonly number[],
  pageW: number,
): T["id"][] {
  return items
    .map((b) => ({ id: b.id, c: columnOf(b.bbox, bounds, pageW), y: b.bbox[1], x: b.bbox[0] }))
    .sort((a, b) => b.c - a.c || a.y - b.y || b.x - a.x)
    .map((o) => o.id);
}

/**
 * Reading order inside one container for a Hebrew book page: the gutter is found from
 * the boxes themselves (the widest vertical gap crossed by no box), the right column
 * reads first, then the left; a box spanning the gutter comes where its top falls, in
 * the right column's sequence.
 */
export function bookReadingOrder<T extends { id: string; bbox: BBox }>(items: readonly T[]): string[] {
  if (items.length < 2) return items.map((b) => b.id);
  const x0 = Math.min(...items.map((b) => b.bbox[0]));
  const x1 = Math.max(...items.map((b) => b.bbox[2]));
  const width = x1 - x0;
  // Candidate gutter: the largest x-interval inside the middle 60% of the span that no
  // box narrower than 60% of the span crosses.
  const narrow = items.filter((b) => b.bbox[2] - b.bbox[0] < 0.6 * width);
  const edges = narrow.flatMap((b) => [b.bbox[0], b.bbox[2]]).sort((a, b) => a - b);
  let best: [number, number] | null = null;
  for (let i = 0; i < edges.length - 1; i++) {
    const lo = edges[i], hi = edges[i + 1];
    if (hi - lo < 0.02 * width) continue;
    const mid = (lo + hi) / 2;
    if (mid < x0 + 0.2 * width || mid > x1 - 0.2 * width) continue;
    if (narrow.some((b) => b.bbox[0] < mid && b.bbox[2] > mid)) continue;
    if (!best || hi - lo > best[1] - best[0]) best = [lo, hi];
  }
  const gutter = best ? (best[0] + best[1]) / 2 : null;
  const col = (b: T): number => {
    if (gutter == null) return 1;
    if (b.bbox[2] - b.bbox[0] >= 0.6 * width) return 1; // spanning: reads with the right column
    return (b.bbox[0] + b.bbox[2]) / 2 > gutter ? 1 : 0;
  };
  return items
    .map((b) => ({ id: b.id, c: col(b), y: b.bbox[1], x: b.bbox[0] }))
    .sort((a, b) => b.c - a.c || a.y - b.y || b.x - a.x)
    .map((o) => o.id);
}

/** Pixel box → the canonical 0–1000 grid, rounded to 5 decimals like the detector. */
export function toGrid(b: BBox, w: number, h: number): BBox {
  const f = (v: number, d: number) => Math.round((v / d) * 1000 * 1e5) / 1e5;
  return [f(b[0], w), f(b[1], h), f(b[2], w), f(b[3], h)];
}

export function fromGrid(b: readonly number[], w: number, h: number): BBox {
  return [(b[0] / 1000) * w, (b[1] / 1000) * h, (b[2] / 1000) * w, (b[3] / 1000) * h];
}

/** How far the page is turned on screen, clockwise, for reading a sideways page. The
 *  view only: every stored coordinate stays in the page's own frame. */
export type ViewRotation = 0 | 90 | 180 | 270;

/** The on-screen size of a W x H page turned `rot` degrees (unscaled). */
export function viewSize(w: number, h: number, rot: ViewRotation): [number, number] {
  return rot === 90 || rot === 270 ? [h, w] : [w, h];
}

/** A page point to the turned view (both unscaled). */
export function pageToView(x: number, y: number, rot: ViewRotation, w: number, h: number): [number, number] {
  if (rot === 90) return [h - y, x];
  if (rot === 180) return [w - x, h - y];
  if (rot === 270) return [y, w - x];
  return [x, y];
}

/** The inverse of `pageToView`: a point on the turned view back to the page. */
export function viewToPage(vx: number, vy: number, rot: ViewRotation, w: number, h: number): [number, number] {
  if (rot === 90) return [vy, h - vx];
  if (rot === 180) return [w - vx, h - vy];
  if (rot === 270) return [w - vy, vx];
  return [vx, vy];
}

/** The CSS transform (origin top-left) that turns a page layer of scaled size sw x sh
 *  onto the view exactly as `pageToView` maps its points. */
export function viewTransform(rot: ViewRotation, sw: number, sh: number): string | undefined {
  if (rot === 90) return `translate(${sh}px, 0) rotate(90deg)`;
  if (rot === 180) return `translate(${sw}px, ${sh}px) rotate(180deg)`;
  if (rot === 270) return `translate(0, ${sw}px) rotate(270deg)`;
  return undefined;
}

/* ── acts on a turned view ─────────────────────────────────────────────────────────
 * The canvas turns only the picture. Every pointer point goes through `viewToPage`, so a
 * drawn, moved, resized or marquee box is already in the page's frame; what is *not* a
 * point — a keyboard step, the axis of a cut — is a direction on screen and is mapped
 * here, so each act lands on the page where the reviewer sees it land. */

/** A step on screen (dx right, dy down) as a step on the page turned `rot`. */
export function screenDeltaToPage(dx: number, dy: number, rot: ViewRotation): [number, number] {
  // the linear part of `viewToPage`; `+ 0` keeps -0 out of the results
  if (rot === 90) return [dy + 0, -dx + 0];
  if (rot === 180) return [-dx + 0, -dy + 0];
  if (rot === 270) return [-dy + 0, dx + 0];
  return [dx, dy];
}

/** The page axis of a line that runs `shown` on screen ("h" across, "v" down). */
export function pageAxis(shown: Axis, rot: ViewRotation): Axis {
  return rot === 90 || rot === 270 ? (shown === "h" ? "v" : "h") : shown;
}

/** A box dragged by a page-frame delta. */
export function shiftBox(b: BBox, dx: number, dy: number): BBox {
  return [b[0] + dx, b[1] + dy, b[2] + dx, b[3] + dy].map(Math.round) as BBox;
}

/** A box resized by dragging the handle on `edges` (page-frame n/s/e/w) by a page delta. */
export function resizeBox(b: BBox, edges: string, dx: number, dy: number): BBox {
  const out: BBox = [...b] as BBox;
  if (edges.includes("w")) out[0] = Math.min(b[2] - 2, b[0] + dx);
  if (edges.includes("e")) out[2] = Math.max(b[0] + 2, b[2] + dx);
  if (edges.includes("n")) out[1] = Math.min(b[3] - 2, b[1] + dy);
  if (edges.includes("s")) out[3] = Math.max(b[1] + 2, b[3] + dy);
  return out.map(Math.round) as BBox;
}

/** The resize cursor a page-frame handle shows once the page is turned `rot`. */
export function handleCursor(edges: string, rot: ViewRotation): string {
  const diag = edges.length === 2;
  const quarter = rot === 90 || rot === 270;
  if (diag) {
    const nwse = edges === "nw" || edges === "se";
    return nwse !== quarter ? "nwse-resize" : "nesw-resize";
  }
  const vertical = edges === "n" || edges === "s";
  return vertical !== quarter ? "ns-resize" : "ew-resize";
}

/** S draws its line across the screen, so on a quarter-turned page it cuts the page's x.
 *  ↑↓ move the line by a screen step; the new page coordinate stays 2 px inside the box. */
export function moveSplit(b: BBox, at: number, axis: Axis, screenDy: number, rot: ViewRotation): number {
  const [dx, dy] = screenDeltaToPage(0, screenDy, rot);
  const d = axis === "v" ? dx : dy;
  const lo = axis === "v" ? b[0] : b[1];
  const hi = axis === "v" ? b[2] : b[3];
  return Math.min(hi - 2, Math.max(lo + 2, at + d));
}
