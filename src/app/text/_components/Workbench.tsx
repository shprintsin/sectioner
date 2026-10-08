"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";

import { readSelection } from "../_lib/domSelection";
import { download, exportName } from "../_lib/download";
import { resolveKey } from "../_lib/keymap";
import { rangeFromAnchors } from "../_lib/offsets";
import { findStale } from "../_lib/serialise";
import { makeInitial, project, projectSections, reducer, section } from "../_lib/state";
import type { State } from "../_lib/state";
import { HttpStorage } from "../_lib/storage";
import type { Capabilities, StoragePort } from "../_lib/storage";
import { exportInline, exportStandoff, exportVariablesCsv } from "../_lib/tei";
import { buildView } from "../_lib/viewModel";

import { MenuBar, ReviewBar, RightNav, StatusBar, Toolbar } from "./Chrome";
import { Overlays } from "./Overlays";
import { Reader } from "./Reader";
import { SidePanel } from "./SidePanel";

/**
 * A letter or digit by the key pressed, not the character typed, so a Hebrew (or any
 * non-Latin) keyboard layout and Caps Lock leave the shortcuts alone. Everything else is
 * the browser's own key name.
 */
export function physicalKey(e: { key: string; code: string; shiftKey: boolean; ctrlKey: boolean; metaKey: boolean; altKey: boolean }): string {
  const letter = /^Key([A-Z])$/.exec(e.code);
  if (letter) return e.shiftKey ? letter[1] : letter[1].toLowerCase();
  const digit = /^Digit([0-9])$/.exec(e.code);
  if (digit && !e.shiftKey) return digit[1];
  return e.key;
}

/** How long a toast stays up. The design's figure, near enough to read and not linger. */
const TOAST_MS = 1700;

interface Props {
  /** Show the Variables strip under the tag track. */
  showVariables?: boolean;
  /** Seed state, for tests and stories. Production takes the fixtures. */
  initial?: Partial<State>;
  /**
   * Where annotations are read and written. Injected so a test can hand in a
   * `MemoryStorage` and never touch the network; production talks to the route handlers.
   */
  storage?: StoragePort;
  /** Skip the load/autosave cycle entirely. Component tests set this. */
  persist?: boolean;
  /** Problems the server met loading the project, shown once in a banner. */
  loadErrors?: string[];
}

