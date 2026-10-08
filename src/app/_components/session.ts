"use client";

// One open page: the annotation with undo/redo, the view state, the clock and the
// autosave. Shared by both modes; nothing here knows what a section or a region is.
//
// Two of the brief's non-negotiables live here. Undo is a snapshot per act to any depth
// (300 kept), and it covers repairs because the blocks are part of the annotation. And
// nothing is lost: every act schedules a save a quarter of a second later, the page is
// saved again when it is left, and a save still in flight when the tab closes is sent
// with `keepalive`.

import { useCallback, useEffect, useRef, useState } from "react";

import type { Ann, PageSummary } from "../_lib/types";
import { initialUi, type UiState } from "../_lib/ui";

export interface ActResult<A> {
  ann: A;
  move: { cur?: number; sel?: (number | string)[] | null; active?: string | null };
  note: string;
}

export interface Session<A extends Ann> {
  ann: A;
  ui: UiState;
  setUi: (patch: Partial<UiState> | ((u: UiState) => Partial<UiState>)) => void;
  /** Apply an act. `null` means the act did not apply; the fallback note says why. */
  apply: (res: ActResult<A> | null, fallback?: string) => void;
  /** Replace the annotation without an undo step — a mode's initial load. */
  reset: (ann: A) => void;
  undo: () => void;
  redo: () => void;
  toast: (msg: string) => void;
  /** Seconds on this page, including the current sitting, read at call time. The page
   *  itself never re-renders for the clock: a whole-page render every second is what
   *  made key presses wait. The status bar's clock ticks on its own. */
  secondsNow: () => number;
  saveState: "saved" | "saving" | "dirty" | "error" | "readonly";
  /** Save now, optionally with the contract output beside the session. */
  save: (output?: unknown) => Promise<string | null>;
}

export interface SaveArgs {
  ws: string;
  id: string;
  writable: boolean;
  /** When supplied, reject writes from a stale tab instead of replacing newer work. */
  initialRevision?: string | null;
  /** Counts for the working-set list, derived by the mode from the annotation. */
  counts: (ann: Ann) => { units: number; open: number };
  /** The contract record, when the page is done: written beside the session. */
  outputIfDone: (ann: Ann) => unknown;
  /** The server's summary of the page after a save — the working-set list keeps up. */
  onSaved?: (summary: PageSummary) => void;
}

/** `uiSeed` opens the page with part of the view already set — the zoom and cursor a
 *  reviewer carries across when the focus moves to the other page of a spread. */
export function usePageSession<A extends Ann>(initial: A, args: SaveArgs, uiSeed?: Partial<UiState>): Session<A> {
  const [ann, setAnn] = useState<A>(initial);
  const [ui, setUiState] = useState<UiState>(() => ({ ...initialUi, ...uiSeed }));
  const past = useRef<A[]>([]);
  const future = useRef<A[]>([]);
  const [saveState, setSaveState] = useState<Session<A>["saveState"]>(args.writable ? "saved" : "readonly");

  // The clock: the session's recorded seconds plus this sitting.
  const base = useRef(initial.seconds);
  const opened = useRef(Date.now());
  const secondsNow = useCallback(() => base.current + (Date.now() - opened.current) / 1000, []);

  const annRef = useRef(ann);
  annRef.current = ann;
  const argsRef = useRef(args);
  argsRef.current = args;
  const pendingWrite = useRef(false);
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve());
  const revision = useRef<string | null | undefined>(args.initialRevision);

  const doSave = useCallback(async (output?: unknown): Promise<string | null> => {
    const a = argsRef.current;
    if (!a.writable) return null;
    const source = annRef.current;
    const current = { ...source, seconds: Math.round(secondsNow()) } as A;
    const c = a.counts(current);
    const out = output !== undefined ? output : a.outputIfDone(current);
    setSaveState("saving");
    const write = async (): Promise<string | null> => { try {
      const res = await fetch(`/api/session?ws=${encodeURIComponent(a.ws)}&id=${encodeURIComponent(a.id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session: current, n_units: c.units, n_open: c.open, output: out,
          ...(revision.current === undefined ? {} : { expected_revision: revision.current }) }),
        keepalive: true,
      });
      if (!res.ok) {
        if (res.status === 409) setUiState((u) => ({ ...u, toast: "Another tab saved this page. Copy any unsaved edits before reloading." }));
        throw new Error(`save failed: ${res.status}`);
      }
      const j = (await res.json()) as { wrote: string | null; summary: PageSummary; revision?: string };
      if (j.revision) revision.current = j.revision;
      if (annRef.current === source) {
        pendingWrite.current = false;
        setSaveState("saved");
      }
      a.onSaved?.(j.summary);
      return j.wrote;
    } catch {
      setSaveState("error");
      return null;
    } };
    // A later edit must not reach the server before an older save from this tab.
    const queued = saveQueue.current.then(write);
    saveQueue.current = queued;
    return queued;
  }, []);

  // Debounced autosave after every change of the annotation.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialRef = useRef(initial);
  const hasEdited = useRef(false);
  useEffect(() => {
    // The value the page opened with is already on disk (or is the fixture); only an
    // act makes it worth a write. Checked by identity, which also survives React's
    // development double-mount.
    // Undoing the first act returns to the initial object, but that value now needs
    // saving too: otherwise a reload restores the edit the reviewer just undid.
    if (ann === initialRef.current && !hasEdited.current) return;
    hasEdited.current = true;
    pendingWrite.current = true;
    if (!argsRef.current.writable) return;
    setSaveState("dirty");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void doSave(), 250);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [ann, doSave]);

  // Leaving the page (unmount) or the tab: flush.
  useEffect(() => {
    const flush = () => { if (pendingWrite.current) void doSave(); };
    window.addEventListener("beforeunload", flush);
    return () => {
      window.removeEventListener("beforeunload", flush);
      if (timer.current) {
        clearTimeout(timer.current);
        flush();
      }
    };
  }, [doSave]);

  const setUi = useCallback((patch: Partial<UiState> | ((u: UiState) => Partial<UiState>)) => {
    setUiState((u) => ({ ...u, ...(typeof patch === "function" ? patch(u) : patch) }));
  }, []);

  const toast = useCallback((msg: string) => setUi({ toast: msg }), [setUi]);

  const apply = useCallback(
    (res: ActResult<A> | null, fallback?: string) => {
      if (!res) {
        if (fallback) toast(fallback);
        return;
      }
      past.current.push(annRef.current);
      if (past.current.length > 300) past.current.shift();
      future.current = [];
      const next = { ...res.ann, seconds: secondsNow() } as A;
      setAnn(next);
      setUi((u) => ({ ...u, ...res.move, toast: res.note }));
    },
    [setUi, toast],
  );

  const reset = useCallback((a: A) => {
    past.current = [];
    future.current = [];
    initialRef.current = a;
    hasEdited.current = false;
    pendingWrite.current = false;
    setAnn(a);
  }, []);

  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (!prev) return toast("nothing to undo");
    future.current.push(annRef.current);
    setAnn(prev);
    setUi({ toast: "undone", splitAt: null, linking: null });
  }, [setUi, toast]);

  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return toast("nothing to redo");
    past.current.push(annRef.current);
    setAnn(next);
    setUi({ toast: "redone" });
  }, [setUi, toast]);

  return { ann, ui, setUi, apply, reset, undo, redo, toast, secondsNow, saveState, save: doSave };
}

export function mmss(n: number): string {
  const s = Math.max(0, Math.floor(n));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
