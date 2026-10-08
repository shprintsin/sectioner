import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { dataWritable, shown, writeUtf8 } from "~/server/store";

import type { Ann, PageSummary } from "../../_lib/types";
import { SAFE_ID, findWorkset, indexFile, outputFile, readIndex, sessionFile, statusOf } from "../../_server/worksets";

export const dynamic = "force-dynamic";

interface Body {
  session: Ann;
  /** Sections (newspaper) or regions (book), and how many are still open. */
  n_units: number;
  n_open: number;
  /** The contract record, when the page is done or the annotator asked for a write. */
  output?: unknown;
  expected_revision?: string | null;
}

/**
 * Autosave. The session is the app's working state and is written after every act;
 * the contract output beside it only when the page is done or explicitly written, so
 * the output folder never holds a half-finished page. A write is atomic per file: the
 * JSON is serialised before anything touches the disk.
 */
export async function PUT(req: NextRequest) {
  const ws = req.nextUrl.searchParams.get("ws") ?? "";
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!SAFE_ID.test(ws) || !SAFE_ID.test(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const w = await findWorkset(ws);
  if (!w) return NextResponse.json({ error: "no such workset" }, { status: 404 });
  if (!(await dataWritable())) return NextResponse.json({ error: "read-only instance" }, { status: 403 });

  const body = (await req.json()) as Body;
  const s = body.session;
  if (!s || !["newspaper", "book"].includes(s.kind) || s.kind !== w.kind) {
    return NextResponse.json({ error: "session kind does not match the workset" }, { status: 400 });
  }
  const summary: PageSummary = {
    id,
    status: statusOf(s.done, s.flag, body.n_units),
    n_units: body.n_units,
    n_open: body.n_open,
    ...(s.kind === "newspaper" ? { n_verified: s.sections.filter(section => section.verified).length } : {}),
    flag: s.flag,
    seconds: Math.round(s.seconds),
  };
  try {
    if (body.expected_revision !== undefined) {
      let currentRevision: string | null = null;
      try { currentRevision = createHash("sha256").update(await readFile(sessionFile(w, id))).digest("hex"); }
      catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
      if (currentRevision !== body.expected_revision) return NextResponse.json({ error: "This page changed in another tab. Copy any unsaved edits before reloading." }, { status: 409 });
    }
    const sessionBytes = JSON.stringify(s);
    await writeUtf8(sessionFile(w, id), sessionBytes);
    const index = await readIndex(w, id);
    index[id] = summary;
    await writeUtf8(indexFile(w, id), JSON.stringify(index, null, 1));
    let wrote: string | null = null;
    if (body.output !== undefined) {
      const out = outputFile(w, id);
      await writeUtf8(out, JSON.stringify(body.output, null, 1) + "\n");
      wrote = shown(out);
    }
    return NextResponse.json({ ok: true, summary, wrote, revision: createHash("sha256").update(sessionBytes).digest("hex") });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
