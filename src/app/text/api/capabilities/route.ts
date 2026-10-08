import { NextResponse } from "next/server";

import { dataRoot, dataWritable, shown } from "~/server/store";

// Reads the filesystem, so it can never be prerendered into a static answer.
export const dynamic = "force-dynamic";

/** Can this instance write annotations? Asked on mount; "no" is a state, not an error. */
export async function GET() {
  const ok = await dataWritable();
  return NextResponse.json({
    writable: ok,
    root: ok ? shown(dataRoot()) : null,
    reason: ok ? undefined : process.env.SECTIONER_READONLY === "1" ? "this instance is read-only (SECTIONER_READONLY=1)" : "the data folder is not writable",
  });
}
