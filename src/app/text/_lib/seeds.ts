// Turning the fixture's declarative seeds into real annotations.
//
// A seed says "tag this phrase"; this resolves the phrase to character offsets against
// the section's own text. That indirection is what keeps the fixture readable and is how
// the design builds its sample data at init.
//
// It is deliberately *not* how a saved annotation works. Real annotations carry offsets
// and a `quote` that must match them (SPEC §3.2); a store that re-found its quotes on
// every load would repair itself silently and hide exactly the drift the stale queue
// exists to catch.

import { withParents } from "./annotations";
import type { Ann, Project, Section, Seed } from "./types";

/** The layer machine proposals land in, as the design labels its one sample run. */
export const AGENT_LAYER = "agent:run-14";

export interface Range {
  start: number;
  end: number;
}

/**
 * The `nth` occurrence of `q` in `text`, 1-based, or null.
 *
 * The scan advances one character at a time, so occurrences may overlap: "aa" occurs
 * three times in "aaaa". That is the design's behaviour and the fixture relies on it.
 */
export function find(text: string, q: string, nth: number): Range | null {
  let i = -1;
  for (let k = 0; k < nth; k++) {
    i = text.indexOf(q, i + 1);
    if (i < 0) return null;
  }
  return { start: i, end: i + q.length };
}

/** Locate a seed's span in its section, or null if it cannot be placed. */
export function resolveSeed(sec: Section, seed: Seed): Range | null {
  if (seed.doc === true) return null;
  if (seed.from !== undefined && seed.to !== undefined) {
    const a = sec.text.indexOf(seed.from);
    const b = sec.text.indexOf(seed.to);
    if (a < 0 || b < 0) return null;
    return { start: a, end: b + seed.to.length };
  }
  if (seed.q === undefined) return null;
  return find(sec.text, seed.q, seed.nth ?? 1);
}

/**
 * Resolve every seed in the corpus into an annotation, then compute nesting.
 *
 * A seed whose phrase cannot be found is dropped and does not consume an id, so ids stay
 * dense — which is what makes `a1..a84` a meaningful assertion about the fixture rather
 * than a coincidence.
 */
const layer = (seed: Seed) => (seed.prov === "agent" ? AGENT_LAYER : "gold");

export function materialise(projects: Project[]): Ann[] {
  const out: Ann[] = [];
  let n = 1;

  for (const p of projects) {
    for (const v of p.volumes) {
      for (const sec of v.sections) {
        for (const seed of sec.seeds) {
          const docScope = seed.doc === true;
          const range = docScope ? null : resolveSeed(sec, seed);
          if (!docScope && range === null) continue;

          out.push({
            id: `a${n++}`,
            doc: sec.doc_id,
            tag: seed.tag,
            start: range ? range.start : null,
            end: range ? range.end : null,
            quote: range ? sec.text.slice(range.start, range.end) : null,
            attrs: { ...seed.attrs },
            layer: layer(seed),
            // Same value at birth; only `layer` may ever move (see `Ann.origin`).
            origin: layer(seed),
            prov: seed.prov ?? "human",
            status: seed.status ?? "accepted",
            // `??`, not `||`: a real confidence of 0 must survive as 0. The design's
            // `sd.conf || null` turns it into "unscored", which reads as a different fact.
            conf: seed.conf ?? null,
            uncertain: seed.uncertain === true,
            parent: null,
          });
        }
      }
    }
  }

  return withParents(out);
}
