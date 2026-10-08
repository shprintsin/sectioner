// The browser side of `api/projects`: list, save, delete. A save sends the whole project;
// the server validates it again, archives the previous file and moves working sets.

import type { ProjectDef, TagDef } from "../_lib/project";
import type { Kind } from "../_lib/types";

export interface ProjectsResponse {
  projects: (ProjectDef & { synthesized: boolean })[];
  worksets: { id: string; kind: Kind; label: string }[];
  library: Record<Kind, TagDef[]>;
  defaults: Record<Kind, TagDef[]>;
  path: string;
  writable: boolean;
  error?: string;
}

export async function fetchProjects(): Promise<ProjectsResponse> {
  const r = await fetch("/api/projects");
  const j = (await r.json()) as ProjectsResponse;
  if (!r.ok || j.error) throw new Error(j.error ?? "could not read the projects");
  return j;
}

export async function putProject(project: ProjectDef, previousId?: string): Promise<ProjectDef> {
  const clean: ProjectDef & { synthesized?: boolean } = { ...project };
  delete clean.synthesized;
  const r = await fetch("/api/projects", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ project: clean, previousId }) });
  const j = (await r.json()) as { project?: ProjectDef; error?: string };
  if (!r.ok || !j.project) throw new Error(j.error ?? "could not save the project");
  return j.project;
}

export async function removeProject(id: string): Promise<void> {
  const r = await fetch(`/api/projects?id=${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!r.ok) throw new Error(((await r.json()) as { error?: string }).error ?? "could not delete the project");
}

export interface NewWorkset {
  id: string;
  label: string;
  kind: Kind;
  root: string;
  files: Partial<Record<"image" | "layout" | "proposal" | "ocr" | "existing" | "text" | "corpus", string>>;
  labels?: boolean;
}

export interface WorksetPreview {
  ok: boolean;
  errors: string[];
  root: string;
  nPages: number;
  sample: string[];
  firstPage: { id: string; files: Record<string, boolean>; width: number | null; height: number | null } | null;
}

/** What a working-set definition finds on disk; nothing is written. */
export async function previewWorkset(w: NewWorkset): Promise<WorksetPreview> {
  const r = await fetch("/api/worksets/new?preview=1", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(w) });
  const j = (await r.json()) as WorksetPreview & { error?: string };
  if (!r.ok || j.error) throw new Error(j.error ?? "could not check the working set");
  return j;
}

/** Append the working set to worksets.json (the server archives the previous file). */
export async function createWorkset(w: NewWorkset): Promise<void> {
  const r = await fetch("/api/worksets/new", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(w) });
  const j = (await r.json()) as { error?: string };
  if (!r.ok || j.error) throw new Error(j.error ?? "could not add the working set");
}

/** Save only a project's key map, starting from what the server holds now. */
export async function saveKeymap(projectId: string, keymap: Record<string, string[]>): Promise<void> {
  const all = await fetchProjects();
  const p = all.projects.find((x) => x.id === projectId);
  if (!p) throw new Error(`no project ${projectId}`);
  await putProject({ ...p, keymap });
}
