// Every colour and reusable style object, transcribed from `Sectioner.dc.html`
// (Claude Design project 6cb35020-9fb8-4317-a7fb-3a5b940d96ae). Nothing here is
// invented; check a change against the design before making one.
//
// The fonts are the design's, with local fallbacks in the stack instead of a Google
// Fonts link: the brief requires the tool to run fully offline.

import type { CSSProperties } from "react";
import type { BookRole, NewsType } from "./types";

export const C = {
  /** The shell behind everything. */
  bg: "#efece5",
  /** Top and bottom bars, the export dialog. */
  bar: "#fbfaf7",
  /** Side panels. */
  panel: "#f7f5f0",
  /** The canvas well the scan floats in. */
  well: "#e7e3da",
  /** The tool rail. */
  rail: "#f2efe8",
  ink: "#211e19",
  inkSoft: "#2b2721",
  text: "#3a352e",
  text2: "#56504a",
  muted: "#7a736a",
  muted2: "#8a8377",
  faint: "#a09889",
  border: "#d9d3c7",
  borderSoft: "#e0dad0",
  borderFaint: "#e4ded2",
  borderPale: "#ece7de",
  borderOn: "#b3aa9b",
  borderRow: "#c2b9a8",
  borderKey: "#ded8cd",
  chip: "#eae5da",
  track: "#e4ded2",
  bar2: "#cfc7b8",
  dark: "#3a352e",
  onDark: "#fbfaf7",
  link: "oklch(0.52 0.11 250)",
  linkHover: "oklch(0.44 0.13 250)",
  focus: "oklch(0.52 0.16 250)",
  /** An unassigned block — amber, pulsing. */
  un: "oklch(0.70 0.16 72)",
  unBg: "oklch(0.95 0.05 75)",
  unInk: "oklch(0.42 0.12 55)",
  ok: "oklch(0.60 0.12 150)",
  okBg: "oklch(0.95 0.04 150)",
  okInk: "oklch(0.38 0.09 150)",
  okBorder: "oklch(0.72 0.10 150)",
  cut: "oklch(0.55 0.20 25)",
  cutInk: "oklch(0.50 0.18 25)",
  line: "oklch(0.55 0.13 250 / 0.55)",
  lineBg: "oklch(0.55 0.13 250 / 0.06)",
  splitBg: "oklch(0.96 0.03 75)",
  splitInk: "oklch(0.45 0.11 55)",
  flagBg: "oklch(0.93 0.05 75)",
  flagInk: "oklch(0.42 0.11 55)",
  warnBg: "oklch(0.94 0.05 60)",
  warnInk: "oklch(0.42 0.12 50)",
  warnBorder: "oklch(0.85 0.08 65)",
} as const;

export const SANS = "'IBM Plex Sans', 'Segoe UI', 'Helvetica Neue', Helvetica, Arial, sans-serif";
export const MONO = "'IBM Plex Mono', Consolas, 'Cascadia Mono', Menlo, monospace";
/** Hebrew serif for page text. `David` is the Windows fallback that ships with the OS. */
export const SERIF = "'Frank Ruhl Libre', 'David', 'Times New Roman', serif";

/** Hue and chroma per section type — `tcol(type, alpha)` mixes the swatch. */
export const NEWS_HUE: Record<NewsType, [number, number]> = {
  ARTICLE: [250, 0.12],
  ADVERTISEMENT: [45, 0.15],
  MASTHEAD: [305, 0.12],
  RUNNING_HEAD: [195, 0.09],
  SECTION: [150, 0.11],
  TABLE_OF_CONTENTS: [100, 0.09],
  IMPRINT: [330, 0.08],
  ILLUSTRATION: [215, 0.07],
  NOISE: [60, 0.02],
  PUBLICATION_INFO: [175, 0.09],
};

export const NEWS_SHORT: Record<NewsType, string> = {
  ARTICLE: "ART",
  ADVERTISEMENT: "AD",
  MASTHEAD: "Name / logo",
  RUNNING_HEAD: "Page header",
  SECTION: "DEPT",
  TABLE_OF_CONTENTS: "TOC",
  IMPRINT: "IMPR",
  ILLUSTRATION: "ILLU",
  NOISE: "NOISE",
  PUBLICATION_INFO: "Publication info",
};

export function tcol(t: NewsType, alpha?: number): string {
  const [h, c] = NEWS_HUE[t] ?? NEWS_HUE.ARTICLE;
  return `oklch(0.60 ${c} ${h}${alpha == null ? "" : ` / ${alpha}`})`;
}
export function tink(t: NewsType): string {
  return `oklch(0.36 0.06 ${(NEWS_HUE[t] ?? NEWS_HUE.ARTICLE)[0]})`;
}
export function tinkDeep(t: NewsType): string {
  return `oklch(0.35 0.06 ${(NEWS_HUE[t] ?? NEWS_HUE.ARTICLE)[0]})`;
}

