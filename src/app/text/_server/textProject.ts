// A text project on disk: its documents, its annotations, its tags. Server-only.
//
// The documents come from the project's text working sets (`worksets.json`): either one
// file per document (`files.text`, `{id}` in the name) or one JSONL corpus
// (`files.corpus`, `{"id","text","title"?,"part"?}` per line). Machine proposals, when a
// working set names a `files.proposal` JSONL, are merged in as suggestions to review.
//
// Annotations are kept per **working set**, like the image engines' sessions and outputs:
// `output/<workset>/annotations.jsonl` (every annotation with its status — proposed,
// accepted, rejected — one per line) and `sessions/<workset>/_index.json` (per document:
// done or not, how many spans, how many open proposals). A project is configuration over
// that data, so moving a working set to another project moves its annotations with it.

import { basename, join, resolve } from "node:path";

import { dataRoot, readIfPresent, writeUtf8 } from "~/server/store";

import type { ProjectDef } from "../../_lib/project";
import type { PageSummary } from "../../_lib/types";
import { allProjects, saveProject } from "../../_server/projects";
import { findWorkset, indexFile, listPages, pageFile, readCorpus, readIndex, readManifest, rootDir, statusOf, type WorksetDef } from "../../_server/worksets";
import { withParents } from "../_lib/annotations";
import { canonical, projectTags, resolveDirection, sectionOf, teiTags } from "../_lib/fromProject";
import { seedCounter } from "../_lib/ids";
import { parseProposals, resolveProposals } from "../_lib/proposals";
import { fromJsonl, toJsonl } from "../_lib/serialise";
import type { Ann, Project, Section, TagDef, Volume } from "../_lib/types";

/** Documents per volume in the reader: a long working set is split into volumes this big,
 *  because the reader draws a whole volume at once. */
export const VOLUME_SIZE = 150;

export interface TextProjectData {
  def: ProjectDef & { synthesized: boolean };
  project: Project;
  tags: TagDef[];
  anns: Ann[];
  done: Record<string, boolean>;
  direction: "rtl" | "ltr";
  /** Problems found while loading — a bad line, a proposal that could not be placed. */
  errors: string[];
  /** Per proposals file: how many lines were offered as new suggestions, and how many
   *  were already decided (the same tag on the same span is in the saved annotations). */
  proposals: { workset: string; file: string; lines: number; offered: number; failed: number }[];
}

interface Loaded {
  w: WorksetDef;
  sections: Section[];
}

/** The text working sets a project owns, with their documents. */
async function loadWorksets(def: ProjectDef, errors: string[]): Promise<Loaded[]> {
  const out: Loaded[] = [];
  const seen = new Map<string, string>();
  for (const id of def.worksets) {
    const w = await findWorkset(id);
    if (!w) { errors.push(`working set ${id} is not in worksets.json`); continue; }
    if (w.kind !== "text") { errors.push(`working set ${id} is a ${w.kind} set`); continue; }
    const docs: { id: string; text: string; title?: string; part?: string }[] = [];
    try {
      if (w.files.corpus) docs.push(...(await readCorpus(w)));
      else {
        for (const p of await listPages(w)) {
          const path = pageFile(w, p, "text");
          const text = path ? await readIfPresent(path) : null;
          if (text === null) { errors.push(`${id}: no text file for ${p.id}`); continue; }
          docs.push({ id: p.id, text: text.replace(/^﻿/, "") });
        }
      }
    } catch (e) {
      errors.push((e as Error).message);
      continue;
    }
    const sections: Section[] = [];
    for (const d of docs) {
      const other = seen.get(d.id);
      if (other) { errors.push(`${id}: document ${d.id} is already in ${other}; skipped (document ids must be unique in a project)`); continue; }
      const sec = sectionOf(d);
      if (!sec.segs.length) { errors.push(`${id}: document ${d.id} is empty; skipped`); continue; }
      seen.set(d.id, id);
      sections.push(sec);
    }
    out.push({ w, sections });
  }
  return out;
}

function annotationsPath(w: WorksetDef): string {
  return join(dataRoot(), "output", w.id, "annotations.jsonl");
}

export async function findTextProject(id: string): Promise<(ProjectDef & { synthesized: boolean }) | null> {
  return (await allProjects()).find((p) => p.id === id && p.kind === "text") ?? null;
}

