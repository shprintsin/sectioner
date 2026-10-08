// Minting annotation ids.
//
// The design uses `'n' + Date.now()`, which collides for any two annotations created
// inside the same millisecond — accept-all, or a fast `Enter` repeat, does exactly that —
// and produces a different id for the same action on every run, so no test can assert one.
//
// A counter fixes both. It has to be *seeded* from what is already loaded, or a session
// that reopens a saved file starts at n1 and mints ids that already exist on disk.

import type { Ann } from "./types";

/** The prefix for ids this app creates. Loaded fixtures use `a`; the two never collide. */
export const ID_PREFIX = "n";

export function mintId(n: number): string {
  return ID_PREFIX + n;
}

/**
 * The next free counter value, given everything already loaded.
 *
 * Reads the numeric tail of any id that has one, whatever its prefix — so ids minted by
 * an earlier session (`n7`) and ids that came with the fixture (`a84`) both push the
 * counter forward, and a later `n` can never land on an existing row.
 */
export function seedCounter(anns: Ann[]): number {
  let max = 0;
  for (const a of anns) {
    const m = /(\d+)$/.exec(a.id);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return max + 1;
}
