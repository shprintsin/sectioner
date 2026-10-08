// What a piece of text looks like, given the annotations covering it.
//
// Transcribed from `pieceStyle(cov, selHit)` in the design. The one change is that state
// arrives as an argument instead of being read off `this.state`, which is what makes it
// testable — and what lets the same function serve the reader, the export preview and any
// future print view without any of them owning the state.

import { tagById } from "./tagset";
import type { Ann, MarkOpts, Style, TagDef } from "./types";

/**
 * The style for one piece.
 *
 * `cov` is the piece's coverage, innermost first, as `piecesIn` sorts it. Structural tags
 * are dropped before anything is painted: they frame the text rather than pointing at it,
 * and a rule under half the document would drown every mark that carries information.
 */
export function pieceStyle(
  cov: Ann[],
  selHit: boolean,
  tags: TagDef[],
  opts: MarkOpts,
): Style {
  const st: Style = { cursor: "pointer", borderRadius: "2px", paddingBottom: "1px" };
  const colorOf = (a: Ann) => tagById(tags, a.tag).color;
  const inline = cov.filter((a) => !tagById(tags, a.tag).structural);

  // Before the clean-read bail-out on purpose: clean read hides the annotation layer, not
  // the thing the user is doing at this moment.
  if (selHit) {
    st.background = "rgba(35,32,27,.16)";
    st.boxShadow = "0 0 0 1px rgba(35,32,27,.25)";
  }
  if (opts.cleanRead || inline.length === 0) return st;

  if (opts.mode === "highlight") {
    const inner = inline[0];
    const c = colorOf(inner);
    if (inner.status === "proposed") {
      st.background = c + "14";
      st.outline = "1px dashed " + c + "aa";
      st.outlineOffset = "1px";
    } else {
      st.background = c + (inline.length > 1 ? "33" : "22");
      st.boxShadow = "inset 0 -2px 0 " + c + "66";
    }
    // The outermost colour, not the innermost: the fill already says what the innermost
    // tag is, so the ring must say something else — that a larger span covers this too.
    if (inline.length > 1) {
      st.boxShadow = "inset 0 0 0 1px " + colorOf(inline[inline.length - 1]) + "55";
    }
  } else {
    const imgs: string[] = [];
    const sizes: string[] = [];
    const poss: string[] = [];
    const reps: string[] = [];
    // Three rules is the legibility cap; the padding below still counts every mark, so a
    // fourth annotation does not crowd the line beneath. The asymmetry is the design's.
    inline.slice(0, 3).forEach((a, i) => {
      const c = colorOf(a);
      if (a.status === "proposed") {
        imgs.push("linear-gradient(to right," + c + " 0 4px, transparent 4px 8px)");
        sizes.push("8px 2px");
        reps.push("repeat-x");
      } else {
        imgs.push("linear-gradient(" + c + "," + c + ")");
        sizes.push("100% 2px");
        reps.push("no-repeat");
      }
      poss.push("0 calc(100% - " + i * 4 + "px)");
    });
    st.backgroundImage = imgs.join(",");
    st.backgroundSize = sizes.join(",");
    st.backgroundPosition = poss.join(",");
    st.backgroundRepeat = reps.join(",");
    st.paddingBottom = (inline.length > 1 ? 4 + inline.length * 2 : 4) + "px";
  }

  if (inline.some((a) => a.uncertain)) st.textDecoration = "underline dotted #a4452a";
  if (opts.activeId !== null && inline.some((a) => a.id === opts.activeId)) {
    st.background = colorOf(inline[0]) + "2e";
    st.boxShadow = "0 0 0 1px " + colorOf(inline[0]) + "99";
  }
  return st;
}
