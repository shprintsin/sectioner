import type { CSSProperties, ReactNode } from "react";
import type { NewsType } from "../_lib/types";

export type NewsVisualKind = NewsType | "S" | "H1" | "H2" | "author" | "footnote" | "divider" | "rot90" | "rot270" | "rot180" | "flag" | "center";
export type HeadingLevel = "S" | "H1" | "H2";

/** Type is encoded by shape; article membership keeps its existing color. */
export function typeFrame(type: NewsType, ink: string): CSSProperties {
  const frame = (borderWidth: string | number, borderRadius = 0, borderStyle = "solid"): CSSProperties => ({ borderWidth, borderRadius, borderStyle, borderColor: ink });
  switch (type) {
    case "ADVERTISEMENT": return frame(2, 6);
    case "MASTHEAD": return frame(3, 0, "double");
    case "RUNNING_HEAD": return frame("3px 1px");
    case "SECTION": return frame("1px 3px");
    case "TABLE_OF_CONTENTS": return frame(1.5);
    case "IMPRINT": return frame("1px 1px 3px");
    case "ILLUSTRATION": return frame(2);
    case "NOISE": return { ...frame(1, 0, "dotted"), borderColor: "#666" };
    case "PUBLICATION_INFO": return frame(1.5, 4);
    default: return {};
  }
}

/** One fixed colour per heading level, outside the article palette's range (that palette
 *  is mid-dark, 36% lightness): black, a bright magenta, a bright orange. The level is
 *  read from the colour and the pattern; the article from the side borders. */
export const HEADING_INK: Record<HeadingLevel, string> = { S: "#111", H1: "oklch(0.58 0.24 350)", H2: "oklch(0.70 0.19 55)" };

/** Headings are ruled above and below, like a printed rule, in their level's colour:
 *  the section title (§, a department heading above the articles) heavy black double
 *  rules, H1 magenta double rules, H2 orange dashed rules. The left and right sides stay
 *  a thin line in the article's colour, so membership is still visible. */
export function headingFrame(level: HeadingLevel, ink: string): CSSProperties {
  const [width, style] = level === "S" ? [7, "double"] : level === "H1" ? [5, "double"] : [3, "dashed"];
  return { borderWidth: `${width}px 1.5px`, borderStyle: `${style} solid`, borderColor: `${HEADING_INK[level]} ${ink}` };
}

/** One fixed colour per block tag, like the heading levels: the tag is read from the
 *  colour, the pattern and the icon; the article from the fill and the untagged sides. */
export const ROLE_INK = {
  byline: "oklch(0.55 0.13 195)",
  toc_list: "oklch(0.52 0.11 65)",
  footnote: "oklch(0.52 0.19 300)",
  center: "oklch(0.50 0.14 250)",
} as const;

/** A small icon on a white badge, so it reads over any scan. */
function Badge({ kind, color, title }: { kind: NewsVisualKind; color: string; title: string }) {
  return <span title={title} style={{ display: "inline-block", background: "#fff", color, borderRadius: 3, padding: 1, lineHeight: 0, boxShadow: `0 0 0 1px ${color}` }}><NewsTypeGlyph kind={kind} size={12} /></span>;
}

const TYPE_TITLE: Partial<Record<NewsType, string>> = { ADVERTISEMENT: "advertisement", MASTHEAD: "name / logo", RUNNING_HEAD: "page header", SECTION: "department", TABLE_OF_CONTENTS: "table of contents", IMPRINT: "imprint", ILLUSTRATION: "illustration", NOISE: "noise", PUBLICATION_INFO: "publication info" };

/**
 * Every tag a block carries, drawn the same way on the page being edited and on the
 * facing page: its section's type (frame shape + icon), its role (fixed-colour frame +
 * icon; headings are ruled above and below, with no icon), and the rotation and review
 * flags in the corners. Icons sit in one row above the block's top edge so two tags never
 * hide each other. `ink` is the article's colour.
 */
export function blockMarks(
  b: { role: string | null; rotation?: 90 | 180 | 270; flag?: { note: string | null }; align?: "center" },
  sec: { type: NewsType } | undefined,
  isTitle: boolean,
  ink: string,
): { style: CSSProperties; marks: ReactNode } {
  const style: CSSProperties = {};
  const icons: ReactNode[] = [];
  if (sec) {
    Object.assign(style, typeFrame(sec.type, ink));
    if (sec.type !== "ARTICLE") icons.push(<Badge key="type" kind={sec.type} color={sec.type === "NOISE" ? "#666" : ink} title={TYPE_TITLE[sec.type] ?? sec.type} />);
  }
  if (b.role === "byline") {
    Object.assign(style, { borderWidth: 2, borderStyle: "dotted", borderColor: ROLE_INK.byline });
    icons.push(<Badge key="role" kind="author" color={ROLE_INK.byline} title="author" />);
  } else if (b.role === "toc_list") {
    Object.assign(style, { borderWidth: "1.5px 5px 1.5px 1.5px", borderStyle: "solid", borderColor: `${ink} ${ROLE_INK.toc_list} ${ink} ${ink}` });
    icons.push(<Badge key="role" kind="TABLE_OF_CONTENTS" color={ROLE_INK.toc_list} title="table of contents" />);
  } else if (b.role === "footnote") {
    Object.assign(style, { borderWidth: "3px 1.5px 1.5px", borderStyle: "solid dotted dotted", borderColor: ROLE_INK.footnote });
    icons.push(<Badge key="role" kind="footnote" color={ROLE_INK.footnote} title="footnote" />);
  }
  // Centred text is a feature of the setting, not a role: an icon only, so it adds to
  // whatever frame the role drew.
  if (b.align === "center") icons.push(<Badge key="align" kind="center" color={ROLE_INK.center} title="centred text" />);
  const heading = headingLevel(b.role, isTitle);
  if (heading) Object.assign(style, headingFrame(heading, ink));
  const marks = (
    <>
      {icons.length ? <span style={{ position: "absolute", right: 0, bottom: "100%", marginBottom: 3, display: "flex", gap: 2, pointerEvents: "none" }}>{icons}</span> : null}
      {b.rotation ? <RotationTag rotation={b.rotation} /> : null}
      {b.flag ? <FlagTag note={b.flag.note} /> : null}
    </>
  );
  return { style, marks };
}

