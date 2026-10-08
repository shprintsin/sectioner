import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { dataWritable } from "~/server/store";

import { PROJECT_ID } from "../../../_lib/project";
import type { Ann, TagDef } from "../../_lib/types";
import { loadTextProject, saveTextProject } from "../../_server/textProject";

export const dynamic = "force-dynamic";

interface Body {
  anns: Ann[];
  done?: Record<string, boolean>;
  tags?: TagDef[];
  version?: string;
}

/** A text project's annotations (saved, plus any machine proposals not yet decided). */
export async function GET(req: NextRequest) {
  const project = req.nextUrl.searchParams.get("project") ?? "";
  if (!PROJECT_ID.test(project)) return NextResponse.json({ error: "bad project id" }, { status: 400 });
  try {
    const data = await loadTextProject(project);
    if (!data) return NextResponse.json({ error: "no such text project" }, { status: 404 });
    return NextResponse.json({ anns: data.anns, tags: data.tags, done: data.done, errors: data.errors.length ? data.errors : undefined });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/** Autosave: the annotations go back to their working sets' files. */
export async function PUT(req: NextRequest) {
  const project = req.nextUrl.searchParams.get("project") ?? "";
  if (!PROJECT_ID.test(project)) return NextResponse.json({ error: "bad project id" }, { status: 400 });
  if (!(await dataWritable())) return NextResponse.json({ error: "read-only instance" }, { status: 403 });
  const body = (await req.json()) as Body;
  if (!Array.isArray(body.anns)) return NextResponse.json({ error: "anns must be an array" }, { status: 400 });
  try {
    const r = await saveTextProject(project, { anns: body.anns, done: body.done, tags: body.tags });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
