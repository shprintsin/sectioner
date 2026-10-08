// Which annotations are in play, and which of them are on screen.
//
// Four nested sets, and the difference between them is the whole of the visibility model:
//
//   projAnns    every annotation in the open project, rejections included
//   volAnns     the open volume, rejections dropped
//   proposals   the volume's undecided machine proposals
//   visibleAnns what the reader actually paints
//
// A rejection stays in `projAnns` on purpose. It is evidence about the model that made it
// (SPEC §3.5), and the Analysis panel counts it — so "rejected" must never mean "deleted".

import { inProject } from "./tagset";
import type { Ann, Project, StatusFilter, TagDef, Volume } from "./types";

/** Every `doc_id` in a project, across all its volumes. */
export function projectDocIds(p: Project): string[] {
  return p.volumes.flatMap((v) => v.sections.map((s) => s.doc_id));
}

/** Every `doc_id` in one volume. */
export function volDocIds(v: Volume): string[] {
  return v.sections.map((s) => s.doc_id);
}

/** Every annotation belonging to the given documents, whatever its status. */
export function inDocs(anns: Ann[], docIds: string[]): Ann[] {
  const ids = new Set(docIds);
  return anns.filter((a) => ids.has(a.doc));
}

/** The open volume's live annotations — everything except rejections. */
export function volAnns(anns: Ann[], docIds: string[]): Ann[] {
  return inDocs(anns, docIds).filter((a) => a.status !== "rejected");
}

/** The undecided machine proposals in the given set, in corpus order. */
export function proposals(live: Ann[]): Ann[] {
  return live.filter((a) => a.status === "proposed");
}

/**
 * What the reader paints.
 *
 * Proposals are hidden until review mode is on — the reason the review toggle reads as a
 * *layer* switch rather than a filter. The status filter then narrows further.
 */
export function visibleAnns(
  live: Ann[],
  review: boolean,
  statusFilter: StatusFilter,
): Ann[] {
  return live.filter((a) => {
    if (a.status === "proposed" && !review) return false;
    if (statusFilter === "proposals") return a.status === "proposed";
    if (statusFilter === "uncertain") return a.uncertain;
    return true;
  });
}

/** The next value of the status filter chip. The cycle is all → proposals → uncertain. */
export function nextStatusFilter(f: StatusFilter): StatusFilter {
  return f === "all" ? "proposals" : f === "proposals" ? "uncertain" : "all";
}

/**
 * The tag palette, filtered by the query.
 *
 * Matches English label, id and Hebrew label, so a user typing either script finds the
 * tag. The English match is case-insensitive; Hebrew has no case to fold.
 */
export function paletteList(tags: TagDef[], projectId: string, query: string): TagDef[] {
  const q = query.toLowerCase();
  return tags
    .filter((t) => inProject(t, projectId))
    .filter(
      (t) => !q || t.en.toLowerCase().includes(q) || t.id.includes(q) || t.he.includes(q),
    );
}
