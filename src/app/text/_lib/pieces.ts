// The boundary sweep: cutting a run of text into the pieces that can be styled uniformly.
//
// Standoff annotations overlap freely, but a DOM node — and a TEI element — can only
// carry one style at a time. So the text is cut at every annotation edge inside it, and
// each resulting piece knows the full set of annotations covering it.
//
// This returns data only: no styles, no handlers. `pieceStyle` decides what a piece looks
// like, and the inline TEI exporter will decide what it nests as. One algorithm, two
// consumers, one test suite — so a rendering bug and an export bug cannot disagree.

import { spanLen } from "./annotations";
import type { Ann, Sel } from "./types";

export interface Piece {
  /** Start offset, inclusive, into the section's text. */
  s: number;
  /** End offset, exclusive. */
  e: number;
  /** Every annotation covering this piece, innermost (shortest) first. */
  cov: Ann[];
  /** True when the live selection covers this piece. */
  selHit: boolean;
}

/**
 * Cut `[pStart, pEnd)` of a section into pieces at every annotation and selection edge.
 *
 * `marks` must already be filtered to annotations with a range; document-scope ones
 * cover nothing. Marks and selections outside the run contribute no boundary, and a
 * mark that spans the whole run contributes none either — which is why a paragraph
 * inside a long structural span comes back as a single covered piece rather than three.
 */
export function piecesIn(
  docId: string,
  pStart: number,
  pEnd: number,
  marks: Ann[],
  sel: Sel | null,
): Piece[] {
  const bounds = new Set<number>([pStart, pEnd]);

  for (const a of marks) {
    if (a.start === null || a.end === null) continue;
    if (a.end > pStart && a.start < pEnd) {
      if (a.start > pStart) bounds.add(a.start);
      if (a.end < pEnd) bounds.add(a.end);
    }
  }

  const selHere = sel !== null && sel.doc === docId;
  if (selHere) {
    if (sel.start > pStart && sel.start < pEnd) bounds.add(sel.start);
    if (sel.end > pStart && sel.end < pEnd) bounds.add(sel.end);
  }

  const pts = [...bounds].sort((x, y) => x - y);
  const out: Piece[] = [];

  for (let i = 0; i < pts.length - 1; i++) {
    const s = pts[i];
    const e = pts[i + 1];
    const cov = marks
      .filter((a) => a.start !== null && a.end !== null && a.start <= s && a.end >= e)
      // innermost first: the shortest mark is the one whose colour the piece takes and
      // whose annotation a click selects. `sort` is stable, so equal-length marks keep
      // corpus order.
      .sort((a, b) => spanLen(a) - spanLen(b));
    out.push({
      s,
      e,
      cov,
      selHit: selHere && sel.start <= s && sel.end >= e,
    });
  }

  return out;
}