/** Everything the workbench opens with. Null when there is no such text project. */
export async function loadTextProject(id: string): Promise<TextProjectData | null> {
  const def = await findTextProject(id);
  if (!def) return null;
  const errors: string[] = [];
  const sets = await loadWorksets(def, errors);
  const tags = teiTags(def.tags);

  const volumes: Volume[] = [];
  const anns: Ann[] = [];
  const done: Record<string, boolean> = {};
  const ids = new Set<string>();
  const proposals: TextProjectData["proposals"] = [];
  for (const { w, sections } of sets) {
    const docs = new Set(sections.map((s) => s.doc_id));
    // saved annotations
    const raw = await readIfPresent(annotationsPath(w));
    if (raw !== null) {
      const parsed = fromJsonl(raw);
      for (const e of parsed.errors) errors.push(`${w.id}/annotations.jsonl line ${e.line}: ${e.reason}`);
      for (const a of parsed.anns) {
        if (!docs.has(a.doc)) continue; // kept on disk by the next save, not shown
        // Two working sets saved apart may both hold an `n1`; the later one is renumbered.
        anns.push(ids.has(a.id) ? { ...a, id: `${a.id}_${w.id}` } : a);
        ids.add(anns[anns.length - 1].id);
      }
    }
    // machine proposals
    const proposalTemplate = w.files.proposal;
    if (proposalTemplate) {
      const path = resolve(rootDir(w), proposalTemplate);
      const text = await readIfPresent(path);
      if (text === null) errors.push(`${w.id}: proposals file ${proposalTemplate} not found`);
      else {
        const { records, errors: perr } = parseProposals(text);
        const byDoc = new Map(sections.map((s) => [s.doc_id, s]));
        const r = resolveProposals(records, byDoc, tags, anns, `agent:${basename(proposalTemplate).replace(/\.jsonl?$/i, "")}`, seedCounter(anns));
        for (const e of [...perr, ...r.errors]) errors.push(`${w.id}/${basename(proposalTemplate)} ${e}`);
        anns.push(...r.anns);
        proposals.push({ workset: w.id, file: proposalTemplate, lines: records.length + perr.length, offered: r.anns.length, failed: perr.length + r.errors.length });
      }
    }
    const index = await readIndex(w);
    for (const s of sections) if (index[s.doc_id]?.status === "done") done[s.doc_id] = true;

    const n = Math.ceil(sections.length / VOLUME_SIZE);
    for (let k = 0; k < n; k++) {
      const part = sections.slice(k * VOLUME_SIZE, (k + 1) * VOLUME_SIZE);
      const volDocs = new Set(part.map((s) => s.doc_id));
      const nDone = part.filter((s) => done[s.doc_id]).length;
      volumes.push({
        id: n > 1 ? `${w.id}~${k + 1}` : w.id,
        title: (w.label ?? w.id) + (n > 1 ? ` · ${k * VOLUME_SIZE + 1}–${k * VOLUME_SIZE + part.length}` : ""),
        sub: `${w.id} · ${part.length} document${part.length === 1 ? "" : "s"}`,
        slug: w.id,
        units: part.length,
        pct: part.length ? Math.round((nDone / part.length) * 100) : 0,
        review: anns.filter((a) => a.status === "proposed" && volDocs.has(a.doc)).length,
        sections: part,
      });
    }
  }

  const project: Project = {
    id: def.id,
    name: def.label,
    path: `projects.json#${def.id}`,
    corpusLabel: `${volumes.reduce((n, v) => n + v.units, 0)} documents · ${sets.length} working set${sets.length === 1 ? "" : "s"}`,
    tagsetPath: `projects.json#${def.id}`,
    volumes,
  };
  const direction = resolveDirection(def.direction, volumes.flatMap((v) => v.sections.slice(0, 20).map((s) => s.text)));
  return { def, project, tags, anns: withParents(anns), done, direction, errors, proposals };
}

export interface TextSave {
  anns: Ann[];
  done?: Record<string, boolean>;
  /** The workbench's tag set, when its Tagset tab changed it. */
  tags?: TagDef[];
}

/**
 * Write a text project's annotations back, one file per working set. A line on disk whose
 * document is no longer in the working set is kept as it was: losing a document from the
 * corpus must not silently delete what was said about it.
 */
export async function saveTextProject(id: string, body: TextSave): Promise<{ written: number; worksets: string[] }> {
  const def = await findTextProject(id);
  if (!def) throw new Error(`no text project ${id}`);
  const sets = await loadWorksets(def, []);
  const written: string[] = [];
  let n = 0;
  for (const { w, sections } of sets) {
    const docs = new Set(sections.map((s) => s.doc_id));
    const mine = body.anns.filter((a) => docs.has(a.doc));
    const path = annotationsPath(w);
    const prev = await readIfPresent(path);
    const kept = prev === null ? [] : fromJsonl(prev).anns.filter((a) => !docs.has(a.doc));
    const next = toJsonl([...mine, ...kept]);
    if (next !== (prev ?? "") && !(prev === null && next === "")) {
      await writeUtf8(path, next);
      written.push(w.id);
    }
    n += mine.length;

    const index: Record<string, PageSummary> = {};
    for (const s of sections) {
      const on = mine.filter((a) => a.doc === s.doc_id);
      const nUnits = on.filter((a) => a.status === "accepted").length;
      const isDone = body.done?.[s.doc_id] === true;
      index[s.doc_id] = { id: s.doc_id, status: statusOf(isDone, null, nUnits), n_units: nUnits, n_open: on.filter((a) => a.status === "proposed").length, flag: null, seconds: 0 };
    }
    const indexText = JSON.stringify(index, null, 1);
    if (indexText !== (await readIfPresent(indexFile(w)))) await writeUtf8(indexFile(w), indexText);
  }
  if (body.tags) {
    const next = projectTags(body.tags, def.tags);
    if (JSON.stringify(canonical(next)) !== JSON.stringify(canonical(def.tags))) {
      const { synthesized: _s, ...plain } = def;
      await saveProject({ ...plain, tags: next });
    }
  }
  return { written: n, worksets: written };
}

/** Every text working set in the manifest — for the CLI and the checks. */
export async function textWorksets(): Promise<WorksetDef[]> {
  return ((await readManifest())?.worksets ?? []).filter((w) => w.kind === "text");
}
