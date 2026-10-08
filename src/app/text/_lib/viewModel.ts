// buildView(state, ctx) → ViewModel. One pure function; the components read it and
// dispatch what it tells them to.
//
// This is the same shape `/ocr-comparison` uses in this app: every string, style object
// and flag a component needs is computed here, so a component contains JSX and nothing
// else. The difference from the design is that a clickable thing carries an **Action**
// rather than a closure — closures are opaque to a test, whereas `expect(vm.volumes[1].on)
// .toEqual({type:"openVolume", volId:"v-ach"})` says exactly what the button does.
//
// Viewport-dependent values (the floating menu's x/y) take `ctx.viewportWidth`, which the
// component measures in an effect. Nothing here reads `window`.

import { C, DIR, F, LTR, SWATCHES, btn, chip, keyBadge, sideTab, tab } from "./designTokens";
import { menuDefs, isSeparator } from "./menuDef";
import type { MenuEntry } from "./menuDef";
import { menuHalfWidth, menuPosition } from "./offsets";
import { piecesIn } from "./pieces";
import { pieceStyle } from "./pieceStyle";
import { paletteList } from "./selectors";
import {
  activeAnn,
  project,
  projectSections,
  proposals,
  section,
  sections,
  tagOf,
  visibleAnns,
  volAnns,
  volume,
} from "./state";
import type { Action, State } from "./state";
import { defaultAttrs, inProject, popularTags } from "./tagset";
import type { Ann, Style, TagDef } from "./types";
import { isEmptyValue, variables } from "./variables";

/** What the component knows and the reducer must not: the size of the window. */
export interface ViewCtx {
  viewportWidth: number;
}


/* ── the pieces the components consume ─────────────────────────────────────────────── */

export interface PieceVM {
  /** Absolute offset — written to `data-off`, and read back by the selection reader. */
  s: number;
  doc: string;
  text: string;
  style: Style;
  /** The annotation a click selects: the innermost non-structural mark, if any. */
  on: Action;
}

export interface ParagraphVM {
  num: string;
  structLabel: string;
  pieces: PieceVM[];
  wrapStyle: Style;
  gutterStyle: Style;
  structStyle: Style;
}

export interface SectionVM {
  docId: string;
  part: string;
  showPart: boolean;
  title: string;
  count: string;
  paragraphs: ParagraphVM[];
  doneLabel: string;
  doneStyle: Style;
  onDone: Action;
  padStyle: Style;
  partStyle: Style;
  partTextStyle: Style;
  headStyle: Style;
  titleStyle: Style;
  sepStyle: Style;
  dot: Style;
}

export interface InstanceVM {
  id: string;
  quote: string;
  meta: string;
  badge: string;
  badgeStyle: Style;
  isProposal: boolean;
  style: Style;
  on: Action;
  accept: Action;
  reject: Action;
}

export interface TrackVM {
  tagId: string;
  label: string;
  count: string;
  total: string;
  caret: string;
  caretStyle: Style;
  dot: Style;
  warn: string;
  warnStyle: Style;
  barStyle: Style;
  rowStyle: Style;
  open: boolean;
  toggle: Action;
  rows: InstanceVM[];
}

export interface AttrOptionVM {
  label: string;
  key: string;
  style: Style;
  on: Action;
}

export interface InspectorAttrVM {
  label: string;
  isEnum: boolean;
  value: string;
  hint: string;
  attrId: string;
  annId: string;
  options: AttrOptionVM[];
}

export interface ActionButtonVM {
  label: string;
  style: Style;
  on: Action;
}

export interface MenuItemVM {
  sep: boolean;
  label: string;
  key: string;
  on: Action | null;
  style: Style;
}

export interface MenuVM {
  label: string;
  open: boolean;
  toggle: Action;
  style: Style;
  items: MenuItemVM[];
}

/* ── the whole view ────────────────────────────────────────────────────────────────── */

export interface ViewModel {
  menus: MenuVM[];
  menuOverlay: boolean;
  layerDot: Style;
  layerLabel: string;
  tagsetVersion: string;
  savedLabel: string;

  projectName: string;
  projectId: string;
  projectPath: string;
  projectBtn: Style;
  projectsOpen: boolean;
  projectList: {
    id: string; name: string; meta: string; state: string; stateStyle: Style; dot: Style; style: Style; on: Action;
  }[];

  volTitle: string;
  volSub: string;
  volCount: string;
  // Every list carries its own identity. Two sections in one volume can share a title —
  // `סימן א` occurs in more than one part of a book — so a React key taken from the label
  // is not unique, and React then reuses one row's DOM for the other.
  volumes: { id: string; title: string; meta: string; dot: Style; style: Style; on: Action }[];
  sectionNav: {
    docId: string; title: string; count: string; dateChip: Style; placeChip: Style;
    propChip: string; propChipStyle: Style; dot: Style; style: Style; on: Action;
  }[];

  readerStyle: Style;
  readerPadStyle: Style;
  volHeadStyle: Style;
  volTitleStyle: Style;
  volSubStyle: Style;
  sections: SectionVM[];

  sizeBtn: Style;
  cleanBtn: Style;
  compactBtn: Style;
  modeUnderlineStyle: Style;
  modeHighlightStyle: Style;
  reviewBtn: Style;
  reviewLabel: string;
  reviewOn: boolean;
  reviewProgress: string;
  ghostBtn: Style;

