// The whole of the app's state, and the only function allowed to change it.
//
// The design keeps this in a React class and reaches for `this.setState` from forty
// places. Here it is one reducer over one `State`, which buys three things the port
// needs: every transition is testable without a DOM, `window` cannot leak into a
// transition, and an action that changes nothing can return the *identical* state object
// so React skips the render. That last point is load-bearing — the OCR explorer in this
// same app documents an infinite render loop caused by returning a fresh object from a
// no-op measurement.
//
// Two things the design does imperatively are modelled as data instead:
//   · **scroll intent** — the design calls `scrollTo(doc)` inside a handler. Here the
//     reducer records `{doc, seq}` and an effect performs it, so scrolling is asserted in
//     tests as a value rather than mocked as a call.
//   · **the toast timer** — the reducer sets the text and a sequence number; the effect
//     owns the clock. A reducer that called `setTimeout` would not be pure.

import { withParents } from "./annotations";
import { PROJECTS, allSections } from "./corpus";
import { mintId, seedCounter } from "./ids";
import { stepEnd } from "./offsets";
import { materialise } from "./seeds";
import {
  nextStatusFilter,
  paletteList,
  proposals as proposalsOf,
  visibleAnns as visibleAnnsOf,
  volAnns as volAnnsOf,
  volDocIds,
} from "./selectors";
import { TAG_DEFS, defaultAttrs, tagById } from "./tagset";
import type {
  Ann,
  AttrValues,
  Project,
  Sel,
  SelRect,
  Section,
  SpanMode,
  StatusFilter,
  Tab,
  TagDef,
  TrackScope,
  Volume,
} from "./types";

/** How many annotation sets the undo stack keeps. The design's number. */
export const UNDO_DEPTH = 40;

/** The reader's font size, in px, and the range the two controls move it through. */
export const SIZE_MIN = 15;
export const SIZE_MAX = 28;

/** What an export produces. Each is a different file and a different serialiser. */
export type ExportKind = "standoff" | "inline" | "variables";

export interface ScrollIntent {
  doc: string;
  /** Bumped on every request, so asking twice for the same section scrolls twice. */
  seq: number;
}

export interface State {
  tab: Tab;
  projects: Project[];
  projectId: string;
  volId: string;
  tags: TagDef[];
  anns: Ann[];
  /** The section the keyboard acts on — not necessarily one with an annotation in it. */
  focusDoc: string;
  sel: Sel | null;
  /** The selection's viewport rect, kept raw so a resize can re-clamp the menu. */
  selRect: SelRect | null;
  activeId: string | null;
  /** Label of the open menu-bar menu. */
  openMenu: string | null;
  projectsOpen: boolean;
  trackScope: TrackScope;
  statusFilter: StatusFilter;
  expanded: Record<string, boolean>;
  spanMode: SpanMode;
  cleanRead: boolean;
  palette: boolean;
  paletteQ: string;
  help: boolean;
  toast: string;
  /** Bumped with every toast, so the effect restarts its timer for a repeated message. */
  toastSeq: number;
  review: boolean;
  size: number;
  compact: boolean;
  editTag: string;
  dirty: boolean;
  version: string;
  done: Record<string, boolean>;
  undo: Ann[][];
  redo: Ann[][];
  /** The last tag applied, with its attributes — what Enter repeats. */
  lastTag: { tag: string; attrs: AttrValues } | null;
  scrollIntent: ScrollIntent | null;
  /**
   * Effects the reducer cannot perform itself, recorded as data for an effect to carry
   * out — the same shape as `scrollIntent`, and for the same reason. Writing a file and
   * building an export both need the world; a reducer must not touch it.
   */
  saveIntent: number;
  exportIntent: { what: ExportKind; seq: number } | null;
  /** Next annotation id to mint. See `ids.ts` for why this is not `Date.now()`. */
  nextId: number;
}

/* ── lookups ───────────────────────────────────────────────────────────────────────── */

export function project(s: State): Project {
  return s.projects.find((p) => p.id === s.projectId) ?? s.projects[0];
}

export function volume(s: State): Volume {
  const p = project(s);
  return p.volumes.find((v) => v.id === s.volId) ?? p.volumes[0];
}

/** The sections of the open volume — what the reader shows. */
export function sections(s: State): Section[] {
  return volume(s).sections;
}

