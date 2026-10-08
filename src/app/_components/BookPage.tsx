"use client";

// The book mode: detector regions on a responsa page, repaired, roled, streamed and
// ordered. Same shell and habits as the newspaper mode; the model is
// `_lib/book/model.ts`, the output `_lib/book/export.ts`.

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import { buildBookPage, isComplete, validateBook } from "../_lib/book/export";
import * as M from "../_lib/book/model";
import { defaultTags, formatChord, isBuiltin, normalizeChord, tagColor, tagFor, tagInk, tagsFromRoles, type ResolvedProject, type TagDef } from "../_lib/project";
import { coveredShare, moveSplit, pageAxis, screenDeltaToPage, union, type ViewRotation } from "../_lib/geometry";
import { BOOK_SHORT, C, MONO, SERIF, btn, hebrewBox, rcol, tag } from "../_lib/tokens";
import type { BBox, BookAnn, BookBundle, BookRole, PageSummary, RelationType, Rotation, StyleTag } from "../_lib/types";
import { BOOK_CONFIDENCE, BOOK_LAYOUT_TAGS, STYLE_TAGS } from "../_lib/types";
import type { ArrowSpec, OverlaySpec, RectSpec } from "../_lib/ui";
import { cutAxisOf } from "../_lib/ui";
import Shell from "./Shell";
import { ActionGrid, Field, Label, Ribbon, Row, Spacer, type Tick, type ToolDef } from "./bits";
import type { Command } from "./CommandPalette";
import { RotationTag } from "./NewsTypeVisual";
import { I, Icon } from "./icons";
import Loupe, { createPointStore } from "./Loupe";
import type { ModeView } from "./modeTypes";
import type { KeyInput } from "../_lib/keys";
import { usePageSession } from "./session";
import { TagGlyph } from "./tagIcons";

const TOOLS: ToolDef[] = [
  { tool: "select", key: "V", glyph: "▣", name: "Select", hint: "click a region · drag its handles · drag to select several" },
  { tool: "draw", key: "B", glyph: "✚", name: "Draw region", hint: "a rectangle around ink the detector missed" },
  { tool: "zone", key: "Y", glyph: "▤", name: "Draw zone", hint: "a vertical band with one column arrangement" },
  { tool: "column", key: "O", glyph: "▥", name: "Draw column", hint: "a column inside a zone" },
  { tool: "cut-h", key: "W", glyph: "⬓", name: "Cut across", hint: "click inside a region to cut it into an upper and a lower part" },
  { tool: "cut-v", key: "⇧W", glyph: "◨", name: "Cut down", hint: "click inside a region to cut it into a right and a left part" },
];

// A block type is one letter, read by the physical key (so Caps Lock and a Hebrew layout
// do not change it) and without Shift, which the letters' other acts use (⇧M merges).
// Streams follow the block type; any other stream is set from the palette.
const STREAMS = ["main", "header", "page_number", "commentary", "footnotes", "references", "paratext", "aux_unknown"];

// Whole-box style marks, independent of the block type and of each other. ⇧1/⇧2/⇧3 are
// free in book mode (the digits 0, 6-9 are block types); plain 1-3 stay free for a
// project's own tags (the typography project binds them). Command ids `style-<tag>`.
const STYLE_INFO: Record<StyleTag, { en: string; badge: string; hue: number; key: string; tip: string }> = {
  bold: { en: "Bold", badge: "B", hue: 20, key: "Shift+1", tip: "the whole box is set in bold type" },
  centered: { en: "Centred", badge: "C", hue: 260, key: "Shift+2", tip: "the printed lines are centred in their column" },
  spaced: { en: "Letter-spaced", badge: "S", hue: 150, key: "Shift+3", tip: "wide-tracked emphasis: extra space between the letters" },
};


export interface BookPageProps {
  ws: string;
  wsLabel: string;
  writable: boolean;
  bundle: BookBundle;
  pages: PageSummary[];
  onGoPage: (delta: number) => void;
  onPickPage: (id: string) => void;
  onSaved: (summary: PageSummary) => void;
  /** Every change of this page's annotation, so the tab's cached copy stays current: a
   *  page reopened with [ or ] must show the edits made here, not what the server held
   *  when it was first fetched (whose autosave would then write the stale copy back). */
  onAnn?: (id: string, ann: BookAnn) => void;
  /** The working set's project: the tags this page offers and the key map. */
  project?: ResolvedProject;
  onProjectChanged?: () => void;
}

function counts(ann: BookAnn) {
  return { units: Object.keys(ann.regions).length, open: M.unverified(ann).length };
}