  selLabel: string;
  statusHint: string;

  tab: State["tab"];
  tabStyles: Record<"tags" | "tagset" | "library" | "analysis", Style>;

  inspectorTitle: string;
  hasInspector: boolean;
  inspectorTag: string;
  inspectorTei: string;
  inspectorDot: Style;
  inspectorQuote: string;
  inspectorRange: string;
  inspectorStatus: string;
  inspectorStatusStyle: Style;
  inspectorAttrs: InspectorAttrVM[];
  inspectorActions: ActionButtonVM[];

  scopeSectionStyle: Style;
  scopeVolumeStyle: Style;
  statusChip: Style;
  statusFilter: string;
  tagTrack: TrackVM[];
  varsScope: string;
  variables: { id: string; value: string; valueStyle: Style }[];

  tagsetPath: string;
  tagRows: { id: string; label: string; he: string; key: string; keyStyle: Style; uses: string; dot: Style; style: Style; on: Action }[];
  editDot: Style;
  editLabel: string;
  editId: string;
  editLabelEn: string;
  editLabelHe: string;
  editTei: string;
  editKey: string;
  editKeyWarn: string;
  editKeyWarnStyle: Style;
  popularStyle: Style;
  popularLabel: string;
  swatches: { color: string; style: Style; on: Action }[];
  editAttrs: { id: string; kind: string; tei: string; values: string; kindStyle: Style }[];
  containers: { label: string; style: Style }[];
  editImpact: string;
  bumpLabel: string;

  librarySub: string;
  libStats: { value: string; label: string }[];
  libRows: {
    he: string; slug: string; units: string; pct: string; tagged: number; review: string;
    reviewStyle: Style; barStyle: Style; btnLabel: string; btnStyle: Style; cardStyle: Style; on: Action;
  }[];

  analysisSub: string;
  analysisStats: { value: string; label: string }[];
  distribution: { label: string; count: string; dot: Style; barStyle: Style }[];
  outcomes: { label: string; value: string; dot: Style }[];
  varRows: { title: string; docId: string; style: Style; cells: { label: string; value: string; style: Style }[] }[];

  selMenuOpen: boolean;
  selMenuStyle: Style;
  selMenuItems: { label: string; key: string; title: string; dot: Style; keyStyle: Style; style: Style; on: Action }[];

  paletteOpen: boolean;
  paletteQ: string;
  paletteItems: { label: string; he: string; tei: string; key: string; keyStyle: Style; dot: Style; style: Style; on: Action }[];

  helpOpen: boolean;
  helpRows: { key: string; label: string; keyStyle: Style }[];

  hasToast: boolean;
  toast: string;
}

/* ── the builder ───────────────────────────────────────────────────────────────────── */

export function buildView(s: State, ctx: ViewCtx): ViewModel {
  const proj = project(s);
  const vol = volume(s);
  const tags = s.tags.filter((t) => inProject(t, s.projectId));
  const act = activeAnn(s);
  const props = proposals(s);
  const live = volAnns(s);
  const projAnns = s.anns.filter((a) =>
    projectSections(s).some((x) => x.doc_id === a.doc),
  );
  const notRejected = projAnns.filter((a) => a.status !== "rejected");
  const editTag = tagOf(s, s.editTag);
  const popular = popularTags(s.tags, s.projectId);
  const focusSec = section(s, s.focusDoc);

  return {
    ...chrome(s, proj),
    ...projectsDialog(s),
    ...navigator(s, proj, vol),
    ...reader(s),
    ...toolbar(s, props),
    ...tagsPanel(s, tags, act, focusSec),
    ...tagsetPanel(s, proj, tags, editTag),
    ...libraryPanel(s, proj, notRejected),
    ...analysisPanel(s, tags, projAnns, notRejected),
    ...overlays(s, ctx, tags, popular),
    tab: s.tab,
    tabStyles: {
      tags: sideTab(s.tab === "tags"),
      tagset: sideTab(s.tab === "tagset"),
      library: sideTab(s.tab === "library"),
      analysis: sideTab(s.tab === "analysis"),
    },
    selLabel: s.sel
      ? "selection " + s.sel.start + "–" + s.sel.end + " · " + focusSec.title
      : act
        ? "annotation " + act.id + " · " + tagOf(s, act.tag).en
        : "highlight a passage to tag it",
    statusHint:
      live.length + " in volume · " + props.length + " proposals " + (s.review ? "shown" : "hidden"),
    hasToast: s.toast !== "",
    toast: s.toast,
  };
}

/* ── menu bar and title chrome ─────────────────────────────────────────────────────── */