/** Every section of the open project, which is what the Analysis panel counts. */
export function projectSections(s: State): Section[] {
  return allSections(project(s));
}

/**
 * A section by id.
 *
 * Searched across **every** loaded project, not just the open one. The design looks only
 * inside the open project and falls back to the first section of the open volume — so an
 * annotation belonging to the other project resolves to the wrong text, and since
 * `applyTag` slices the `quote` out of whatever this returns, a stale `focusDoc` during a
 * project switch would write a quote taken from a different document entirely. The
 * fallback is kept for the genuinely-unknown id, where the reader still needs something
 * to render.
 */
export function section(s: State, docId: string): Section {
  for (const p of s.projects) {
    const hit = p.volumes.flatMap((v) => v.sections).find((x) => x.doc_id === docId);
    if (hit) return hit;
  }
  return sections(s)[0];
}

export function activeAnn(s: State): Ann | null {
  return s.anns.find((a) => a.id === s.activeId) ?? null;
}

export function volAnns(s: State): Ann[] {
  return volAnnsOf(s.anns, volDocIds(volume(s)));
}

export function proposals(s: State): Ann[] {
  return proposalsOf(volAnns(s));
}

export function visibleAnns(s: State): Ann[] {
  return visibleAnnsOf(volAnns(s), s.review, s.statusFilter);
}

export function tagOf(s: State, id: string): TagDef {
  return tagById(s.tags, id);
}

/* ── the initial state ─────────────────────────────────────────────────────────────── */

export function makeInitial(overrides: Partial<State> = {}): State {
  const anns = materialise(PROJECTS);
  return {
    tab: "tags",
    projects: PROJECTS,
    projectId: "p-responsa",
    volId: "v-eyn",
    tags: TAG_DEFS,
    anns,
    focusDoc: "responsa/eynyitzchak/12866655",
    sel: null,
    selRect: null,
    activeId: null,
    openMenu: null,
    projectsOpen: false,
    trackScope: "volume",
    statusFilter: "all",
    expanded: {},
    spanMode: "underline",
    cleanRead: false,
    palette: false,
    paletteQ: "",
    help: false,
    toast: "",
    toastSeq: 0,
    review: false,
    size: 20,
    compact: false,
    editTag: "place",
    dirty: false,
    version: "1.3.0",
    done: {},
    undo: [],
    redo: [],
    lastTag: null,
    scrollIntent: null,
    saveIntent: 0,
    exportIntent: null,
    nextId: seedCounter(anns),
    ...overrides,
  };
}

/* ── actions ───────────────────────────────────────────────────────────────────────── */

export type Action =
  | { type: "select"; sel: Sel; rect: SelRect | null }
  | { type: "clearSelection" }
  | { type: "applyTag"; tagId: string; attrs?: AttrValues }
  | { type: "repeatLastTag" }
  | { type: "setAttr"; id: string; key: string; value: string | number }
  | { type: "pickEnum"; index: number }
  | { type: "decide"; id: string; ok: boolean }
  | { type: "decideAll"; ok: boolean }
  | { type: "remove"; id: string }
  | { type: "toggleUncertain"; id?: string }
  | { type: "stepBoundary"; dir: 1 | -1 }
  | { type: "setActive"; id: string | null; scroll?: boolean }
  | { type: "stepAnnotation"; dir: 1 | -1 }
  | { type: "stepProposal"; dir: 1 | -1 }
  | { type: "stepSection"; dir: 1 | -1 }
  | { type: "setFocusDoc"; doc: string; scroll?: boolean }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "toggleReview" }
  | { type: "toggleDone"; doc: string }
  | { type: "openVolume"; volId: string }
  | { type: "openProject"; id: string }
  | { type: "setTab"; tab: Tab }
  | { type: "setTrackScope"; scope: TrackScope }
  | { type: "cycleStatusFilter" }
  | { type: "toggleExpanded"; tagId: string }
  | { type: "setSpanMode"; mode: SpanMode }
  | { type: "toggleClean" }
  | { type: "toggleCompact"; announce?: boolean }
  | { type: "nudgeSize"; delta: number }
  | { type: "openPalette" }
  | { type: "closePalette" }
  | { type: "acceptPaletteTop" }
  | { type: "setPaletteQ"; q: string }
  | { type: "toggleHelp" }
  | { type: "escape" }
  | { type: "setOpenMenu"; label: string | null }
  | { type: "setProjectsOpen"; open: boolean }
  | { type: "setEditTag"; id: string }
  | { type: "editTagField"; field: keyof TagDef; value: string | boolean }
  | { type: "bumpVersion" }
  | { type: "markSaved" }
  | { type: "save" }
  | { type: "export"; what: ExportKind }
  | { type: "flash"; msg: string }
  | { type: "clearToast" }
  | { type: "loaded"; anns: Ann[]; tags?: TagDef[]; done?: Record<string, boolean> };

