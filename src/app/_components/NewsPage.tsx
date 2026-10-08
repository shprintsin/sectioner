"use client";

// The newspaper mode: blocks walked in reading order, grouped into sections. A
// transcription of `Sectioner.dc.html` onto the pure model in `_lib/news/model.ts`.

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { clampBox, intersection } from "../_lib/geometry";
import * as M from "../_lib/news/model";
import { articleColor, blockTag, sectionTag } from "../_lib/news/display";
import { buildPage, isComplete, validate } from "../_lib/news/export";
import { defaultTags, formatChord, isBuiltin, normalizeChord, tagColor, tagFor, tagInk, type ResolvedProject, type TagDef } from "../_lib/project";
import { C, MONO, NEWS_SHORT, SERIF, hebrewBox, tag, tcol } from "../_lib/tokens";
import type { Ann, BBox, Bundle, NewsAnn, NewsBundle, NewsRole, NewsSection, NewsType, PageSummary, Rotation } from "../_lib/types";
import { NEWS_ROLES } from "../_lib/types";
import type { ArrowSpec, OverlaySpec, RectSpec, UiState } from "../_lib/ui";
import { cutAxisOf } from "../_lib/ui";
import Shell from "./Shell";
import { ActionGrid, Field, KeyRows, Label, Ribbon, Row, Spacer, type Tick, type ToolDef } from "./bits";
import type { Command } from "./CommandPalette";
import type { ModeView } from "./modeTypes";
import { TagGlyph } from "./tagIcons";
import type { KeyInput } from "../_lib/keys";
import { usePageSession } from "./session";
import { FlagTag, NewsTypeGlyph, RotationTag, blockMarks, type NewsVisualKind } from "./NewsTypeVisual";

// The types a reviewer can give are the project's tags (`_lib/project.ts`). By default
// Department (SECTION) and Imprint are no longer offered, and a table of contents is a
// character of blocks (the `toc_list` role, so an article can contain one), not a kind of
// section; a saved section that has one of these types keeps it. The number keys keep
// their old digits (1–9 over NEWS_TYPES): 6 tags TOC blocks, and 5 and 7 do nothing,
// rather than shifting every habit by one.

const TOOLS: ToolDef[] = [
  { tool: "select", key: "V", glyph: "▣", name: "Select", hint: "click a block · double-click to resize · drag to lasso a run" },
  { tool: "lasso", key: "L", glyph: "⬚", name: "Lasso → section", hint: "drag around an advertisement — it becomes one section" },
  { tool: "draw", key: "N", glyph: "✚", name: "New box", hint: "drag a rectangle or thin line, then classify the box" },
  { tool: "cut-h", key: "W", glyph: "⬓", name: "Cut across", hint: "click inside a box to cut it into an upper and a lower box" },
  { tool: "cut-v", key: "⇧W", glyph: "◨", name: "Cut down", hint: "click inside a box to cut it into a right and a left box" },
];

const KEYS: [string, string][] = [
  ["Double-click", "resize box: drag an edge or corner · Esc finishes"],
  ["Ctrl+G", "group selected blocks; a whole article (A…) in the selection keeps its id"],
  ["Ctrl+⇧G", "group selected blocks as a new section, always a new id"],
  ["Shift+click", "add or remove one block from selection"],
  ["Ctrl+click", "add or remove one block from selection · Ctrl+drag adds every touched block"],
  ["Space", "current block → active section (the 77% answer)"],
  ["N", "draw a new box, then classify it"],
  ["Enter", "continue to the next page"],
  ["1 – 9", "set the section's type"],
  ["T", "this block is the printed headline → title"],
  ["H", "toggle H2 / subheading on selected blocks"],
  ["⇧H", "toggle section title (§, above H1) on selected blocks"],
  ["Y", "toggle author (byline / signature) on selected blocks"],
  ["6", "toggle table of contents on selected blocks (they stay in their article)"],
  ["C", "toggle centred text on selected blocks"],
  ["O", "rotation flag: 90° clockwise → 90° counter-clockwise → 180° → none"],
  ["!", "flag the selected blocks for review (again clears) · note in the inspector"],
  ["⇧F", "toggle footnote on selected blocks"],
  ["X", "skip: printed rule, ornament, noise"],
  ["↑ ↓ / J K", "walk blocks in RTL reading order"],
  ["⇧ ↑ ↓", "extend the range · drag on scan = lasso"],
  ["V L N", "tools: select · lasso→section · new box"],
  ["W / ⇧W", "cut tool: click inside a box to cut it across / down — W again flips the axis"],
  ["G", "jump to next unassigned block"],
  ["A", "approve all remaining sections, then the next page"],
  ["⇧A", "approve all remaining sections on this page"],
  ["M / ⇧M", "merge sections / merge blocks (repair)"],
  ["S / ⇧S", "split block between lines / split section"],
  ["D", "dissolve the active section"],
  ["Del", "delete a spurious block"],
  [", .", "move the block earlier / later in reading order"],
  ["< >", "continues from previous / to next page"],
  ["R", "cycle the block's role (secondary)"],
  ["F", "flag the page with a note"],
  ["Z + − 0", "zoom · ⌘wheel · [ ] previous / next page"],
  ["⌘Z / U", "undo, to any depth · ⇧⌘Z redo"],
];

export interface NewsPageProps {
  ws: string;
  wsLabel: string;
  writable: boolean;
  bundle: NewsBundle;
  pages: PageSummary[];
  onGoPage: (delta: number) => void;
  onPickPage: (id: string) => void;
  onSaved: (summary: PageSummary) => void;
  /** Load another page of the working set — the tab's own copy when it has one. */
  loadBundle: (id: string) => Promise<Bundle>;
  /** Every change of this page's annotation, so the tab's copy stays current. */
  onAnn: (id: string, ann: Ann) => void;
  /** The working set's project: the section types this page offers and the key map. */
  project?: ResolvedProject;
  onProjectChanged?: () => void;
}

/** What survives the editing focus moving to the other page of a spread: the view, the
 *  spread itself, and the block that was clicked on the page coming into focus. Read
 *  once by the page it names, then dropped. */
let handoff: { pageId: string; direction: "previous" | "next"; blockId: number | null; advanced: boolean; ui: Partial<UiState> } | null = null;

function counts(ann: NewsAnn, bundle: NewsBundle) {
  const order = M.orderOf(ann, bundle.columnBounds, bundle.width);
  return { units: ann.sections.length, open: M.unassigned(ann, order).length + ann.sections.filter((s) => !s.verified).length };
}

/** Neighboring page: show the saved article map without making that page editable here. */
function neighborRects(bundle: NewsBundle): RectSpec[] {
  const ann = bundle.session ?? M.initNews(bundle);
  const membership = M.assignMap(ann);
  const contextGroups = new Map<string, number[]>();
  for (const b of Object.values(ann.blocks)) {
    if (b.geometryEdit || b.inputEvidence?.geometryStatus !== "source_parent_context_only") continue;
    const key = `${b.inputEvidence.parentBlockId}|${b.bbox.join(",")}`;
    contextGroups.set(key, [...(contextGroups.get(key) ?? []), b.id]);
  }
  const seenContexts = new Set<string>();
  return Object.values(ann.blocks).flatMap((b): RectSpec[] => {
    const contextKey = !b.geometryEdit && b.inputEvidence?.geometryStatus === "source_parent_context_only"
      ? `${b.inputEvidence.parentBlockId}|${b.bbox.join(",")}` : null;
    if (contextKey && seenContexts.has(contextKey)) return [];
    if (contextKey) seenContexts.add(contextKey);
    const owners = contextKey ? new Set((contextGroups.get(contextKey) ?? []).map(id => membership[id])) : new Set([membership[b.id]]);
    const sec = owners.size === 1 ? M.sectionOf(ann, membership[b.id] ?? null) : undefined;
    const ink = sec ? articleColor(sec) : C.un;
    const separator = b.role === "separator" || b.label === "separator";
    const mk = separator || contextKey ? null : blockMarks(b, sec, sec?.titleBlockId === b.id, ink);
    const style: CSSProperties = {
      // Longhands only: mixing `border` with the marks' borderWidth/Style/Color makes
      // React warn on every render.
      borderWidth: separator ? 2 : 1,
      borderStyle: separator ? "double" : "solid",
      borderColor: separator ? "#666" : ink,
      ...(mk?.style ?? {}),
      background: sec && !contextKey ? articleColor(sec, 0.08) : "transparent",
      zIndex: 2,
    };
    const chip = sec && b.role !== "separator" && b.label !== "separator" ? sectionTag(sec) : undefined;
    return [{ key: String(b.id), id: b.id, bbox: b.bbox, style, pick: false, chip,
      decoration: mk ? mk.marks : <>{b.rotation ? <RotationTag rotation={b.rotation} /> : null}{b.flag ? <FlagTag note={b.flag.note} /> : null}</>,
      chipStyle: chip ? { position: "absolute", top: -1, left: -1, padding: "0 3px", fontSize: 10, lineHeight: "13px", fontFamily: MONO, background: ink, color: "#fff", borderRadius: "2px 0 3px 0", whiteSpace: "nowrap" } : undefined,
      title: `${chip ?? "Unassigned"} · ${sec?.type ?? ""} · ${b.text.slice(0, 90)}` }];
  });
}