function chrome(s: State, proj: ReturnType<typeof project>): Pick<ViewModel, "menus" | "menuOverlay" | "layerDot" | "layerLabel" | "tagsetVersion" | "savedLabel" | "projectName" | "projectId" | "projectPath" | "projectBtn"> {
  const menus: MenuVM[] = menuDefs(s).map((m) => ({
    label: m.label,
    open: s.openMenu === m.label,
    toggle: { type: "setOpenMenu", label: s.openMenu === m.label ? null : m.label },
    style: {
      border: 0,
      background: s.openMenu === m.label ? C.paper : "transparent",
      color: C.head,
      padding: "0 9px",
      cursor: "pointer",
      fontSize: "11px",
      height: "100%",
    },
    items: m.items.map((it: MenuEntry) =>
      isSeparator(it)
        ? { sep: true, label: "", key: "", on: null, style: { height: "1px", background: C.lineMid, margin: "4px 0" } }
        : {
            sep: false,
            label: it.label,
            key: it.key,
            on: it.action,
            style: {
              display: "flex", alignItems: "center", gap: "12px", padding: "4px 12px",
              cursor: "pointer", fontSize: "11px", color: C.inkSoft,
            },
          },
    ),
  }));

  return {
    menus,
    menuOverlay: s.openMenu !== null,
    layerDot: {
      width: "7px", height: "7px", borderRadius: "50%",
      background: s.review ? C.propose : SWATCHES[1], display: "inline-block",
    },
    layerLabel: s.review ? ["gold", ...new Set(s.anns.filter((a) => a.status === "proposed").map((a) => a.layer))].join(" + ") : "gold",
    tagsetVersion: s.version + (s.dirty ? "*" : ""),
    savedLabel: s.dirty ? "unsaved" : "saved",
    projectName: proj.name,
    projectId: proj.id,
    projectPath: proj.path + " · " + proj.corpusLabel,
    projectBtn: btn(false, { fontWeight: 600, fontSize: "11px", flex: "0 0 auto", ...LTR }),
  };
}

function projectsDialog(s: State): Pick<ViewModel, "projectsOpen" | "projectList"> {
  return {
    projectsOpen: s.projectsOpen,
    projectList: s.projects.map((p) => {
      const ids = new Set(p.volumes.flatMap((v) => v.sections.map((x) => x.doc_id)));
      const cnt = s.anns.filter((a) => ids.has(a.doc) && a.status !== "rejected").length;
      const on = p.id === s.projectId;
      return {
        id: p.id,
        name: p.name,
        meta: p.path + " · " + p.volumes.length + " titles · " + cnt + " annotations",
        state: on ? "open" : "",
        stateStyle: { fontFamily: F.mono, fontSize: "10px", color: C.accept },
        dot: { width: "9px", height: "9px", borderRadius: "2px", background: on ? C.accept : C.dim3, display: "inline-block" },
        style: {
          display: "flex", alignItems: "center", gap: "10px", padding: "9px 14px", cursor: "pointer",
          borderBottom: "1px solid " + C.lineSoft2, background: on ? C.chrome : "transparent",
        },
        on: { type: "openProject", id: p.id },
      };
    }),
  };
}

/* ── the right-hand navigator ──────────────────────────────────────────────────────── */

function navigator(s: State, proj: ReturnType<typeof project>, vol: ReturnType<typeof volume>): Pick<ViewModel, "volTitle" | "volSub" | "volCount" | "volumes" | "sectionNav"> {
  return {
    volTitle: vol.title,
    volSub: vol.sub,
    volCount: String(proj.volumes.length),
    volumes: proj.volumes.map((v) => {
      const ids = new Set(v.sections.map((x) => x.doc_id));
      const cnt = s.anns.filter((a) => ids.has(a.doc) && a.status !== "rejected").length;
      const on = v.id === s.volId;
      return {
        id: v.id,
        title: v.title,
        meta: v.sections.length + "§ · " + cnt,
        dot: { width: "7px", height: "7px", borderRadius: "2px", flex: "0 0 7px", background: on ? SWATCHES[0] : C.dim },
        style: {
          display: "flex", alignItems: "center", gap: "7px", padding: "6px 9px", cursor: "pointer",
          background: on ? C.fill : "transparent", borderBottom: "1px solid " + C.line,
        },
        on: { type: "openVolume", volId: v.id },
      };
    }),
    sectionNav: sections(s).map((sec) => {
      const mine = volAnns(s).filter((a) => a.doc === sec.doc_id);
      const hasDate = mine.some((a) => a.tag === "date" && a.status === "accepted");
      const hasPlace = mine.some((a) => a.tag === "place" && a.status === "accepted");
      const pr = s.anns.filter((a) => a.doc === sec.doc_id && a.status === "proposed").length;
      const on = sec.doc_id === s.focusDoc;
      return {
        docId: sec.doc_id,
        title: sec.title,
        count: String(mine.length),
        dateChip: chip(hasDate, SWATCHES[1]),
        placeChip: chip(hasPlace, SWATCHES[2]),
        propChip: pr ? pr + " prop" : "",
        propChipStyle: {
          fontFamily: F.mono, fontSize: "9px", color: C.propose, border: "1px dashed " + C.proposeLine,
          borderRadius: "2px", padding: "0 4px", display: pr ? "inline-block" : "none",
        },
        dot: {
          width: "7px", height: "7px", borderRadius: "50%", flex: "0 0 7px",
          background: s.done[sec.doc_id] ? C.accept : mine.length ? SWATCHES[0] : C.dim,
        },
        style: {
          padding: "6px 9px", cursor: "pointer", borderBottom: "1px solid " + C.line,
          background: on ? C.fill : "transparent",
        },
        on: { type: "setFocusDoc", doc: sec.doc_id, scroll: true },
      };
    }),
  };
}

/* ── the reader ────────────────────────────────────────────────────────────────────── */

