// Where annotations live, behind one interface with three implementations.
//
// The annotations belong beside the corpus they describe, in the **parent** repo
// (SPEC §4.6) — `site/` is its own git repo and an annotation of a responsum is not a
// fact about a Next.js app. A route handler does the writing, because the browser cannot.
//
// A deployed instance has no filesystem to write to. That is not an error state to be
// handled at the last moment: it is what a reviewer following a link sees, so it is a
// first-class capability the app asks about on mount and renders honestly.

import type { Ann, TagDef } from "./types";

export interface Capabilities {
  /** True when an `annotations/` root is reachable and writable. */
  writable: boolean;
  /** Where it is, relative to the repo root, or null when there is none. */
  root: string | null;
  /** Why not, when `writable` is false. Shown to the user, so it must be plain. */
  reason?: string;
}

export interface ProjectData {
  anns: Ann[];
  /** Documents declared done, by doc id. */
  done?: Record<string, boolean>;
  tags?: TagDef[];
  version?: string;
}

export interface StoragePort {
  capabilities(): Promise<Capabilities>;
  load(projectId: string): Promise<ProjectData | null>;
  save(projectId: string, data: ProjectData): Promise<void>;
}

/** In-memory: tests, and the read-only deployed instance. */
export class MemoryStorage implements StoragePort {
  private readonly store = new Map<string, ProjectData>();

  constructor(private readonly writable = true) {}

  capabilities(): Promise<Capabilities> {
    return Promise.resolve(
      this.writable
        ? { writable: true, root: "(memory)" }
        : { writable: false, root: null, reason: "no annotations directory — running on the shipped fixtures" },
    );
  }

  load(projectId: string): Promise<ProjectData | null> {
    return Promise.resolve(this.store.get(projectId) ?? null);
  }

  save(projectId: string, data: ProjectData): Promise<void> {
    if (!this.writable) return Promise.reject(new Error("read-only"));
    // Deep-ish copy, so a later mutation of the caller's array cannot reach back into
    // what is supposedly "saved" and make a test pass that should fail.
    this.store.set(projectId, { ...data, anns: data.anns.map((a) => ({ ...a })) });
    return Promise.resolve();
  }
}

/** Talks to the route handlers under `text/api/`. */
export class HttpStorage implements StoragePort {
  constructor(private readonly base = "/text/api") {}

  async capabilities(): Promise<Capabilities> {
    try {
      const r = await fetch(`${this.base}/capabilities`);
      if (!r.ok) throw new Error(String(r.status));
      return (await r.json()) as Capabilities;
    } catch {
      // A failed probe is a read-only instance, not a crash: the app must still open.
      return { writable: false, root: null, reason: "storage unreachable — annotations will not be saved" };
    }
  }

  async load(projectId: string): Promise<ProjectData | null> {
    const r = await fetch(`${this.base}/annotations?project=${encodeURIComponent(projectId)}`);
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`load failed: ${r.status}`);
    return (await r.json()) as ProjectData;
  }

  async save(projectId: string, data: ProjectData): Promise<void> {
    const r = await fetch(`${this.base}/annotations?project=${encodeURIComponent(projectId)}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!r.ok) throw new Error(`save failed: ${r.status}`);
  }
}

/**
 * A save that waits for the typing to stop, and never loses the last one.
 *
 * `flush` is what `visibilitychange` calls: closing the tab must cost at most the action
 * in flight, not the last `delay` milliseconds of work.
 */
export function debounceSave(
  save: (data: ProjectData) => Promise<void>,
  delay = 250,
): { queue: (d: ProjectData) => void; flush: () => Promise<void>; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: ProjectData | null = null;

  const run = async () => {
    if (pending === null) return;
    const d = pending;
    pending = null;
    await save(d);
  };

  return {
    queue(d) {
      pending = d;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void run(), delay);
    },
    async flush() {
      if (timer) clearTimeout(timer);
      timer = null;
      await run();
    },
    cancel() {
      if (timer) clearTimeout(timer);
      timer = null;
      pending = null;
    },
  };
}