export default function NewsPage(p: NewsPageProps) {
  const { bundle } = p;
  const [arrived] = useState(() => {
    const h = handoff?.pageId === bundle.id ? handoff : null;
    handoff = null;
    return h;
  });
  const [focusArticle, setFocusArticle] = useState(false);
  const [resizeId, setResizeId] = useState<number | null>(null);
  const [isolateBlock, setIsolateBlock] = useState(false);
  const [advanced, setAdvanced] = useState(arrived?.advanced ?? false);
  const issuePages = useMemo(() => p.pages.filter(page => page.id.startsWith(`${bundle.id.split(".")[0]}.`)), [p.pages, bundle.id]);
  const issueIndex = issuePages.findIndex(page => page.id === bundle.id);
  const previousId = issueIndex > 0 ? issuePages[issueIndex - 1].id : null;
  const nextId = issueIndex >= 0 && issueIndex + 1 < issuePages.length ? issuePages[issueIndex + 1].id : null;
  // Read on first render (this component only ever renders in the browser), so a page
  // that takes over the editing focus opens as a spread instead of flashing single.
  const [twoPage, setTwoPage] = useState(() => { try { return window.localStorage.getItem("sectioner.twoPage") === "true"; } catch { return false; } });
  const arrivedDirection = arrived && (arrived.direction === "previous" ? previousId : nextId) ? arrived.direction : null;
  const [neighborDirection, setNeighborDirection] = useState<"previous" | "next">(arrivedDirection ?? (previousId ? "previous" : "next"));
  const neighborId = neighborDirection === "previous" ? previousId : nextId;
  const [neighborState, setNeighborState] = useState<{ id: string; bundle: NewsBundle | null; error: string | null } | null>(null);
  const { loadBundle } = p;
  useEffect(() => {
    if (!twoPage || !neighborId) return;
    let live = true;
    setNeighborState(prev => prev?.id === neighborId && prev.bundle ? prev : { id: neighborId, bundle: null, error: null });
    loadBundle(neighborId).then(
      data => {
        if (!live) return;
        if (data.kind !== "newspaper") setNeighborState({ id: neighborId, bundle: null, error: "The neighboring page is not a newspaper page" });
        else setNeighborState({ id: neighborId, bundle: data, error: null });
      },
      error => { if (live) setNeighborState({ id: neighborId, bundle: null, error: String(error) }); },
    );
    return () => { live = false; };
  }, [twoPage, neighborId, loadBundle]);
  const neighborBundle = neighborState?.id === neighborId ? neighborState.bundle : null;
  const companionRects = useMemo(() => neighborBundle ? neighborRects(neighborBundle) : [], [neighborBundle]);
  const toggleTwoPage = () => {
    const enabled = !twoPage;
    setTwoPage(enabled);
    window.localStorage.setItem("sectioner.twoPage", String(enabled));
  };
  const [initialAnn] = useState(() => bundle.session ?? M.initNews(bundle));
  const [uiSeed] = useState((): Partial<UiState> | undefined => {
    if (!arrived) return undefined;
    if (arrived.blockId == null || !initialAnn.blocks[arrived.blockId]) return { ...arrived.ui, cur: 0 };
    const cur = M.orderOf(initialAnn, bundle.columnBounds, bundle.width).indexOf(arrived.blockId);
    const active = M.assignMap(initialAnn)[arrived.blockId] ?? null;
    return { ...arrived.ui, cur: Math.max(0, cur), sel: cur >= 0 ? [arrived.blockId] : null, active };
  });
  const s = usePageSession<NewsAnn>(initialAnn, {
    ws: p.ws,
    id: bundle.id,
    writable: p.writable,
    counts: (a) => counts(a as NewsAnn, bundle),
    outputIfDone: (a) => ((a as NewsAnn).done ? buildPage(a as NewsAnn, bundle) : undefined),
    onSaved: p.onSaved,
  }, uiSeed);
  const { ann, ui, setUi } = s;
  // The section types this page offers: the project's schema, else what it always offered.
  const tags: TagDef[] = useMemo(() => p.project?.tags ?? defaultTags("newspaper"), [p.project]);
  const tagOfSection = (sec: NewsSection) => tagFor(tags, "newspaper", sec.type, sec.tag?.base === sec.type ? sec.tag.id : null);
  const shortOf = (t: TagDef) => (isBuiltin(t, "newspaper") ? NEWS_SHORT[t.base as NewsType] : t.label.length > 14 ? `${t.label.slice(0, 13)}…` : t.label);
  /** The key a tag answers to under the project's key map, as printed. */
  const tagKey = (t: TagDef) => { const over = p.project?.keymap[`tag:${t.id}`]; const k = over ? over[0] : t.key; const c = k ? normalizeChord(k) : null; return c ? formatChord(c) : ""; };

  // The article ids the issue's other pages hold, so a new group's id is unique across
  // the issue. Until they are read no id is minted (an early act stays unkeyed and is
  // keyed by the next one), so a key can never collide with an unread page.
  const issueIds = issuePages.map(pg => pg.id).filter(id => id !== bundle.id).join("|");
  const [issueKeys, setIssueKeys] = useState<Set<string> | null>(null);
  useEffect(() => {
    let live = true;
    const ids = issueIds ? issueIds.split("|") : [];
    void Promise.all(ids.map(id => loadBundle(id).catch(() => null))).then(bs => {
      if (!live) return;
      const keys = new Set<string>();
      for (const b of bs) {
        if (b?.kind !== "newspaper") continue;
        for (const sec of (b.session ?? M.initNews(b)).sections) if (sec.articleKey?.trim()) keys.add(sec.articleKey.trim());
        for (const pr of b.proposal) if (pr.articleKey?.trim()) keys.add(pr.articleKey.trim());
      }
      setIssueKeys(keys);
    });
    return () => { live = false; };
  }, [issueIds, loadBundle]);
  const reservedKeys = useMemo(() => {
    const keys = new Set(issueKeys ?? []);
    for (const sec of neighborState?.bundle?.session?.sections ?? []) if (sec.articleKey?.trim()) keys.add(sec.articleKey.trim());
    return keys;
  }, [issueKeys, neighborState]);
  /** Every act, with any group it left without an id given an issue-wide one. */
  const apply = (res: M.Result | null, fallback?: string) => {
    if (res && issueKeys && p.writable) res = { ...res, ann: M.keySections(res.ann, reservedKeys, M.orderOf(res.ann, bundle.columnBounds, bundle.width)) };
    s.apply(res, fallback);
  };
  // A page opened with unkeyed groups (older sessions) gets its ids once the issue's
  // are known, as one undoable act.
  const keyedOnce = useRef(false);
  useEffect(() => {
    if (keyedOnce.current || !issueKeys || !p.writable) return;
    keyedOnce.current = true;
    const n = ann.sections.filter(sec => !sec.articleKey?.trim()).length;
    if (!n) return;
    const keyed = M.keySections(ann, reservedKeys, M.orderOf(ann, bundle.columnBounds, bundle.width));
    s.apply({ ann: { ...keyed, ops: keyed.ops + 1 }, move: {}, note: `${n} group${n > 1 ? "s" : ""} given issue-wide article ids (A…) — the same id now means the same article on every page` });
  }, [issueKeys]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Link the active section to a section of the facing page: both carry one article id.
   *  A facing section with no id yet is given one, and that page's session is written
   *  here — it is not open for editing, so nothing else holds it. */
  /** The facing section's article id, giving it one (and saving that page) if it has none. */
  const neighborKey = async (target: NewsSection): Promise<string | null> => {
    const nb = neighborBundle;
    if (!nb || !p.writable) return null;
    let key = target.articleKey?.trim();
    if (!key) {
      key = M.nextArticleKey([...reservedKeys, ...ann.sections.map(sec => sec.articleKey ?? "")]);
      const nAnn = structuredClone(nb.session ?? M.initNews(nb));
      const nSec = nAnn.sections.find(sec => sec.id === target.id);
      if (!nSec) return null;
      nSec.articleKey = key;
      nSec.colorHue = undefined;
      if (neighborDirection === "previous") nSec.continuesTo = true;
      else nSec.continuesFrom = true;
      nAnn.ops += 1;
      const c = counts(nAnn, nb);
      const res = await fetch(`/api/session?ws=${encodeURIComponent(p.ws)}&id=${encodeURIComponent(nb.id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session: nAnn, n_units: c.units, n_open: c.open, output: nAnn.done ? buildPage(nAnn, nb) : undefined }),
      });
      if (!res.ok) { s.toast(`could not write ${nb.id} — nothing was changed`); return null; }
      p.onAnn(nb.id, nAnn);
      setNeighborState({ id: nb.id, bundle: { ...nb, session: nAnn }, error: null });
    }
    return key;
  };
  const linkToNeighbor = async (target: NewsSection) => {
    const sid = ui.active;
    if (!sid) return s.toast("choose a section on this page first");
    const key = await neighborKey(target);
    if (key) apply(M.linkArticle(ann, sid, key, neighborDirection, order), "choose a section on this page first");
  };
  /** A typed article id. An id the facing page shows (its A-id, or a page-local label
   *  like s5 it still carries) links to that section, so both pages end with one id; any
   *  other text is taken as typed. */
  const setKeyTyped = (sid: string, value: string) => {
    const typed = value.trim();
    const facing = typed ? neighborRows?.find(x => x.articleKey?.trim() === typed || (!x.articleKey?.trim() && x.id === typed)) : undefined;
    if (facing && sid === ui.active) { void linkToNeighbor(facing); return; }
    apply(M.setArticleKey(ann, sid, value));
    if (/^s[0-9]+$/.test(typed)) s.toast(`${typed} is a page-local group number, not an article id — pick the article in the sidebar under the other page`);
  };
  /** Selected blocks here + a section of the facing page: they are that article. */
  const assignToNeighbor = async (target: NewsSection) => {
    const ids = targetIds();
    if (!ids.length) return s.toast("select blocks on this page first");
    const key = await neighborKey(target);
    if (key) apply(M.assignToArticle(ann, ids, key, neighborDirection, order), "could not assign the selection");
  };
  const pickSection = (value: string) => {
    if (!value) return;
    if (value.startsWith("n:")) {
      const target = neighborRows?.find(x => x.id === value.slice(2));
      if (target) void assignToNeighbor(target);
    } else apply(M.assignMembership(ann, targetIds(), value));
  };
  const { onAnn } = p;
  useEffect(() => { onAnn(bundle.id, ann); }, [onAnn, bundle.id, ann]);
  /** Hand the editing focus to the companion page. This page stays on screen beside it
   *  in the same position, now as the companion; its edits are already autosaved. */
  const focusNeighbor = (blockId: number | string | null) => {
    if (!neighborId) return;
    handoff = {
      pageId: neighborId,
      direction: neighborDirection === "previous" ? "next" : "previous",
      blockId: blockId == null ? null : Number(blockId),
      advanced,
      ui: { zoom: ui.zoom, leftW: ui.leftW, rightW: ui.rightW, showRules: ui.showRules, showLines: ui.showLines, showChips: ui.showChips, showKeys: ui.showKeys, tool: ui.tool === "select" || ui.tool === "lasso" ? ui.tool : "select", toast: `Editing ${neighborId} · Tab or a click on ${bundle.id} returns` },
    };
    p.onPickPage(neighborId);
  };
  const cols = bundle.columnBounds, W = bundle.width;

  const order = useMemo(() => M.orderOf(ann, cols, W), [ann, cols, W]);
  const m = useMemo(() => M.assignMap(ann), [ann]);
  const un = useMemo(() => M.unassigned(ann, order), [ann, order]);
  const curIdx = Math.min(ui.cur, Math.max(0, order.length - 1));
  const curId = order[curIdx];
  const cb = curId != null ? ann.blocks[curId] : undefined;
  const sel = (ui.sel as number[] | null) ?? null;
  const targetIds = useCallback((): number[] => (sel?.length ? sel.slice() : curId != null ? [curId] : []), [sel, curId]);
  const act = M.sectionOf(ann, ui.active);
  const checks = useMemo(() => validate(ann, bundle), [ann, bundle]);
  const complete = isComplete(checks);
  // Unknown inner rectangles are source context, not independently located blocks.
  const contextPeers = useMemo(() => {
    const groups = new Map<string, number[]>();
    for (const b of Object.values(ann.blocks)) {
      if (b.geometryEdit || b.inputEvidence?.geometryStatus !== "source_parent_context_only") continue;
      const key = `${b.inputEvidence.parentBlockId}|${b.bbox.join(",")}`;
      groups.set(key, [...(groups.get(key) ?? []), b.id]);
    }
    return new Map([...groups.values()].flatMap(ids => ids.map(id => [id, ids] as const)));
  }, [ann.blocks]);

  /* ── acts ─────────────────────────────────────────────────────────────────────── */

  const clearSelection = () => {
    setResizeId(null);
    setIsolateBlock(false);
    setUi({ cur: -1, active: null, sel: null, splitAt: null, tool: "select", toast: "Selection cleared" });
  };
  const startDrawing = () => {
    if (!p.writable) return;
    setResizeId(null);
    setUi({ tool: "draw", sel: null, splitAt: null, toast: "New box: drag a rectangle or line, then choose its classification · Esc cancels" });
  };

  const assignSame = () => targetIds().length && apply(bundle.startWithProposal && ui.active ? M.assignMembership(ann, targetIds(), ui.active) : M.assignSame(ann, targetIds(), ui.active, order));
  const startSection = (type: NewsType | null) => targetIds().length && apply(M.startSection(ann, targetIds(), type, order));
  /** A tag is its base type, plus the tag's own id on every section the act touched when
   *  it is a custom one. */
  const setTag = (t: TagDef) => {
    const base = t.base as NewsType;
    const ids = targetIds();
    const res = sel?.length ? M.classifyBlocks(ann, sel, base, order) : M.setType(ann, ui.active, base, ids, order);
    if (res) {
      const hit = new Set(ids);
      for (const sec of res.ann.sections) {
        if (sec.type !== base || !(sec.blockIds.some((b) => hit.has(b)) || (!sel?.length && sec.id === ui.active))) continue;
        if (isBuiltin(t, "newspaper")) delete sec.tag;
        else sec.tag = { id: t.id, base };
      }
      res.note = `${res.note} · ${t.label}`;
    }
    apply(res);
  };
  const group = (fresh = false) => { if (p.writable) { setResizeId(null); apply(M.groupBlocks(ann, targetIds(), order, fresh)); } };
  const setTitle = () => {
    if (!p.writable) return;
    const ids = targetIds();
    if (ids.length !== 1) return s.toast("Select one box for the article's H1 headline");
    apply(M.markHeadline(ann, ids[0], order));
  };
  const skip = () => targetIds().length && apply(M.skip(ann, targetIds(), order));
  const dissolve = () => (ui.active ? apply(M.dissolve(ann, ui.active)) : s.toast("no active section"));
  const mergeSections = () => {
    const sid = curId != null ? m[curId] : undefined;
    if (!sid || !ui.active || sid === ui.active) return s.toast("put the cursor on a block of the other section, then M");
    apply(M.mergeSections(ann, ui.active, sid, order));
  };
  const splitSection = () => curId != null && apply(M.splitSection(ann, curId), "cursor is not inside a section, or is its first block");
  const mergeBlocks = () => (sel && sel.length >= 2 ? apply(M.mergeBlocks(ann, sel, cols, W)) : s.toast("select 2+ blocks (shift+↑↓ or drag) then ⇧M"));
  const startSplit = () => {
    if (!cb || cb.lines.length < 2) return s.toast("this block has fewer than two printed lines — nothing to split between");
    if (cb.inputEvidence && cb.lines.length !== cb.text.split("\n").length) return s.toast("The image lines and the OCR lines do not match one to one; this block cannot be split automatically.");
    setUi({ splitAt: 1, toast: "split mode — ↑↓ choose the cut, Enter commits" });
  };
  const commitSplit = () => {
    if (curId == null || ui.splitAt == null) return;
    apply(M.splitBlock(ann, curId, ui.splitAt, cols, W));
    setUi({ splitAt: null });
  };
  const cutTool = (axis: "h" | "v") => {
    if (!p.writable) return;
    setResizeId(null);
    setUi({ tool: axis === "h" ? "cut-h" : "cut-v", sel: null, splitAt: null, toast: axis === "h" ? "Cut across: click inside a box — the line follows the pointer · Esc leaves the tool" : "Cut down: click inside a box — the right part keeps the section, the left becomes loose · Esc leaves the tool" });
  };
  const cutAt = (id: number, x: number, y: number) => {
    if (!p.writable) return;
    const axis = cutAxisOf(ui.tool);
    if (!axis) return;
    apply(M.cutBlock(ann, id, axis === "v" ? x : y, axis, cols, W), "the cut must fall inside the box");
  };
  const toggleProposal = () => apply(ann.mode === "proposal" ? M.dropProposal(ann) : M.loadProposal(ann, bundle.proposal, order));
  const accept = () => {
    const sid = (curId != null ? m[curId] : undefined) ?? ui.active;
    if (!sid) return s.toast("nothing here to accept");
    apply(M.accept(ann, sid, order));
  };
  const acceptAll = () => apply(M.acceptAll(ann), "all sections on this page are already approved");
  // The page turns in an effect, after the act has rendered: the autosave then flushes
  // the approved annotation on unmount instead of the one from before the key press.
  const [turnPage, setTurnPage] = useState(false);
  const { onGoPage } = p;
  useEffect(() => { if (turnPage) { setTurnPage(false); onGoPage(1); } }, [turnPage, onGoPage]);
  const nextPage = () => setTurnPage(true);
  const approveAndNext = () => {
    if (p.writable) { const r = M.acceptAll(ann); if (r) apply(r); }
    nextPage();
  };
  const gotoUnassigned = () => {
    const open = un.length ? un : ann.sections.filter((x) => !x.verified).map((x) => x.blockIds[0]);
    if (!open.length) return s.toast("every content block is in a section ✓");
    const idxs = open.map((id) => order.indexOf(id)).sort((a, b) => a - b);
    const next = idxs.find((i) => i > curIdx) ?? idxs[0];
    setUi({ cur: next, sel: null, toast: `${un.length} unassigned left${ann.sections.some((x) => !x.verified) ? " · unverified sections remain" : ""}` });
  };
  const reorder = (d: -1 | 1) => curId != null && apply(M.reorder(ann, curId, d), "block is not in a section");
  const del = () => targetIds().length && apply(M.deleteBlocks(ann, targetIds(), cols, W));
  /** O: none → 90° clockwise → 90° counter-clockwise → 180° → none, from the cursor's block. */
  const cycleRotation = () => {
    const ids = targetIds();
    if (!ids.length || !p.writable) return;
    const cycle: (Rotation | null)[] = [null, 90, 270, 180];
    const now = ann.blocks[ids[0]]?.rotation ?? null;
    const next = cycle[(cycle.indexOf(now) + 1) % cycle.length]!;
    apply(M.setRotation(ann, ids, next));
  };
  const cycleRole = () => {
    if (!cb) return;
    const i = cb.role ? NEWS_ROLES.indexOf(cb.role) : -1;
    const next = i + 1 >= NEWS_ROLES.length ? null : NEWS_ROLES[i + 1];
    apply(M.setRole(ann, targetIds(), next));
  };
  const toggleDone = () => {
    if (!ann.done && !complete) return s.toast(`${un.length} content blocks are still unassigned — press G`);
    apply(M.markDone(ann, !ann.done));
  };
  const flag = () => {
    const v = window.prompt("Flag this page (empty clears):", ann.flag ?? "");
    if (v !== null) apply(M.setFlag(ann, v));
  };

  /* ── input ────────────────────────────────────────────────────────────────────── */

  const move = (d: number, shift: boolean) => {
    const n = Math.min(order.length - 1, Math.max(0, curIdx + d));
    if (shift) {
      const anchor = sel?.length ? order.indexOf(sel[0]) : curIdx;
      const lo = Math.min(anchor, n), hi = Math.max(anchor, n);
      setUi({ cur: n, sel: order.slice(lo, hi + 1) });
    } else setUi({ cur: n, sel: null });
  };

  const onKey = (e: KeyInput): boolean => {
    if ((e.ctrlKey || e.metaKey) && e.code === "KeyG") { group(e.shiftKey); return true; }
    if (!e.ctrlKey && !e.metaKey && !e.altKey && e.shiftKey && e.code === "KeyA") { acceptAll(); return true; }
    const k = e.key;
    if (!e.ctrlKey && !e.metaKey && !e.altKey && (e.code === "KeyN" || k === "n" || k === "N")) { startDrawing(); return true; }
    if (ui.splitAt != null && cb) {
      if (k === "ArrowDown" || k === "j") setUi({ splitAt: Math.min(cb.lines.length - 1, ui.splitAt + 1) });
      else if (k === "ArrowUp" || k === "k") setUi({ splitAt: Math.max(1, ui.splitAt - 1) });
      else if (k === "Enter") commitSplit();
      else if (k === "Escape") setUi({ splitAt: null, toast: "split cancelled" });
      else return false;
      return true;
    }
    if (!e.ctrlKey && !e.metaKey && !e.altKey && (e.code === "KeyH" || k === "h" || k === "H")) {
      apply(M.markStructuralRoles(ann, targetIds(), e.shiftKey ? "section_title" : "subhead")); return true;
    }
    // Shift+1 arrives as "!" from a keyboard and as "1"+Shift from some input paths.
    if (!e.ctrlKey && !e.metaKey && !e.altKey && (k === "!" || (e.shiftKey && e.code === "Digit1"))) {
      if (p.writable) apply(M.toggleBlockFlag(ann, targetIds()), "select a block first");
      return true;
    }
    if (!e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && (k === "o" || k === "O")) {
      cycleRotation(); return true;
    }
    if (!e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && k === "c") {
      if (p.writable) apply(M.toggleCentered(ann, targetIds()), "select a block first");
      return true;
    }
    if (!e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && k === "y") {
      if (p.writable) apply(M.markStructuralRoles(ann, targetIds(), "byline"), "select a block first");
      return true;
    }
    // By the physical key and Shift, not by case: with Caps Lock on, Shift+M arrives as "m".
    if (!e.ctrlKey && !e.metaKey && !e.altKey && e.code === "KeyM") { if (e.shiftKey) mergeBlocks(); else mergeSections(); return true; }
    if (!e.ctrlKey && !e.metaKey && !e.altKey && e.shiftKey && e.code === "KeyF") {
      apply(M.markStructuralRoles(ann, targetIds(), "footnote")); return true;
    }
    switch (k) {
      case "ArrowDown": case "j": case "J": move(1, e.shiftKey); return true;
      case "ArrowUp": case "k": case "K": move(-1, e.shiftKey); return true;
      case " ": assignSame(); return true;
      case "Enter": nextPage(); return true;
      case "t": case "T": setTitle(); return true;
      case "x": case "X": skip(); return true;
      case "g": case "G": gotoUnassigned(); return true;
      case "a": approveAndNext(); return true;
      case "d": dissolve(); return true;
      case "D": dissolve(); return true;
      case "p": case "P": toggleProposal(); return true;
      case "m": mergeSections(); return true;
      case "M": mergeBlocks(); return true;
      case "s": startSplit(); return true;
      case "S": splitSection(); return true;
      case "r": case "R": cycleRole(); return true;
      case "f": case "F": flag(); return true;
      case "Delete": case "Backspace": del(); return true;
      case "v": case "V": setUi({ tool: "select", toast: "select tool — click a block, drag to lasso" }); return true;
      case "l": case "L": setUi({ tool: "lasso", toast: "lasso→section — drag around an advertisement, it becomes one section" }); return true;
      case "b": case "B": startDrawing(); return true;
      case "w": cutTool(ui.tool === "cut-h" ? "v" : "h"); return true;
      case "W": cutTool("v"); return true;
      case "Escape": clearSelection(); return true;
      case ",": reorder(-1); return true;
      case ".": reorder(1); return true;
      case "<": if (ui.active) apply(M.setContinues(ann, ui.active, "from")); return true;
      case ">": if (ui.active) apply(M.setContinues(ann, ui.active, "to")); return true;
      case "1": case "2": case "3": case "4": case "5": case "6": case "7": case "8": case "9": {
        // The types are the project's tags, bound by the shell; a digit that reaches here
        // is bound to nothing.
        if (e.shiftKey) return false;
        s.toast(`${k} is not a type in this project — Help ▸ Keyboard shortcuts`);
        return true;
      }
    }
    return false;
  };

  const onMarquee = (box: BBox, add = false) => {
    if (ui.tool === "draw") {
      if (!p.writable) return;
      const clipped = clampBox(box, W, bundle.height);
      if (clipped[2] <= clipped[0] || clipped[3] <= clipped[1]) return;
      const result = M.addBlock(ann, clipped, cols, W);
      const id = M.orderOf(result.ann, cols, W)[result.move.cur!];
      result.note = "New box saved — choose its classification or assign it to a section";
      result.ann.done = false;
      result.move.sel = [id];
      result.move.active = null;
      apply(result);
      setUi({ tool: "select" });
      return;
    }
    setResizeId(null);
    const hit = order.filter((id) => intersection(ann.blocks[id].bbox, box) > 0);
    if (!hit.length) { if (!add) clearSelection(); return; }
    if (ui.tool === "lasso" && hit.length) {
      apply(M.groupBlocks(ann, hit, order));
      return;
    }
    if (add) {
      // Ctrl+drag: the touched blocks join what is already selected.
      const next = [...new Set([...(sel ?? (curId != null ? [curId] : [])), ...hit])];
      setUi({ sel: next, cur: order.indexOf(hit[0]), toast: `${next.length} blocks selected — Ctrl+click or Ctrl+drag adds more` });
      return;
    }
    setUi({
      sel: hit.length ? hit : null,
      cur: hit.length ? order.indexOf(hit[0]) : curIdx,
      toast: hit.length ? `${hit.length} blocks selected by overlap — Ctrl+G groups; 1–9 classifies; Shift+click removes unwanted blocks` : "nothing in the selection",
    });
  };

  const onPick = (id: number | string, shift: boolean, toggle = false) => {
    if (id !== resizeId) setResizeId(null);
    const i = order.indexOf(id as number);
    if (i < 0) return;
    if (shift || toggle) {
      const current = sel ?? (curId != null ? [curId] : []);
      const next = current.includes(Number(id)) ? current.filter(b => b !== Number(id)) : [...current, Number(id)];
      setUi({ sel: next.length ? next : null, cur: i });
    } else setUi({ cur: i, sel: [Number(id)], active: m[id as number] ?? ui.active });
  };

  /* ── the canvas ───────────────────────────────────────────────────────────────── */

  const rects: RectSpec[] = [];
  for (const b of Object.values(ann.blocks)) {
    const peers = contextPeers.get(b.id);
    // Draw each source-context frame once; allow a chosen unit to be manually resized.
    if (peers && b.id !== (resizeId != null && peers.includes(resizeId) ? resizeId : peers[0])) continue;
    const sep = !M.isContent(b);
    if (sep && !ui.showRules) continue;
    const sid = m[b.id];
    const sec = sid ? M.sectionOf(ann, sid) : undefined;
    const isSel = !!sel && sel.includes(b.id);
    const isCur = b.id === curId;
    let bg = "transparent", bd = "1px solid rgba(120,112,100,0.35)";
    const extra: CSSProperties = {};
    if (sep) bd = "1px solid rgba(120,112,100,0.30)";
    else if (sec) {
      bg = articleColor(sec, 0.13);
      bd = `1px solid ${articleColor(sec, 0.5)}`;
    } else if (!ann.skip[b.id]) {
      bg = `${C.un}15`;
      bd = `1.5px solid ${C.un}`;
    } else {
      bg = "rgba(120,112,100,0.10)";
      bd = "1px solid rgba(120,112,100,0.3)";
    }
    const fallback = !b.geometryEdit && b.inputEvidence?.geometryStatus === "source_parent_context_only";
    const style: CSSProperties = { background: bg, borderWidth: parseFloat(bd), borderStyle: "solid", borderColor: bd.replace(/^\S+\s+\S+\s+/, ""), borderRadius: 2, cursor: sep ? "default" : "pointer", zIndex: isCur ? 9 : isSel ? 8 : fallback ? 2 : 5, opacity: isolateBlock && !isCur && !isSel ? 0.08 : focusArticle && ui.active && sid !== ui.active ? 0.18 : 1, ...extra };
    // Geometry uncertainty belongs in the inspector; fill consistently shows membership.
    if (isSel) style.boxShadow = `0 0 0 2px #fff, 0 0 0 3.5px ${C.dark}`;
    if (isCur) {
      style.boxShadow = `0 0 0 2px #fff, 0 0 0 4px ${C.focus}`;
      style.background = sec ? articleColor(sec, 0.25) : "oklch(0.52 0.16 250 / 0.14)";
    }
    const r: RectSpec = { key: String(b.id), id: b.id, bbox: b.bbox, style, pick: !sep };
    // Every tag the block carries — type, role, heading level, rotation, review flag —
    // drawn by the one function the facing page uses too.
    if (!sep && !peers) {
      const mk = blockMarks(b, sec, sec?.titleBlockId === b.id, sec ? articleColor(sec) : C.un);
      Object.assign(style, mk.style);
      r.decoration = mk.marks;
    }
    r.handles = p.writable && b.id === resizeId && isCur && ui.tool === "select";
      r.title = "Drag to select touched blocks · Shift/Ctrl+click toggles this block · Double-click to resize";
    if (ui.showChips && !sep) {
      r.chip = sectionTag(sec);
      r.chipStyle = { position: "absolute", top: -1, left: -1, padding: "0 3px", fontSize: 10, lineHeight: "13px", fontFamily: MONO, background: sec ? articleColor(sec) : C.un, color: "#fff", borderRadius: "2px 0 3px 0", whiteSpace: "nowrap" };
    }
    if (peers) {
      style.background = "transparent";
      Object.assign(style, { borderWidth: 1, borderStyle: "solid", borderColor: "#777" });
      r.badge = undefined;
      r.title = `Source context for ${peers.length} text units; internal boxes are unknown. Select a unit in the inspector to locate it.`;
      const owners = new Set(peers.map(id => m[id]));
      r.chip = owners.size === 1 ? sectionTag(sec) : undefined;
      // Never let a shared source frame imply that its first unit is the entire group.
      if (peers.some(id => sel?.includes(id) || id === curId)) style.boxShadow = `0 0 0 2px ${C.focus}`;
    }
    if (b.role === "separator") {
      style.background = "transparent";
      Object.assign(style, { borderWidth: 3, borderStyle: "double", borderColor: "#555" });
      style.minHeight = 3;
      style.minWidth = 3;
      r.chip = undefined;
      r.decoration = undefined;
    }
    if (peers && (b.rotation || b.flag)) r.decoration = <>{b.rotation ? <RotationTag rotation={b.rotation} /> : null}{b.flag ? <FlagTag note={b.flag.note} /> : null}</>;
    rects.push(r);
  }

  const overlays: OverlaySpec[] = [];
  if (cb && ((advanced && ui.showLines) || ui.splitAt != null)) {
    cb.lines.forEach((l, i) => overlays.push({ key: `l${i}`, bbox: l, style: { border: `1px solid ${C.line}`, background: C.lineBg, zIndex: 11 } }));
    if (ui.splitAt != null && cb.lines[ui.splitAt]) {
      const y = (cb.lines[ui.splitAt][1] + cb.lines[ui.splitAt - 1][3]) / 2;
      overlays.push({ key: "cut", bbox: [cb.bbox[0] - 6, y - 1, cb.bbox[2] + 6, y + 1], style: { background: C.cut, boxShadow: "0 0 0 1px #fff", zIndex: 20, minHeight: 3 } });
    }
  }
  const arrows: ArrowSpec[] = [];

  /* ── panels ───────────────────────────────────────────────────────────────────── */

  const ticks: Tick[] = order.map((id, i) => {
    const sid = m[id];
    const sec = sid ? M.sectionOf(ann, sid) : undefined;
    return {
      key: String(id),
      color: sec ? articleColor(sec, 0.9) : ann.skip[id] ? C.bar2 : C.un,
      dim: !!sec && !sec.verified,
      cur: i === curIdx,
      sel: !!sel && sel.includes(id),
      onClick: () => setUi({ cur: i, sel: null, active: m[id] ?? ui.active }),
    };
  });
  const tagCount = new Map<string, { t: TagDef; n: number }>();
  for (const x of ann.sections) { const t = tagOfSection(x); tagCount.set(t.id, { t, n: (tagCount.get(t.id)?.n ?? 0) + 1 }); }
  const tally: { key: string; label: string; style: CSSProperties }[] = [...tagCount.values()]
    .map(({ t, n }) => ({ key: t.id, label: `${n} ${shortOf(t)}`, style: { fontSize: 9.5, fontFamily: MONO, padding: "1px 5px", borderRadius: 3, background: tagColor(t, 0.14), color: tagInk(t), whiteSpace: "nowrap" } }));
  if (un.length) tally.unshift({ key: "un", label: `${un.length} loose`, style: { fontSize: 9.5, fontFamily: MONO, padding: "1px 5px", borderRadius: 3, background: "oklch(0.94 0.05 75)", color: C.unInk, whiteSpace: "nowrap" } });

  const sectionRows = ann.sections
    .slice()
    .sort((a, b) => {
      const ia = order.indexOf(a.blockIds[0]), ib = order.indexOf(b.blockIds[0]);
      return (ia < 0 ? 1e9 : ia) - (ib < 0 ? 1e9 : ib);
    });

  // In a spread the list names both pages' sections, each page under its own heading and
  // in page order, so an article continuing across the fold is visible on both sides. The
  // companion's rows are read-only here: a click moves the editing focus onto that section.
  const neighborAnn = twoPage && neighborBundle ? neighborBundle.session ?? M.initNews(neighborBundle) : null;
  const neighborRows = neighborAnn && neighborBundle
    ? (() => {
        const nOrder = M.orderOf(neighborAnn, neighborBundle.columnBounds, neighborBundle.width);
        const at = (s: NewsSection) => { const i = nOrder.indexOf(s.blockIds[0]); return i < 0 ? 1e9 : i; };
        return neighborAnn.sections.slice().sort((a, b) => at(a) - at(b));
      })()
    : null;
  const keysHere = new Set(ann.sections.map(x => x.articleKey?.trim()).filter(Boolean));
  const keysThere = new Set((neighborRows ?? []).map(x => x.articleKey?.trim()).filter(Boolean));
  const neighborFirst = neighborDirection === "previous";
  const pageHeading = (id: string, editing: boolean, n: number, order: number) => (
    <div style={{ order, display: "flex", alignItems: "baseline", gap: 6, padding: "8px 4px 3px", fontSize: 10, color: editing ? C.ink : C.muted2, borderBottom: `${editing ? 2 : 1}px solid ${editing ? C.focus : C.borderSoft}`, marginBottom: 3 }}>
      <b style={{ fontFamily: MONO, fontWeight: editing ? 600 : 400 }}>{id.split(".").slice(-2).join(".")}</b>
      <span>{editing ? "editing" : sel?.length ? "click an id: the selected blocks join it" : "click a section to edit"}</span>
      <Spacer />
      <span style={{ fontFamily: MONO }}>{n}</span>
    </div>
  );
  const neighborList = neighborRows && neighborBundle ? (
    <>
      {pageHeading(neighborBundle.id, false, neighborRows.length, neighborFirst ? 0 : 2)}
      <div style={{ order: neighborFirst ? 1 : 3, display: "flex", flexDirection: "column", gap: 3, marginBottom: 6 }}>
        {neighborRows.length === 0 ? <div style={{ fontSize: 10.5, color: C.faint, fontStyle: "italic", padding: "2px 7px" }}>no sections yet</div> : null}
        {neighborRows.map((x) => {
          const tb = M.titleText(neighborAnn!, x);
          const shared = !!x.articleKey?.trim() && keysHere.has(x.articleKey.trim());
          return (
            <div key={`n-${x.id}`} title={sel?.length ? `Make the ${sel.length} selected blocks ${sectionTag(x)} — the same article as on ${neighborBundle.id}` : `${sectionTag(x)} on ${neighborBundle.id} — click to edit that page here`} onClick={() => { if (sel?.length && p.writable) void assignToNeighbor(x); else focusNeighbor(x.blockIds[0] ?? null); }} style={{ padding: "4px 7px", borderRadius: 5, cursor: "pointer", border: "1px dashed transparent", opacity: 0.85 }}>
              <Row>
                <span style={{ width: 11, height: 11, borderRadius: 2, background: articleColor(x), flex: "0 0 auto" }} />
                <span style={{ fontFamily: MONO, fontSize: 12, color: C.ink }}>{x.articleKey || x.id}</span>
                {shared ? <span title="this article id is on both pages" style={{ fontSize: 10, color: C.muted }}>↔</span> : null}
                <Spacer />
                {act && p.writable && act.articleKey?.trim() !== x.articleKey?.trim() ? (
                  <button
                    title={`Same article: ${sectionTag(act)} on this page takes the id ${x.articleKey || "(new)"} and continues across the fold${x.articleKey && ann.sections.some(sec => sec.id !== act.id && sec.articleKey === x.articleKey) ? ` — merged with ${x.articleKey} here` : ""}`}
                    onClick={(e) => { e.stopPropagation(); void linkToNeighbor(x); }}
                    style={{ fontSize: 10, padding: "0 5px", height: 18, cursor: "pointer", border: `1px solid ${articleColor(act)}`, borderRadius: 3, background: "#fff", color: C.text2, whiteSpace: "nowrap" }}
                  >⇄ {sectionTag(act)}</button>
                ) : null}
              </Row>
              <div dir="rtl" style={{ fontFamily: SERIF, fontSize: tb ? 13 : 10.5, marginTop: 2, color: tb ? C.inkSoft : C.faint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontStyle: tb ? "normal" : "italic" }}>
                {tb ?? neighborAnn!.blocks[x.blockIds[0]]?.text.slice(0, 75) ?? "—"}
              </div>
            </div>
          );
        })}
      </div>
    </>
  ) : null;

  // The facing page's ids in the assign dropdowns: choosing one makes the selection that article.
  const neighborOptions = neighborRows?.length && neighborAnn && neighborBundle ? (
    <optgroup label={`${neighborDirection === "previous" ? "Previous" : "Next"} page · ${neighborBundle.id}`}>
      {neighborRows.map(x => <option key={`n-${x.id}`} value={`n:${x.id}`}>{sectionTag(x)} — {M.titleText(neighborAnn, x) ?? neighborAnn.blocks[x.blockIds[0]]?.text.slice(0, 35)}</option>)}
    </optgroup>
  ) : null;

  const left = (
    <>
      <div style={{ minWidth: 0 }}>
      {advanced ? <Ribbon ticks={ticks} note="Color identifies a section; assignments remain subject to review" tally={tally} /> : null}
      </div>
      <div style={{ display: "grid", gridTemplateRows: "auto 1fr", minHeight: 0, minWidth: 0 }}>
        <Row style={{ padding: "8px 10px 6px" }}>
          <Label>Sections</Label>
          <span style={{ fontFamily: MONO, color: C.ink }}>{ann.sections.length}</span>
          <Spacer />
          <span style={{ fontSize: 10, color: C.faint }}>{sel?.length ? `click to assign all ${sel.length} selected` : `${ann.sections.filter(section => section.verified).length}/${ann.sections.length} approved`}</span>
        </Row>
        {ann.sections.length === 0 ? (
          <div style={{ margin: "2px 10px 10px", padding: 10, border: `1px dashed ${C.border}`, borderRadius: 5, fontSize: 10.5, lineHeight: 1.5, color: C.muted2 }}>
            No sections yet. Select blocks and press <b>Ctrl+G</b> to group them, then <b>1–9</b> to classify the section. Press <b>N</b> to draw a missing box{bundle.proposal.length ? <> — or press <b>P</b> to start from the machine proposal</> : null}.
          </div>
        ) : null}
        <div className="om-scroll" style={{ overflowY: "auto", padding: "0 8px 10px", display: "flex", flexDirection: "column" }}>
          {neighborList ? pageHeading(bundle.id, true, ann.sections.length, neighborFirst ? 2 : 0) : null}
          {neighborList}
          <div style={{ order: neighborList ? (neighborFirst ? 3 : 1) : 0, display: "flex", flexDirection: "column", gap: 3, marginBottom: 6 }}>
            {sectionRows.map((x) => {
              const on = x.id === ui.active;
              const sharedHere = !!x.articleKey?.trim() && keysThere.has(x.articleKey.trim());
              const tb = M.titleText(ann, x);
              const flagText = !x.verified ? "unverified" : x.type === "ADVERTISEMENT" && x.titleBlockId == null ? "check title" : "";
              return (
                <div key={x.id} title={sel?.length ? `Move all ${sel.length} selected blocks to ${sectionTag(x)}` : `Review ${sectionTag(x)}`} onClick={() => {
                  if (sel?.length) {
                    if (!p.writable) return;
                    const result = M.assignMembership(ann, sel, x.id);
                    if (result) apply({ ...result, note: `Moved all ${sel.length} selected blocks to ${sectionTag(x)}` });
                  } else setUi({ active: x.id, cur: order.indexOf(x.blockIds[0]), sel: null });
                }} style={{ padding: "5px 7px", borderRadius: 5, cursor: "pointer", background: on ? "#fff" : "transparent", border: `1px solid ${on ? C.borderRow : "transparent"}`, boxShadow: on ? `inset 3px 0 0 ${articleColor(x)}` : "none" }}>
                  <Row>
                    <span style={{ width: 11, height: 11, borderRadius: 2, background: articleColor(x), flex: "0 0 auto" }} />
                    <span style={{ fontFamily: MONO, fontSize: 12, color: C.ink }}>{x.articleKey || x.id}</span>
                    {sharedHere ? <span title="this article id is on both pages" style={{ fontSize: 10, color: C.muted }}>↔</span> : null}
                    {advanced ? <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.05em" }}>{shortOf(tagOfSection(x))}</span> : null}
                    {x.continuesFrom ? <span title="continues from previous page" style={{ fontSize: 9, color: C.faint }}>◂</span> : null}
                    {x.continuesTo ? <span title="continues to next page" style={{ fontSize: 9, color: C.faint }}>▸</span> : null}
                    <Spacer />
                    {advanced && flagText ? <span style={{ fontSize: 9, padding: "0 4px", borderRadius: 3, color: C.flagInk, background: C.flagBg }}>{flagText}</span> : null}
                    {advanced ? <span style={{ fontFamily: MONO, fontSize: 10, color: C.muted2 }}>{x.blockIds.length}b</span> : null}
                  </Row>
                  <div dir="rtl" style={{ fontFamily: SERIF, fontSize: tb ? 13.5 : 10.5, marginTop: 2, color: tb ? C.inkSoft : C.faint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontStyle: tb ? "normal" : "italic" }}>
                    {tb ?? ann.blocks[x.blockIds[0]]?.text.slice(0, 75) ?? "—"}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );

  const actBlocks = act ? act.blockIds.map((i) => ann.blocks[i]).filter(Boolean) : [];
  const actTitle = act ? M.titleText(ann, act) : null;
  const panelW = Math.max(200, ui.rightW - 26);
  const insp: CSSProperties = cb
    ? (() => {
        const bw = cb.bbox[2] - cb.bbox[0], bh = cb.bbox[3] - cb.bbox[1];
        const k = Math.min(6, Math.max(1.2, panelW / bw));
        return { height: Math.min(190, Math.max(90, bh * k)), border: `1px solid ${C.bar2}`, borderRadius: 4, backgroundColor: "#fff", backgroundImage: `url("${bundle.imageUrl}")`, backgroundRepeat: "no-repeat", backgroundSize: `${bundle.width * k}px ${bundle.height * k}px`, backgroundPosition: `${-cb.bbox[0] * k}px ${-cb.bbox[1] * k}px` };
      })()
    : { height: 150, background: C.well, border: `1px solid ${C.borderSoft}`, borderRadius: 4 };

  const editingActions = (
    <>
      {ui.splitAt != null && cb ? (
        <div style={{ padding: 10, borderBottom: `1px solid ${C.borderSoft}`, background: C.splitBg }}>
          <div style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: C.splitInk, marginBottom: 6 }}>Split block {cb.id} between printed lines</div>
          <div className="om-scroll" style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 240, overflow: "auto" }}>
            {cb.lines.map((l, i) => (
              <div key={i} onClick={() => i > 0 && setUi({ splitAt: i })} style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 4px", borderRadius: 3, cursor: i > 0 ? "pointer" : "default", borderTop: `2px solid ${i === ui.splitAt ? C.cut : "transparent"}`, background: i === ui.splitAt ? "#fff" : "transparent" }}>
                <span style={{ fontFamily: MONO, fontSize: 10, color: C.muted2 }}>L{i + 1}</span>
                <span style={{ flex: 1, height: 6, background: C.bar2, borderRadius: 2, maxWidth: `${Math.max(10, ((l[2] - l[0]) / (cb.bbox[2] - cb.bbox[0])) * 100)}%` }} />
                <span style={{ fontSize: 9.5, color: C.cutInk, fontWeight: 600, minWidth: 30 }}>{i === ui.splitAt ? "◀ cut" : ""}</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 8, fontSize: 11, color: C.text2 }}>↑↓ move the cut · <b>Enter</b> commit · <b>Esc</b> cancel — both halves stay pixel-exact.</div>
        </div>
      ) : null}

      <ActionGrid
        actions={[
          { label: "Group selected", hint: "Ctrl+G", primary: true, onClick: () => group() },
          { label: "New group", hint: "Ctrl+⇧G", primary: true, onClick: () => group(true) },
          { label: "New section", hint: "", primary: true, onClick: () => startSection(null) },
          { label: "Assign → active", hint: "Space", primary: true, onClick: assignSame },
          { label: "Set title", hint: "T", primary: true, onClick: setTitle },
          { label: "Skip block", hint: "X", onClick: skip },
          { label: "Accept section", hint: "", onClick: accept },
          { label: "Approve all on page", hint: "⇧A", onClick: acceptAll },
          { label: "Approve all → next page", hint: "A", onClick: approveAndNext },
          { label: "Next page", hint: "Enter", onClick: nextPage },
          { label: "Dissolve section", hint: "D", onClick: dissolve },
          { label: "Merge sections", hint: "M", onClick: mergeSections },
          { label: "Merge blocks", hint: "⇧M", onClick: mergeBlocks },
          { label: "Split block", hint: "S", onClick: startSplit },
          { label: "Cut across ⬓", hint: "W", onClick: () => cutTool("h") },
          { label: "Cut down ◨", hint: "⇧W", onClick: () => cutTool("v") },
          { label: "Split section", hint: "⇧S", onClick: splitSection },
          { label: "Delete block", hint: "Del", onClick: del },
          { label: "Next unassigned", hint: "G", onClick: gotoUnassigned },
        ]}
      />
    </>
  );

  const advancedRight = (
    <>

      {sel?.length ? <div data-testid="selection-panel" style={{ padding: 10, background: "#fff", borderBottom: `1px solid ${C.border}` }}>
        <b>{sel.length} selected blocks</b>
        <div style={{ fontSize: 11, margin: "5px 0" }}>Drag across any part of a block to select it. Shift+click adds/removes individual blocks.</div>
        <Row><button onClick={() => group()}>Group selected · Ctrl+G</button><button onClick={() => group(true)}>New group · Ctrl+⇧G</button><button onClick={() => setUi({ sel: null })}>Clear selection</button></Row>
        <label style={{ display: "block", marginTop: 7, fontSize: 11 }}>Classify selected blocks
          <select aria-label="Classify selected blocks" value="" onChange={e => { const t = tags.find((x) => x.id === e.target.value); if (t) setTag(t); }} style={{ width: "100%" }}>
            <option value="">Choose classification…</option>
            {tags.map(t => <option key={t.id} value={t.id}>{t.label} · {t.base}</option>)}
          </select>
        </label>
        <div style={{ fontSize: 10, marginTop: 5 }}>Only selected blocks change type. Partial sections are separated; grouping is a separate action.</div>
        <div style={{ maxHeight: 90, overflow: "auto", marginTop: 5 }}>
          {sel.map(id => <button key={id} aria-label={`Deselect block ${id}`} onClick={() => onPick(id, true)} style={{ margin: 2 }}>B{id} ×</button>)}
        </div>
      </div> : null}

      <div style={{ padding: 10, borderBottom: `1px solid ${C.borderSoft}` }}>
        <Row style={{ marginBottom: 8 }}>
          <Label>Block</Label>
          <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 500 }}>{cb ? cb.id : "—"}</span>
          {cb ? <span style={tag(cb.source === "op" || cb.source === "added" ? "flag" : "chip")}>{cb.source === "op" ? "repaired" : cb.source === "added" ? "added" : cb.label}</span> : null}
          {cb?.role ? <span style={tag("chip")}>{cb.role}</span> : null}
          <Spacer />
          <span style={{ fontFamily: MONO, fontSize: 10, color: C.muted2 }}>{order.length ? `${curIdx + 1} / ${order.length}` : ""}</span>
        </Row>
        <div style={insp} />
        {cb ? <div style={{ fontSize: 11, marginTop: 7 }}>
          <button disabled={!p.writable} onClick={() => { setResizeId(resizeId === cb.id ? null : cb.id); setUi({ tool: "select", splitAt: null, sel: null }); }}>
            {resizeId === cb.id ? "Finish resizing" : "Resize box"}
          </button>
          <div style={{ marginTop: 4 }}>Double-click a box, then drag its edges or corners. Esc finishes; Ctrl+Z undoes.</div>
        </div> : null}
        {cb?.cutFrom ? (
          <div style={{ marginTop: 7, padding: "4px 6px", borderRadius: 4, background: C.splitBg, fontSize: 10.5, lineHeight: 1.45, color: C.splitInk }}>
            cut {cb.cutFrom.seq}: the {cb.cutFrom.side} part of block <b style={{ fontFamily: MONO }}>#{cb.cutFrom.parent}</b>, {cb.cutFrom.kind === "line" ? "between printed lines" : "free-hand"} at {cb.cutFrom.axis === "v" ? "x" : "y"}={cb.cutFrom.at} px · other half <b style={{ fontFamily: MONO }}>#{cb.cutFrom.sibling}</b> · written to the record as <code style={{ fontFamily: MONO }}>cuts[{cb.cutFrom.seq - 1}]</code>
          </div>
        ) : null}
        {cb?.inputEvidence ? <div dir="rtl" style={{ fontSize: 11, lineHeight: 1.6, marginTop: 7 }}>
          {cb.geometryEdit ? "✎ Box corrected by hand; the source coordinates and the OCR text are kept." : cb.inputEvidence.geometryStatus === "source_parent_context_only" ? "? Showing the whole source block; where the span sits inside it is not known yet." : cb.inputEvidence.geometryStatus === "estimated" ? "≈ Estimated inner box — not checked by a person." : "The source block's box."}
          <div dir="ltr" style={{ fontSize: 9, overflowWrap: "anywhere", color: C.muted }}>{cb.inputEvidence.unitId}</div>
        </div> : null}
        <label style={{ display: "block", fontSize: 11, marginTop: 9 }}>Go to block (also where boxes overlap)
          <select aria-label="Go to block" value={curId ?? ""} onChange={e => onPick(Number(e.target.value), false)} style={{ width: "100%", padding: 5 }}>
            {order.map(id => <option key={id} value={id}>{blockTag(M.sectionOf(ann, m[id] ?? null), id)} — {ann.blocks[id].text.slice(0, 28)}</option>)}
          </select>
        </label>
        {cb ? <div style={{ fontSize: 11, marginTop: 9 }}>
          <label><input type="checkbox" checked={isolateBlock} onChange={e => setIsolateBlock(e.target.checked)} /> Dim other boxes</label>
          {order.some(id => id !== cb.id && intersection(ann.blocks[id].bbox, cb.bbox) > 0) ? <details open style={{ marginTop: 5 }}>
            <summary>Overlapping boxes</summary>
            <p style={{ margin: "5px 0" }}>≈ is an estimated text box; ? is the whole source block because the inner location is unknown. Overlap alone does not mean duplicate text or the same article. Select a box below to compare its OCR; double-click to resize.</p>
            <div style={{ maxHeight: 120, overflow: "auto" }}>
              {order.filter(id => id !== cb.id && intersection(ann.blocks[id].bbox, cb.bbox) > 0).map(id => <button key={id} onClick={e => onPick(id, e.shiftKey || e.ctrlKey || e.metaKey)} style={{ display: "block", width: "100%", textAlign: "start", marginBottom: 3 }}>
                {blockTag(M.sectionOf(ann, m[id] ?? null), id)} — {ann.blocks[id].text.slice(0, 55) || "No OCR"}
              </button>)}
            </div>
          </details> : null}
        </div> : null}
        {cb ? <label style={{ display: "block", fontSize: 11, marginTop: 9 }}>Assign to article
          <select aria-label="Assign to article" value="" disabled={!p.writable} onChange={e => pickSection(e.target.value)} style={{ width: "100%", padding: 5 }}>
            <option value="">Choose an article to move every selected block to…</option>
            {ann.sections.map(section => <option key={section.id} value={section.id}>{section.articleKey || section.id} — {M.titleText(ann, section) || ann.blocks[section.blockIds[0]]?.text.slice(0, 32)}</option>)}
            {neighborOptions}
          </select>
          <button onClick={() => startSection(null)} style={{ marginTop: 5, padding: "5px 9px" }}>New article from the selected block</button>
        </label> : null}
        <Row style={{ gap: 8, margin: "7px 0 5px" }}>
          <Label>OCR</Label>
          {cb ? <span style={{ ...tag(cb.conf != null && cb.conf < 0.6 ? "warn" : "chip") }}>{cb.conf != null ? `conf ${cb.conf.toFixed(2)}` : "conf n/a"}</span> : null}
          <Spacer />
          <span style={{ fontSize: 10, color: C.faint }}>{sel?.length ? `${sel.length} selected` : curId != null ? (m[curId] ? `in ${m[curId]}` : ann.skip[curId] ? "skipped" : "unassigned") : ""}</span>
        </Row>
        {cb ? (
          <Field key={cb.id} value={cb.text} rtl multiline placeholder="— no OCR text for this block —" onCommit={(v) => apply(M.setText(ann, cb.id, v))} style={{ ...hebrewBox, maxHeight: 130, minHeight: 60 }} />
        ) : null}
      </div>

      <div style={{ padding: 10, borderBottom: `1px solid ${C.borderSoft}` }}>
        <Row style={{ marginBottom: 7 }}>
          <Label>Active section</Label>
          {act ? <span style={{ width: 9, height: 9, borderRadius: 2, background: articleColor(act) }} /> : null}
          <span style={{ fontFamily: MONO, fontSize: 11 }}>{act ? `${act.articleKey || act.id} · ${act.type}` : "none — Ctrl+G starts one"}</span>
          <Spacer />
          <span style={{ fontSize: 10, color: C.faint }}>{act ? `${act.blockIds.length} blocks` : ""}</span>
        </Row>
        {act ? <div dir="rtl" style={{ fontSize: 11, marginBottom: 10 }}>
          <label>Article id in the issue — the same id continues it on another page
            <Field key={`key-${act.id}`} value={act.articleKey ?? ""} placeholder="e.g. A12" onCommit={v => setKeyTyped(act.id, v)} />
          </label>
        </div> : null}
        <div style={{ fontSize: 11, lineHeight: 1.5, marginTop: 6 }}>
          <b>Name / logo (3)</b> is the newspaper masthead; <b>Page header (4)</b> is a repeating page heading.
          Missing logo box: press <b>N</b>, draw around it, then <b>Ctrl+G</b> and <b>3</b> to create a separate masthead section.
        </div>
        <Row style={{ alignItems: "baseline", marginTop: 9 }}>
          <Label>Title</Label>
          <span style={{ fontSize: 10, color: C.faint }}>T — point at the headline block</span>
          <Spacer />
          {act ? (
            <>
              <button onClick={() => apply(M.setContinues(ann, act.id, "from"))} title="< — continues from the previous page" style={{ ...tag(act.continuesFrom ? "flag" : "chip"), cursor: "pointer", border: "none" }}>◂ from prev</button>
              <button onClick={() => apply(M.setContinues(ann, act.id, "to"))} title="> — continues to the next page" style={{ ...tag(act.continuesTo ? "flag" : "chip"), cursor: "pointer", border: "none" }}>to next ▸</button>
            </>
          ) : null}
        </Row>
        <div dir="rtl" style={{ fontFamily: SERIF, fontSize: actTitle ? 17 : 12, lineHeight: 1.3, marginTop: 3, color: actTitle ? C.ink : C.faint, fontStyle: actTitle ? "normal" : "italic" }}>{actTitle ?? "— no title block yet —"}</div>
        {act ? (
          <Field key={act.id} value={act.titleText ?? ""} rtl placeholder="type only when no block holds the headline" onCommit={(v) => apply(M.setTitleText(ann, act.id, v))} style={{ marginTop: 4, fontSize: 12, padding: "2px 6px", borderStyle: act.titleText ? "solid" : "dashed" }} />
        ) : null}
        <div dir="rtl" className="om-scroll" style={{ maxHeight: 76, overflow: "auto", marginTop: 6, fontFamily: SERIF, fontSize: 11.5, lineHeight: 1.45, color: C.muted, whiteSpace: "pre-wrap" }}>
          {actBlocks.map((b) => b.text).filter(Boolean).join("\n").slice(0, 900)}
        </div>
      </div>

      <div style={{ padding: 10, borderBottom: `1px solid ${C.borderSoft}` }}>
        <Row style={{ alignItems: "baseline", marginBottom: 5 }}>
          <Label>Members · reading order</Label>
          <Spacer />
          <span style={{ fontSize: 9.5, color: C.faint }}>, . reorder</span>
        </Row>
        {act?.orderUncertain ? <div style={{ padding: "4px 0", fontSize: 11 }}>The reading order is not settled yet — this list is provisional. <button onClick={() => apply(M.confirmOrder(ann, act.id))}>Confirm the order shown</button></div> : null}
        {!act || !actBlocks.length ? <div style={{ fontSize: 10.5, color: C.faint, fontStyle: "italic" }}>No active section — the blocks you assign will be listed here in the order a reader follows them.</div> : null}
        <div className="om-scroll" style={{ display: "flex", flexDirection: "column", gap: 1, maxHeight: 150, overflowY: "auto" }}>
          {act
            ? actBlocks.map((b, i) => {
                const isTitle = b.id === act.titleBlockId;
                const role = isTitle ? "title" : b.source === "op" ? "repaired" : b.source === "added" ? "added" : b.role ?? (b.label === "text:heading" ? "heading" : "body");
                return (
                  <div key={b.id} onClick={() => setUi({ cur: order.indexOf(b.id), sel: null })} style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 5px", borderRadius: 3, cursor: "pointer", fontSize: 10.5, background: b.id === curId ? "#fff" : "transparent", border: `1px solid ${b.id === curId ? C.borderRow : "transparent"}` }}>
                    <span style={{ fontFamily: MONO, fontSize: 9.5, color: C.faint }}>{String(i + 1).padStart(2, "0")}</span>
                    <span style={{ fontFamily: MONO, color: C.text }}>#{b.id}</span>
                    <span style={{ fontSize: 9, padding: "0 4px", borderRadius: 3, whiteSpace: "nowrap", background: isTitle ? tcol(act.type, 0.18) : C.chip, color: isTitle ? tcol(act.type, 0.95) : C.muted }}>{role}</span>
                    <span dir="rtl" style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: SERIF, fontSize: 11, color: C.muted }}>{(b.text || "").split("\n")[0].slice(0, 34) || "—"}</span>
                    <button aria-label={`Move block ${b.id} earlier`} disabled={i === 0} onClick={e => { e.stopPropagation(); apply(M.reorder(ann, b.id, -1)); }}>↑</button>
                    <button aria-label={`Move block ${b.id} later`} disabled={i === act.blockIds.length - 1} onClick={e => { e.stopPropagation(); apply(M.reorder(ann, b.id, 1)); }}>↓</button>
                  </div>
                );
              })
            : null}
        </div>
      </div>

      {cb ? (
        <div style={{ padding: 10, borderBottom: `1px solid ${C.borderSoft}` }}>
          <Row style={{ alignItems: "baseline", marginBottom: 5 }}>
            <Label>Block role</Label>
            <Spacer />
            <span style={{ fontSize: 9.5, color: C.faint }}>R cycles · secondary to the section</span>
          </Row>
          <select value={cb.role ?? ""} onChange={(e) => apply(M.setRole(ann, targetIds(), (e.target.value || null) as NewsRole | null))} onKeyDown={(e) => e.stopPropagation()} style={{ width: "100%", fontFamily: "inherit", fontSize: 11, padding: "3px 6px", border: `1px solid ${C.border}`, borderRadius: 4, background: "#fff" }}>
            <option value="">— derived from the section —</option>
            {NEWS_ROLES.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>
      ) : null}

      <div style={{ padding: 10, borderBottom: `1px solid ${C.borderSoft}` }}>
        <Row style={{ alignItems: "baseline", marginBottom: 5 }}>
          <Label>Page flag</Label>
          <Spacer />
          <span style={{ fontSize: 9.5, color: C.faint }}>F · a problem to come back to</span>
        </Row>
        <Field value={ann.flag ?? ""} placeholder="— not flagged —" onCommit={(v) => apply(M.setFlag(ann, v))} />
      </div>

      <KeyRows rows={KEYS} open={ui.showKeys} toggle={() => setUi({ showKeys: !ui.showKeys })} />
    </>
  );

  const total = order.length, placed = total - un.length;
  const currentSection = cb ? M.sectionOf(ann, m[cb.id] ?? null) : undefined;
  const isHeadline = cb && (currentSection?.titleBlockId === cb.id || cb.role === "headline" || cb.role === "ad_headline");
  const annotationIds = targetIds();
  const annotationCells: { id: string; label: string; hint: string; on: boolean; disabled: boolean; action: () => void; description: string; glyph?: ReactNode }[] = [
    ...tags.map((t) => ({ id: `tag:${t.id}`, label: t.label, hint: tagKey(t), on: annotationIds.length > 0 && annotationIds.every(id => { const sec = M.sectionOf(ann, m[id] ?? null); return !!sec && tagOfSection(sec).id === t.id; }), disabled: false, action: () => setTag(t), description: t.description ?? (t.base === "PUBLICATION_INFO" && isBuiltin(t, "newspaper") ? "Publication details: issue date/number, subscription prices, advertising rates and office/contact information" : `Classify selected boxes as ${t.label}${isBuiltin(t, "newspaper") ? "" : ` (written as ${t.base})`}`), glyph: isBuiltin(t, "newspaper") ? undefined : <span style={{ color: tagColor(t), display: "inline-flex" }}><TagGlyph icon={t.icon} size={16} /></span> })),
    { id: "S", label: "§ Section title", hint: "⇧H", on: annotationIds.length > 0 && annotationIds.every(id => ann.blocks[id]?.role === "section_title"), disabled: false, action: () => apply(M.markStructuralRoles(ann, annotationIds, "section_title")), description: "Shift+H · A department heading above the articles' H1 titles (e.g. a rubric over several articles); applies to all selected boxes" },
    { id: "h1", label: "H1 · Main heading", hint: "T", on: annotationIds.length === 1 && !!isHeadline, disabled: annotationIds.length !== 1, action: setTitle, description: "One main headline per article; select one box" },
    { id: "h2", label: "H2 · Subheading", hint: "H", on: annotationIds.length > 0 && annotationIds.every(id => ann.blocks[id]?.role === "subhead"), disabled: false, action: () => apply(M.markStructuralRoles(ann, annotationIds, "subhead")), description: "H · Toggle internal headings; applies to all selected boxes" },
    { id: "TABLE_OF_CONTENTS", label: "TOC", hint: "6", on: annotationIds.length > 0 && annotationIds.every(id => ann.blocks[id]?.role === "toc_list"), disabled: false, action: () => apply(M.markStructuralRoles(ann, annotationIds, "toc_list")), description: "6 · A table of contents: a character of the selected blocks, which stay in their article; click again to clear" },
    { id: "author", label: "Author", hint: "Y", on: annotationIds.length > 0 && annotationIds.every(id => ann.blocks[id]?.role === "byline"), disabled: false, action: () => apply(M.markStructuralRoles(ann, annotationIds, "byline")), description: "Y · The author's name or signature line (exported as the byline role); applies to all selected boxes" },
    { id: "footnote", label: "Footnote", hint: "⇧F", on: annotationIds.length > 0 && annotationIds.every(id => ann.blocks[id]?.role === "footnote"), disabled: false, action: () => apply(M.markStructuralRoles(ann, annotationIds, "footnote")), description: "Shift+F · Toggle footnotes within their article; applies to all selected boxes" },
    ...([[90, "rot90", "Rotated 90° clockwise", "The tops of the letters point right. Flag only — for straightening later"], [270, "rot270", "Rotated 90° counter-clockwise", "The tops of the letters point left. Flag only — for straightening later"], [180, "rot180", "Upside down (180°)", "The text is upside down. Flag only — for straightening later"]] as const).map(([deg, id, label, why]) => ({
      id, label, hint: "O", on: annotationIds.length > 0 && annotationIds.every(b => ann.blocks[b]?.rotation === deg), disabled: false, action: () => apply(M.setRotation(ann, annotationIds, deg)), description: `${why}; applies to all selected boxes · O cycles` })),
    { id: "center", label: "Centered", hint: "C", on: annotationIds.length > 0 && annotationIds.every(b => ann.blocks[b]?.align === "center"), disabled: false, action: () => apply(M.toggleCentered(ann, annotationIds)), description: "C · The printed lines are centred; combines with any role (a centred H1, a centred signature); click again to clear" },
    { id: "flag", label: "⚑ Flag block", hint: "!", on: annotationIds.length > 0 && annotationIds.every(b => !!ann.blocks[b]?.flag), disabled: false, action: () => apply(M.toggleBlockFlag(ann, annotationIds)), description: "! · Flag the selected blocks for another look; write why in the note below. Click again to clear" },
  ];
  const right = <>
    <div style={{ padding: 10, display: "grid", gap: 8 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4 }}>
        <button disabled={!p.writable} aria-pressed={ui.tool === "draw"} onClick={startDrawing}>New box · N</button>
        <button disabled={!cb || !p.writable} title="A whole article (A…) in the selection keeps its id" onClick={() => group()}>Group · Ctrl+G</button>
        <button disabled={!cb || !p.writable} title="Always a new section with a new id" onClick={() => group(true)}>New group · Ctrl+⇧G</button>
      </div>
      <b>{sel?.length ? `${sel.length} blocks selected` : `Section ${sectionTag(currentSection)}`}</b>
      <div style={{ fontSize: 11 }}>Click a section on the left to assign the selection. Shift-click adds/removes boxes.</div>
      <div role="group" aria-label="Annotation classification" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 3 }}>
        {annotationCells.map(cell => <button key={cell.id} title={cell.description} aria-pressed={cell.on} disabled={!p.writable || !annotationIds.length || cell.disabled} onClick={cell.action} style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", justifyContent: "center", gap: 2, minHeight: 42, padding: "4px 6px", fontFamily: "inherit", textAlign: "left", borderRadius: 4, border: `1px solid ${cell.on ? C.focus : C.borderKey}`, background: cell.on ? "rgba(35,120,225,0.13)" : "#fff", color: C.text2, cursor: "pointer" }}>
          <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", gap: 4 }}>
            {cell.glyph ?? <NewsTypeGlyph kind={(cell.id === "h1" ? "H1" : cell.id === "h2" ? "H2" : cell.id.startsWith("tag:") ? tags.find((t) => `tag:${t.id}` === cell.id)?.base ?? "ARTICLE" : cell.id) as NewsVisualKind} />}
            {cell.hint ? <span style={{ fontFamily: MONO, fontSize: 9, opacity: 0.65 }}>{cell.hint}</span> : null}
          </span>
          <span style={{ fontSize: 11, lineHeight: 1.2 }}>{cell.label}</span>
        </button>)}
      </div>
      {cb?.flag ? <label style={{ display: "block", fontSize: 11 }}>⚑ Flag note — block {cb.id}
        <Field key={`flag-${cb.id}`} value={cb.flag.note ?? ""} placeholder="what is wrong with this block (optional)" onCommit={v => apply(M.setBlockFlagNote(ann, cb.id, v))} />
      </label> : null}
      <div style={{ fontSize: 10, color: C.muted }}>§ = section title above the articles · H1 = article title · H2 = internal heading. Click §/H1/H2/Footnote again to remove that role.</div>
      <div style={{ fontSize: 10, color: C.muted }}>Page colors identify articles (the sides of a heading keep them); frame shapes and the symbols above them identify types. Headings are ruled above and below: § black double, H1 magenta double, H2 orange dashed.</div>
      {currentSection?.type === "PUBLICATION_INFO" ? <div style={{ fontSize: 10, color: C.muted }}>Publication info: dates, issue numbers, subscription prices, advertising rates and office details. The newspaper name uses Name / logo.</div> : null}
      {p.project ? <a href={`/?project=${encodeURIComponent(p.project.id)}`} style={{ fontSize: 10.5, color: C.link }}>+ Custom tag · edit this project&apos;s types, icons and keys</a> : null}
      {editingActions}
      <details>
        <summary style={{ fontSize: 11, cursor: "pointer" }}>Assign through list</summary>
      <label style={{ fontSize: 12 }}>Assign selection to section
        <select aria-label="Assign selection to section" value="" disabled={!p.writable} onChange={e => pickSection(e.target.value)} style={{ display: "block", width: "100%", padding: 6 }}>
          <option value="">Move all selected blocks to…</option>
          {sectionRows.map(section => <option key={section.id} value={section.id}>{sectionTag(section)} — {M.titleText(ann, section) || ann.blocks[section.blockIds[0]]?.text.slice(0, 35)}</option>)}
          {neighborOptions}
        </select>
      </label>
      </details>
      {sel?.length ? <button onClick={() => setUi({ sel: null })}>Clear selection</button> : null}
      <hr style={{ width: "100%", border: 0, borderTop: `1px solid ${C.border}` }} />
      {currentSection && M.titleText(ann, currentSection) ? <div dir="rtl" style={{ fontFamily: SERIF, fontSize: 16 }}>{M.titleText(ann, currentSection)}</div> : null}
      {cb ? <>
        {contextPeers.has(cb.id) ? <div style={{ fontSize: 12, padding: 8, background: "#fff", border: `1px solid ${C.border}` }}>
          <b>Source context — internal positions unknown</b>
          <div style={{ margin: "5px 0" }}>This frame is shown once. Choose a text unit below to assign it or resize its own box.</div>
          <div style={{ maxHeight: 160, overflow: "auto" }}>
            {contextPeers.get(cb.id)!.map(id => <button key={id} aria-pressed={curId === id && sel?.length === 1} onClick={() => onPick(id, false)} style={{ display: "block", width: "100%", textAlign: "start", marginBottom: 4 }}>
              {sectionTag(M.sectionOf(ann, m[id] ?? null))} — {ann.blocks[id].text.slice(0, 65)}
            </button>)}
          </div>
        </div> : null}
        <div style={insp} />
        <div dir="rtl" style={{ ...hebrewBox, maxHeight: 210, overflow: "auto", whiteSpace: "pre-wrap", padding: 8 }}>{cb.text || "No OCR text"}</div>
        <button onClick={() => { setResizeId(resizeId === cb.id ? null : cb.id); setUi({ tool: "select", splitAt: null, sel: null }); }}>{resizeId === cb.id ? "Finish resizing" : "Resize box · double-click"}</button>
      </> : null}
      <label style={{ fontSize: 11 }}><input type="checkbox" checked={isolateBlock} onChange={e => setIsolateBlock(e.target.checked)} /> Dim other boxes</label>
    </div>
    <button aria-expanded={advanced} onClick={() => setAdvanced(!advanced)} style={{ margin: 10, padding: 7 }}>{advanced ? "Hide advanced controls" : "Advanced controls"}</button>
    {advanced ? advancedRight : null}
  </>;
  const none = !annotationIds.length;
  const w = !p.writable;
  const struct = (role: M.StructuralRole) => () => { if (p.writable) apply(M.markStructuralRoles(ann, targetIds(), role), "select a block first"); };
  // `defaultKeys` are the keys this mode always had (the onKey switch above is their
  // fallback); the project's key map may move them. `context` puts a command on the
  // right-click menu.
  const commands: Command[] = [
    { id: "approve-next", group: "Review", label: "Approve all remaining sections, then the next page", defaultKeys: ["A"], run: approveAndNext },
    { id: "approve-all", group: "Review", label: "Approve all remaining sections on this page", defaultKeys: ["Shift+A"], run: acceptAll, context: "blank" },
    { id: "accept", group: "Review", label: "Approve this section", run: accept, context: "unit" },
    { id: "next-page", group: "Review", label: "Next page", defaultKeys: ["Enter"], keywords: "continue", run: nextPage },
    { id: "next-open", group: "Review", label: "Next unassigned block", defaultKeys: ["G", "Shift+G"], keywords: "open loose", run: gotoUnassigned },
    ...tags.map((t): Command => ({ id: `tag:${t.id}`, group: "Section type", label: t.label, defaultKeys: t.key ? [t.key] : [], keywords: `type tag ${t.base} ${t.id}`, run: () => setTag(t), disabled: none || w, context: "unit", checked: annotationIds.length > 0 && annotationIds.every((id) => { const sec = M.sectionOf(ann, m[id] ?? null); return !!sec && tagOfSection(sec).id === t.id; }), icon: <span style={{ color: tagColor(t), display: "inline-flex" }}><TagGlyph icon={t.icon} size={12} /></span> })),
    { id: "title", group: "Marks", label: "H1 · the article's printed headline", defaultKeys: ["T", "Shift+T"], run: setTitle, disabled: annotationIds.length !== 1 || w, context: "unit" },
    { id: "subhead", group: "Marks", label: "H2 · subheading", defaultKeys: ["H"], run: struct("subhead"), disabled: none || w, context: "unit" },
    { id: "section-title", group: "Marks", label: "§ Section title (above H1)", defaultKeys: ["Shift+H"], run: struct("section_title"), disabled: none || w, context: "unit" },
    { id: "byline", group: "Marks", label: "Author (byline / signature)", defaultKeys: ["Y"], run: struct("byline"), disabled: none || w, context: "unit" },
    { id: "footnote", group: "Marks", label: "Footnote", defaultKeys: ["Shift+F"], run: struct("footnote"), disabled: none || w, context: "unit" },
    { id: "toc", group: "Marks", label: "Table of contents (blocks stay in their article)", defaultKeys: ["6"], run: struct("toc_list"), disabled: none || w, context: "unit" },
    { id: "center", group: "Marks", label: "Centred text", defaultKeys: ["C"], run: () => { if (p.writable) apply(M.toggleCentered(ann, targetIds()), "select a block first"); }, disabled: none || w, context: "unit" },
    { id: "rot-cycle", group: "Marks", label: "Rotation flag: 90° → 270° → 180° → none", defaultKeys: ["O"], run: cycleRotation, disabled: none || w, context: "unit" },
    { id: "flag-block", group: "Marks", label: "Flag the block for review", defaultKeys: ["Shift+1"], run: () => { if (p.writable) apply(M.toggleBlockFlag(ann, targetIds()), "select a block first"); }, disabled: none || w, context: "unit" },
    { id: "role-cycle", group: "Marks", label: "Cycle the block's role (secondary)", defaultKeys: ["R", "Shift+R"], run: cycleRole, disabled: !cb },
    { id: "down", group: "Selection", label: "Next block in reading order", defaultKeys: ["ArrowDown", "J"], keywords: "walk", run: () => move(1, false) },
    { id: "up", group: "Selection", label: "Previous block in reading order", defaultKeys: ["ArrowUp", "K"], keywords: "walk", run: () => move(-1, false) },
    { id: "deselect", group: "Selection", label: "Clear the selection", keys: "Esc", run: clearSelection, context: "blank" },
    { id: "assign", group: "Sections", label: "Assign → the active section", defaultKeys: ["Space"], run: assignSame, disabled: none || !ui.active, context: "unit" },
    { id: "group", group: "Sections", label: "Group the selection (an article keeps its id)", defaultKeys: ["Ctrl+G"], run: () => group(), disabled: none || w, context: "unit" },
    { id: "group-new", group: "Sections", label: "Group the selection as a new section", defaultKeys: ["Ctrl+Shift+G"], run: () => group(true), disabled: none || w, context: "unit" },
    { id: "new-section", group: "Sections", label: "New section from the selection", run: () => startSection(null), disabled: none || w },
    { id: "merge-sections", group: "Sections", label: "Merge this block's section into the active one", defaultKeys: ["M"], run: mergeSections },
    { id: "split-section", group: "Sections", label: "Split the section at this block", defaultKeys: ["Shift+S"], run: splitSection, context: "unit" },
    { id: "dissolve", group: "Sections", label: "Dissolve the active section", defaultKeys: ["D", "Shift+D"], run: dissolve, disabled: !ui.active, context: "unit" },
    { id: "earlier", group: "Sections", label: "Move the block earlier in reading order", defaultKeys: [","], run: () => reorder(-1), disabled: curId == null },
    { id: "later", group: "Sections", label: "Move the block later in reading order", defaultKeys: ["."], run: () => reorder(1), disabled: curId == null },
    { id: "continues-from", group: "Sections", label: "Continues from the previous page", defaultKeys: ["Shift+,"], run: () => { if (ui.active) apply(M.setContinues(ann, ui.active, "from")); }, disabled: !ui.active, checked: !!act?.continuesFrom },
    { id: "continues-to", group: "Sections", label: "Continues to the next page", defaultKeys: ["Shift+."], run: () => { if (ui.active) apply(M.setContinues(ann, ui.active, "to")); }, disabled: !ui.active, checked: !!act?.continuesTo },
    { id: "skip", group: "Blocks", label: "Skip: rule, ornament, noise", defaultKeys: ["X", "Shift+X"], run: skip, disabled: none, context: "unit" },
    { id: "delete", group: "Blocks", label: "Delete a spurious block", defaultKeys: ["Delete", "Backspace"], run: del, disabled: none || w, context: "unit" },
    { id: "merge-blocks", group: "Blocks", label: "Merge the selected blocks (repair)", defaultKeys: ["Shift+M"], run: mergeBlocks, disabled: (sel?.length ?? 0) < 2 || w, context: "unit" },
    { id: "split-block", group: "Blocks", label: "Split the block between printed lines", defaultKeys: ["S"], run: startSplit, disabled: !cb || w, context: "unit" },
    { id: "tool-select", group: "Tools", label: "Select tool", defaultKeys: ["V", "Shift+V"], run: () => setUi({ tool: "select", toast: "select tool — click a block, drag to lasso" }), checked: ui.tool === "select" },
    { id: "tool-lasso", group: "Tools", label: "Lasso → section", defaultKeys: ["L", "Shift+L"], run: () => setUi({ tool: "lasso", toast: "lasso→section — drag around an advertisement, it becomes one section" }), checked: ui.tool === "lasso", context: "blank" },
    { id: "tool-draw", group: "Tools", label: "Draw a new box", defaultKeys: ["N", "Shift+N", "B", "Shift+B"], run: startDrawing, disabled: w, checked: ui.tool === "draw", context: "blank" },
    { id: "tool-cut", group: "Tools", label: "Cut tool (again flips across / down)", defaultKeys: ["W"], run: () => cutTool(ui.tool === "cut-h" ? "v" : "h"), disabled: w },
    { id: "tool-cut-v", group: "Tools", label: "Cut down", defaultKeys: ["Shift+W"], run: () => cutTool("v"), disabled: w, checked: ui.tool === "cut-v" },
    { id: "flag-page", group: "Pages", label: "Flag the page with a note…", defaultKeys: ["F"], run: flag },
    { id: "proposal", group: "Pages", label: ann.mode === "proposal" ? "Drop the machine proposal" : "Start from the machine proposal", defaultKeys: ["P", "Shift+P"], run: toggleProposal, disabled: !bundle.proposal.length, context: "blank" },
    { id: "advanced", group: "View", label: "Advanced controls", run: () => setAdvanced(!advanced), checked: advanced },
  ];

  const view: ModeView = {
    meta: `${ann.sections.filter(section => section.verified).length}/${ann.sections.length} approved · ${total} blocks`,
    progress: { placed, total, openLabel: un.length ? `${un.length} unassigned  G` : complete ? "review complete ✓" : "assigned · review pending", complete },
    gotoOpen: gotoUnassigned,
    proposal: advanced && bundle.proposal.length ? { label: ann.mode === "proposal" ? "Proposal loaded · drop" : "Start from proposal  P", on: ann.mode === "proposal", onClick: toggleProposal } : null,
    done: ann.done,
    canDone: complete,
    toggleDone,
    focus: cb?.bbox ?? null,
    focusKey: `${curId}|${bundle.id}`,
    rects,
    overlays,
    arrows,
    tools: TOOLS,
    toggles: advanced ? [
      { key: "rules", label: "Rules", on: ui.showRules, onClick: () => setUi({ showRules: !ui.showRules }) },
      { key: "lines", label: "Lines", on: ui.showLines, onClick: () => setUi({ showLines: !ui.showLines }) },
      { key: "chips", label: "Labels", on: ui.showChips, onClick: () => setUi({ showChips: !ui.showChips }) },
      { key: "article", label: "Focus on the article", on: focusArticle, onClick: () => setFocusArticle(!focusArticle) },
    ] : [],
    toolNote: ui.tool === "cut-h" ? "cut across: click inside a box to cut it into an upper and a lower box · W flips the axis · Esc leaves" : ui.tool === "cut-v" ? "cut down: click inside a box to cut it into a right and a left box · Esc leaves" : ui.tool === "draw" ? "new box: drag a rectangle or line, then classify it · Esc cancels" : ui.tool === "lasso" ? "drag across blocks to group them" : resizeId === curId ? "resize: drag an edge or corner · Esc finishes · Ctrl+Z undoes" : "N draws a new box · drag to select · Ctrl+G groups · double-click resizes",
    modeHint: null,
    left,
    right,
    approval: { verified: ann.sections.filter(section => section.verified).length, total: ann.sections.length, loose: un.length },
    spread: {
      enabled: twoPage,
      onToggle: toggleTwoPage,
      direction: neighborDirection,
      onDirection: setNeighborDirection,
      previousId,
      nextId,
      neighborId,
      neighbor: neighborBundle ? { id: neighborBundle.id, width: neighborBundle.width, height: neighborBundle.height, imageUrl: neighborBundle.imageUrl, rects: companionRects } : null,
      error: neighborState?.id === neighborId ? neighborState.error : null,
      onFocus: focusNeighbor,
    },
    onKey,
    modal: ui.splitAt != null && !!cb,
    commands,
    contextTitle: (id) => {
      if (id == null) return "Page";
      if ((sel?.length ?? 0) > 1) return `${sel!.length} blocks selected`;
      const sec = M.sectionOf(ann, m[Number(id)] ?? null);
      return `Block #${id} · ${sec ? `${sectionTag(sec)} · ${tagOfSection(sec).label}` : ann.skip[Number(id)] ? "skipped" : "unassigned"}`;
    },
    onMarquee,
    onPick: (id, shift, toggle = false) => {
      const peers = contextPeers.get(Number(id));
      if (!peers || resizeId === Number(id)) { onPick(id, shift, toggle); return; }
      setResizeId(null);
      const ids = shift || toggle ? [...new Set([...(sel ?? []), ...peers])] : peers.slice();
      setUi({ cur: order.indexOf(Number(id)), sel: ids, active: m[Number(id)] ?? null, toast: `${peers.length} text units share this source context; use the inspector for individual units` });
    },
    onBlankClick: clearSelection,
    onCut: (id, x, y) => cutAt(Number(id), x, y),
    dragSelectFromRect: true,
    onDoublePick: id => {
      if (!p.writable) return;
      if (contextPeers.has(Number(id))) {
        onPick(id, false);
        s.toast("Choose the intended text unit in the inspector, then Resize box to locate it.");
        return;
      }
      onPick(id, false);
      setResizeId(Number(id));
      setUi({ tool: "select", splitAt: null, sel: null, toast: "Drag an edge or corner to resize · Esc finishes · Ctrl+Z undoes" });
    },
    onBoxChange: (id, box) => {
      if (p.writable) apply(M.resizeBlock(ann, Number(id), box, cols, W, bundle.height));
    },
    export: {
      title: `Export ${bundle.id}.json`,
      subtitle: "Page schema · UTF-8 · route: manual",
      checks,
      note: complete ? "complete: every content block lands in exactly one section" : `${un.length} unassigned blocks — export is allowed but the page is not complete`,
      build: () => buildPage(ann, bundle),
    },
    opsLabel: `${ann.ops} acts · ${ann.mode === "proposal" ? "proposal" : "empty"} start`,
  };

  const onWrite = async () => {
    const wrote = await s.save(buildPage(ann, bundle));
    s.toast(wrote ? `wrote ${wrote}` : "could not write — is the instance writable?");
    setUi({ exportOpen: false });
  };

  return (
    <Shell
      kind="newspaper"
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
