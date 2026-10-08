import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { dataWritable, shown } from "~/server/store";

import { KINDS, PROJECT_ID, defaultTags, tagLibrary, type ProjectDef } from "../../_lib/project";
import { allProjects, deleteProject, projectsPath, saveProject, worksetRefs } from "../../_server/projects";

export const dynamic = "force-dynamic";

/** Every project (persisted and derived), the working sets they can own, and the tag
 *  library per kind, so the schema editor needs nothing else. */
export async function GET() {
  const writable = await dataWritable();
  try {
    const [projects, worksets] = await Promise.all([allProjects(), worksetRefs()]);
    return NextResponse.json({
      projects,
      worksets: worksets.map(({ id, kind, label }) => ({ id, kind, label: label ?? id })),
      library: Object.fromEntries(KINDS.map((k) => [k, tagLibrary(k)])),
      defaults: Object.fromEntries(KINDS.map((k) => [k, defaultTags(k)])),
      path: shown(projectsPath()),
      writable,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message, path: shown(projectsPath()) }, { status: 500 });
  }
}

/** Create or replace a project: `{ project, previousId? }`. */
export async function PUT(req: NextRequest) {
  if (!(await dataWritable())) return NextResponse.json({ error: "read-only instance" }, { status: 403 });
  const body = (await req.json()) as { project?: ProjectDef; previousId?: string };
  if (!body.project) return NextResponse.json({ error: "no project" }, { status: 400 });
  if (body.previousId !== undefined && !PROJECT_ID.test(body.previousId)) return NextResponse.json({ error: "bad previous id" }, { status: 400 });
  try {
    const saved = await saveProject(body.project, body.previousId);
    return NextResponse.json({ project: saved });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

/** Remove a project's configuration (never its working sets' data). */
export async function DELETE(req: NextRequest) {
  if (!(await dataWritable())) return NextResponse.json({ error: "read-only instance" }, { status: 403 });
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!PROJECT_ID.test(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const gone = await deleteProject(id);
  return gone ? NextResponse.json({ deleted: id }) : NextResponse.json({ error: "no such saved project" }, { status: 404 });
}

