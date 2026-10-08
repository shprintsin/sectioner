// The DOM seam. The only file in the app that touches `window.getSelection()`.
//
// Everything it learns comes back as plain data — two absolute offsets and a rectangle —
// which `offsets.ts` then turns into a selection with no browser in sight. jsdom has a
// Selection but no layout, so `Range.getBoundingClientRect` does not exist there; keeping
// the untestable part down to these few lines is what makes the rest assertable.
//
// The contract with the reader: every rendered piece carries `data-off` (its absolute
// start offset in the section's text) and `data-doc`. A piece span must contain **exactly
// one text node** — `anchorOffset` is an offset into a text node, so a span holding two
// of them makes every offset past the first wrong.

import type { RawAnchors } from "./offsets";

/** Walk up to the nearest element carrying `data-off`. */
function pieceOf(node: Node | null): HTMLElement | null {
  let el: HTMLElement | null =
    node === null
      ? null
      : node.nodeType === Node.TEXT_NODE
        ? node.parentElement
        : (node as HTMLElement);
  while (el && el.dataset.off === undefined) el = el.parentElement;
  return el;
}

/**
 * Read the live selection as absolute offsets, or null when there is nothing to read.
 *
 * Clears the browser selection on success: the app draws its own highlight from state,
 * and leaving the native one behind would show two overlapping selections.
 */
export function readSelection(): RawAnchors | null {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed) return null;

  const a = pieceOf(sel.anchorNode);
  const b = pieceOf(sel.focusNode);
  if (!a || !b) return null;

  const docA = a.dataset.doc ?? "";
  const docB = b.dataset.doc ?? "";
  const offA = parseInt(a.dataset.off ?? "0", 10) + sel.anchorOffset;
  const offB = parseInt(b.dataset.off ?? "0", 10) + sel.focusOffset;

  let rect: RawAnchors["rect"] = null;
  try {
    const r = sel.getRangeAt(0).getBoundingClientRect();
    rect = { left: r.left, top: r.top, width: r.width };
  } catch {
    // No layout (jsdom) or a detached range. The selection is still valid; only the
    // floating menu needs the rectangle, and it simply does not open without one.
    rect = null;
  }

  sel.removeAllRanges();
  return { docA, offA, docB, offB, rect };
}