/* ── helpers the reducer uses ──────────────────────────────────────────────────────── */

/** Record a new annotation set: history, toast, dirty flag. The design's `push`. */
function push(s: State, next: Ann[], msg: string): State {
  return {
    ...s,
    anns: next,
    undo: [...s.undo, s.anns].slice(-UNDO_DEPTH),
    redo: [],
    dirty: true,
    ...toast(s, msg),
  };
}

function toast(s: State, msg: string): Pick<State, "toast" | "toastSeq"> {
  return { toast: msg, toastSeq: s.toastSeq + 1 };
}

function scroll(s: State, doc: string): ScrollIntent {
  return { doc, seq: (s.scrollIntent?.seq ?? 0) + 1 };
}

/** Replace one annotation in place, leaving the rest identical. */
function patch(anns: Ann[], id: string, f: (a: Ann) => Ann): Ann[] {
  return anns.map((a) => (a.id === id ? f(a) : a));
}

/* ── the reducer ───────────────────────────────────────────────────────────────────── */

export function reducer(s: State, action: Action): State {
  switch (action.type) {
    case "select": {
      return { ...s, sel: action.sel, selRect: action.rect, activeId: null, focusDoc: action.sel.doc, tab: "tags" };
    }

    case "clearSelection": {
      // Identity bail-out. mouseup fires on every click, most of which collapse the
      // selection that was already empty; returning a fresh object here would re-render
      // the entire reader on every click in the document.
      if (s.sel === null && s.selRect === null) return s;
      return { ...s, sel: null, selRect: null };
    }

    case "applyTag":
      return applyTag(s, action.tagId, action.attrs);

    case "repeatLastTag":
      return s.lastTag
        ? applyTag(s, s.lastTag.tag, s.lastTag.attrs)
        : { ...s, ...toast(s, "no previous tag") };

    case "setAttr": {
      const { id, key, value } = action;
      return push(
        s,
        patch(s.anns, id, (a) => ({ ...a, attrs: { ...a.attrs, [key]: value } })),
        key + " = " + String(value),
      );
    }

    case "pickEnum": {
      // `1`–`9` sets the active annotation's first enum attribute. One key, whatever the
      // tag: the number means "the nth choice", not a fixed attribute.
      const act = activeAnn(s);
      if (!act) return s;
      const en = tagOf(s, act.tag).attrs.find((a) => a.kind === "enum");
      const v = en?.values?.[action.index - 1];
      if (!en || v === undefined) return s;
      return reducer(s, { type: "setAttr", id: act.id, key: en.id, value: v });
    }

    case "decide": {
      const { id, ok } = action;
      const rest = proposals(s).filter((a) => a.id !== id);
      const next = push(
        s,
        patch(s.anns, id, (a) => ({
          ...a,
          status: ok ? "accepted" : "rejected",
          // Accepting moves the row into the gold layer and takes responsibility for it.
          // Rejecting changes only the verdict: the row stays, with its layer and its
          // provenance intact, because it is evidence about the model (SPEC §3.5).
          layer: ok ? "gold" : a.layer,
          prov: ok ? "human" : a.prov,
        })),
        ok ? "accepted" : "rejected",
      );
      return { ...next, activeId: rest.length ? rest[0].id : null };
    }

    case "decideAll": {
      const ids = new Set(proposals(s).map((a) => a.id));
      if (ids.size === 0) return { ...s, ...toast(s, "queue empty") };
      const next = s.anns.map((a) =>
        ids.has(a.id)
          ? action.ok
            ? { ...a, status: "accepted" as const, layer: "gold", prov: "human" as const }
            : { ...a, status: "rejected" as const }
          : a,
      );
      return {
        ...push(s, next, (action.ok ? "accepted " : "rejected ") + ids.size),
        activeId: null,
      };
    }

    case "remove": {
      // The parents of anything nested inside the removed span change, so they are
      // recomputed rather than left pointing at an id that no longer exists.
      const next = withParents(s.anns.filter((a) => a.id !== action.id));
      return { ...push(s, next, "deleted"), activeId: null };
    }

    case "toggleUncertain": {
      const id = action.id ?? s.activeId;
      if (id === null) return s;
      return push(s, patch(s.anns, id, (a) => ({ ...a, uncertain: !a.uncertain })), "flagged uncertain");
    }

    case "stepBoundary": {
      const act = activeAnn(s);
      if (act?.start == null || act.end === null) return s;
      const text = section(s, act.doc).text;
      const end = stepEnd(text, act.start, act.end, action.dir);
      if (end === null || end === act.end) return s;
      const next = withParents(
        patch(s.anns, act.id, (a) => ({ ...a, end, quote: text.slice(a.start!, end) })),
      );
      return push(s, next, "boundary");
    }

    case "setActive": {
      const a = s.anns.find((x) => x.id === action.id);
      const base: State = { ...s, activeId: action.id, sel: null, selRect: null };
      if (!a) return base;
      return {
        ...base,
        focusDoc: a.doc,
        // Clicking a mark opens its tag's group in the track, so the row it selected is
        // actually visible in the sidebar rather than hidden inside a collapsed group.
        expanded: { ...s.expanded, [a.tag]: true },
        scrollIntent: action.scroll ? scroll(s, a.doc) : s.scrollIntent,
      };
    }

    case "stepAnnotation": {
      const list = visibleAnns(s).filter((a) => a.start !== null);
      if (!list.length) return s;
      const i = list.findIndex((a) => a.id === s.activeId);
      // With nothing active, Tab starts at the first annotation and Shift+Tab at the
      // last. The design computes both from index −1, which sends Shift+Tab to the
      // second-to-last and makes the final annotation unreachable that way.
      const nxt =
        i < 0
          ? list[action.dir === 1 ? 0 : list.length - 1]
          : list[(i + action.dir + list.length) % list.length];
      return { ...s, activeId: nxt.id, sel: null, selRect: null, focusDoc: nxt.doc, tab: "tags" };
    }

    case "stepProposal": {
      const p = proposals(s);
      if (!p.length) return s;
      const i = p.findIndex((a) => a.id === s.activeId);
      const nx = p[((i < 0 ? 0 : i + action.dir) + p.length) % p.length];
      return { ...s, activeId: nx.id, sel: null, selRect: null, focusDoc: nx.doc, scrollIntent: scroll(s, nx.doc) };
    }

    case "stepSection": {
      const secs = sections(s);
      const i = Math.max(0, secs.findIndex((x) => x.doc_id === s.focusDoc));
      const nx = secs[(i + action.dir + secs.length) % secs.length];
      return { ...s, focusDoc: nx.doc_id, activeId: null, sel: null, selRect: null, scrollIntent: scroll(s, nx.doc_id) };
    }

    case "setFocusDoc":
      return {
        ...s,
        focusDoc: action.doc,
        scrollIntent: action.scroll ? scroll(s, action.doc) : s.scrollIntent,
      };

    case "undo": {
      const u = s.undo[s.undo.length - 1];
      if (!u) return s;
      return {
        ...s,
        anns: u,
        undo: s.undo.slice(0, -1),
        redo: [...s.redo, s.anns],
        dirty: true,
        ...toast(s, "undo"),
      };
    }

    case "redo": {
      const r = s.redo[s.redo.length - 1];
      if (!r) return s;
      return {
        ...s,
        anns: r,
        redo: s.redo.slice(0, -1),
        undo: [...s.undo, s.anns],
        dirty: true,
        ...toast(s, "redo"),
      };
    }

    case "toggleReview": {
      const on = !s.review;
      const p = proposals(s);
      return {
        ...s,
        review: on,
        tab: "tags",
        activeId: on && p.length ? p[0].id : null,
        sel: null,
        selRect: null,
        openMenu: null,
        scrollIntent: on && p.length ? scroll(s, p[0].doc) : s.scrollIntent,
        ...toast(
          s,
          on ? p.length + " proposals loaded into this volume" : "review mode off — proposals hidden",
        ),
      };
    }

    case "toggleDone": {
      const was = s.done[action.doc] === true;
      return {
        ...s,
        done: { ...s.done, [action.doc]: !was },
        dirty: true,
        ...toast(s, was ? "reopened" : "declared done"),
      };
    }

    case "openVolume": {
      const v = project(s).volumes.find((x) => x.id === action.volId);
      if (!v) return s;
      return {
        ...s,
        volId: action.volId,
        focusDoc: v.sections[0].doc_id,
        activeId: null,
        sel: null,
        selRect: null,
        scrollIntent: scroll(s, v.sections[0].doc_id),
      };
    }

    case "openProject": {
      const p = s.projects.find((x) => x.id === action.id);
      if (!p) return s;
      const firstTag = s.tags.find((t) => t.proj === "both" || t.proj === action.id);
      return {
        ...s,
        projectId: action.id,
        volId: p.volumes[0].id,
        focusDoc: p.volumes[0].sections[0].doc_id,
        activeId: null,
        sel: null,
        selRect: null,
        projectsOpen: false,
        openMenu: null,
        // Review mode is per-volume, and the other project's proposals are a different
        // run. Leaving it on would show an empty queue and read as "nothing to review".
        review: false,
        editTag: firstTag ? firstTag.id : s.editTag,
        ...toast(s, "opened " + p.name),
      };
    }

    case "setTab":
      return s.tab === action.tab ? s : { ...s, tab: action.tab, openMenu: null };

    case "setTrackScope":
      return s.trackScope === action.scope ? s : { ...s, trackScope: action.scope };

    case "cycleStatusFilter":
      return { ...s, statusFilter: nextStatusFilter(s.statusFilter) };

    case "toggleExpanded":
      return { ...s, expanded: { ...s.expanded, [action.tagId]: !s.expanded[action.tagId] } };

    case "setSpanMode":
      return s.spanMode === action.mode ? s : { ...s, spanMode: action.mode };

    case "toggleClean":
      return { ...s, cleanRead: !s.cleanRead };

    case "toggleCompact": {
      const next = { ...s, compact: !s.compact };
      return action.announce
        ? { ...next, ...toast(s, s.compact ? "normal reading" : "compact — line breaks ignored") }
        : next;
    }

    case "nudgeSize": {
      const size = Math.min(SIZE_MAX, Math.max(SIZE_MIN, s.size + action.delta));
      return size === s.size ? s : { ...s, size };
    }

    case "openPalette":
      return { ...s, palette: true, paletteQ: "", selRect: null, openMenu: null };

    case "closePalette":
      return s.palette ? { ...s, palette: false, paletteQ: "" } : s;

    case "acceptPaletteTop": {
      // Enter in the palette takes the first result — the fast path for a tag whose
      // hotkey you do not remember. Closing happens whether or not there is a match, so
      // Enter on an empty result set is not a dead key.
      const top = paletteList(s.tags, s.projectId, s.paletteQ)[0];
      const closed: State = { ...s, palette: false, paletteQ: "" };
      return top ? applyTag(closed, top.id) : closed;
    }

    case "setPaletteQ":
      return s.paletteQ === action.q ? s : { ...s, paletteQ: action.q };

    case "toggleHelp":
      return { ...s, help: !s.help, openMenu: null };

    case "escape": {
      // One key that closes everything. The bail-out matters: Escape with nothing open
      // is common (it is how you leave a text field), and it must not re-render.
      const clean =
        !s.palette && !s.help && s.sel === null && s.selRect === null && s.activeId === null &&
        s.openMenu === null && !s.projectsOpen;
      if (clean) return s;
      return {
        ...s,
        palette: false,
        help: false,
        sel: null,
        selRect: null,
        activeId: null,
        openMenu: null,
        projectsOpen: false,
      };
    }

    case "setOpenMenu":
      return s.openMenu === action.label ? s : { ...s, openMenu: action.label };

    case "setProjectsOpen":
      return s.projectsOpen === action.open ? s : { ...s, projectsOpen: action.open, openMenu: null };

    case "setEditTag":
      return s.editTag === action.id ? s : { ...s, editTag: action.id };

    case "editTagField": {
      const { field, value } = action;
      return {
        ...s,
        tags: s.tags.map((t) => (t.id === s.editTag ? { ...t, [field]: value } : t)),
        dirty: true,
      };
    }

    case "bumpVersion": {
      const version = s.version.replace(/(\d+)$/, (m) => String(parseInt(m, 10) + 1));
      return { ...s, version, dirty: false, ...toast(s, "tagset saved") };
    }

    case "save":
      return { ...s, saveIntent: s.saveIntent + 1, openMenu: null };

    case "export":
      return {
        ...s,
        exportIntent: { what: action.what, seq: (s.exportIntent?.seq ?? 0) + 1 },
        openMenu: null,
      };

    case "markSaved":
      return s.dirty ? { ...s, dirty: false } : s;

    case "flash":
      return { ...s, ...toast(s, action.msg) };

    case "clearToast":
      return s.toast === "" ? s : { ...s, toast: "" };

    case "loaded": {
      // `origin ?? layer` so a file written before this field existed still loads: the
      // annotation is simply treated as having originated where it now sits.
      const anns = withParents(action.anns.map((a) => ({ ...a, origin: a.origin || a.layer })));
      return {
        ...s,
        anns,
        tags: action.tags ?? s.tags,
        done: action.done ?? s.done,
        nextId: seedCounter(anns),
        undo: [],
        redo: [],
        dirty: false,
        activeId: null,
      };
    }
  }
}

