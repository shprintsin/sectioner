// Where the app keeps everything it reads and writes, and the rules about writing. Server-only.
//
// One folder, the **data folder**, holds the configuration (`projects.json`,
// `worksets.json`) and every human judgement (`sessions/`, `output/`, `text/`). It is
// `SECTIONER_DATA` when set (absolute, or relative to the folder the app was started
// from) and `./data` otherwise, so a clone runs with no configuration at all and a team
// can keep its data in a repository of its own.
//
// The pages and texts being annotated may live anywhere. A working set's `root` that is
// not absolute is resolved against `SECTIONER_ROOT` when set, else against the data
// folder: a data folder can carry its material with it, or point at a corpus beside it.

import { access, constants, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";

/** The data folder, absolute. */
export function dataRoot(): string {
  return resolve(process.cwd(), process.env.SECTIONER_DATA?.trim() || "data");
}

/** What a relative working-set `root` (and a relative output template) is resolved against. */
export function worksetBase(): string {
  const r = process.env.SECTIONER_ROOT?.trim();
  return r ? resolve(process.cwd(), r) : dataRoot();
}

export async function isWritable(dir: string): Promise<boolean> {
  try {
    await access(dir, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Can this instance write at all? `SECTIONER_READONLY=1` says no (a shared, look-only
 * instance); otherwise the data folder, or the folder it would be created in, must be
 * writable. Every page renders the answer as a state, never as an error.
 */
export async function dataWritable(): Promise<boolean> {
  if (process.env.SECTIONER_READONLY === "1") return false;
  const root = dataRoot();
  return (await isWritable(root)) || (await isWritable(dirname(root)));
}

/** Read a file, or null when it is not there. Any other error still throws. */
export async function readIfPresent(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}

/**
 * Write UTF-8, creating the directory, and never a BOM: a BOM on a JSONL file makes its
 * first line unparseable in Python's `json`, and the failure looks like corrupt data.
 */
export async function writeUtf8(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
}

/** True when `child` really is inside `parent` — the check after any path join. */
export function contains(parent: string, child: string): boolean {
  const p = resolve(parent);
  const c = resolve(child);
  return c === p || c.startsWith(p + sep);
}

/** A path as shown to a person: relative to where the app runs when it is inside it. */
export function shown(path: string): string {
  const rel = relative(process.cwd(), path);
  return (rel.startsWith("..") ? path : rel).split("\\").join("/");
}