export default function BookPage(p: BookPageProps) {
  const { bundle } = p;
  const s = usePageSession<BookAnn>(M.initBook(bundle), {
    ws: p.ws,
    id: bundle.id,
    writable: p.writable,
    initialRevision: bundle.sessionRevision,
    counts: (a) => counts(a as BookAnn),
    outputIfDone: (a) => ((a as BookAnn).done ? buildBookPage(a as BookAnn, bundle) : undefined),
    onSaved: p.onSaved,
  }, bundle.labels === false ? { showChips: false } : undefined);
  const { ann, ui, setUi, apply } = s;
  // The block types this page offers: the project's schema; without a project, the working
  // set's own `roles` list, else every role (what the app offered before projects).
  const tags: TagDef[] = useMemo(() => p.project?.tags ?? (bundle.roles?.length ? tagsFromRoles(bundle.roles) : defaultTags("book")), [p.project, bundle.roles]);
  const tagOf = (r: { role: BookRole; tag?: { id: string; base: BookRole } }) => tagFor(tags, "book", r.role, r.tag?.base === r.role ? r.tag.id : null);
  /** The short label a chip carries: the design's for a built-in tag, the name for a custom one. */
  /** The key a tag answers to under the project's key map, as printed. */
  const tagKey = (t: TagDef) => { const over = p.project?.keymap[`tag:${t.id}`]; const k = over ? over[0] : t.key; const c = k ? normalizeChord(k) : null; return c ? formatChord(c) : ""; };
  const shortOf = (t: TagDef) => (isBuiltin(t, "book") ? BOOK_SHORT[t.base as BookRole] : t.label.length > 12 ? `${t.label.slice(0, 11)}…` : t.label);
  const { onAnn } = p;
  useEffect(() => { onAnn?.(bundle.id, ann); }, [onAnn, bundle.id, ann]);
  const order = useMemo(() => M.walk(ann), [ann]);
  const curIdx = Math.min(ui.cur, Math.max(0, order.length - 1));
  const curId = order[curIdx];
  const cr = curId ? ann.regions[curId] : undefined;
  const sel = (ui.sel as string[] | null) ?? null;
  const targetIds = (): string[] => (sel?.length ? sel.slice() : curId ? [curId] : []);
  const open = useMemo(() => M.unverified(ann), [ann]);
  const checks = useMemo(() => validateBook(ann), [ann]);
  const complete = isComplete(checks);
  const streamList = useMemo(() => M.streams(ann), [ann]);
  const textHintRef = useRef<HTMLInputElement | null>(null);
  const reasonRef = useRef<HTMLInputElement | null>(null);
  // The pointer over the page, for the loupe only: a mouse move must not re-render the page.
  const hover = useMemo(() => createPointStore(), []);

  /* ── acts ─────────────────────────────────────────────────────────────────────── */

  /** A tag is its base role, plus the tag's own id when it is a custom one. */
  const setTag = (t: TagDef) => {
    const ids = targetIds();
    const res = M.setRole(ann, ids, t.base as BookRole);
    if (res) {
      for (const id of ids) {
        const r = res.ann.regions[id];
        if (!r) continue;
        if (isBuiltin(t, "book")) delete r.tag;
        else r.tag = { id: t.id, base: t.base as BookRole };
      }
      res.note = `${ids.length} region${ids.length > 1 ? "s" : ""} → ${t.label}`;
    }
    apply(res, "no region under the cursor");
    if (t.base === "unknown") setTimeout(() => reasonRef.current?.focus(), 0);
  };
  const setStream = (st: string | null) => apply(M.setStream(ann, targetIds(), st), "a separator or a table area belongs to no stream");
  const accept = () => apply(M.accept(ann, targetIds()), "already reviewed — ↓ moves on");
  // Enter / ⇧A turn the page as they do in newspaper mode. The page turns in an effect,
  // after the act has rendered, so the autosave flushes the accepted annotation on
  // unmount instead of the one from before the key press (NewsPage does the same).
  const [turnPage, setTurnPage] = useState(false);
  const { onGoPage } = p;
  useEffect(() => { if (turnPage) { setTurnPage(false); onGoPage(1); } }, [turnPage, onGoPage]);
  const nextPage = () => setTurnPage(true);
  /** ⇧A: accept every region, mark the page done (which writes its contract record), and
   *  move on. A page that still fails a check stays open, with the check named: moving on
   *  without "done" left every page `wip` with no output (2026-09-28). */
  const acceptAllAndNext = () => {
    if (!p.writable) return nextPage();
    const accepted = M.acceptAll(ann)?.ann ?? ann;
    const failing = validateBook(accepted).find((c) => !c.ok && !c.soft);
    if (failing) {
      if (accepted !== ann) apply({ ann: accepted, move: {}, note: "" });
      return s.toast(`accepted, not done: ${failing.label}`);
    }
    apply(accepted.done ? { ann: accepted, move: {}, note: "" } : M.markDone(accepted, true));
    nextPage();
  };
  const del = () => apply(M.deleteRegions(ann, targetIds()), "no region under the cursor");
  const setRotation = (r: Rotation | null) => apply(M.setRotation(ann, targetIds(), r), "no region under the cursor");
  const toggleStyle = (t: StyleTag) => apply(M.toggleStyle(ann, targetIds(), t), "select a box first, then ⇧1 bold · ⇧2 centred · ⇧3 spaced");
  /** A style mark is "on" in the panel when every target region has it. */
  const styleOn = (t: StyleTag) => { const ids = targetIds(); return ids.length > 0 && ids.every((id) => M.hasStyle(ann.regions[id], t)); };
  const styleSome = (t: StyleTag) => targetIds().some((id) => M.hasStyle(ann.regions[id], t));
  /** L: none → 90° clockwise → 90° counter-clockwise → 180° → none (newspaper mode's O). */
  const cycleRotation = () => {
    const cycle: (Rotation | null)[] = [null, 90, 270, 180];
    const now = cr?.rotation ?? null;
    setRotation(cycle[(cycle.indexOf(now) + 1) % cycle.length] ?? null);
  };
  /** Ctrl+G: the selection (or the group a selected region is in) becomes one group. */
  const group = () => apply(M.groupRegions(ann, sel ?? [], order), "select 2+ regions that are not already one group (shift+↑↓, drag, or Ctrl+click) then Ctrl+G");
  /** Ctrl+⇧G: dissolve the group of every selected region (or of the cursor region). */
  const ungroup = () => apply(M.ungroupRegions(ann, targetIds()), "the selected region is in no group");
  const leave = () => apply(M.leaveGroup(ann, targetIds()), "the selected region is in no group");
  const selectGroup = (ids: string[]) => setUi({ sel: ids, cur: Math.max(0, order.indexOf(ids[0])), toast: `${ids.length} regions selected — Ctrl+⇧G ungroups` });
  const merge = () => (sel && sel.length >= 2 ? apply(M.mergeRegions(ann, sel)) : s.toast("select 2+ regions (shift+↑↓ or drag) then ⇧M"));
  // The page is shown turned `viewRot`; S cuts across the page as shown, which on a
  // quarter-turned page is the page's vertical axis (x), and ↑↓ move the line on screen.
  const viewRot: ViewRotation = ann.view_rotation ?? 0;
  const splitAxis = pageAxis("h", viewRot);
  const startSplit = () => {
    if (!cr) return;
    const mid = splitAxis === "v" ? (cr.bbox[0] + cr.bbox[2]) / 2 : (cr.bbox[1] + cr.bbox[3]) / 2;
    setUi({ splitAt: Math.round(mid), toast: "split mode — ↑↓ move the cut (⇧ faster), Enter commits, Esc cancels" });
  };
  const commitSplit = () => {
    if (!cr || ui.splitAt == null) return;
    apply(M.splitRegion(ann, cr.id, ui.splitAt, splitAxis), "the cut must fall inside the region");
    setUi({ splitAt: null });
  };
  // turning the view drops a split in progress: its line would change axis under the reviewer
  const turnView = () => { if (ui.splitAt != null) setUi({ splitAt: null }); apply(M.turnView(ann)); };
  // W is "across as the page is shown": on a page turned a quarter that is the page's other axis.
  const cutTool = (shown: "h" | "v") => { const axis = pageAxis(shown, viewRot); setUi({ tool: axis === "h" ? "cut-h" : "cut-v", sel: null, splitAt: null, toast: axis === "h" ? "cut across — click inside a region; the line follows the pointer · Esc leaves the tool" : "cut down — click inside a region; the right part keeps its place in the reading order · Esc leaves the tool" }); };
  const cutAt = (id: string, x: number, y: number) => {
    const axis = cutAxisOf(ui.tool);
    if (!axis) return;
    apply(M.splitRegion(ann, id, axis === "v" ? x : y, axis), "the cut must fall inside the region");
  };
  const cutBlank = (x: number, y: number) => {
    const axis = cutAxisOf(ui.tool);
    if (!axis) return;
    if (Object.keys(ann.regions).length) return s.toast("no region here — a cut on blank page only starts an empty page");
    apply(M.cutEmptyPage(ann, bundle.width, bundle.height, axis === "v" ? x : y, axis), "the cut must fall inside the page");
  };
  const reorder = (d: -1 | 1) => cr && apply(M.reorder(ann, cr.id, d), "region is in no stream order");
  const autoOrder = () => {
    const st = cr?.stream_id ?? ui.active;
    if (!st) return s.toast("no stream to reorder");
    apply(M.autoOrder(ann, st));
  };
  // dx, dy are on screen: an arrow moves the box the way it is seen to move on a turned page
  const nudge = (sx: number, sy: number) => {
    if (!cr) return;
    const [dx, dy] = screenDeltaToPage(sx, sy, viewRot);
    apply(M.setBox(ann, cr.id, [cr.bbox[0] + dx, cr.bbox[1] + dy, cr.bbox[2] + dx, cr.bbox[3] + dy]));
  };
  const gotoOpen = () => {
    if (!open.length) return s.toast("every region reviewed ✓");
    const idxs = open.map((id) => order.indexOf(id)).sort((a, b) => a - b);
    const next = idxs.find((i) => i > curIdx) ?? idxs[0];
    setUi({ cur: next, sel: null, toast: `${open.length} regions to review` });
  };
  const toggleProposal = () => {
    if (!bundle.proposal) return s.toast("this page has no detector proposal");
    if (ann.mode === "proposal") {
      if (ann.ops > 1) return s.toast("Suggestions are part of this edited page; undo to remove them.");
      return apply(M.dropProposal(ann));
    }
    if (Object.keys(ann.regions).length) return apply(M.addProposalCandidates(ann, bundle.proposal));
    apply(M.loadProposal(ann, bundle.proposal));
  };
  const toggleDone = () => {
    if (!ann.done && !complete) return s.toast(checks.find((c) => !c.ok && !c.soft)?.label ?? "not complete");
    apply(M.markDone(ann, !ann.done));
  };
  /** Esc and a click on blank page: nothing is selected, not even the cursor region. */
  const deselect = () => setUi({ cur: -1, sel: null });

  /* ── input ────────────────────────────────────────────────────────────────────── */

  const move = (d: number, shift: boolean) => {
    const n = Math.min(order.length - 1, Math.max(0, curIdx + d));
    if (shift && !ui.linking) {
      const anchor = sel?.length ? order.indexOf(sel[0]) : curIdx < 0 ? n : curIdx;
      const lo = Math.min(anchor, n), hi = Math.max(anchor, n);
      setUi({ cur: n, sel: order.slice(lo, hi + 1) });
    } else setUi({ cur: n, sel: null });
  };

  const onKey = (e: KeyInput): boolean => {
    const k = e.key;
    if (ui.splitAt != null && cr) {
      const step = (e.shiftKey ? 0.05 : 0.01) * (splitAxis === "v" ? cr.bbox[2] - cr.bbox[0] : cr.bbox[3] - cr.bbox[1]);
      if (k === "ArrowDown" || k === "j") setUi({ splitAt: moveSplit(cr.bbox, ui.splitAt, splitAxis, step, viewRot) });
      else if (k === "ArrowUp" || k === "k") setUi({ splitAt: moveSplit(cr.bbox, ui.splitAt, splitAxis, -step, viewRot) });
      else if (k === "Enter") commitSplit();
      else if (k === "Escape") setUi({ splitAt: null, toast: "split cancelled" });
      else return false;
      return true;
    }
    if ((e.ctrlKey || e.metaKey) && e.code === "KeyG") {
      if (e.shiftKey) ungroup();
      else group();
      return true;
    }
    if (e.altKey && k.startsWith("Arrow")) {
      const d = e.shiftKey ? 10 : 2;
      nudge(k === "ArrowLeft" ? -d : k === "ArrowRight" ? d : 0, k === "ArrowUp" ? -d : k === "ArrowDown" ? d : 0);
      return true;
    }
    // By the physical key and Shift, not by case: with Caps Lock on, Shift+M arrives as "m".
    // (Block types are commands now, bound by the project's key map in the shell.)
    if (!e.ctrlKey && !e.metaKey && !e.altKey && e.shiftKey && e.code === "KeyM") { merge(); return true; }
    switch (k) {
      case "ArrowDown": case "j": case "J": move(1, e.shiftKey); return true;
      case "ArrowUp": case "k": case "K": move(-1, e.shiftKey); return true;
      case "a": accept(); return true;
      case "A": acceptAllAndNext(); return true;
      case "Enter": nextPage(); return true;
      case "l": cycleRotation(); return true;
      case "L": turnView(); return true;
      case "x": case "X": case "Delete": case "Backspace": del(); return true;
      case "s": case "S": startSplit(); return true;
      case "O": autoOrder(); return true;
      case "o": setUi({ tool: "column", toast: "draw column — drag inside a zone" }); return true;
      case "y": case "Y": setUi({ tool: "zone", toast: "draw zone — drag a vertical band of the page" }); return true;
      case "b": case "B": setUi({ tool: "draw", toast: "draw region — drag a rectangle around the ink" }); return true;
      case "w": {
        // flip the cut as it is seen: on a quarter-turned page the tool's axis is the page's other one
        const onPage = cutAxisOf(ui.tool);
        const seen = onPage ? pageAxis(onPage, viewRot) : null; // the map is its own inverse
        cutTool(seen === "h" ? "v" : "h");
        return true;
      }
      case "W": cutTool("v"); return true;
      case "v": case "V": setUi({ tool: "select", toast: "select tool — click a region, drag its handles" }); return true;
      case ",": reorder(-1); return true;
      case ".": reorder(1); return true;
      case "t": case "T": textHintRef.current?.focus(); return true;
      case "g": case "G": gotoOpen(); return true;
      case "p": case "P": toggleProposal(); return true;
      case "Escape":
        if (ui.tool !== "select" || ui.splitAt != null || ui.linking) setUi({ splitAt: null, linking: null, tool: "select" });
        else deselect();
        return true;
    }
    return false;
  };

  const onMarquee = (box: BBox, add = false) => {
    if (ui.tool === "draw") {
      if (!M.validBox(box)) return;
      apply(M.addRegion(ann, box));
      return;
    }
    if (ui.tool === "zone" || ui.tool === "column") {
      apply(M.addContainer(ann, ui.tool, box));
      setUi({ tool: "select" });
      return;
    }
    const hit = order.filter((id) => coveredShare(ann.regions[id].bbox, box) > 0.45);
    if (add) {
      // Ctrl+drag: the covered regions join what is already selected.
      if (!hit.length) return;
      const next = [...new Set([...(sel ?? (curIdx >= 0 ? [order[curIdx]] : [])), ...hit])];
      setUi({ sel: next, cur: order.indexOf(hit[0]), toast: `${next.length} regions selected — Ctrl+click or Ctrl+drag adds more` });
      return;
    }
    setUi({ sel: hit.length ? hit : null, cur: hit.length ? order.indexOf(hit[0]) : curIdx, toast: hit.length ? `${hit.length} regions selected — choose a block type, Ctrl+G groups, ⇧M merges, X deletes` : "nothing selected" });
  };

  const onPick = (id: number | string, shift: boolean, toggle = false) => {
    const i = order.indexOf(String(id));
    if (i < 0) return;
    if (toggle) {
      // Ctrl+click adds this one region to the selection, or takes it out; shift is a range.
      const current = sel ?? (curIdx >= 0 ? [order[curIdx]] : []);
      const next = current.includes(String(id)) ? current.filter(r => r !== String(id)) : [...current, String(id)];
      setUi({ sel: next.length ? next : null, cur: i });
    } else if (shift) {
      const anchor = curIdx < 0 ? i : curIdx;
      const lo = Math.min(anchor, i), hi = Math.max(anchor, i);
      setUi({ sel: order.slice(lo, hi + 1), cur: i });
    } else setUi({ cur: i, sel: null, active: ann.regions[String(id)]?.stream_id ?? ui.active });
  };

  const onBoxChange = (id: number | string, box: BBox) => {
    if (!M.validBox(box)) return s.toast("a region must be at least 3 px each way");
    apply(M.setBox(ann, String(id), box));
  };

  /* ── the canvas ───────────────────────────────────────────────────────────────── */

  const rects: RectSpec[] = [];
  if (ui.showContainers) {
    for (const c of ann.containers) {
      rects.push({
        key: `c:${c.id}`,
        id: c.id,
        bbox: c.bbox,
        under: true,
        pick: false,
        title: `${c.kind} ${c.id}`,
        style: c.kind === "zone" ? { border: "1.5px dashed oklch(0.55 0.08 250 / 0.6)", borderRadius: 3, zIndex: 2 } : { border: "1px dotted oklch(0.55 0.08 250 / 0.7)", background: "oklch(0.55 0.08 250 / 0.03)", borderRadius: 2, zIndex: 3 },
        chip: c.id,
        chipStyle: { position: "absolute", top: -12, left: -1, fontSize: 8.5, fontFamily: MONO, color: "oklch(0.45 0.08 250)", whiteSpace: "nowrap" },
      });
    }
  }
  for (const r of Object.values(ann.regions)) {
    const sep = r.role === "separator";
    const table = r.role === "table";
    if (sep && !ui.showRules) continue;
    const isSel = !!sel && sel.includes(r.id);
    const isCur = r.id === curId;
    const linkFrom = ui.linking?.from === r.id;
    const tg = tagOf(r);
    const style: CSSProperties = {
      background: sep ? "transparent" : tagColor(tg, table ? 0.05 : 0.12),
      border: `${r.verified ? "1.5px solid" : "1.5px dashed"} ${sep ? "rgba(120,112,100,0.5)" : tagColor(tg, 0.95)}`,
      borderRadius: 2,
      cursor: "pointer",
      // a table area lies under the lines drawn inside it, so a click there picks the line
      zIndex: isCur ? 9 : isSel ? 8 : table ? 4 : 5,
    };
    if (!r.verified && !sep) style.animation = "pulseUn 2.4s ease-in-out infinite";
    if (isSel) style.boxShadow = `0 0 0 2px #fff, 0 0 0 3.5px ${C.dark}`;
    if (isCur) {
      style.boxShadow = `0 0 0 2px #fff, 0 0 0 4px ${C.focus}`;
      style.background = tagColor(tg, 0.3);
      style.animation = undefined;
    }
    if (linkFrom) style.boxShadow = `0 0 0 2px #fff, 0 0 0 4px ${C.cut}`;
    const grp = M.groupOf(ann, r.id);
    if (grp) { style.outline = `2px dotted oklch(0.55 0.17 ${grp.colorHue})`; style.outlineOffset = 3; }
    const spec: RectSpec = { key: r.id, id: r.id, bbox: r.bbox, style, pick: true, handles: isCur && ui.tool === "select" && ui.splitAt == null };
    if (r.rotation || r.style_tags?.length) spec.decoration = <>{r.rotation ? <RotationTag rotation={r.rotation} /> : null}<StyleMarks tags={r.style_tags} /></>;
    if (ui.showChips && !sep) {
      spec.chip = `${r.id} ${shortOf(tg)}${r.stream_id && r.stream_id !== M.DEFAULT_STREAM[r.role] ? ` ${r.stream_id}` : ""}${grp ? ` ⧉${grp.id}` : ""}${r.verified ? "" : " ?"}`;
      spec.chipStyle = { position: "absolute", top: -1, left: -1, padding: "0 3px", fontSize: 8.5, lineHeight: "12px", fontFamily: MONO, background: tagColor(tg, 0.95), color: "#fff", borderRadius: "2px 0 3px 0", whiteSpace: "nowrap" };
    }
    rects.push(spec);
  }
  const overlays: OverlaySpec[] = [];
  for (const g of ann.groups ?? []) {
    const boxes = g.region_ids.map((i) => ann.regions[i]?.bbox).filter((b): b is BBox => !!b);
    if (boxes.length < 2) continue;
    const hull = union(boxes);
    overlays.push({ key: `grp:${g.id}`, bbox: [hull[0] - 8, hull[1] - 8, hull[2] + 8, hull[3] + 8], style: { border: `2px dashed oklch(0.55 0.17 ${g.colorHue})`, background: `oklch(0.6 0.12 ${g.colorHue} / 0.05)`, borderRadius: 5, zIndex: 1 } });
  }
  if (ui.splitAt != null && cr) {
    overlays.push(splitAxis === "v"
      ? { key: "cut", bbox: [ui.splitAt - 1, cr.bbox[1] - 6, ui.splitAt + 1, cr.bbox[3] + 6], style: { background: C.cut, boxShadow: "0 0 0 1px #fff", zIndex: 20, minWidth: 3 } }
      : { key: "cut", bbox: [cr.bbox[0] - 6, ui.splitAt - 1, cr.bbox[2] + 6, ui.splitAt + 1], style: { background: C.cut, boxShadow: "0 0 0 1px #fff", zIndex: 20, minHeight: 3 } });
  }
  const REL_COLOR: Record<RelationType, string> = { heads: "oklch(0.55 0.15 305)", continues: "oklch(0.52 0.14 250)", annotates: "oklch(0.55 0.15 45)" };
  const arrows: ArrowSpec[] = [];
  if (cr) {
    ann.relations.forEach((x, i) => {
      if ((x.from === curId || x.to === curId) && ann.regions[x.from] && ann.regions[x.to]) {
        arrows.push({ key: `rel${i}`, from: ann.regions[x.from].bbox, to: ann.regions[x.to].bbox, color: REL_COLOR[x.type], label: x.type });
      }
    });
    if (ui.linking && ann.regions[ui.linking.from] && ui.linking.from !== curId) {
      arrows.push({ key: "linking", from: ann.regions[ui.linking.from].bbox, to: cr.bbox, color: C.cut, label: `${ui.linking.type}?` });
    }
  }

  /* ── panels ───────────────────────────────────────────────────────────────────── */

  const ticks: Tick[] = order.map((id, i) => {
    const r = ann.regions[id];
    return { key: id, color: r.verified ? tagColor(tagOf(r), 0.9) : C.un, dim: false, cur: i === curIdx, sel: !!sel && sel.includes(id), onClick: () => setUi({ cur: i, sel: null, active: r.stream_id ?? ui.active }) };
  });
  const tagCount = new Map<string, { t: TagDef; n: number }>();
  for (const r of Object.values(ann.regions)) { const t = tagOf(r); tagCount.set(t.id, { t, n: (tagCount.get(t.id)?.n ?? 0) + 1 }); }
  const tally: { key: string; label: string; style: CSSProperties }[] = [...tagCount.values()]
    .map(({ t, n }) => ({ key: t.id, label: `${n} ${shortOf(t)}`, style: { fontSize: 9.5, fontFamily: MONO, padding: "1px 5px", borderRadius: 3, background: tagColor(t, 0.14), color: tagInk(t), whiteSpace: "nowrap" } }));
  if (open.length) tally.unshift({ key: "open", label: `${open.length} to review`, style: { fontSize: 9.5, fontFamily: MONO, padding: "1px 5px", borderRadius: 3, background: "oklch(0.94 0.05 75)", color: C.unInk, whiteSpace: "nowrap" } });

  const loose = Object.values(ann.regions).filter((r) => !M.isStreamless(r.role) && !M.orderPos(ann, r.id));
  const responsa = new Map<string, string[]>();
  for (const id of order) {
    const r = ann.regions[id];
    if (r?.role !== "main_text" && r?.role !== "title" && r?.role !== "subtitle" && r?.role !== "signature" && r?.role !== "summary" && r?.role !== "date") continue;
    if (!r.responsum_id) continue;
    responsa.set(r.responsum_id, [...(responsa.get(r.responsum_id) ?? []), id]);
  }
  const left = (
    <>
      <Ribbon ticks={ticks} note={!order.length ? "draw or load blocks to begin" : open.length ? "amber = not yet reviewed · click any tick to jump" : "all reviewed · click a tick to jump"} tally={tally} />
      <div style={{ display: "grid", gridTemplateRows: "auto 1fr", minHeight: 0 }}>
        <Row style={{ padding: "8px 10px 6px" }}>
          <Label>Streams</Label>
          <span style={{ fontFamily: MONO, color: C.ink }}>{streamList.length}</span>
          <Spacer />
          <span style={{ fontSize: 10, color: C.faint }}>click a region to go there</span>
        </Row>
        {!Object.keys(ann.regions).length ? (
          <div style={{ margin: "2px 10px 10px", padding: 10, border: `1px dashed ${C.border}`, borderRadius: 5, fontSize: 10.5, lineHeight: 1.5, color: C.muted2 }}>
            No regions yet. Press <b>B</b> and drag a rectangle around each printed block, then choose its type on the right{bundle.proposal ? <> — or <b>P</b> to start from the detector proposal</> : null}.
          </div>
        ) : null}
        <div className="om-scroll" style={{ overflowY: "auto", padding: "0 8px 10px" }}>
          {(ann.groups ?? []).length ? <div style={{ marginBottom: 9, borderBottom: `1px solid ${C.borderSoft}`, paddingBottom: 7 }}>
            <Row style={{ padding: "3px 6px 5px" }}><Label>Groups</Label><Spacer /><span style={{ fontFamily: MONO, fontSize: 10, color: C.muted2 }}>{(ann.groups ?? []).length}</span></Row>
            {(ann.groups ?? []).map((g) => {
              const here = curId ? g.region_ids.includes(curId) : false;
              return <div key={g.id} style={{ display: "flex", alignItems: "center", gap: 7, padding: "4px 7px", marginBottom: 3, borderRadius: 4, border: `1px solid ${here ? C.borderRow : C.borderFaint}`, background: here ? "#fff" : C.panel }}>
                <button onClick={() => selectGroup(g.region_ids)} title="select every region of this group" style={{ display: "flex", flex: 1, alignItems: "center", gap: 7, textAlign: "left", cursor: "pointer", border: "none", background: "transparent", padding: 0, color: C.text, minWidth: 0 }}>
                  <span style={{ width: 9, height: 9, borderRadius: 2, background: `oklch(0.6 0.15 ${g.colorHue})`, flex: "0 0 auto" }} />
                  <span style={{ fontFamily: MONO, fontSize: 11 }}>{g.id}</span>
                  <span dir="rtl" style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: SERIF, fontSize: 11, color: C.muted }}>{g.region_ids.map((i) => ann.regions[i]?.text_hint).filter(Boolean).join(" · ")}</span>
                  <span style={{ fontFamily: MONO, fontSize: 10, color: C.muted2 }}>{g.region_ids.length}</span>
                </button>
                <button onClick={() => apply(M.ungroupRegions(ann, g.region_ids))} title="ungroup" style={{ border: "none", background: "transparent", cursor: "pointer", color: C.muted2, fontSize: 11, padding: 0 }}>✕</button>
              </div>;
            })}
          </div> : null}
          {responsa.size ? <div style={{ marginBottom: 9, borderBottom: `1px solid ${C.borderSoft}`, paddingBottom: 7 }}>
            <Row style={{ padding: "3px 6px 5px" }}><Label>Units</Label><Spacer /><span style={{ fontFamily: MONO, fontSize: 10, color: C.muted2 }}>{responsa.size}</span></Row>
            {[...responsa].map(([name, ids]) => <button key={name} onClick={() => setUi({ cur: order.indexOf(ids[0]), sel: null, active: "main" })} style={{ display: "flex", width: "100%", alignItems: "center", gap: 7, padding: "5px 7px", marginBottom: 3, textAlign: "left", cursor: "pointer", borderRadius: 4, border: `1px solid ${ids.includes(curId) ? C.borderRow : C.borderFaint}`, background: ids.includes(curId) ? "#fff" : C.panel, color: C.text }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: rcol("main_text") }} /><span dir="rtl" style={{ flex: 1, fontFamily: SERIF, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis" }}>{name}</span><span style={{ fontFamily: MONO, fontSize: 10, color: C.muted2 }}>{ids.length}</span>
            </button>)}
          </div> : null}
          {streamList.map((st) => {
            const ids = ann.order[st] ?? [];
            const on = ui.active === st;
            return (
              <div key={st} style={{ marginBottom: 6 }}>
                <div onClick={() => ids.length && setUi({ active: st, cur: order.indexOf(ids[0]), sel: null })} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 6px", borderRadius: 4, cursor: "pointer", background: on ? "#fff" : "transparent", border: `1px solid ${on ? C.borderRow : "transparent"}` }}>
                  <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 500 }}>{st}</span>
                  <Spacer />
                  <button title="⇧O — reorder from the geometry" onClick={(e) => { e.stopPropagation(); apply(M.autoOrder(ann, st)); }} style={{ ...tag("chip"), cursor: "pointer", border: "none" }}>⇧O</button>
                  <span style={{ fontFamily: MONO, fontSize: 10, color: C.muted2 }}>{ids.length}</span>
                </div>
                {ids.map((id, i) => regionRow(id, i))}
              </div>
            );
          })}
          {loose.length ? (
            <div style={{ marginBottom: 6 }}>
              <Row style={{ padding: "3px 6px" }}>
                <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 500, color: C.unInk }}>not in any order</span>
                <Spacer />
                <span style={{ fontFamily: MONO, fontSize: 10, color: C.muted2 }}>{loose.length}</span>
              </Row>
              {loose.map((r, i) => regionRow(r.id, i))}
            </div>
          ) : null}
          {ann.containers.length ? (
            <div style={{ marginTop: 8, borderTop: `1px solid ${C.borderSoft}`, paddingTop: 6 }}>
              <Row style={{ padding: "0 6px 4px" }}>
                <Label>Containers</Label>
                <Spacer />
                <button title="a zone and two columns from the main stream" onClick={() => apply(M.autoColumns(ann, cr?.stream_id ?? "main"), "needs two regions in the stream")} style={{ ...tag("chip"), cursor: "pointer", border: "none" }}>auto</button>
              </Row>
              {ann.containers.map((c) => (
                <Row key={c.id} style={{ padding: "1px 6px", fontSize: 10.5 }}>
                  <span style={{ fontFamily: MONO, color: C.text }}>{c.id}</span>
                  <span style={{ color: C.muted }}>{c.kind}{c.parent_id ? ` in ${c.parent_id}` : ""}</span>
                  <Spacer />
                  <span style={{ fontFamily: MONO, fontSize: 9.5, color: C.faint }}>{Object.values(ann.regions).filter((r) => r.container_id === c.id).length} regions</span>
                  <button onClick={() => apply(M.deleteContainer(ann, c.id))} title="remove" style={{ border: "none", background: "transparent", cursor: "pointer", color: C.muted2, fontSize: 11, padding: 0 }}>✕</button>
                </Row>
              ))}
            </div>
          ) : (
            <div style={{ marginTop: 8, padding: "6px", fontSize: 10, color: C.faint }}>
              No zones or columns yet — <b>Y</b> draws a zone, <b>O</b> a column, or <button onClick={() => apply(M.autoColumns(ann, "main"), "needs two regions in main")} style={{ ...tag("chip"), cursor: "pointer", border: "none" }}>auto</button> from the main stream.
            </div>
          )}
        </div>
      </div>
    </>
  );

  function regionRow(id: string, i: number) {
    const r = ann.regions[id];
    if (!r) return null;
    return (
      <div key={id} onClick={() => setUi({ cur: order.indexOf(id), sel: null, active: r.stream_id ?? ui.active })} style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 6px 2px 14px", borderRadius: 3, cursor: "pointer", fontSize: 10.5, background: id === curId ? "#fff" : "transparent", border: `1px solid ${id === curId ? C.borderRow : "transparent"}` }}>
        <span style={{ fontFamily: MONO, fontSize: 9.5, color: C.faint }}>{String(i + 1).padStart(2, "0")}</span>
        <span style={{ color: tagColor(tagOf(r), 0.95), flex: "0 0 auto", display: "inline-flex" }}><TagGlyph icon={tagOf(r).icon} size={11} /></span>
        <span style={{ fontFamily: MONO, color: C.text }}>{id}</span>
        <span style={{ fontSize: 9, color: C.muted }}>{shortOf(tagOf(r))}</span>
        {r.style_tags?.length ? <span style={{ display: "inline-flex", gap: 2 }}>{r.style_tags.map((t) => <span key={t} title={STYLE_INFO[t].en} style={{ fontFamily: MONO, fontSize: 8.5, lineHeight: "11px", padding: "0 3px", borderRadius: 2, color: "#fff", background: `oklch(0.52 0.15 ${STYLE_INFO[t].hue})` }}>{STYLE_INFO[t].badge}</span>)}</span> : null}
        {M.groupOf(ann, id) ? <span title={`in group ${M.groupOf(ann, id)?.id}`} style={{ fontFamily: MONO, fontSize: 9, padding: "0 4px", borderRadius: 3, color: "#fff", background: `oklch(0.55 0.17 ${M.groupOf(ann, id)?.colorHue ?? 0})` }}>{M.groupOf(ann, id)?.id}</span> : null}
        {!r.verified ? <span style={{ fontSize: 9, padding: "0 4px", borderRadius: 3, color: C.flagInk, background: C.flagBg }}>?</span> : null}
        <span dir="rtl" style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: SERIF, fontSize: 11, color: C.muted }}>{r.text_hint || ""}</span>
      </div>
    );
  }

  const right = (
    <>
      {ui.splitAt != null && cr ? (
        <div style={{ padding: 10, borderBottom: `1px solid ${C.borderSoft}`, background: C.splitBg }}>
          <div style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: C.splitInk, marginBottom: 6 }}>Split {cr.id} across{viewRot ? " (as shown)" : ""}</div>
          <input type="range" min={(splitAxis === "v" ? cr.bbox[0] : cr.bbox[1]) + 2} max={(splitAxis === "v" ? cr.bbox[2] : cr.bbox[3]) - 2} value={ui.splitAt} onChange={(e) => setUi({ splitAt: Number(e.target.value) })} onKeyDown={(e) => e.stopPropagation()} style={{ width: "100%" }} />
          <div style={{ marginTop: 6, fontSize: 11, color: C.text2 }}>{splitAxis === "v" ? "x" : "y"} = {Math.round(ui.splitAt)} px · ↑↓ move the cut (⇧ faster) · <b>Enter</b> commit · <b>Esc</b> cancel</div>
        </div>
      ) : null}

      <div style={{ padding: "7px 10px", borderBottom: `1px solid ${C.borderSoft}`, display: "flex", alignItems: "center", gap: 8 }}>
        <button onClick={turnView} aria-pressed={!!viewRot} title="Turn the page on screen a quarter clockwise — the view only; every box stays in the page's own frame" style={btn(!!viewRot, { height: 24, padding: "0 9px" })}>Rotate view ⟳ (⇧L)</button>
        <span style={{ fontSize: 10.5, color: C.muted2 }}>{viewRot ? `turned ${viewRot}° — boxes are saved upright` : "upright"}</span>
      </div>
      <div style={{ padding: 10, borderBottom: `1px solid ${C.borderSoft}` }}>
        <Row style={{ marginBottom: 7 }}><Label>Block type</Label><Spacer /><span style={{ color: C.muted2, fontSize: 10 }}>{cr ? `selected: ${cr.id}` : "select a box on the page"}</span></Row>
        {!cr ? <div style={{ marginBottom: 8, color: C.text2, fontSize: 11, lineHeight: 1.45 }}>Start with {bundle.proposal ? <><button onClick={toggleProposal} style={btn(false, { height: 23, padding: "0 8px" })}>Suggested boxes · P</button> or </> : null}<button onClick={() => setUi({ tool: "draw" })} style={btn(ui.tool === "draw", { height: 23, padding: "0 8px" })}>Draw a block · B</button>. Check every printed block before finishing.</div> : null}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 4 }}>
          {tags.map((t) => {
            const on = !!cr && tagOf(cr).id === t.id;
            const key = tagKey(t);
            return <button key={t.id} disabled={!cr} onClick={() => setTag(t)} aria-pressed={on} title={`${t.label}${isBuiltin(t, "book") ? "" : ` (written as ${t.base})`}${key ? ` · ${key}` : ""}${t.description ? ` — ${t.description}` : ""}`} style={{ display: "flex", alignItems: "center", gap: 6, minHeight: 32, padding: "4px 6px", borderRadius: 4, cursor: cr ? "pointer" : "default", opacity: cr ? 1 : 0.55, fontFamily: "inherit", textAlign: "left", border: `1px solid ${on ? tagColor(t, 0.95) : C.borderKey}`, background: on ? tagColor(t, 0.16) : "#fff", color: on ? tagInk(t) : C.text2 }}>
              <span style={{ color: tagColor(t), flexShrink: 0, display: "inline-flex" }}><TagGlyph icon={t.icon} size={13} /></span><span style={{ flex: 1, minWidth: 0, fontSize: 10.5, lineHeight: 1.1 }}>{t.label}</span><span style={{ fontFamily: MONO, fontSize: 9, color: C.muted2 }}>{key}</span>
            </button>;
          })}
          {p.project ? <a href={`/?project=${encodeURIComponent(p.project.id)}`} title="Add a custom tag, change icons, colours and keys in the project's schema" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, minHeight: 32, borderRadius: 4, border: `1px dashed ${C.border}`, color: C.muted, fontSize: 10.5, textDecoration: "none" }}>+ Custom tag…</a> : null}
        </div>
        {bundle.roles?.length || p.project?.synthesized === false ? null : <div style={{ marginTop: 7, fontSize: 10, color: C.muted }}>Use Date / dateline for a separate printed date in the responsum. Summary is a synopsis; a short subject line is Title. Page footer is page furniture.</div>}
      </div>

      <div style={{ padding: "8px 10px", borderBottom: `1px solid ${C.borderSoft}` }}>
        <Row style={{ marginBottom: 6 }}><Label>Style</Label><Spacer /><span style={{ color: C.muted2, fontSize: 10 }}>whole box · any mix · ⇧1 ⇧2 ⇧3</span></Row>
        <div role="group" aria-label="Style marks" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 4 }}>
          {STYLE_TAGS.map((t) => {
            const info = STYLE_INFO[t];
            const on = styleOn(t), some = styleSome(t);
            const col = `oklch(0.52 0.15 ${info.hue})`;
            return <button key={t} disabled={!cr && !sel?.length} onClick={() => toggleStyle(t)} aria-pressed={on} title={`${info.en} — ${info.tip} · ${formatChord(info.key)}${some && !on ? " (some of the selection has it)" : ""}`} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, minHeight: 30, padding: "3px 6px", borderRadius: 4, cursor: cr || sel?.length ? "pointer" : "default", opacity: cr || sel?.length ? 1 : 0.55, fontFamily: "inherit", border: `1px ${some && !on ? "dashed" : "solid"} ${on || some ? col : C.borderKey}`, background: on ? `oklch(0.52 0.15 ${info.hue} / 0.14)` : "#fff", color: on ? col : C.text2 }}>
              <span style={{ fontSize: 12, fontWeight: t === "bold" ? 700 : 400, letterSpacing: t === "spaced" ? "0.18em" : undefined }}>{info.en}</span>
              <span style={{ fontFamily: MONO, fontSize: 9, color: C.muted2 }}>{formatChord(info.key)}</span>
            </button>;
          })}
        </div>
      </div>

      <ActionGrid
        groups={[
          {
            label: "Review",
            cols: 3,
            actions: [
              { label: "Accept", tip: "Accept region — its box and role are right", hint: "A", primary: true, icon: <Icon>{I.check}</Icon>, onClick: accept },
              { label: "Accept all", tip: "Accept all regions, mark the page done, next page", hint: "⇧A", primary: true, icon: <Icon>{I.checkAllNext}</Icon>, onClick: acceptAllAndNext },
              { label: "Next page", tip: "Continue to the next page", hint: "⏎", primary: true, icon: <Icon>{I.nextPage}</Icon>, onClick: nextPage },
            ],
          },
          {
            label: "Regions",
            cols: 3,
            actions: [
              { label: "Merge", tip: "Merge the selected regions", hint: "⇧M", icon: <Icon>{I.merge}</Icon>, onClick: merge },
              { label: "Reorder", tip: "Reorder the stream from the geometry", hint: "⇧O", icon: <Icon>{I.reorder}</Icon>, onClick: autoOrder },
              { label: "Next open", tip: "Next region not yet reviewed", hint: "G", icon: <Icon>{I.nextOpen}</Icon>, onClick: gotoOpen },
            ],
          },
          {
            label: "Groups",
            cols: 3,
            actions: [
              { label: "Group", tip: "Group the selected regions into one unit", hint: "Ctrl+G", primary: true, onClick: group },
              { label: "Ungroup", tip: "Dissolve the group of the selected regions", hint: "Ctrl+⇧G", onClick: ungroup },
              { label: "Leave group", tip: "Take the selected regions out of their group", hint: "", onClick: leave },
            ],
          },
        ]}
      />

      <div style={{ padding: 10, borderBottom: `1px solid ${C.borderSoft}` }}>
        <Row style={{ marginBottom: 8 }}>
          <Label>Region</Label>
          <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 500 }}>{cr ? cr.id : "—"}</span>
          {cr ? <span style={tag(cr.verified ? "ok" : "flag")}>{cr.verified ? "reviewed" : "unreviewed"}</span> : null}
          {cr ? <span style={tag("chip")}>{cr.source}</span> : null}
          <Spacer />
          <span style={{ fontFamily: MONO, fontSize: 10, color: C.muted2 }}>{cr ? `${curIdx + 1} / ${order.length}` : order.length ? `${order.length} regions` : ""}</span>
        </Row>
        <Loupe store={hover} imageUrl={bundle.imageUrl} width={bundle.width} height={bundle.height} region={cr?.bbox ?? null} rotation={ann.view_rotation ?? 0} />
        {cr ? (
          <>
            <Row style={{ marginTop: 8, gap: 3 }}>
              <Label>Text rotation · L</Label>
              <Spacer />
              {([[90, "↻ 90°", "tops of the letters point right"], [270, "↺ 270°", "tops of the letters point left"], [180, "⇅ 180°", "upside down"]] as [Rotation, string, string][]).map(([rot, text, tip]) => {
                const on = cr.rotation === rot;
                return <button key={rot} onClick={() => setRotation(on ? null : rot)} aria-pressed={on} style={btn(on)} title={on ? `${tip} — click again for upright` : tip}>{text}</button>;
              })}
            </Row>
            <Row style={{ marginTop: 6, fontSize: 10, color: C.muted, flexWrap: "wrap" }}>
              <span style={{ fontFamily: MONO }}>{cr.bbox.join(", ")}</span>
              <span>· {cr.bbox[2] - cr.bbox[0]}×{cr.bbox[3] - cr.bbox[1]} px</span>
              {cr.container_id ? <span>· in {cr.container_id}</span> : <span>· no container</span>}
              {cr.detector_role ? <span>· detector said {cr.detector_role}{cr.detector_confidence != null ? ` @ ${cr.detector_confidence.toFixed(2)}` : ""}</span> : null}
            </Row>
            {M.groupOf(ann, cr.id) ? (
              <Row style={{ marginTop: 6, fontSize: 10.5, color: C.text2 }}>
                <span style={{ width: 9, height: 9, borderRadius: 2, background: `oklch(0.6 0.15 ${M.groupOf(ann, cr.id)?.colorHue ?? 0})` }} />
                <span>in group <b style={{ fontFamily: MONO }}>{M.groupOf(ann, cr.id)?.id}</b> with {(M.groupOf(ann, cr.id)?.region_ids.length ?? 1) - 1} other region{(M.groupOf(ann, cr.id)?.region_ids.length ?? 0) > 2 ? "s" : ""}</span>
                <Spacer />
                <button onClick={() => selectGroup(M.groupOf(ann, cr.id)?.region_ids ?? [])} style={{ ...tag("chip"), cursor: "pointer", border: "none" }}>select all</button>
              </Row>
            ) : null}
            {cr.cut_from ? (
              <div style={{ marginTop: 6, padding: "4px 6px", borderRadius: 4, background: C.splitBg, fontSize: 10.5, lineHeight: 1.45, color: C.splitInk }}>
                cut {cr.cut_from.seq}: the {cr.cut_from.side} part of <b style={{ fontFamily: MONO }}>{cr.cut_from.parent}</b>, {cr.cut_from.axis === "v" ? "x" : "y"}={cr.cut_from.at} px · other half <b style={{ fontFamily: MONO }}>{cr.cut_from.sibling}</b> · written to the record as <code style={{ fontFamily: MONO }}>cuts[{cr.cut_from.seq - 1}]</code>
              </div>
            ) : null}
            <Row style={{ marginTop: 8, flexWrap: "wrap", gap: 3 }}>
              <Label style={{ width: "100%" }}>Unit id (a letter, article, responsum…)</Label>
              <Field key={`resp${cr.id}`} value={cr.responsum_id ?? ""} placeholder="same id on every block of the unit" onCommit={(v) => apply(M.setField(ann, cr.id, { responsum_id: v.trim() || null }))} />
            </Row>
            <Row style={{ marginTop: 6, flexWrap: "wrap", gap: 3 }}>
              <Label style={{ width: "100%" }}>Boundary in this block</Label>
              {([["unknown", "Unclear"], ["start", "Start"], ["continuation", "Middle"], ["end", "End"], ["whole", "Whole"]] as const).map(([boundary, label]) => (
                <button key={boundary} onClick={() => apply(M.setField(ann, cr.id, { responsum_boundary: boundary }))} aria-pressed={(cr.responsum_boundary ?? "unknown") === boundary} style={btn((cr.responsum_boundary ?? "unknown") === boundary, { padding: "0 6px", height: 22, fontSize: 10 })}>{label}</button>
              ))}
            </Row>
            <Row style={{ marginTop: 8, gap: 3 }}>
              <Label>Confidence</Label>
              {BOOK_CONFIDENCE.map((c) => (
                <button key={c} onClick={() => apply(M.setField(ann, cr.id, { confidence: c }))} style={btn(cr.confidence === c, { padding: "0 7px" })}>{c}</button>
              ))}
              <Spacer />
              <Field value={cr.subtype ?? ""} placeholder="subtype (dateline…)" onCommit={(v) => apply(M.setField(ann, cr.id, { subtype: v.trim() || null }))} style={{ width: 120, height: 22, fontSize: 10 }} />
            </Row>
            <Row style={{ alignItems: "baseline", marginTop: 8 }}>
              <Label>Text hint</Label>
              <span style={{ fontSize: 10, color: C.faint }}>T · a few legible words, not a transcription</span>
            </Row>
            <FieldRef key={`t${cr.id}`} inputRef={textHintRef} value={cr.text_hint} rtl placeholder="—" onCommit={(v) => apply(M.setField(ann, cr.id, { text_hint: v }))} style={{ ...hebrewBox, padding: "4px 8px", fontSize: 13 }} />
            {cr.role === "unknown" ? (
              <>
                <Row style={{ alignItems: "baseline", marginTop: 6 }}>
                  <Label style={{ color: C.unInk }}>Ambiguity reason</Label>
                  <span style={{ fontSize: 10, color: C.faint }}>U · required for every unknown</span>
                </Row>
                <FieldRef key={`u${cr.id}`} inputRef={reasonRef} value={cr.ambiguity_reason} placeholder="why the evidence does not decide the role" onCommit={(v) => apply(M.setField(ann, cr.id, { ambiguity_reason: v }))} style={{ borderColor: cr.ambiguity_reason ? C.border : C.un }} />
              </>
            ) : null}
          </>
        ) : null}
      </div>

      <div style={{ padding: 10, borderBottom: `1px solid ${C.borderSoft}` }}>
        <Row style={{ alignItems: "baseline", marginBottom: 5 }}>
          <Label>Layout notes</Label>
          <span style={{ fontSize: 10, color: C.faint }}>one per line</span>
        </Row>
        <Field value={ann.layout_notes.join("\n")} multiline placeholder="what this page's layout is: columns, apparatus, headings…" onCommit={(v) => apply(M.setNotes(ann, "layout_notes", v.split("\n")))} />
      </div>

      <div style={{ padding: 10, borderBottom: `1px solid ${C.borderSoft}` }}>
        <Row style={{ alignItems: "baseline", marginBottom: 5 }}>
          <Label>Book layout tags</Label>
          <span style={{ fontSize: 10, color: C.faint }}>sampling guidance, not region labels</span>
        </Row>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
          {BOOK_LAYOUT_TAGS.map((t) => (
            <button key={t} onClick={() => apply(M.toggleTag(ann, t))} style={btn(ann.layout_tags.includes(t), { padding: "0 6px", fontSize: 10, height: 20 })}>{t}</button>
          ))}
        </div>
      </div>

    </>
  );

  const toolCmd = (tool: "select" | "draw" | "zone" | "column", toast: string) => () => setUi({ tool, toast });
  const none = !cr && !sel?.length;
  // `defaultKeys` are the keys the mode always had; the project's key map may move them
  // (Help ▸ Keyboard shortcuts). `context` puts a command on the right-click menu.
  const commands: Command[] = [
    { id: "accept", group: "Review", label: "Accept region — its box and role are right", defaultKeys: ["A"], run: accept, disabled: none, context: "unit", icon: <Icon size={13}>{I.check}</Icon> },
    { id: "accept-all", group: "Review", label: "Accept all, mark the page done, next page", defaultKeys: ["Shift+A"], run: acceptAllAndNext, context: "blank" },
    { id: "next-page", group: "Review", label: "Next page", defaultKeys: ["Enter"], keywords: "continue", run: nextPage },
    { id: "next-open", group: "Review", label: "Next region not yet reviewed", defaultKeys: ["G", "Shift+G"], keywords: "open unreviewed", run: gotoOpen },
    ...tags.map((t): Command => ({ id: `tag:${t.id}`, group: "Block type", label: t.label, defaultKeys: t.key ? [t.key] : [], keywords: `role tag ${t.base} ${t.id}`, run: () => setTag(t), disabled: none, context: "unit", checked: !!cr && tagOf(cr).id === t.id, icon: <span style={{ color: tagColor(t), display: "inline-flex" }}><TagGlyph icon={t.icon} size={12} /></span> })),
    { id: "down", group: "Selection", label: "Next region in reading order", defaultKeys: ["ArrowDown", "J"], keywords: "walk", run: () => move(1, false) },
    { id: "up", group: "Selection", label: "Previous region in reading order", defaultKeys: ["ArrowUp", "K"], keywords: "walk", run: () => move(-1, false) },
    { id: "deselect", group: "Selection", label: "Drop the selection", keys: "Esc", keywords: "deselect clear", run: deselect, context: "blank" },
    { id: "delete", group: "Regions", label: "Delete region", defaultKeys: ["X", "Shift+X", "Delete", "Backspace"], keywords: "remove spurious", run: del, disabled: none, context: "unit" },
    { id: "merge", group: "Regions", label: "Merge the selection", defaultKeys: ["Shift+M"], keywords: "join combine", run: merge, disabled: (sel?.length ?? 0) < 2, context: "unit" },
    { id: "split", group: "Regions", label: "Split region across (as the page is shown)", defaultKeys: ["S", "Shift+S"], run: startSplit, disabled: !cr, context: "unit" },
    { id: "earlier", group: "Regions", label: "Move earlier in the stream", defaultKeys: [","], keywords: "order", run: () => reorder(-1), disabled: !cr, context: "unit" },
    { id: "later", group: "Regions", label: "Move later in the stream", defaultKeys: ["."], keywords: "order", run: () => reorder(1), disabled: !cr, context: "unit" },
    { id: "auto-order", group: "Regions", label: "Reorder the stream from the geometry", defaultKeys: ["Shift+O"], keywords: "sort", run: autoOrder },
    { id: "text-hint", group: "Regions", label: "Type the text hint", defaultKeys: ["T", "Shift+T"], run: () => textHintRef.current?.focus(), disabled: !cr, context: "unit" },
    { id: "unknown-reason", group: "Regions", label: "Mark unclear and type the reason", keywords: "ambiguity unknown", run: () => { if (cr && cr.role !== "unknown") apply(M.setRole(ann, [cr.id], "unknown")); setTimeout(() => reasonRef.current?.focus(), 0); }, disabled: !cr },
    { id: "group", group: "Groups", label: "Group the selected regions into one unit", defaultKeys: ["Ctrl+G"], keywords: "join together unit", run: group, context: "unit" },
    { id: "ungroup", group: "Groups", label: "Ungroup — dissolve the group of the selection", defaultKeys: ["Ctrl+Shift+G"], keywords: "dissolve", run: ungroup, disabled: !targetIds().some((id) => M.groupOf(ann, id)), context: "unit" },
    { id: "leave-group", group: "Groups", label: "Take the selection out of its group", keywords: "remove from group", run: leave, disabled: !targetIds().some((id) => M.groupOf(ann, id)) },
    ...STREAMS.map((st): Command => ({ id: `stream-${st}`, group: "Stream", label: `Stream: ${st}`, run: () => setStream(st), disabled: none, context: "unit", checked: !!cr && cr.stream_id === st })),
    { id: "rot-cycle", group: "Text rotation", label: "Cycle the text rotation", defaultKeys: ["L"], keywords: "rotation turn", run: cycleRotation, disabled: !cr },
    ...([[90, "Text rotated 90° clockwise"], [270, "Text rotated 90° counter-clockwise"], [180, "Text upside down (180°)"], [null, "Text upright"]] as [Rotation | null, string][]).map(([rot, label]): Command => ({ id: `rot-${rot ?? 0}`, group: "Text rotation", label, keywords: "rotation turn", run: () => setRotation(rot), disabled: !cr, context: "unit", checked: !!cr && (cr.rotation ?? null) === rot })),
    ...STYLE_TAGS.map((t): Command => ({ id: `style-${t}`, group: "Style", label: `${STYLE_INFO[t].en} — ${STYLE_INFO[t].tip}`, defaultKeys: [STYLE_INFO[t].key], keywords: "style typography mark bold centered centred spaced letter-spaced tracking", run: () => toggleStyle(t), disabled: none, context: "unit", checked: styleOn(t) })),
    { id: "tool-select", group: "Tools", label: "Select tool", defaultKeys: ["V", "Shift+V"], run: toolCmd("select", "select tool — click a region, drag its handles"), checked: ui.tool === "select" },
    { id: "tool-draw", group: "Tools", label: "Draw region", defaultKeys: ["B", "Shift+B"], keywords: "new box rectangle", run: toolCmd("draw", "draw region — drag a rectangle around the ink"), checked: ui.tool === "draw", context: "blank" },
    { id: "tool-zone", group: "Tools", label: "Draw zone", defaultKeys: ["Y", "Shift+Y"], run: toolCmd("zone", "draw zone — drag a vertical band of the page"), checked: ui.tool === "zone", context: "blank" },
    { id: "tool-column", group: "Tools", label: "Draw column", defaultKeys: ["O"], run: toolCmd("column", "draw column — drag inside a zone"), checked: ui.tool === "column" },
    { id: "tool-cut", group: "Tools", label: "Cut tool (again flips across / down)", defaultKeys: ["W"], keywords: "split", run: () => { const onPage = cutAxisOf(ui.tool); const seen = onPage ? pageAxis(onPage, viewRot) : null; cutTool(seen === "h" ? "v" : "h"); } },
    { id: "tool-cut-h", group: "Tools", label: "Cut across", keywords: "split", run: () => cutTool("h"), checked: ui.tool === "cut-h" },
    { id: "tool-cut-v", group: "Tools", label: "Cut down", defaultKeys: ["Shift+W"], keywords: "split", run: () => cutTool("v"), checked: ui.tool === "cut-v" },
    { id: "turn", group: "View", label: ann.view_rotation ? `Turn the page on (now ${ann.view_rotation}°)` : "Turn the page a quarter clockwise", defaultKeys: ["Shift+L"], keywords: "rotate view", run: turnView, context: "blank" },
    ...(bundle.proposal ? [{ id: "proposal", group: "Pages", label: ann.mode === "proposal" ? "Drop the detector proposal" : "Load the detector proposal", defaultKeys: ["P", "Shift+P"], keywords: "suggested boxes", run: toggleProposal, context: "blank" as const }] : []),
  ];
  // A stream outside the list: typed as "stream <name>".
  const extraCommands = (q: string): Command[] => {
    const m = /^stream[:\s]+(\S.*)$/i.exec(q.trim());
    const st = m?.[1]?.trim();
    return st ? [{ id: `stream-custom-${st}`, group: "Stream", label: `Set the stream to “${st}”`, run: () => setStream(st), disabled: !cr && !sel?.length }] : [];
  };

  const total = order.length, placed = total - open.length;
  const view: ModeView = {
    meta: `${bundle.width}×${bundle.height} px · ${total} regions · ${(ann.groups ?? []).length} groups · ${streamList.length} streams · ${ann.containers.length} containers`,
    progress: { placed, total, openLabel: !total ? "draw blocks · B" : open.length ? `${open.length} to review  G` : "all reviewed ✓", complete: total > 0 && open.length === 0 },
    gotoOpen,
    proposal: bundle.proposal ? { label: ann.mode === "proposal" ? ann.ops > 1 ? "Suggestions loaded" : "Suggested boxes · drop" : ann.mode === "existing" && Object.keys(ann.regions).length ? "Add suggested boxes  P" : "Suggested boxes  P", on: ann.mode === "proposal", onClick: toggleProposal } : null,
    done: ann.done,
    canDone: complete,
    toggleDone,
    focus: cr?.bbox ?? null,
    focusKey: `${curId}|${bundle.id}|${ui.zoom}|${ann.view_rotation ?? 0}`,
    rotation: ann.view_rotation ?? 0,
    rects,
    overlays,
    arrows,
    tools: TOOLS,
    toggles: [
      { key: "rules", label: "Rules", on: ui.showRules, onClick: () => setUi({ showRules: !ui.showRules }) },
      { key: "containers", label: "Containers", on: ui.showContainers, onClick: () => setUi({ showContainers: !ui.showContainers }) },
      { key: "chips", label: "Labels", on: ui.showChips, onClick: () => setUi({ showChips: !ui.showChips }) },
      { key: "turn", label: ann.view_rotation ? `Page turned ${ann.view_rotation}° · ⇧L` : "Turn page · ⇧L", on: !!ann.view_rotation, onClick: turnView },
    ],
    toolNote: ui.tool === "cut-h" ? "cut across — click inside a region to cut it into an upper and a lower part · W flips the axis · Esc leaves" : ui.tool === "cut-v" ? "cut down — click inside a region to cut it into a right and a left part · Esc leaves" : ui.tool === "draw" ? "drag a rectangle around the ink — the region is recorded as source: human" : ui.tool === "zone" ? "drag a vertical band — columns are found inside a zone" : ui.tool === "column" ? "drag a column inside a zone" : "click a region · drag its handles · shift+click for a range · ctrl+click adds one · drag on the page to select several",
    modeHint: { text: ann.mode === "proposal" ? "detector proposal — dashed = not yet reviewed · roles are suggestions" : ann.mode === "existing" ? "editing the annotation on disk — dashed = not yet re-reviewed" : "drawn by hand", on: ann.mode !== "empty" },
    left,
    right,
    onKey,
    modal: ui.splitAt != null && !!cr,
    contextTitle: (id) => { const r = id == null ? null : ann.regions[String(id)]; if (!r) return "Page"; const n = sel?.length ?? 0; return n > 1 ? `${n} regions selected` : `Region ${r.id} · ${tagOf(r).label}${r.verified ? "" : " · unreviewed"}`; },
    onMarquee,
    onPick,
    onBlankClick: () => { if (ui.tool === "select") deselect(); },
    commands,
    extraCommands,
    onHover: hover.set,
    onCut: (id, x, y) => cutAt(String(id), x, y),
    onCutBlank: cutBlank,
    onBoxChange,
    export: {
      title: `Export ${bundle.id}.json`,
      subtitle: "layout schema 0.1 · xyxy_0_1000 · route: manual",
      checks,
      note: complete ? "complete: every region reviewed, streamed and ordered" : `${open.length} regions not yet reviewed — export is allowed but the page is not complete`,
      build: () => buildBookPage(ann, bundle),
    },
    opsLabel: `${ann.ops} acts · ${ann.mode} start`,
  };

  const onWrite = async () => {
    const wrote = await s.save(buildBookPage(ann, bundle));
    s.toast(wrote ? `wrote ${wrote}` : "could not write — is the instance writable?");
    setUi({ exportOpen: false });
  };

  return (
    <Shell
      kind="book"
      wsLabel={p.wsLabel}
      pageId={bundle.id}
      pages={p.pages}
      width={bundle.width}
      height={bundle.height}
      imageUrl={bundle.imageUrl}
      session={s}
      view={view}
      onGoPage={p.onGoPage}
      onPickPage={p.onPickPage}
      onWrite={() => void onWrite()}
      project={p.project}
      onProjectChanged={p.onProjectChanged}
      writable={p.writable}
    />
  );
}