/* ── applyTag, the one transition with real branching ──────────────────────────────── */

function applyTag(s: State, tagId: string, attrs?: AttrValues): State {
  const t = tagOf(s, tagId);

  // A document-scope tag classifies the whole section and carries no range, so it does
  // not need — and must not consume — a selection.
  if (t.scope === "document") {
    const doc = s.sel ? s.sel.doc : s.focusDoc;
    const ann: Ann = {
      id: mintId(s.nextId),
      doc,
      tag: tagId,
      start: null,
      end: null,
      quote: null,
      // The design passes `attrs || {}` here and `defaults(t)` on the ranged path, so
      // the same tag came out with different attributes depending on how it was applied
      // — a doctype from the palette had no `value` at all. One rule for both.
      attrs: attrs ? { ...attrs } : defaultAttrs(t),
      layer: "gold",
      origin: "gold",
      prov: "human",
      status: "accepted",
      conf: null,
      uncertain: false,
      parent: null,
    };
    return {
      ...push(s, [...s.anns, ann], "document-level " + t.en),
      sel: null,
      selRect: null,
      nextId: s.nextId + 1,
      lastTag: { tag: tagId, attrs: ann.attrs },
    };
  }

  // No selection but something is active: this is a retag, not a new annotation.
  if (!s.sel && s.activeId) {
    const next = withParents(
      patch(s.anns, s.activeId, (a) => ({ ...a, tag: tagId, attrs: attrs ? { ...attrs } : defaultAttrs(t) })),
    );
    return {
      ...push(s, next, "retagged → " + t.en),
      lastTag: { tag: tagId, attrs: attrs ?? defaultAttrs(t) },
      expanded: { ...s.expanded, [tagId]: true },
    };
  }

  if (!s.sel) return { ...s, ...toast(s, "highlight a passage first") };

  const text = section(s, s.sel.doc).text;
  const ann: Ann = {
    id: mintId(s.nextId),
    doc: s.sel.doc,
    tag: tagId,
    start: s.sel.start,
    end: s.sel.end,
    quote: text.slice(s.sel.start, s.sel.end),
    attrs: attrs ? { ...attrs } : defaultAttrs(t),
    layer: "gold",
    origin: "gold",
    prov: "human",
    status: "accepted",
    conf: null,
    uncertain: false,
    parent: null,
  };
  // Recomputed across the whole set, not just for the new row: a span that *contains*
  // an existing annotation becomes its parent, so the old row changes too.
  const next = withParents([...s.anns, ann]);
  const placed = next.find((a) => a.id === ann.id)!;
  return {
    ...push(
      s,
      next,
      t.en + " · " + (ann.end! - ann.start!) + " chars" + (placed.parent ? " · nested" : ""),
    ),
    sel: null,
    selRect: null,
    activeId: ann.id,
    nextId: s.nextId + 1,
    lastTag: { tag: tagId, attrs: ann.attrs },
    expanded: { ...s.expanded, [tagId]: true },
  };
}