export function Workbench({ showVariables = true, initial, storage, persist = true, loadErrors = [] }: Props) {
  const [showErrors, setShowErrors] = useState(loadErrors.length > 0);
  // Lazy: `makeInitial` resolves 84 seeds against the corpus text, which is real work and
  // must not happen on every render.
  const [state, dispatch] = useReducer(reducer, initial ?? {}, makeInitial);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  // `window` is read here and nowhere else, so the ViewModel stays pure and the module
  // can be imported on the server without exploding.
  const [viewportWidth, setViewportWidth] = useState(1440);
  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const vm = useMemo(() => buildView(state, { viewportWidth }), [state, viewportWidth]);

  /* ── persistence ────────────────────────────────────────────────────────────────── */

  const store = useMemo(() => storage ?? new HttpStorage(), [storage]);
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const projectId = state.projectId;

  // Load once per project. A 404 is "nothing saved yet" and leaves the fixtures in place;
  // only a real response replaces them, so a fresh clone opens with something to read.
  useEffect(() => {
    if (!persist) return;
    let live = true;
    void (async () => {
      const c = await store.capabilities();
      if (!live) return;
      setCaps(c);
      try {
        const data = await store.load(projectId);
        if (!live || !data) return;
        dispatch({ type: "loaded", anns: data.anns, tags: data.tags, done: data.done });
      } catch {
        dispatch({ type: "flash", msg: "could not load the saved annotations" });
      }
    })();
    return () => {
      live = false;
    };
  }, [store, projectId, persist]);

  // Autosave. The reducer sets `dirty`; this is the only thing that clears it, so an
  // unsaved star on screen always means there is genuinely something unwritten.
  const saveNow = useCallback(async () => {
    if (!persist || caps?.writable !== true) return;
    try {
      await store.save(projectId, { anns: state.anns, tags: state.tags, version: state.version, done: state.done });
      dispatch({ type: "markSaved" });
    } catch {
      dispatch({ type: "flash", msg: "save failed — the annotations are still in this tab" });
    }
  }, [store, projectId, persist, caps, state.anns, state.tags, state.version, state.done]);

  useEffect(() => {
    if (!state.dirty || caps?.writable !== true) return;
    const t = setTimeout(() => void saveNow(), 400);
    return () => clearTimeout(t);
  }, [state.dirty, state.anns, caps, saveNow]);

  // Closing the tab costs at most the action in flight, not the last 400ms of work.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden" && state.dirty) void saveNow();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [state.dirty, saveNow]);

  // Ctrl/Cmd+S and the File menu both raise `saveIntent`; the effect performs it.
  const saveIntent = state.saveIntent;
  useEffect(() => {
    if (saveIntent === 0) return;
    if (caps?.writable !== true) {
      dispatch({ type: "flash", msg: caps?.reason ?? "read-only — nothing was written" });
      return;
    }
    void saveNow();
    dispatch({ type: "flash", msg: "written to " + (caps.root ?? "the data folder") });
    // Deliberately keyed on the counter alone. This effect *performs* an intent raised
    // once by Cmd+S; re-running it because `state.anns` changed would turn every edit
    // into an explicit save with a toast, which is what autosave exists to avoid.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveIntent]);

  /* ── the export intents ─────────────────────────────────────────────────────────── */

  const exportSeq = state.exportIntent?.seq ?? 0;
  useEffect(() => {
    const what = state.exportIntent?.what;
    if (what === undefined) return;
    const input = {
      project: project(state),
      sections: projectSections(state),
      anns: state.anns,
      tags: state.tags,
      version: state.version,
    };
    if (what === "variables") {
      download(
        exportName(projectId, "variables", "csv"),
        exportVariablesCsv(input.sections, input.anns),
        "text/csv",
      );
      dispatch({ type: "flash", msg: "variables.csv — one row per section" });
      return;
    }
    if (what === "standoff") {
      download(exportName(projectId, "standoff", "xml"), exportStandoff(input), "application/xml");
      dispatch({ type: "flash", msg: "TEI standoff written for " + input.sections.length + " documents" });
      return;
    }
    const { xml, dropped } = exportInline(input);
    download(exportName(projectId, "inline", "xml"), xml, "application/xml");
    // Never silently: XML is a tree and these annotations were not, so the count of what
    // could not be nested is the one number that makes the file honest.
    dispatch({
      type: "flash",
      msg: dropped.length
        ? "inline TEI — " + dropped.length + " overlapping span(s) left out, see standoff"
        : "inline TEI — every annotation nested",
    });
    // Same reason: one download per request, not one per subsequent keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exportSeq]);

  /* ── stale annotations ──────────────────────────────────────────────────────────── */

  // Checked once, after a load: an annotation whose quote no longer matches the text
  // under its offsets is reported rather than silently re-anchored (SPEC §3.2).
  const annCount = state.anns.length;
  useEffect(() => {
    if (!persist) return;
    const stale = findStale(state.anns, (doc) => section(state, doc).text);
    if (stale.length) {
      dispatch({
        type: "flash",
        msg: stale.length + " annotation(s) no longer match their text — check before editing",
      });
    }
    // Runs when the set is replaced (a load), not when one annotation is edited: the
    // reducer keeps quote and offsets in step, so an edit can never make a row stale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [annCount, persist]);

  /* ── the DOM seam ───────────────────────────────────────────────────────────────── */

  const onMouseUp = useCallback(
    (e?: { altKey?: boolean }) => {
      const raw = readSelection();
      if (!raw) {
        dispatch({ type: "clearSelection" });
        return;
      }
      // Alt suppresses word snapping — for the cases where a partial word really is the
      // span, which in this material means an abbreviation or a prefix letter.
      const text = section(state, raw.docA).text;
      const r = rangeFromAnchors(raw, text, e?.altKey !== true);
      if (!r.ok) {
        if (r.reason === "cross-section") {
          dispatch({ type: "flash", msg: "a span cannot cross two documents" });
        }
        return;
      }
      dispatch({ type: "select", sel: r.sel, rect: r.rect });
    },
    [state],
  );

  /* ── the keyboard ───────────────────────────────────────────────────────────────── */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const r = resolveKey(state, {
        key: physicalKey(e),
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        shiftKey: e.shiftKey,
        altKey: e.altKey,
        targetTag: target?.tagName,
      });
      if (r.preventDefault) e.preventDefault();
      if (r.blur) target?.blur();
      if (r.action) dispatch(r.action);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state]);

  /* ── effects that carry out what the reducer only recorded ──────────────────────── */

  const scrollSeq = state.scrollIntent?.seq ?? 0;
  useEffect(() => {
    const doc = state.scrollIntent?.doc;
    if (doc === undefined) return;
    const container = scrollRef.current;
    const el = sectionRefs.current[doc];
    if (!container || !el) return;
    // offsetTop is relative to the nearest positioned ancestor, so walk up to the
    // scroller rather than trusting a single offsetTop.
    let y = 0;
    let node: HTMLElement | null = el;
    while (node && node !== container) {
      y += node.offsetTop;
      node = node.offsetParent as HTMLElement | null;
    }
    container.scrollTop = Math.max(0, y - 10);
    // Keyed on the sequence number, not the doc id: asking twice for the same section
    // must scroll twice, and it is the counter that says a new request was made.
  }, [scrollSeq, state.scrollIntent?.doc]);

  const { toast, toastSeq } = state;
  useEffect(() => {
    if (toast === "") return;
    const t = setTimeout(() => dispatch({ type: "clearToast" }), TOAST_MS);
    return () => clearTimeout(t);
  }, [toast, toastSeq]);

  /* ── the frame ──────────────────────────────────────────────────────────────────── */

  return (
    <div
      style={{
        height: "100vh", display: "flex", flexDirection: "column", background: "#f6f2ea",
        color: "#23201b", fontFamily: "var(--tei-sans)", fontSize: "12px", overflow: "hidden",
      }}
    >
      <MenuBar vm={vm} dispatch={dispatch} />
      <Toolbar vm={vm} dispatch={dispatch} />
      {/* Read-only is a state, not an error. A reviewer opening a deployed link should
          see the fixtures and a plain sentence saying nothing they do will be kept. */}
      {caps?.writable === false && (
        <div
          role="note"
          style={{
            flex: "0 0 auto", padding: "4px 14px", background: "#f4ece0",
            borderBottom: "1px solid #e2d8c2", fontSize: "11px", color: "#7a5a2a",
          }}
        >
          Read-only — {caps.reason ?? "annotations cannot be saved from here"}. Tagging still
          works in this tab; use Export to take the result with you.
        </div>
      )}

      {showErrors && (
        <div
          role="alert"
          style={{
            flex: "0 0 auto", maxHeight: "30vh", overflowY: "auto", padding: "4px 14px",
            background: "#f7e9e4", borderBottom: "1px solid #e3c4b8", fontSize: "11px", color: "#8a3b26",
          }}
        >
          <button onClick={() => setShowErrors(false)} style={{ float: "right", border: "none", background: "transparent", cursor: "pointer", color: "inherit" }}>
            dismiss
          </button>
          {loadErrors.length} problem{loadErrors.length === 1 ? "" : "s"} loading this project:
          <ul style={{ margin: "2px 0 4px 18px", padding: 0 }}>
            {loadErrors.slice(0, 50).map((e) => <li key={e}>{e}</li>)}
          </ul>
        </div>
      )}

      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <SidePanel vm={vm} dispatch={dispatch} showVariables={showVariables} />

        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, background: "#f6f2ea" }}>
          <ReviewBar vm={vm} dispatch={dispatch} />
          <Reader
            vm={vm}
            annotations={state.anns}
            dispatch={dispatch}
            scrollRef={scrollRef}
            sectionRefs={sectionRefs}
            onMouseUp={onMouseUp}
          />
          <StatusBar vm={vm} />
        </div>

        <RightNav vm={vm} dispatch={dispatch} />
      </div>

      <Overlays vm={vm} dispatch={dispatch} />
    </div>
  );
}
