import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { bookBundle, newsBundle, pageOf } from "../../_server/bundle";
import { SAFE_ID, findWorkset } from "../../_server/worksets";

export const dynamic = "force-dynamic";

/** Everything the client needs for one page: layout, proposal, text, saved session. */
export async function GET(req: NextRequest) {
  const ws = req.nextUrl.searchParams.get("ws") ?? "";
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!SAFE_ID.test(ws) || !SAFE_ID.test(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const w = await findWorkset(ws);
  if (!w) return NextResponse.json({ error: "no such workset" }, { status: 404 });
  const page = await pageOf(w, id);
  if (!page) return NextResponse.json({ error: "no such page" }, { status: 404 });
  try {
    if (w.kind === "text") return NextResponse.json({ error: "a text working set opens in /text" }, { status: 400 });
    const bundle = w.kind === "newspaper" ? await newsBundle(w, page) : await bookBundle(w, page);
    return NextResponse.json(bundle);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
