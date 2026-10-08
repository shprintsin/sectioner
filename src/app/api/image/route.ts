import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { bookImagePath, pageOf } from "../../_server/bundle";
import { SAFE_ID, contentType, exists, findWorkset, pageFile } from "../../_server/worksets";

export const dynamic = "force-dynamic";

/**
 * The scan, streamed from wherever the workset keeps it. The path is resolved from the
 * manifest again on every request — the client never names a file.
 */
export async function GET(req: NextRequest) {
  const ws = req.nextUrl.searchParams.get("ws") ?? "";
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!SAFE_ID.test(ws) || !SAFE_ID.test(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const w = await findWorkset(ws);
  if (!w) return NextResponse.json({ error: "no such workset" }, { status: 404 });
  const page = await pageOf(w, id);
  if (!page) return NextResponse.json({ error: "no such page" }, { status: 404 });
  let path: string | null;
  try {
    path = w.kind === "text" ? null : w.kind === "newspaper" ? pageFile(w, page, "image") : await bookImagePath(w, page);
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
  if (!(await exists(path)) || !path) return NextResponse.json({ error: "no image" }, { status: 404 });
  const st = await stat(path);
  const body = Readable.toWeb(createReadStream(path)) as unknown as ReadableStream;
  return new NextResponse(body, {
    headers: {
      "Content-Type": contentType(path),
      "Content-Length": String(st.size),
      // The scan of a page never changes under its id; a working set is reopened often.
      "Cache-Control": "private, max-age=3600",
    },
  });
}
