import { NextResponse } from "next/server";

import { dataWritable, shown } from "~/server/store";

import { projectOf, withDerived } from "../../_lib/project";
import { readProjects } from "../../_server/projects";
import { manifestPath, readManifest, summarise } from "../../_server/worksets";

// Reads the filesystem, so it can never be prerendered into a static answer.
export const dynamic = "force-dynamic";

/** The manifest, each workset with its pages and their status. */
export async function GET() {
  const writable = await dataWritable();
  let manifest;
  try {
    manifest = await readManifest();
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message, manifest: shown(manifestPath()) }, { status: 500 });
  }
  if (!manifest) {
    return NextResponse.json({ worksets: [], manifest: shown(manifestPath()), missing: true, writable });
  }
  // Each working set carries its project: its schema and key map.
  let projects;
  try {
    projects = withDerived(await readProjects(), manifest.worksets.map((w) => ({ id: w.id, kind: w.kind, label: w.label, roles: w.roles })));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message, manifest: shown(manifestPath()) }, { status: 500 });
  }
  const worksets = await Promise.all(manifest.worksets.filter((w) => !w.hidden).map(async (w) => ({ ...(await summarise(w, writable)), project: projectOf(projects, w) })));
  return NextResponse.json({ worksets, manifest: shown(manifestPath()), writable });
}

