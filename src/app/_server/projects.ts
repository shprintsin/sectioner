// Projects on disk: `projects.json` in the data folder, beside the working-set manifest.
// Server-only.
//
// The file holds only what a person decided — project names, which working sets each
// owns, the schema and the key map. It never touches `worksets.json`, the sessions or the
// outputs: a project is configuration over data that already exists, so creating,
// editing or deleting one changes how pages are offered and drawn, never what was saved.
// Until the file exists every working set sits in a derived project (`withDerived`),
// which is exactly the app as it was. Every write first copies the previous file to
// `_archive/projects.<date>.<sha>.json`.

import { createHash } from "node:crypto";
import { join } from "node:path";

import { readIfPresent, writeUtf8 } from "~/server/store";

import { normalizeProject, projectOf, validateProject, withDerived, type ProjectDef, type ResolvedProject, type WorksetRef } from "../_lib/project";
import { readManifest, sectionerRoot } from "./worksets";

export interface ProjectsFile {
  version: 1;
  projects: ProjectDef[];
}

export function projectsPath(): string {
  return join(sectionerRoot(), "projects.json");
}

export async function readProjects(): Promise<ProjectDef[]> {
  const raw = await readIfPresent(projectsPath());
  if (raw === null) return [];
  const f = JSON.parse(raw) as ProjectsFile;
  if (!Array.isArray(f.projects)) throw new Error("projects.json: `projects` must be an array");
  const projects = f.projects.map(normalizeProject);
  for (const p of projects) {
    const errs = validateProject(p);
    if (errs.length) throw new Error(`projects.json: ${p.id}: ${errs[0]}`);
  }
  return projects;
}

/** Every working set the manifest names, hidden ones included (a bookmarked URL still opens). */
export async function worksetRefs(): Promise<WorksetRef[]> {
  const m = await readManifest();
  return (m?.worksets ?? []).map((w) => ({ id: w.id, kind: w.kind, label: w.label, roles: w.roles }));
}

export async function allProjects(): Promise<(ProjectDef & { synthesized: boolean })[]> {
  return withDerived(await readProjects(), await worksetRefs());
}

export async function resolveFor(w: WorksetRef): Promise<ResolvedProject> {
  return projectOf(await allProjects(), w);
}

async function writeAll(projects: ProjectDef[]): Promise<void> {
  const prev = await readIfPresent(projectsPath());
  if (prev !== null) {
    const sha = createHash("sha256").update(prev).digest("hex").slice(0, 12);
    const day = new Date().toISOString().slice(0, 10);
    await writeUtf8(join(sectionerRoot(), "_archive", `projects.${day}.${sha}.json`), prev);
  }
  const file: ProjectsFile = { version: 1, projects };
  await writeUtf8(projectsPath(), `${JSON.stringify(file, null, 2)}\n`);
}

/**
 * Create or replace one project. `previousId` names the project being edited when its id
 * changed. A working set moves to this project from whichever project held it before;
 * a derived project is never written unless it is the one being saved.
 */
export async function saveProject(p0: ProjectDef, previousId?: string): Promise<ProjectDef> {
  const p = normalizeProject(p0);
  const errs = validateProject(p);
  if (errs.length) throw new Error(errs.join("; "));
  const refs = await worksetRefs();
  const known = new Map(refs.map((w) => [w.id, w]));
  for (const id of p.worksets) {
    const w = known.get(id);
    if (!w) throw new Error(`no working set ${id}`);
    if (w.kind !== p.kind) throw new Error(`working set ${id} is a ${w.kind} set, not ${p.kind}`);
  }
  const now = new Date().toISOString();
  const persisted = await readProjects();
  const old = persisted.find((x) => x.id === (previousId ?? p.id));
  if (persisted.some((x) => x.id === p.id && x.id !== old?.id)) throw new Error(`a project ${p.id} already exists`);
  const saved: ProjectDef = { ...p, worksets: [...new Set(p.worksets)], created: old?.created ?? p.created ?? now, updated: now };
  const mine = new Set(saved.worksets);
  const others = persisted.filter((x) => x !== old).map((x) => ({ ...x, worksets: x.worksets.filter((w) => !mine.has(w)) }));
  const next = old ? persisted.map((x) => (x === old ? saved : others.find((o) => o.id === x.id)!)) : [...others, saved];
  await writeAll(next);
  return saved;
}

/** Remove a project's configuration. Its working sets fall back to a derived project;
 *  their sessions and outputs are not touched. */
export async function deleteProject(id: string): Promise<boolean> {
  const persisted = await readProjects();
  if (!persisted.some((p) => p.id === id)) return false;
  await writeAll(persisted.filter((p) => p.id !== id));
  return true;
}