/** The style marks of a region, drawn inside its bottom-left corner: B bold, C centred,
 *  S letter-spaced. Hebrew names and the English ones are in the tooltip. */
function StyleMarks({ tags }: { tags: StyleTag[] | undefined }) {
  if (!tags?.length) return null;
  return (
    <span aria-hidden="true" style={{ position: "absolute", bottom: 2, left: 2, display: "flex", gap: 2, pointerEvents: "none", zIndex: 2 }}>
      {tags.map((t) => <span key={t} title={STYLE_INFO[t].en} style={{ padding: "0 4px", fontSize: 10, lineHeight: "14px", fontWeight: 700, fontFamily: MONO, color: "#fff", background: `oklch(0.52 0.15 ${STYLE_INFO[t].hue})`, borderRadius: 3, whiteSpace: "nowrap" }}>{STYLE_INFO[t].badge}</span>)}
    </span>
  );
}

/** `Field` with a ref, so a key can put the caret in it. */
function FieldRef(p: { inputRef: React.RefObject<HTMLInputElement | null>; value: string; placeholder?: string; rtl?: boolean; onCommit: (v: string) => void; style?: CSSProperties }) {
  return (
    <div ref={(el) => { p.inputRef.current = el?.querySelector("input") ?? null; }}>
      <Field value={p.value} placeholder={p.placeholder} rtl={p.rtl} onCommit={p.onCommit} style={p.style} />
    </div>
  );
}
