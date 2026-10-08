// Every colour and every reusable style object, copied from the design file.
//
// Nothing here is invented. `TEI Annotation Workbench.dc.html` decides the palette, the
// five style factories and the twelve swatches; this file is where they are transcribed so
// that no component ever types a hex literal. Check a change against the design before
// making one — /ocr-comparison was built under the same rule and its transcription is
// still diffable against its source.

import type { Style } from "./types";

/* ── the warm-paper palette ────────────────────────────────────────────────────────── */

export const C = {
  /** The reader's page. */
  paper: "#f6f2ea",
  /** Chrome behind the panels — one step darker than the page. */
  chrome: "#f1ece2",
  /** Panel rows, alternating with `paper`. */
  paperLit: "#faf8f2",
  /** The active row in a list. */
  rowActive: "#f8f5ee",
  /** A pressed control, and the open row in the tag track. */
  fill: "#e6dcc2",
  fillSoft: "#ece6da",
  /** Body text. */
  ink: "#23201b",
  inkSoft: "#2b2721",
  /** Headings. */
  head: "#3a352d",
  /** Secondary text. */
  muted: "#6d6559",
  muted2: "#7d7466",
  muted3: "#8b8275",
  /** Tertiary text — counts, paths, hints. */
  faint: "#a89f92",
  faint2: "#a29885",
  /** A control that is off, and an empty progress bar. */
  dim: "#cfc5b0",
  dim2: "#b3a893",
  dim3: "#c2b8a4",
  /** Borders, lightest to heaviest. */
  line: "#e9e2d4",
  lineSoft: "#eee7db",
  lineSoft2: "#efe9dd",
  lineMid: "#e0d8c8",
  lineWarm: "#e6dfd1",
  border: "#d8cfbd",
  borderOn: "#bcae8c",
  borderKey: "#d3c9b5",
  keyBg: "#e4ddce",
  /** Accepted, and a section declared done. */
  accept: "#3f6b2c",
  /** Rejected, and the uncertain flag. */
  reject: "#a4452a",
  /** A machine proposal, everywhere it appears. */
  propose: "#7a5a2a",
  proposeLine: "#c9ae7d",
  rejectLine: "#d9bdb3",
  /** The floating selection menu — the one dark surface in the app. */
  menuBg: "#23201b",
  menuInk: "#f2ece0",
} as const;

/**
 * The twelve tag colours, which are also the swatches offered in the tag-set editor.
 * Order is the design's and is user-visible.
 */
export const SWATCHES = [
  "#8a6a1f",
  "#2f6b58",
  "#2c5d86",
  "#8f3f55",
  "#5a4a86",
  "#9a6a24",
  "#3f6b2c",
  "#a4452a",
  "#4a6b7a",
  "#6b5a3c",
  "#9a9086",
  "#4a4a4a",
] as const;

/* ── typefaces ─────────────────────────────────────────────────────────────────────── */

/**
 * The three families, as CSS `font-family` values.
 *
 * `page.tsx` binds these names to local font stacks (the app runs offline), so the literal
 * family names the design uses keep working.
 */
export const F = {
  serif: "'Frank Ruhl Libre',serif",
  sans: "'IBM Plex Sans',system-ui,sans-serif",
  mono: "'IBM Plex Mono',monospace",
} as const;

/**
 * A run of Latin text — an id, an offset, a path — inside an otherwise RTL context.
 * Without the isolate, a `chars 12–48` next to Hebrew reorders on screen and reads wrong.
 */
export const LTR: Style = { direction: "ltr", unicodeBidi: "isolate" };

/** The documents' direction, set once on the workbench root as `--tei-dir` (rtl or ltr). */
export const DIR = "var(--tei-dir, rtl)" as Style["direction"];

/* ── the five style factories ──────────────────────────────────────────────────────── */

/** A bordered button. `on` is the pressed state. */
export function btn(on: boolean, extra?: Style): Style {
  return {
    border: "1px solid " + (on ? C.borderOn : C.border),
    background: on ? C.fill : C.paper,
    color: on ? C.head : C.muted,
    borderRadius: "3px",
    padding: "2px 8px",
    cursor: "pointer",
    fontSize: "11px",
    whiteSpace: "nowrap",
    ...extra,
  };
}

/** A borderless toolbar tab. */
export function tab(on: boolean): Style {
  return {
    border: 0,
    background: on ? C.paper : "transparent",
    color: on ? C.ink : C.muted,
    borderRadius: "2px",
    padding: "3px 8px",
    cursor: "pointer",
    fontSize: "11px",
    fontWeight: on ? 600 : 400,
    whiteSpace: "nowrap",
    display: "flex",
    alignItems: "center",
  };
}

/** One of the four side-panel tabs, underlined when active. */
export function sideTab(on: boolean): Style {
  return {
    flex: 1,
    border: 0,
    borderBottom: "2px solid " + (on ? SWATCHES[0] : "transparent"),
    background: on ? C.chrome : "transparent",
    color: on ? C.ink : C.muted2,
    cursor: "pointer",
    padding: "6px 4px",
    fontSize: "10px",
    fontWeight: on ? 600 : 400,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "2px",
    whiteSpace: "nowrap",
  };
}

/** The little keycap shown beside a command. */
export function keyBadge(): Style {
  return {
    fontFamily: F.mono,
    fontSize: "10px",
    background: C.keyBg,
    border: "1px solid " + C.borderKey,
    borderRadius: "2px",
    padding: "0 5px",
    color: "#5c5348",
    minWidth: "16px",
    textAlign: "center",
    display: "inline-block",
  };
}

/**
 * The date/place presence chip in the section navigator. `ok` is "this section has one",
 * and the colour is the tag's own — so the chip and the mark in the text agree.
 */
export function chip(ok: boolean, color: string): Style {
  return {
    display: "inline-flex",
    alignItems: "center",
    padding: "1px 3px",
    borderRadius: "2px",
    border: "1px solid " + (ok ? color + "77" : C.lineMid),
    color: ok ? color : C.dim,
    background: ok ? color + "14" : "transparent",
  };
}