/** The book roles on the same scale: the three text streams get the three strongest
 *  hues, furniture sits lower in chroma, a separator is grey and unknown is amber. */
export const BOOK_HUE: Record<BookRole, [number, number]> = {
  main_text: [250, 0.12],
  title: [305, 0.13],
  subtitle: [325, 0.10],
  commentary: [150, 0.12],
  footnote: [45, 0.14],
  running_header: [195, 0.09],
  page_number: [215, 0.07],
  separator: [60, 0.02],
  unknown: [72, 0.16],
  auxiliary_text: [150, 0.10],
  signature: [15, 0.12],
  page_footer: [215, 0.07],
  summary: [280, 0.11],
  date: [345, 0.12],
  table: [110, 0.10],
  noise: [30, 0.03],
  figure: [170, 0.09],
};

export const BOOK_SHORT: Record<BookRole, string> = {
  main_text: "MAIN",
  title: "TITLE",
  subtitle: "SUBT",
  commentary: "COMM",
  footnote: "NOTE",
  running_header: "HEAD",
  page_number: "PAGE#",
  separator: "RULE",
  unknown: "?",
  auxiliary_text: "AUX",
  signature: "SIGN",
  page_footer: "FOOT",
  summary: "SUM",
  date: "DATE",
  table: "TABLE",
  noise: "NOISE",
  figure: "FIG",
};

export function rcol(r: BookRole, alpha?: number): string {
  const [h, c] = BOOK_HUE[r] ?? BOOK_HUE.unknown;
  return `oklch(0.60 ${c} ${h}${alpha == null ? "" : ` / ${alpha}`})`;
}
export function rink(r: BookRole): string {
  return `oklch(0.36 0.06 ${(BOOK_HUE[r] ?? BOOK_HUE.unknown)[0]})`;
}

/* ── style factories ─────────────────────────────────────────────────────────────── */

/** A small toggle button: dark when on. */
export function btn(on: boolean, extra?: CSSProperties): CSSProperties {
  return {
    height: 22,
    padding: "0 8px",
    borderRadius: 4,
    cursor: "pointer",
    fontFamily: "inherit",
    fontSize: 10.5,
    border: `1px solid ${on ? C.dark : C.border}`,
    background: on ? C.dark : "#fff",
    color: on ? C.onDark : C.text2,
    whiteSpace: "nowrap",
    ...extra,
  };
}

/** A small-caps panel label. */
export const label: CSSProperties = {
  fontSize: 10,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: C.muted2,
};

export const mono: CSSProperties = { fontFamily: MONO };

/** A compact key cap in the Keys panel. */
export const keyCap: CSSProperties = {
  fontFamily: MONO,
  fontSize: 10,
  color: C.text,
  background: "#fff",
  border: `1px solid ${C.borderKey}`,
  borderRadius: 3,
  padding: "1px 4px",
  minWidth: 58,
  textAlign: "center",
};

export const panelSection: CSSProperties = {
  padding: 10,
  borderBottom: `1px solid ${C.borderSoft}`,
};

/** A small tag chip: `flag` amber, `chip` neutral. */
export function tag(kind: "flag" | "chip" | "ok" | "warn"): CSSProperties {
  const base: CSSProperties = { fontSize: 9.5, padding: "1px 5px", borderRadius: 3, fontFamily: MONO, whiteSpace: "nowrap" };
  if (kind === "flag") return { ...base, background: C.flagBg, color: C.flagInk };
  if (kind === "ok") return { ...base, background: C.okBg, color: C.okInk };
  if (kind === "warn") return { ...base, background: C.warnBg, color: C.warnInk };
  return { ...base, background: C.chip, color: C.text2 };
}

/** RTL text box for page text. */
export const hebrewBox: CSSProperties = {
  fontFamily: SERIF,
  fontSize: 14,
  lineHeight: 1.5,
  color: C.inkSoft,
  background: "#fff",
  border: `1px solid ${C.borderSoft}`,
  borderRadius: 4,
  padding: "6px 8px",
  whiteSpace: "pre-wrap",
  overflow: "auto",
};

/** A text input that matches the panels. Every input hands focus back to the shell on
 *  Escape and Enter, so the keyboard never gets lost in it. */
export const input: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  fontFamily: "inherit",
  fontSize: 11,
  padding: "3px 6px",
  border: `1px solid ${C.border}`,
  borderRadius: 4,
  background: "#fff",
  color: C.ink,
};
