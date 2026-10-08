"use client";

// The frame of the design: top bar, three columns with drag handles, status bar, and
// the export dialog. A mode fills the panels and the canvas; the shell routes the
// keyboard, the zoom keys and the page keys.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { C, MONO, btn } from "../_lib/tokens";
import type { Ann, PageSummary } from "../_lib/types";
import { viewSize as turnedSize } from "../_lib/geometry";
import { normalizeKey } from "../_lib/keys";
import { bindings, chordOf, formatChord, keysOf, normalizeChord, type ResolvedProject } from "../_lib/project";
import { ZOOM_MAX, ZOOM_MIN, cycleZoom, fitPageScale } from "../_lib/ui";
import Canvas from "./Canvas";
import { Divider, ExportDialog, Spacer, ToolRail, WorkingSet, ZoomBar } from "./bits";
import { I, Icon } from "./icons";
import CommandPalette, { CommandTrigger, type Command } from "./CommandPalette";
import KeymapDialog from "./KeymapDialog";
import { ContextMenu, MenuBar, buildMenus, type MenuSection } from "./Menus";
import type { ModeView } from "./modeTypes";
import { saveKeymap } from "./projectClient";
import { mmss, type Session } from "./session";

export interface ShellProps<A extends Ann> {
  kind: "newspaper" | "book";
  wsLabel: string;
  pageId: string;
  pages: PageSummary[];
  width: number;
  height: number;
  imageUrl: string;
  session: Session<A>;
  view: ModeView;
  onGoPage: (delta: number) => void;
  onPickPage: (id: string) => void;
  onWrite: () => void;
  /** The working set's project: its key map overrides the commands' default keys. */
  project?: ResolvedProject;
  /** The project was saved from inside the page (the key map); reload it. */
  onProjectChanged?: () => void;
  writable?: boolean;
}

// Panel visibility outlives a page: moving the editing focus to the other page of a
// spread remounts the shell, and must not reopen the panels the reviewer closed.
type PanelState = { left: boolean; right: boolean; beforeSpread: { left: boolean; right: boolean } | null };
const panelMemory: Partial<Record<"newspaper" | "book", PanelState>> = {};

// The zoom mode outlives a page and a reload. A per-viewer convenience, so browser storage;
// the page works the same without it.
const FIT_KEY = "sectioner.fitMode";
function readFitMode(): "width" | null {
  try { return window.localStorage.getItem(FIT_KEY) === "width" ? "width" : null; } catch { return null; }
}
function writeFitMode(m: "width" | null): void {
  try { if (m) window.localStorage.setItem(FIT_KEY, m); else window.localStorage.removeItem(FIT_KEY); } catch { /* storage blocked: the mode lasts this page only */ }
}