function reader(s: State): Pick<ViewModel, "sections" | "readerStyle" | "readerPadStyle" | "volHeadStyle" | "volTitleStyle" | "volSubStyle"> {
  const cp = s.compact;
  const marks = visibleAnns(s).filter((a) => a.start !== null);
  const opts = { mode: s.spanMode, cleanRead: s.cleanRead, activeId: s.activeId };
  let lastPart: string | null = null;

  const built: SectionVM[] = sections(s).map((sec) => {
    const mine = marks.filter((a) => a.doc === sec.doc_id);

    const toPieces = (pStart: number, pEnd: number): PieceVM[] =>
      piecesIn(sec.doc_id, pStart, pEnd, mine, s.sel).map((p) => {
        const inner = p.cov.find((a) => !tagOf(s, a.tag).structural);
        return {
          s: p.s,
          doc: sec.doc_id,
          text: sec.text.slice(p.s, p.e),
          style: pieceStyle(p.cov, p.selHit, s.tags, opts),
          on: { type: "setActive", id: inner ? inner.id : null },
        };
      });

    let paragraphs: ParagraphVM[];
    if (cp) {
      // Compact mode drops the paragraph structure entirely: one run, no gutter. The
      // point is maximum text in view when scanning a volume rather than reading it.
      paragraphs = [
        {
          num: "", structLabel: "", pieces: toPieces(0, sec.text.length),
          wrapStyle: { display: "flex", gap: 0, alignItems: "flex-start", marginBottom: "2px" },
          gutterStyle: { display: "none" }, structStyle: { display: "none" },
        },
      ];
    } else {
      let cursor = 0;
      paragraphs = sec.segs.map((seg, si) => {
        const pStart = sec.text.indexOf(seg, cursor);
        const pEnd = pStart + seg.length;
        cursor = pEnd;
        const struct = mine.filter(
          (a) => tagOf(s, a.tag).structural && a.start! <= pStart && a.end! >= pEnd,
        );
        const label = struct.length
          ? struct.map((a) => String(a.attrs.part ?? tagOf(s, a.tag).en)).join(" ")
          : "";
        return {
          // `b` for a press block, `p` for a responsa paragraph — the gutter says which
          // kind of unit is being counted, not just its number.
          num: "p" + (si + 1),
          structLabel: label,
          pieces: toPieces(pStart, pEnd),
          wrapStyle: { display: "flex", gap: "12px", alignItems: "flex-start", marginBottom: "14px" },
          gutterStyle: { width: "44px", flex: "0 0 44px", paddingTop: "6px", textAlign: "left", userSelect: "none" },
          structStyle: {
            marginTop: "4px", fontSize: "9px", fontFamily: F.mono, color: C.faint,
            borderRight: label ? "2px solid " + C.dim : "none",
            paddingRight: label ? "4px" : 0,
            writingMode: "vertical-rl", height: label ? "auto" : 0,
          },
        };
      });
    }

    const showPart = sec.part !== lastPart;
    lastPart = sec.part;
    const cnt = volAnns(s).filter((a) => a.doc === sec.doc_id).length;
    const done = s.done[sec.doc_id] === true;

    return {
      docId: sec.doc_id,
      part: sec.part,
      showPart,
      title: sec.title,
      count: cnt + " ann.",
      paragraphs,
      doneLabel: done ? "✓ done" : "declare done",
      doneStyle: btn(done, { fontSize: cp ? "9px" : "10px", padding: "1px 7px", direction: "ltr" }),
      onDone: { type: "toggleDone", doc: sec.doc_id },
      padStyle: { paddingTop: cp ? "2px" : "10px" },
      partStyle: { display: "flex", alignItems: "center", gap: "12px", margin: cp ? "10px 0 4px" : "24px 0 12px" },
      partTextStyle: { direction: DIR, fontFamily: F.serif, fontSize: cp ? "14px" : "18px", fontWeight: 700, color: C.head },
      headStyle: {
        display: "flex", alignItems: "center", gap: "8px", marginBottom: cp ? "1px" : "8px",
        direction: DIR, flexWrap: "nowrap", whiteSpace: "nowrap",
      },
      titleStyle: { fontFamily: F.serif, fontSize: cp ? "13px" : "17px", fontWeight: 600, flex: "0 0 auto" },
      sepStyle: { display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", margin: cp ? "5px 0 1px" : "24px 0 4px" },
      dot: {
        width: cp ? "6px" : "8px", height: cp ? "6px" : "8px", borderRadius: "50%",
        background: done ? C.accept : cnt ? SWATCHES[0] : C.dim, display: "inline-block",
      },
    };
  });

  return {
    sections: built,
    readerStyle: (cp
      ? { maxWidth: "1000px", margin: "0 auto", padding: "0 12px", fontFamily: F.serif,
          fontSize: Math.max(13, s.size - 5) + "px", lineHeight: 1.4, color: C.ink }
      : { maxWidth: "780px", margin: "0 auto", padding: "0 26px", fontFamily: F.serif,
          fontSize: s.size + "px", lineHeight: 1.95, color: C.ink }),
    readerPadStyle: { flex: 1, overflow: "auto", position: "relative", padding: cp ? "0 0 40px" : "0 0 90px" },
    volHeadStyle: { textAlign: "center", padding: cp ? "8px 0 2px" : "20px 0 4px" },
    volTitleStyle: { direction: DIR, fontFamily: F.serif, fontSize: cp ? "15px" : "24px", fontWeight: 700 },
    volSubStyle: { fontFamily: F.mono, fontSize: "10px", color: C.faint2, marginTop: "3px", display: cp ? "none" : "block" },
  };
}

function toolbar(s: State, props: Ann[]): Pick<ViewModel, "sizeBtn" | "cleanBtn" | "compactBtn" | "modeUnderlineStyle" | "modeHighlightStyle" | "reviewBtn" | "reviewLabel" | "reviewOn" | "reviewProgress" | "ghostBtn"> {
  return {
    sizeBtn: btn(false, { fontFamily: F.mono, padding: "2px 6px" }),
    cleanBtn: tab(s.cleanRead),
    compactBtn: tab(s.compact),
    modeUnderlineStyle: tab(s.spanMode === "underline" && !s.cleanRead),
    modeHighlightStyle: tab(s.spanMode === "highlight" && !s.cleanRead),
    reviewBtn: btn(s.review, { fontWeight: 600, display: "flex", alignItems: "center", gap: "5px" }),
    reviewLabel: s.review ? "reviewing · exit" : "review " + props.length,
    reviewOn: s.review,
    reviewProgress: props.length
      ? (props.findIndex((a) => a.id === s.activeId) + 1 || 1) + " of " + props.length + " left"
      : "queue empty",
    ghostBtn: btn(false, { padding: "2px 8px" }),
  };
}

/* ── the Tags panel ────────────────────────────────────────────────────────────────── */

function instanceRow(s: State, a: Ann): InstanceVM {
  const t = tagOf(s, a.tag);
  const on = a.id === s.activeId;
  const sec = section(s, a.doc);
  const attrVals = Object.keys(a.attrs)
    .filter((k) => k !== "ref")
    .map((k) => String(a.attrs[k]))
    .slice(0, 2)
    .join(" · ");
  return {
    id: a.id,
    quote: a.quote ?? "— " + (t.he || t.en) + " —",
    meta: sec.title + " · " + (attrVals || (a.start === null ? "doc" : "")),
    badge:
      a.status === "proposed"
        ? a.conf !== null
          ? a.conf.toFixed(2)
          : "?"
        : a.uncertain
          ? "?"
          : a.prov === "rule"
            ? "r"
            : "·",
    badgeStyle: {
      fontFamily: F.mono, fontSize: "9px", width: "26px", textAlign: "center", borderRadius: "2px",
      color: a.status === "proposed" ? C.propose : a.uncertain ? C.reject : C.faint,
      border: "1px " + (a.status === "proposed" ? "dashed " + C.proposeLine : a.uncertain ? "solid " + C.rejectLine : "solid transparent"),
    },
    isProposal: a.status === "proposed",
    style: {
      display: "flex", alignItems: "center", gap: "6px", padding: "3px 10px 3px 8px", cursor: "pointer",
      background: on ? C.rowActive : C.paper, borderTop: "1px solid " + C.lineSoft,
      borderLeft: on ? "2px solid " + t.color : "2px solid transparent",
    },
    on: { type: "setActive", id: a.id, scroll: true },
    accept: { type: "decide", id: a.id, ok: true },
    reject: { type: "decide", id: a.id, ok: false },
  };
}

function tagsPanel(s: State, tags: TagDef[], act: Ann | null, focusSec: ReturnType<typeof section>): Pick<ViewModel, "inspectorTitle" | "hasInspector" | "inspectorTag" | "inspectorTei" | "inspectorDot" | "inspectorQuote" | "inspectorRange" | "inspectorStatus" | "inspectorStatusStyle" | "inspectorAttrs" | "inspectorActions" | "scopeSectionStyle" | "scopeVolumeStyle" | "statusChip" | "statusFilter" | "tagTrack" | "varsScope" | "variables"> {
  const scoped = s.trackScope === "section"
    ? visibleAnns(s).filter((a) => a.doc === s.focusDoc)
    : visibleAnns(s);
  const all = volAnns(s);
  const max = Math.max(1, ...tags.map((t) => scoped.filter((a) => a.tag === t.id).length));

  const tagTrack: TrackVM[] = tags.map((t) => {
    const rows = scoped.filter((a) => a.tag === t.id);
    const total = all.filter((a) => a.tag === t.id).length;
    const open = s.expanded[t.id] === true && rows.length > 0;
    const nProps = rows.filter((a) => a.status === "proposed").length;
    const nUnc = rows.filter((a) => a.uncertain).length;
    return {
      tagId: t.id,
      label: t.en,
      count: String(rows.length),
      total: total ? "/" + total : "",
      caret: open ? "▾" : "▸",
      caretStyle: { fontFamily: F.mono, fontSize: "9px", color: rows.length ? C.muted3 : C.dim, width: "8px" },
      dot: { width: "8px", height: "8px", borderRadius: "2px", background: t.color, display: "inline-block", flex: "0 0 8px", opacity: rows.length ? 1 : 0.35 },
      warn: nProps ? String(nProps) : nUnc ? String(nUnc) : "",
      warnStyle: {
        fontFamily: F.mono, fontSize: "9px", padding: "0 4px", borderRadius: "2px",
        color: nProps ? C.propose : C.reject,
        border: "1px " + (nProps ? "dashed " + C.proposeLine : "solid " + C.rejectLine),
        display: nProps || nUnc ? "inline-block" : "none",
      },
      barStyle: { width: Math.round((rows.length / max) * 100) + "%", height: "100%", background: t.color, opacity: 0.55 },
      rowStyle: {
        display: "flex", alignItems: "center", gap: "6px", padding: "4px 10px", cursor: "pointer",
        minWidth: 0, overflow: "hidden", background: open ? C.fillSoft : "transparent",
        opacity: rows.length ? 1 : 0.55,
      },
      open,
      toggle: { type: "toggleExpanded", tagId: t.id },
      rows: rows.map((a) => instanceRow(s, a)),
    };
  });

  const t = act ? tagOf(s, act.tag) : null;
  const parentTag = act?.parent ? tagOf(s, s.anns.find((x) => x.id === act.parent)?.tag ?? "").en : null;

  return {
    inspectorTitle: act
      ? act.status === "proposed" ? "Proposal" : "Annotation"
      : s.sel ? "Selection — pick a tag" : "Inspector",
    hasInspector: act !== null,
    inspectorTag: t ? t.en : "",
    inspectorTei: t ? "<" + t.tei + ">" : "",
    inspectorDot: { width: "9px", height: "9px", borderRadius: "2px", background: t ? t.color : C.muted3, display: "inline-block" },
    inspectorQuote: act ? (act.quote ?? "— document level —") : "",
    inspectorRange: act
      ? (act.start === null ? "scope: document" : "chars " + act.start + "–" + act.end) +
        " · " + act.layer + " · " + act.prov + (parentTag ? " · child of " + parentTag : "")
      : "",
    inspectorStatus: act
      ? act.status + (act.uncertain ? " · uncertain" : "") + (act.conf !== null ? " · " + act.conf.toFixed(2) : "")
      : "",
    inspectorStatusStyle: {
      fontFamily: F.mono, fontSize: "10px",
      color: act?.status === "proposed" ? C.propose : C.accept,
    },
    inspectorAttrs:
      act && t
        ? t.attrs.map((at) => ({
            label: at.label + " · " + at.tei,
            isEnum: at.kind === "enum",
            value: act.attrs[at.id] != null ? String(act.attrs[at.id]) : "",
            hint: at.kind === "vocab" ? "shared vocab lookup…" : at.kind,
            attrId: at.id,
            annId: act.id,
            options: (at.values ?? []).map((v, i) => ({
              label: v,
              key: String(i + 1),
              style: btn(act.attrs[at.id] === v, { padding: "1px 6px", fontSize: "10px", display: "flex", gap: "4px", alignItems: "center" }),
              on: { type: "setAttr", id: act.id, key: at.id, value: v },
            })),
          }))
        : [],
    inspectorActions: act
      ? ([
          act.status === "proposed"
            ? { label: "✓ accept", on: { type: "decide", id: act.id, ok: true },
                style: btn(false, { color: C.accept, borderColor: "#b9c9ae", background: "#eef3e8" }) }
            : null,
          act.status === "proposed"
            ? { label: "✕ reject", on: { type: "decide", id: act.id, ok: false },
                style: btn(false, { color: C.reject, borderColor: "#d9c0b6", background: "#f6ece8" }) }
            : null,
          { label: act.uncertain ? "✓ clear flag" : "? uncertain",
            on: { type: "toggleUncertain", id: act.id }, style: btn(act.uncertain) },
          { label: "✕ delete", on: { type: "remove", id: act.id }, style: btn(false, { color: C.reject }) },
        ].filter(Boolean) as ActionButtonVM[])
      : [],

    scopeSectionStyle: tab(s.trackScope === "section"),
    scopeVolumeStyle: tab(s.trackScope === "volume"),
    statusChip: btn(s.statusFilter !== "all", { fontSize: "10px", padding: "2px 7px" }),
    statusFilter: s.statusFilter,
    tagTrack,
    varsScope: focusSec.title,
    variables: variables(s.focusDoc, s.anns).map((r) => ({
      id: r.id,
      value: String(r.value),
      valueStyle: {
        fontFamily: F.mono, fontSize: "11px", fontWeight: 600,
        color: isEmptyValue(r.value) ? C.faint : C.inkSoft,
      },
    })),
  };
}

/* ── the Tag set panel ─────────────────────────────────────────────────────────────── */

function tagsetPanel(s: State, proj: ReturnType<typeof project>, tags: TagDef[], et: TagDef): Pick<ViewModel, "tagsetPath" | "tagRows" | "editDot" | "editLabel" | "editId" | "editLabelEn" | "editLabelHe" | "editTei" | "editKey" | "editKeyWarn" | "editKeyWarnStyle" | "popularStyle" | "popularLabel" | "swatches" | "editAttrs" | "containers" | "editImpact" | "bumpLabel"> {
  // The six keys that are also app commands. A tag may take one — it wins while text is
  // selected — but the editor has to say so, because the behaviour is otherwise invisible.
  const shared = "cdnpuy".includes(et.key) && et.key !== "";
  return {
    tagsetPath: proj.tagsetPath + " · v" + s.version,
    tagRows: tags.map((t) => ({
      id: t.id,
      label: t.en,
      he: t.he,
      key: t.key || "—",
      keyStyle: keyBadge(),
      uses: s.anns.filter((a) => a.tag === t.id && a.status !== "rejected").length.toLocaleString(),
      dot: { width: "9px", height: "9px", borderRadius: "2px", background: t.color, display: "inline-block", flex: "0 0 9px" },
      style: {
        display: "flex", alignItems: "center", gap: "7px", padding: "5px 10px", cursor: "pointer",
        fontSize: "11px", borderBottom: "1px solid " + C.line,
        background: s.editTag === t.id ? C.fill : "transparent",
      },
      on: { type: "setEditTag", id: t.id },
    })),
    editDot: { width: "10px", height: "10px", borderRadius: "2px", background: et.color, display: "inline-block" },
    editLabel: et.en,
    editId: et.id,
    editLabelEn: et.en,
    editLabelHe: et.he,
    editTei: et.tei,
    editKey: et.key,
    editKeyWarn: shared ? "shared with an app command" : "free",
    editKeyWarnStyle: { fontFamily: F.mono, fontSize: "9px", color: shared ? C.propose : C.faint },
    popularStyle: btn(et.popular === true, { fontSize: "10px", width: "100%" }),
    popularLabel: et.popular === true ? "✓ shown on selection" : "+ add to selection menu",
    swatches: SWATCHES.map((c) => ({
      color: c,
      style: {
        width: "20px", height: "20px", borderRadius: "3px", background: c, cursor: "pointer",
        border: et.color === c ? "2px solid " + C.ink : "1px solid rgba(0,0,0,.15)",
      },
      on: { type: "editTagField", field: "color", value: c },
    })),
    editAttrs: et.attrs.map((a) => ({
      id: a.id,
      kind: a.kind,
      tei: a.tei,
      values: a.values ? a.values.join(" · ") : a.kind === "vocab" ? "vocabulary" : a.kind === "number" ? "number" : "free text",
      kindStyle: { fontFamily: F.mono, fontSize: "9px", color: C.muted3, border: "1px solid " + C.lineMid, borderRadius: "2px", padding: "0 4px" },
    })),
    containers: et.contain.map((c) => ({
      label: c,
      style: {
        fontSize: "10px", border: "1px solid #ddd5c6", background: "#f4efe5", borderRadius: "2px",
        padding: "1px 7px", color: "#5c5348", fontFamily: F.mono,
      },
    })),
    editImpact:
      s.anns.filter((a) => a.tag === et.id && a.status !== "rejected").length.toLocaleString() +
      " annotations in this project use this tag · " + (et.auto || "—"),
    bumpLabel: s.dirty ? "Save" : "Saved",
  };
}

/* ── the Library panel ─────────────────────────────────────────────────────────────── */

function libraryPanel(s: State, proj: ReturnType<typeof project>, live: Ann[]): Pick<ViewModel, "librarySub" | "libStats" | "libRows"> {
  return {
    librarySub: proj.corpusLabel,
    libStats: [
      { value: String(proj.volumes.length), label: "titles" },
      { value: String(projectSections(s).length), label: "sections" },
      { value: String(live.length), label: "annotations" },
      { value: String(Object.keys(s.done).filter((k) => s.done[k]).length), label: "done" },
    ],
    libRows: proj.volumes.map((v) => {
      const ids = new Set(v.sections.map((x) => x.doc_id));
      const cnt = s.anns.filter((a) => ids.has(a.doc) && a.status !== "rejected").length;
      const on = v.id === s.volId;
      return {
        he: v.title,
        slug: v.slug,
        units: v.sections.length + " of " + v.units + " units loaded",
        pct: v.pct + "%",
        tagged: cnt,
        review: v.review ? v.review + " flagged" : "",
        reviewStyle: { color: C.reject, display: v.review ? "inline" : "none" },
        barStyle: {
          width: v.pct + "%", height: "100%",
          background: v.pct > 60 ? C.accept : v.pct > 20 ? SWATCHES[0] : C.dim2,
        },
        btnLabel: on ? "✓ open" : "open",
        btnStyle: btn(on, { padding: "2px 9px", fontSize: "10px" }),
        cardStyle: { padding: "8px 10px", borderBottom: "1px solid " + C.lineWarm, background: on ? C.paper : "transparent" },
        on: { type: "openVolume", volId: v.id },
      };
    }),
  };
}

/* ── the Analysis panel ────────────────────────────────────────────────────────────── */

function analysisPanel(s: State, tags: TagDef[], projAnns: Ann[], live: Ann[]): Pick<ViewModel, "analysisSub" | "analysisStats" | "distribution" | "outcomes" | "varRows"> {
  const dist = tags
    .map((t) => ({ t, n: live.filter((a) => a.tag === t.id).length }))
    .sort((a, b) => b.n - a.n);
  const distMax = Math.max(1, ...dist.map((d) => d.n));

  return {
    analysisSub: projectSections(s).length + " sections · tagset v" + s.version,
    analysisStats: [
      { value: String(live.length), label: "annotations" },
      { value: String(live.filter((a) => a.prov === "human").length), label: "by hand" },
      { value: String(live.filter((a) => a.prov === "rule").length), label: "by rules" },
      { value: String(projAnns.filter((a) => a.status === "proposed").length), label: "proposals" },
    ],
    distribution: dist.map((d) => ({
      label: d.t.en,
      count: String(d.n),
      dot: { width: "8px", height: "8px", borderRadius: "2px", background: d.t.color, display: "inline-block", flex: "0 0 8px" },
      barStyle: { width: Math.round((d.n / distMax) * 100) + "%", height: "100%", background: d.t.color, opacity: 0.6 },
    })),
    outcomes: [
      ["accepted from proposals", projAnns.filter((a) => a.status === "accepted" && a.origin.startsWith("agent")).length, C.accept],
      ["rejected — kept as evidence", projAnns.filter((a) => a.status === "rejected").length, C.reject],
      ["still open", projAnns.filter((a) => a.status === "proposed").length, C.propose],
    ].map(([label, value, color]) => ({
      label: label as string,
      value: String(value),
      dot: { width: "8px", height: "8px", borderRadius: "2px", background: color as string, display: "inline-block" },
    })),
    varRows: projectSections(s).map((sec, i) => ({
      title: sec.title,
      docId: sec.doc_id,
      style: { padding: "6px 10px", borderTop: "1px solid " + C.lineSoft, background: i % 2 ? C.paper : C.paperLit },
      cells: variables(sec.doc_id, s.anns).map((v) => ({
        label: v.short,
        value: String(v.value),
        style: {
          fontFamily: F.mono, fontSize: "9px", border: "1px solid " + C.lineMid, borderRadius: "2px",
          padding: "1px 5px", color: isEmptyValue(v.value) ? C.dim2 : C.head, background: C.rowActive,
        },
      })),
    })),
  };
}

/* ── the overlays ──────────────────────────────────────────────────────────────────── */

function overlays(s: State, ctx: ViewCtx, tags: TagDef[], popular: TagDef[]): Pick<ViewModel, "selMenuOpen" | "selMenuStyle" | "selMenuItems" | "paletteOpen" | "paletteQ" | "paletteItems" | "helpOpen" | "helpRows"> {
  const half = menuHalfWidth(popular, ctx.viewportWidth);
  const pos = s.selRect ? menuPosition(s.selRect, half, ctx.viewportWidth) : null;

  return {
    selMenuOpen: s.sel !== null && pos !== null,
    selMenuStyle: (pos
      ? {
          position: "fixed", left: pos.x + "px", top: pos.y + "px", transform: "translate(-50%,-100%)",
          display: "flex", alignItems: "center", gap: "1px", background: C.menuBg, borderRadius: "5px",
          padding: "3px", boxShadow: "0 8px 22px rgba(35,32,27,.34)", zIndex: 60,
        }
      : {}),
    selMenuItems: popular.map((t) => ({
      label: t.en,
      key: t.key,
      title: (t.he || t.en) + " · <" + t.tei + ">",
      dot: { width: "8px", height: "8px", borderRadius: "2px", background: t.color, display: "inline-block" },
      keyStyle: { fontFamily: F.mono, fontSize: "9px", opacity: 0.55 },
      style: {
        display: "flex", alignItems: "center", gap: "5px", background: "transparent", border: 0,
        color: C.menuInk, padding: "5px 8px", borderRadius: "3px", cursor: "pointer",
        fontSize: "11px", whiteSpace: "nowrap",
      },
      on: { type: "applyTag", tagId: t.id },
    })),

    paletteOpen: s.palette,
    paletteQ: s.paletteQ,
    paletteItems: paletteList(s.tags, s.projectId, s.paletteQ).map((t) => ({
      label: t.en,
      he: t.he,
      tei: "<" + t.tei + ">",
      key: t.key || "—",
      keyStyle: keyBadge(),
      dot: { width: "8px", height: "8px", borderRadius: "2px", background: t.color, display: "inline-block" },
      style: {
        display: "flex", alignItems: "center", gap: "8px", padding: "6px 12px", cursor: "pointer",
        borderBottom: "1px solid " + C.lineSoft2, fontSize: "12px",
      },
      on: { type: "applyTag", tagId: t.id },
    })),

    helpOpen: s.help,
    // Generated from the tag set, never hardcoded: a tag whose hotkey was just changed in
    // the editor shows its new key here immediately, which is the point of the panel.
    helpRows: [
      ...tags.filter((t) => t.key).map((t) => ({ key: t.key, label: "tag " + t.en })),
      ["drag", "highlight → tag menu at the selection"],
      ["space", "full tag palette"],
      ["enter", "repeat last tag + attributes"],
      ["1–9", "pick enum value"],
      ["tab", "next annotation · next proposal in review"],
      ["[ ]", "shrink / grow span"],
      ["del", "delete"],
      ["u", "flag uncertain"],
      ["y / n", "accept / reject (review mode)"],
      ["`", "clean read"],
      ["c", "compact mode — line breaks ignored, dense text"],
      ["n / p", "next / previous section — when nothing is selected"],
      ["d", "declare section done — when nothing is selected"],
      ["ctrl+z", "undo"],
      ["?", "this map"],
      ["note", "with text selected, every letter is a tag key first"],
    ].map((h) =>
      Array.isArray(h)
        ? { key: h[0], label: h[1], keyStyle: keyBadge() }
        : { key: h.key, label: h.label, keyStyle: keyBadge() },
    ),
  };
}

/** Attributes a fresh annotation of this tag would carry. Re-exported for the components. */
export { defaultAttrs };
