"use client";

// The app: which working set, which page, and the page's data. Everything below this is
// one page at a time; switching pages unmounts the old one (which flushes its save) and
// mounts the next with fresh state.

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { C } from "../_lib/tokens";
import type { Ann, Bundle, PageSummary, WorksetSummary } from "../_lib/types";
import BookPage from "./BookPage";
import NewsPage from "./NewsPage";
import ProjectsHome from "./ProjectsHome";

interface WorksetsResponse {
  worksets: WorksetSummary[];
  manifest: string;
  missing?: boolean;
  writable: boolean;
  error?: string;
}

export default function Sectioner() {
  const router = useRouter();
  const params = useSearchParams();
  const wsId = params.get("ws");
  const pageId = params.get("page");
  const projectId = params.get("project");
  const [list, setList] = useState<WorksetsResponse | null>(null);
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    const r = await fetch("/api/worksets");
    const j = (await r.json()) as WorksetsResponse;
    setList(j);
    return j;
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const ws = list?.worksets.find((w) => w.id === wsId) ?? null;
  const wsKey = ws?.id ?? null;

  // The URL is the state: ?ws=…&page=…. A missing page id means the first open page.
  const go = useCallback(
    (w: string, p: string) => {
      router.replace(`/?ws=${encodeURIComponent(w)}&page=${encodeURIComponent(p)}`);
    },
    [router],
  );

  useEffect(() => {
    if (!list || !ws) return;
    // A text working set opens in the text workbench, not here.
    if (ws.kind === "text") { router.replace(`/text?project=${encodeURIComponent(ws.project?.id ?? "")}&ws=${encodeURIComponent(ws.id)}`); return; }
    if (pageId) return;
    const first = ws.pages.find((p) => p.status !== "done") ?? ws.pages[0];
    if (first) go(ws.id, first.id);
  }, [list, ws, pageId, go, router]);

  // Every page this tab has opened, with the annotation as it stands in this tab. The
  // two pages of a spread trade places by remounting, so the page coming into focus must
  // open without a loading flash and the page left behind must be drawn with the edits
  // just made — not with what the server held when it was first fetched. This tab's
  // copy is the one the autosave writes from, so it is never staler than the disk.
  const cache = useRef(new Map<string, Bundle>());
  const cacheKey = (w: string, id: string) => `${w}\u0000${id}`;
  const loadBundle = useCallback(async (id: string): Promise<Bundle> => {
    if (!wsKey) throw new Error("no working set");
    const hit = cache.current.get(cacheKey(wsKey, id));
    if (hit) return hit;
    const r = await fetch(`/api/page?ws=${encodeURIComponent(wsKey)}&id=${encodeURIComponent(id)}`);
    const j = (await r.json()) as Bundle & { error?: string };
    if (!r.ok || j.error) throw new Error(j.error ?? `could not load ${id}`);
    cache.current.set(cacheKey(wsKey, id), j);
    return j;
  }, [wsKey]);
  const onAnn = useCallback((id: string, ann: Ann) => {
    if (!wsKey) return;
    const k = cacheKey(wsKey, id);
    const hit = cache.current.get(k);
    if (hit) cache.current.set(k, { ...hit, session: ann } as Bundle);
  }, [wsKey]);

  // Keyed on the workset id, not the object: a save refreshes the list and must not
  // reload the page being edited.
  useEffect(() => {
    if (!wsKey || !pageId) return;
    let live = true;
    setError(null);
    const hit = cache.current.get(cacheKey(wsKey, pageId));
    if (hit) { setBundle(hit); return; }
    setBundle(null);
    loadBundle(pageId).then((b) => { if (live) setBundle(b); }, (e: unknown) => { if (live) setError(e instanceof Error ? e.message : String(e)); });
    return () => {
      live = false;
    };
  }, [wsKey, pageId, loadBundle]);

  // Book pages are read one after another: once a page is open, fetch the next one and
  // its scan in the background, so Enter / ⇧A land on a page that is already here. The
  // bundle goes into the same cache (kept current by onAnn), the image into the browser's.
  // Two ahead and one behind: a reviewer who accepts a page in two seconds must not
  // outrun a one-page prefetch (~0.4 s data + ~0.5 s scan on the dev server).
  useEffect(() => {
    if (ws?.kind !== "book" || !pageId || bundle?.id !== pageId) return;
    const i = ws.pages.findIndex((p) => p.id === pageId);
    const n = ws.pages.length;
    if (i < 0 || n < 2) return;
    for (const d of [1, 2, -1]) {
      const id = ws.pages[(i + d + n) % n]?.id;
      if (!id || id === pageId || cache.current.has(cacheKey(ws.id, id))) continue;
      loadBundle(id).then((b) => {
        if (b.kind !== "book") return;
        const img = new Image();
        img.src = b.imageUrl;
      }, () => undefined); // a failed prefetch is retried when the page is opened
    }
  }, [ws, pageId, bundle, loadBundle]);

  const onSaved = useCallback((summary: PageSummary) => {
    setList((l) => (l ? { ...l, worksets: l.worksets.map((w) => (w.id === wsId ? { ...w, pages: w.pages.map((p) => (p.id === summary.id ? summary : p)) } : w)) } : l));
  }, [wsId]);

  const goPage = (delta: number) => {
    if (!ws || !pageId) return;
    const i = ws.pages.findIndex((p) => p.id === pageId);
    const n = ws.pages.length;
    if (!n) return;
    const next = ws.pages[(i + delta + n) % n].id;
    // Page to page within a working set is a URL change only: the browser's history API
    // (which Next syncs into useSearchParams) skips the server re-render router.replace
    // costs on every turn (~0.2 s on the dev server); the page itself comes from the cache.
    window.history.replaceState(null, "", `/?ws=${encodeURIComponent(ws.id)}&page=${encodeURIComponent(next)}`);
  };

  if (!list) return <Frame>loading the working sets…</Frame>;
  if (list.error) return <Frame>could not read <code>{list.manifest}</code>: {list.error}</Frame>;
  if (!ws) {
    return <ProjectsHome
      worksets={list.worksets}
      manifest={list.manifest}
      writable={list.writable}
      missing={list.missing}
      editId={projectId}
      onPick={(w) => w.kind === "text" ? router.push(`/text?project=${encodeURIComponent(w.project?.id ?? "")}&ws=${encodeURIComponent(w.id)}`) : go(w.id, w.pages.find((p) => p.status !== "done")?.id ?? w.pages[0]?.id ?? "")}
      onEdit={(id) => router.replace(id ? `/?project=${encodeURIComponent(id)}` : "/")}
      onChanged={() => void loadList()}
    />;
  }
  if (error) return <Frame>{error} <a href="/" style={{ color: C.link }}>· back to the projects</a></Frame>;
  // The page the URL names: from state once loaded, straight from the cache when the
  // URL has just moved to a page this tab already holds.
  const shown = bundle?.id === pageId ? bundle : pageId ? cache.current.get(cacheKey(ws.id, pageId)) ?? null : null;
  if (!shown || !pageId) return <Frame>loading {pageId ?? ws.id}…</Frame>;

  const common = { ws: ws.id, wsLabel: ws.label, writable: ws.writable, pages: ws.pages, onGoPage: goPage, onPickPage: (id: string) => go(ws.id, id), onSaved };
  // The project rides on the working set; a key map saved from inside the page reloads it.
  const proj = { project: ws.project, onProjectChanged: () => void loadList() };
  const key = `${ws.id}/${shown.id}`;
  return shown.kind === "newspaper" ? <NewsPage key={key} bundle={shown} loadBundle={loadBundle} onAnn={onAnn} {...common} {...proj} /> : <BookPage key={key} bundle={shown} onAnn={onAnn} {...common} {...proj} />;
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text2, fontFamily: "'IBM Plex Sans', 'Segoe UI', sans-serif", fontSize: 13, display: "grid", placeItems: "center" }}>
      <div>{children}</div>
    </div>
  );
}
