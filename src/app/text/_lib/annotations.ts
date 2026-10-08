// Relationships between annotations. Pure, no DOM, no state.

import type { Ann } from "./types";

/** Character length of an annotation's span; 0 at document scope. */
export function spanLen(a: Ann): number {
  if (a.start === null || a.end === null) return 0;
  return a.end - a.start;
}

/**
 * The id of the smallest annotation that strictly contains `a` in the same document,
 * or null. "Strictly" means longer — two annotations over the identical range do not
 * nest, because nothing decides which of them would be the outer one.
 *
 * The design compares candidates with `b === a`, which works only because it mutates
 * its array in place. Every reducer case here rebuilds `anns` immutably, so the "same"
 * annotation arrives as a different object and reference equality silently fails —
 * making every annotation its own parent and corrupting the piece coverage that the
 * whole reader is drawn from. Compare ids.
 */
export function findParent(a: Ann, all: Ann[]): string | null {
  if (a.start === null || a.end === null) return null;
  const mine = spanLen(a);
  let best: Ann | null = null;
  for (const b of all) {
    if (b.id === a.id || b.start === null || b.end === null || b.doc !== a.doc) continue;
    if (b.start <= a.start && b.end >= a.end && spanLen(b) > mine) {
      if (best === null || spanLen(b) < spanLen(best)) best = b;
    }
  }
  return best ? best.id : null;
}

/** Recompute `parent` for every annotation against the given set. */
export function withParents(anns: Ann[]): Ann[] {
  return anns.map((a) => ({ ...a, parent: findParent(a, anns) }));
}
