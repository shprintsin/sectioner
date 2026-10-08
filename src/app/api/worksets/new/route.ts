import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { dataWritable } from "~/server/store";

import { addWorkset, previewWorkset, type NewWorksetInput } from "../../../_server/newWorkset";

export const dynamic = "force-dynamic";

/** `?preview=1`: what the definition finds, nothing written. Otherwise: append it to
 *  worksets.json (the previous file is archived first). */
export async function POST(req: NextRequest) {
  const input = (await req.json()) as NewWorksetInput;
  try {
    if (req.nextUrl.searchParams.get("preview") === "1") return NextResponse.json(await previewWorkset(input));
    if (!(await dataWritable())) return NextResponse.json({ error: "read-only instance" }, { status: 403 });
    return NextResponse.json({ workset: await addWorkset(input) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