/** The level a block's heading role gives it, or null. */
export function headingLevel(role: string | null | undefined, isTitle: boolean): HeadingLevel | null {
  if (role === "section_title") return "S";
  if (isTitle || role === "headline" || role === "ad_headline") return "H1";
  return role === "subhead" ? "H2" : null;
}

/** A flagged block: a red flag inside its bottom-right corner; the note is its tooltip. */
export function FlagTag({ note }: { note: string | null }) {
  return <span aria-hidden="true" title={note ?? "flagged for review"} style={{ position: "absolute", bottom: 2, right: 2, padding: "0 4px", fontSize: 11, lineHeight: "15px", fontWeight: 700, color: "#fff", background: "oklch(0.55 0.22 25)", borderRadius: 3, pointerEvents: "none", whiteSpace: "nowrap", zIndex: 2 }}>⚑{note ? " …" : ""}</span>;
}

/** A rotated block: a small mark inside its top-right corner saying which way. */
export function RotationTag({ rotation }: { rotation: 90 | 180 | 270 }) {
  const label = rotation === 90 ? "↻" : rotation === 270 ? "↺" : "⇅";
  return <span aria-hidden="true" title={rotation === 90 ? "text rotated 90° clockwise" : rotation === 270 ? "text rotated 90° counter-clockwise" : "text upside down"} style={{ position: "absolute", top: 2, right: 2, padding: "0 4px", fontSize: 10, lineHeight: "14px", fontWeight: 700, fontFamily: "'IBM Plex Mono', ui-monospace, monospace", color: "#fff", background: "oklch(0.55 0.19 35)", borderRadius: 3, pointerEvents: "none", whiteSpace: "nowrap", zIndex: 2 }}>{label}</span>;
}


/** The same small, monochrome symbols serve as the palette's visual key. */
export function NewsTypeGlyph({ kind, size = 16 }: { kind: NewsVisualKind; size?: number }) {
  const paths: Record<NewsVisualKind, string> = {
    ARTICLE: "M3 3h14v14H3z M6 7h8 M6 10h8 M6 13h5",
    ADVERTISEMENT: "M3 8h4l9-4v12l-9-4H3z M7 12l2 5h3l-2-4 M16 8h2v4h-2",
    MASTHEAD: "M3 6l4 4 3-7 3 7 4-4-2 9H5z M5 18h10",
    RUNNING_HEAD: "M3 3h14v14H3z M3 7h14 M6 11h8",
    SECTION: "M2 6V4h6l2 3h8v10H2z",
    TABLE_OF_CONTENTS: "M3 5h1 M7 5h10 M3 10h1 M7 10h10 M3 15h1 M7 15h10",
    IMPRINT: "M6 7V2h8v5 M5 14H2V7h16v7h-3 M5 11h10v7H5z M14 9h1",
    ILLUSTRATION: "M2 3h16v14H2z M3 15l5-6 4 5 3-3 3 4 M13 6h1",
    NOISE: "M4 4l12 12 M16 4L4 16",
    PUBLICATION_INFO: "M3 5h14v13H3z M3 9h14 M6 2v5 M14 2v5 M6 12h2 M11 12h2 M6 15h2",
    S: "M2 3h16v5H2z M2 12h16 M2 16h10",
    H1: "M2 5h16 M2 8h16 M2 13h16 M2 16h16",
    H2: "M2 6h3 M8 6h3 M14 6h4 M2 14h3 M8 14h3 M14 14h4",
    author: "M10 3a3 3 0 1 1 0 6a3 3 0 1 1 0-6z M4 17c0-3 3-5 6-5s6 2 6 5 M4 17h12",
    footnote: "M9 2v8 M5 4l8 4 M13 4l-8 4 M4 15h12",
    divider: "M2 10h16 M2 7v6 M18 7v6",
    rot90: "M15 5a7 7 0 1 0 2 5 M15 1v4h-4 M10 7v6",
    rot270: "M5 5a7 7 0 1 1-2 5 M5 1v4h4 M10 7v6",
    rot180: "M10 3v14 M6 13l4 4 4-4 M6 3h8",
    flag: "M4 18V2 M4 3h11l-3 4 3 4H4",
    center: "M3 4h14 M6 8h8 M3 12h14 M6 16h8",
  };
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block", flexShrink: 0 }}><path d={paths[kind]} /></svg>;
}