export default function Shell<A extends Ann>(p: ShellProps<A>) {
  const { session: s, view: v, ui } = { ...p, ui: p.session.ui };
  const grid = useRef<HTMLDivElement | null>(null);
  const [viewport, setViewport] = useState({ w: 900, h: 760 });
  const savedPanels = panelMemory[p.kind];
  const [showLeft, setShowLeft] = useState(savedPanels?.left ?? true);
  const [showRight, setShowRight] = useState(savedPanels?.right ?? true);
  useEffect(() => { if (!savedPanels && window.innerWidth < 1200) setShowLeft(false); }, []);
  const panelsBeforeSpread = useRef<{ left: boolean; right: boolean } | null>(savedPanels?.beforeSpread ?? null);
  useEffect(() => { panelMemory[p.kind] = { left: showLeft, right: showRight, beforeSpread: panelsBeforeSpread.current }; });
  useEffect(() => {
    if (!v.spread) return;
    if (v.spread.enabled && window.innerWidth < 1500 && !panelsBeforeSpread.current) {
      panelsBeforeSpread.current = { left: showLeft, right: showRight };
      setShowLeft(false);
      setShowRight(false);
    } else if (!v.spread.enabled && panelsBeforeSpread.current) {
      setShowLeft(panelsBeforeSpread.current.left);
      setShowRight(panelsBeforeSpread.current.right);
      panelsBeforeSpread.current = null;
    }
  }, [v.spread?.enabled]);
  const dragInfo = useRef<{ side: "left" | "right"; x: number; w: number } | null>(null);
  const workingSetRef = useRef<HTMLDivElement | null>(null);
  const navDragInfo = useRef<{ y: number; h: number; current: number } | null>(null);
  const [navHeight, setNavHeight] = useState(380);
  const [draggingNav, setDraggingNav] = useState(false);
  useEffect(() => {
    const saved = Number(window.localStorage.getItem("sectioner.issueNavHeight"));
    if (Number.isFinite(saved) && saved >= 160 && saved <= 2000) setNavHeight(saved);
  }, []);

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [keymapOpen, setKeymapOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [ctx, setCtx] = useState<{ x: number; y: number; id: number | string | null } | null>(null);
  const applyZoom = useCallback((z: number) => s.setUi({ zoom: Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z)) }), [s]);
  // Fit and the zoom figure measure the page as shown: turned a quarter, width and height swap.
  const [shownW, shownH] = turnedSize(p.width, p.height, v.rotation ?? 0);
  const widthZoom = (viewport.w - 32) / shownW / fitPageScale(shownW, shownH, viewport);
  // Fit width is a mode, not a number: it outlives the page (and a reload), and every page
  // opens fitted to its own width. Any other zoom — a key, the wheel, Fit page — ends it.
  const [fitMode, setFitMode] = useState<"width" | null>(() => readFitMode());
  const setZoom = useCallback((z: number) => { setFitMode(null); writeFitMode(null); applyZoom(z); }, [applyZoom]);
  const fitWidth = useCallback(() => { setFitMode("width"); writeFitMode("width"); applyZoom(widthZoom); }, [applyZoom, widthZoom]);
  useEffect(() => {
    if (fitMode === "width" && Math.abs(ui.zoom - widthZoom) > 1e-3) applyZoom(widthZoom);
    // the page's size, its turn and the window decide the width; a changed zoom is ours
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitMode, widthZoom]);

  // The keyboard. A mode in the middle of something (a split being placed) reads keys
  // first; then the chord goes to whichever command the project's key map binds it to;
  // a chord the key map took away from its default command does nothing; what is left
  // (Shift+arrows extending a range, Esc) is the mode's. The listener is re-attached on
  // every render, so it always sees the commands as they are now.
  useEffect(() => {
    const onKey = (raw: KeyboardEvent) => {
      const t = raw.target as HTMLElement | null;
      if (t && /INPUT|TEXTAREA|SELECT/.test(t.tagName)) {
        if (raw.key === "Escape") t.blur();
        return;
      }
      // Shortcuts are Latin letters; a Hebrew layout sends Hebrew ones (see _lib/keys.ts).
      const e = { ...normalizeKey(raw), preventDefault: () => raw.preventDefault() };
      if (ui.exportOpen || paletteOpen || keymapOpen || menuOpen || ctx) {
        if (e.key === "Escape") s.setUi({ exportOpen: false });
        return;
      }
      if (v.modal && v.onKey(e)) {
        e.preventDefault();
        return;
      }
      // Tab moves the editing focus to the other page of the spread.
      if (e.key === "Tab" && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && v.spread?.enabled && v.spread.neighborId) {
        e.preventDefault();
        v.spread.onFocus(null);
        return;
      }
      const chord = chordOf(raw);
      if (chord) {
        const id = bound.byChord.get(chord);
        const cmd = id ? commandsById.get(id) : undefined;
        if (cmd) {
          e.preventDefault();
          if (cmd.disabled) s.toast(`${cmd.label} — not available here`);
          else cmd.run();
          return;
        }
        if (bound.released.has(chord)) return;
      }
      if (e.ctrlKey || e.metaKey) return;
      if (v.onKey(e)) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Panel resizing.
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const nav = navDragInfo.current;
      if (nav) {
        const available = grid.current?.getBoundingClientRect().height ?? window.innerHeight - 70;
        nav.current = Math.max(160, Math.min(Math.max(160, available - 150), nav.h + e.clientY - nav.y));
        setNavHeight(nav.current);
        return;
      }
      const d = dragInfo.current;
      if (!d) return;
      const dx = e.clientX - d.x;
      const other = d.side === "left" ? ui.rightW : ui.leftW;
      const shellW = Math.max(grid.current?.getBoundingClientRect().width ?? 0, window.innerWidth, 1340);
      const cap = Math.max(d.w, Math.min(560, shellW - other - 470));
      const w = Math.max(190, Math.min(cap, d.side === "left" ? d.w + dx : d.w - dx));
      s.setUi(d.side === "left" ? { leftW: w } : { rightW: w });
    };
    const onUp = () => {
      if (navDragInfo.current) {
        window.localStorage.setItem("sectioner.issueNavHeight", String(navDragInfo.current.current));
        navDragInfo.current = null;
        setDraggingNav(false);
      }
      if (dragInfo.current) {
        dragInfo.current = null;
        s.setUi({ drag: null });
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [s, ui.leftW, ui.rightW]);

  const startDrag = (side: "left" | "right") => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragInfo.current = { side, x: e.clientX, w: side === "left" ? ui.leftW : ui.rightW };
    s.setUi({ drag: side });
  };
  const startNavDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    const h = workingSetRef.current?.getBoundingClientRect().height ?? navHeight;
    navDragInfo.current = { y: e.clientY, h, current: h };
    setDraggingNav(true);
  };

  const scalePct = Math.round(fitPageScale(shownW, shownH, viewport) * ui.zoom * 100);
  const pr = v.progress;
  const saveLabel = { saved: "autosaved to disk", saving: "saving…", dirty: "unsaved", error: "save failed — check the terminal", readonly: "read-only instance" }[s.saveState];
  const saveColor = s.saveState === "saved" ? "oklch(0.52 0.10 150)" : s.saveState === "error" ? C.cut : C.muted;

  const leftName = p.kind === "book" ? "pages" : "articles";
  const rightName = p.kind === "book" ? "labels" : "details";
  const goHref = (href: string) => () => { window.location.href = href; };
  const shellCommands: Command[] = [
    { id: "projects", group: "Project", label: "All projects…", keywords: "home working sets", run: goHref("/") },
    ...(p.project ? [{ id: "project-schema", group: "Project", label: `Edit the schema of “${p.project.label}”…`, keywords: "tags labels icons project settings", run: goHref(`/?project=${encodeURIComponent(p.project.id)}`) }] : []),
    { id: "page-prev", group: "Pages", label: "Previous page", defaultKeys: ["["], run: () => p.onGoPage(-1) },
    { id: "page-next-plain", group: "Pages", label: "Next page, without accepting", defaultKeys: ["]"], run: () => p.onGoPage(1) },
    { id: "done", group: "Pages", label: v.done ? "Mark the page not done" : "Mark the page done", keywords: "finish complete", run: v.toggleDone, disabled: !v.done && !v.canDone, checked: v.done },
    { id: "export", group: "Pages", label: "Export the page JSON…", defaultKeys: ["Alt+E"], keywords: "write download", run: () => s.setUi({ exportOpen: true }) },
    { id: "undo", group: "Edit", label: "Undo", defaultKeys: ["Ctrl+Z", "U"], run: s.undo, context: "both" },
    { id: "redo", group: "Edit", label: "Redo", defaultKeys: ["Ctrl+Shift+Z", "Ctrl+Y"], run: s.redo },
    { id: "zoom-in", group: "View", label: "Zoom in", defaultKeys: ["Shift+=", "="], run: () => setZoom(ui.zoom * 1.25), context: "blank" },
    { id: "zoom-out", group: "View", label: "Zoom out", defaultKeys: ["-", "Shift+-"], run: () => setZoom(ui.zoom / 1.25), context: "blank" },
    { id: "zoom-fit", group: "View", label: "Fit page", defaultKeys: ["0"], run: () => setZoom(1), context: "blank" },
    { id: "zoom-width", group: "View", label: "Fit width (kept from page to page)", run: fitWidth, context: "blank", checked: fitMode === "width" },
    { id: "zoom-cycle", group: "View", label: "Cycle zoom 1× · 2× · 4× · 8×", defaultKeys: ["Z", "Shift+Z"], run: () => setZoom(cycleZoom(ui.zoom)) },
    ...v.toggles.filter((t) => t.key !== "turn").map((t): Command => ({ id: `toggle-${t.key}`, group: "View", label: t.label, keywords: "toggle show hide", run: t.onClick, checked: t.on })),
    { id: "panel-left", group: "View", label: `The ${leftName} panel`, keywords: "sidebar collapse", run: () => setShowLeft(!showLeft), checked: showLeft },
    { id: "panel-right", group: "View", label: `The ${rightName} panel`, keywords: "sidebar collapse", run: () => setShowRight(!showRight), checked: showRight },
    { id: "palette", group: "Help", label: "Search commands…", defaultKeys: ["Ctrl+K", "Shift+/"], run: () => setPaletteOpen(true) },
    { id: "keymap", group: "Help", label: "Keyboard shortcuts…", keywords: "hotkeys keys bindings customise", run: () => setKeymapOpen(true) },
  ];

  // The project's key map over every command. A shell default a mode already uses (book
  // `0` = date, `Z` = summary, `U` = unclear) stays the mode's, as it always was.
  const keymap = p.project?.keymap ?? {};
  const modeCmds = v.commands ?? [];
  const modeDefaults = new Set(modeCmds.flatMap((c) => (c.defaultKeys ?? []).map(normalizeChord)));
  const allCommands: Command[] = [...modeCmds, ...shellCommands.map((c) => (c.defaultKeys ? { ...c, defaultKeys: c.defaultKeys.filter((k) => !modeDefaults.has(normalizeChord(k))) } : c))].map((c) => {
    if (c.defaultKeys === undefined && keymap[c.id] === undefined) return c;
    const ks = keysOf(c, keymap);
    return { ...c, keys: ks.length ? ks.map(formatChord).join(" ") : undefined };
  });
  const commandsById = new Map(allCommands.map((c) => [c.id, c]));
  const bindable = allCommands.map((c) => ({ id: c.id, defaultKeys: c.defaultKeys }));
  const bindingsKey = JSON.stringify(bindable);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- rebuilt only when the bindable set or the key map changes
  const bound = useMemo(() => bindings(bindable, keymap), [bindingsKey, keymap]);
  const menus = buildMenus(allCommands);
  const ctxSections: MenuSection[] = ctx ? buildMenus(allCommands.filter((c) => c.context === "both" || c.context === (ctx.id == null ? "blank" : "unit"))).flatMap((m) => m.sections) : [];
  const openContext = (id: number | string | null, x: number, y: number) => {
    if (id != null && !(ui.sel ?? []).some((x) => String(x) === String(id))) v.onPick(id, false);
    setCtx({ x, y, id });
  };
  const doneStyle = { ...btn(v.done, { height: 24, fontSize: 11 }), ...(!v.canDone && !v.done ? { opacity: 0.55, cursor: "not-allowed" } : {}) };

  const currentCanvas = <Canvas
    width={p.width} height={p.height} imageUrl={p.imageUrl} zoom={ui.zoom} tool={ui.tool} rotation={v.rotation}
    rects={v.rects} overlays={v.overlays} arrows={v.arrows} focus={v.focus} focusKey={v.focusKey}
    onMarquee={v.onMarquee} onPick={v.onPick} onDoublePick={v.onDoublePick}
    onBlankClick={v.onBlankClick} onCut={v.onCut} onCutBlank={v.onCutBlank} onHover={v.onHover} dragSelectFromRect={v.dragSelectFromRect}
    onBoxChange={v.onBoxChange} onZoom={(f) => setZoom(ui.zoom * f)}
    onFit={(fn) => setZoom(fn(viewport))} onViewport={setViewport} onContext={openContext}
  />;
  const spread = v.spread;
  const currentPane = <div key="current" style={{ display: "grid", gridTemplateRows: "28px minmax(0, 1fr)", minWidth: 0, minHeight: 0, borderInlineEnd: `1px solid ${C.border}`, boxShadow: `inset 0 0 0 2px ${C.focus}` }}>
    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 8px", background: C.panel, fontSize: 10, whiteSpace: "nowrap", overflow: "hidden", borderBottom: `2px solid ${C.focus}` }}>
      <strong>Editing</strong><span style={{ fontFamily: MONO, overflow: "hidden", textOverflow: "ellipsis" }}>{p.pageId}</span>
    </div>
    {currentCanvas}
  </div>;
  const neighborPane = spread?.enabled ? <div key="neighbor" style={{ display: "grid", gridTemplateRows: "28px minmax(0, 1fr)", minWidth: 0, minHeight: 0 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 8px", background: C.panel, fontSize: 10, whiteSpace: "nowrap", overflow: "hidden" }}>
      <span title="Click anywhere on this page, or press Tab, to edit it">{spread.direction === "previous" ? "Previous" : "Next"} · click to edit ·</span>
      <span style={{ fontFamily: MONO, overflow: "hidden", textOverflow: "ellipsis" }}>{spread.neighborId ?? "no adjacent page"}</span>
      {spread.neighborId ? <button onClick={() => spread.onFocus(null)} title="Tab · or click anywhere on this page" style={btn(false, { height: 21, padding: "0 5px", fontSize: 10, marginInlineStart: "auto", flexShrink: 0 })}>Edit this page · Tab</button> : null}
    </div>
    {spread.neighbor ? <Canvas
      key={spread.neighbor.id} width={spread.neighbor.width} height={spread.neighbor.height}
      imageUrl={spread.neighbor.imageUrl} readOnly zoom={ui.zoom} tool="select"
      rects={spread.neighbor.rects} overlays={[]} arrows={[]} focus={null} focusKey={spread.neighbor.id}
      onMarquee={() => {}} onPick={() => {}} onZoom={(f) => setZoom(ui.zoom * f)}
      onFit={() => {}} onViewport={() => {}}
      onReadOnlyClick={(x, y) => spread.onFocus(smallestAt(spread.neighbor!.rects, x, y))}
    /> : <div style={{ padding: 16, color: C.muted, background: C.well }}>{spread.error ?? (spread.neighborId ? "Loading neighboring page…" : "No adjacent page in this issue")}</div>}
  </div> : null;

  return (
    <div style={{ height: "100vh", minWidth: 620, display: "grid", gridTemplateRows: "28px 46px 1fr 24px", background: C.bg, color: C.ink, fontFamily: "'IBM Plex Sans', 'Segoe UI', 'Helvetica Neue', Helvetica, sans-serif", fontSize: 12, overflow: "hidden" }}>
      {/* menu bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 8px", background: C.panel, borderBottom: `1px solid ${C.borderSoft}`, position: "relative", zIndex: 40, minWidth: 0 }}>
        <a href="/" title="All projects" style={{ display: "flex", alignItems: "center", gap: 5, padding: "0 6px 0 2px", color: C.ink, textDecoration: "none", fontWeight: 600, fontSize: 11.5, flexShrink: 0 }}>
          <span style={{ width: 15, height: 15, borderRadius: 3, background: C.dark, color: C.onDark, display: "grid", placeItems: "center", fontSize: 9, fontFamily: MONO }}>S</span>
          Sectioner
        </a>
        <MenuBar menus={menus} onOpenChange={setMenuOpen} />
        <Spacer />
        {p.project ? (
          <a href={`/?project=${encodeURIComponent(p.project.id)}`} title="The project this working set belongs to — its schema and keys" style={{ fontSize: 10.5, color: C.muted, textDecoration: "none", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>
            {p.project.label}{p.project.synthesized ? " · default schema" : ""} <span style={{ color: C.faint }}>/</span> {p.wsLabel}
          </a>
        ) : null}
      </div>

      {/* top bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "0 12px", background: C.bar, borderBottom: `1px solid ${C.border}`, overflowX: "auto", whiteSpace: "nowrap" }}>
        <button onClick={() => setShowLeft(!showLeft)} aria-pressed={showLeft} aria-label={leftName} title={`${showLeft ? "Hide" : "Show"} ${leftName}`} style={panelBtn}><Icon size={18}>{I.panelLeft(showLeft)}</Icon></button>
        <div style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
          <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: "-0.01em" }}>Sectioner</span>
          <span style={{ fontSize: 10, color: C.muted2, letterSpacing: "0.06em", textTransform: "uppercase" }}>{p.kind === "newspaper" ? "newspaper · sections" : "page regions"}</span>
        </div>
        <Divider />
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button onClick={() => p.onGoPage(-1)} style={navBtn} title="[ — previous page">[</button>
          <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 500 }}>{p.pageId}</span>
          <button onClick={() => p.onGoPage(1)} style={navBtn} title="] — next page">]</button>
          {spread ? <button aria-pressed={spread.enabled} disabled={!spread.previousId && !spread.nextId} onClick={spread.onToggle} style={btn(spread.enabled, { height: 24, padding: "0 8px", flexShrink: 0 })}>Two pages</button> : null}
          {spread?.enabled ? <>
            <button disabled={!spread.previousId} aria-pressed={spread.direction === "previous"} onClick={() => spread.onDirection("previous")} style={btn(spread.direction === "previous", { height: 24, padding: "0 6px" })}>Previous</button>
            <button disabled={!spread.nextId} aria-pressed={spread.direction === "next"} onClick={() => spread.onDirection("next")} style={btn(spread.direction === "next", { height: 24, padding: "0 6px" })}>Next</button>
          </> : null}
          <span style={{ color: C.muted2, whiteSpace: "nowrap" }}>{v.meta}</span>
        </div>
        <Spacer />
        <CommandTrigger onOpen={() => setPaletteOpen(true)} />
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: C.muted2 }}>{p.kind === "newspaper" ? "assigned" : "reviewed"}</span>
          <div style={{ width: 148, height: 7, borderRadius: 4, background: C.track, overflow: "hidden" }}>
            <div style={{ width: `${pr.total ? (pr.placed / pr.total) * 100 : 0}%`, height: "100%", background: pr.complete ? C.ok : C.un, transition: "width 0.18s ease" }} />
          </div>
          <span style={{ fontFamily: MONO, color: C.text2 }}>{pr.placed}/{pr.total}</span>
          <button
            onClick={v.gotoOpen}
            title="G — jump to the next open unit"
            style={{ height: 24, padding: "0 9px", borderRadius: 4, cursor: "pointer", fontFamily: "inherit", fontSize: 11, fontWeight: 500, border: `1px solid ${pr.complete ? C.okBorder : C.un}`, background: pr.complete ? C.okBg : C.unBg, color: pr.complete ? C.okInk : C.unInk }}
          >
            {pr.openLabel}
          </button>
        </div>
        <Divider />
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {v.proposal ? (
            <button onClick={v.proposal.onClick} style={btn(v.proposal.on, { height: 24, fontSize: 11 })} title="P — load / drop the machine proposal">
              {v.proposal.label}
            </button>
          ) : null}
          <button onClick={() => s.setUi({ exportOpen: true })} style={{ height: 24, padding: "0 10px", border: `1px solid ${C.border}`, background: "#fff", borderRadius: 4, cursor: "pointer", fontFamily: "inherit", fontSize: 11, color: C.text }}>
            Export ⌥E
          </button>
          <button onClick={v.toggleDone} style={doneStyle}>
            {v.done ? "Done ✓" : v.canDone ? "Mark done" : "Mark done (blocked)"}
          </button>
        </div>
        <button onClick={() => setShowRight(!showRight)} aria-pressed={showRight} aria-label={rightName} title={`${showRight ? "Hide" : "Show"} ${rightName}`} style={panelBtn}><Icon size={18}>{I.panelRight(showRight)}</Icon></button>
      </div>

      {/* body */}
      <div ref={grid} style={{ display: "grid", gridTemplateColumns: `${showLeft ? ui.leftW : 0}px ${showLeft ? 5 : 0}px minmax(0, 1fr) ${showRight ? 5 : 0}px ${showRight ? ui.rightW : 0}px`, minHeight: 0, minWidth: 0, cursor: draggingNav ? "row-resize" : ui.drag ? "col-resize" : "auto", userSelect: draggingNav ? "none" : undefined }}>
        <div style={{ gridColumn: 1, gridRow: 1, display: showLeft ? "grid" : "none", gridTemplateColumns: "minmax(0, 1fr)", gridTemplateRows: `min(${navHeight}px, calc(100% - 150px)) 8px minmax(0, 1fr)`, minHeight: 0, minWidth: 0, overflow: "hidden", background: C.panel }}>
          <div ref={workingSetRef} style={{ minHeight: 0, overflow: "hidden" }}><WorkingSet pages={p.pages} current={p.pageId} label={p.wsLabel} kind={p.kind} approval={v.approval} onPick={p.onPickPage} /></div>
          <div role="separator" aria-label="Resize issue navigation" aria-orientation="horizontal" title="Drag to resize the issue list" onMouseDown={startNavDrag} style={{ cursor: "row-resize", background: draggingNav ? C.focus : C.borderSoft, display: "grid", placeItems: "center" }}>
            <span aria-hidden="true" style={{ width: 30, height: 2, borderRadius: 1, background: draggingNav ? "#fff" : C.muted2 }} />
          </div>
          <div style={{ display: "grid", gridTemplateRows: "auto minmax(0, 1fr)", minHeight: 0, overflow: "hidden" }}>{v.left}</div>
        </div>
        <div onMouseDown={startDrag("left")} style={{ gridColumn: 2, gridRow: 1, cursor: "col-resize", background: ui.drag === "left" ? "oklch(0.60 0.12 250)" : C.border }} />
        <div style={{ gridColumn: 3, gridRow: 1, display: "grid", gridTemplateRows: "32px 1fr", minHeight: 0, minWidth: 0, overflow: "hidden", background: C.well }}>
          <ZoomBar
            pct={`${scalePct}%`}
            zoom={ui.zoom}
            setZoom={setZoom}
            fitPage={() => setZoom(1)}
            fitWidth={fitWidth}
            toggles={v.toggles}
            toolNote={v.toolNote}
            modeHint={v.modeHint}
          />
          <div style={{ display: "grid", gridTemplateColumns: "46px minmax(0, 1fr)", minHeight: 0, minWidth: 0 }}>
            <ToolRail tools={v.tools} tool={ui.tool} onPick={(t) => s.setUi({ tool: t.tool, toast: `${t.name} — ${t.hint}` })} />
            {spread?.enabled ? <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", minWidth: 0, minHeight: 0, overflow: "hidden" }}>
              {spread.direction === "previous" ? <>{currentPane}{neighborPane}</> : <>{neighborPane}{currentPane}</>}
            </div> : currentCanvas}
          </div>
        </div>
        <div onMouseDown={startDrag("right")} style={{ gridColumn: 4, gridRow: 1, cursor: "col-resize", background: ui.drag === "right" ? "oklch(0.60 0.12 250)" : C.border }} />
        <div className="om-scroll" style={{ gridColumn: 5, gridRow: 1, display: showRight ? "block" : "none", overflowY: "auto", minWidth: 0, background: C.panel }}>
          {v.right}
        </div>
      </div>

      {/* status bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "0 12px", background: C.bar, borderTop: `1px solid ${C.border}`, fontSize: 10.5, color: C.muted }}>
        <span style={{ color: C.text2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ui.toast}</span>
        <Spacer />
        <span style={{ whiteSpace: "nowrap" }}>{v.opsLabel}</span>
        <Clock secondsNow={s.secondsNow} />
        <span style={{ color: saveColor, whiteSpace: "nowrap" }}>{saveLabel}</span>
      </div>

      {paletteOpen ? (
        <CommandPalette commands={allCommands} extra={v.extraCommands} onClose={() => setPaletteOpen(false)} />
      ) : null}
      {ctx && ctxSections.length ? (
        <ContextMenu x={ctx.x} y={ctx.y} sections={ctxSections} header={v.contextTitle?.(ctx.id)} onClose={() => setCtx(null)} />
      ) : null}
      {keymapOpen ? (
        <KeymapDialog
          commands={allCommands}
          keymap={keymap}
          projectLabel={p.project?.label ?? "this working set"}
          canSave={!!p.project && p.writable !== false}
          onSave={async (km) => { await saveKeymap(p.project!.id, km); p.onProjectChanged?.(); s.toast("keyboard shortcuts saved to the project"); }}
          onClose={() => setKeymapOpen(false)}
        />
      ) : null}
      {ui.exportOpen ? (
        <ExportDialog
          title={v.export.title}
          subtitle={v.export.subtitle}
          checks={v.export.checks}
          preview={preview(v.export.build())}
          note={v.export.note}
          writeLabel={`Write ${p.pageId}.json`}
          onClose={() => s.setUi({ exportOpen: false })}
          onWrite={p.onWrite}
          onDownload={() => download(`${p.pageId}.json`, v.export.build())}
        />
      ) : null}
    </div>
  );
}

/** Time on this page, ticking by itself so the rest of the shell does not re-render. */
function Clock({ secondsNow }: { secondsNow: () => number }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  return <span style={{ fontFamily: MONO, whiteSpace: "nowrap" }}>{mmss(secondsNow())} on this page</span>;
}

/** The id of the smallest rectangle under a page point: what a click on it means. */
function smallestAt(rects: { id: number | string; bbox: [number, number, number, number] }[], x: number, y: number): number | string | null {
  let best: number | string | null = null, area = Infinity;
  for (const r of rects) {
    const b = r.bbox;
    if (x < b[0] || x > b[2] || y < b[1] || y > b[3]) continue;
    const a = (b[2] - b[0]) * (b[3] - b[1]);
    if (a < area) { best = r.id; area = a; }
  }
  return best;
}

const panelBtn: React.CSSProperties = { width: 28, height: 26, flexShrink: 0, display: "grid", placeItems: "center", padding: 0, border: "none", borderRadius: 4, background: "transparent", cursor: "pointer", color: C.text2 };
const navBtn: React.CSSProperties = { width: 22, height: 22, display: "grid", placeItems: "center", border: `1px solid ${C.border}`, background: "#fff", borderRadius: 4, cursor: "pointer", fontFamily: MONO, color: C.text2 };

function preview(out: unknown): string {
  const text = JSON.stringify(out, null, 1);
  const lines = text.split("\n");
  return lines.length > 140 ? `${lines.slice(0, 140).join("\n")}\n… ${lines.length - 140} more lines` : text;
}

function download(name: string, out: unknown) {
  const blob = new Blob([JSON.stringify(out, null, 1) + "\n"], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const el = document.createElement("a");
  el.href = url;
  el.download = name;
  el.click();
  URL.revokeObjectURL(url);
}
