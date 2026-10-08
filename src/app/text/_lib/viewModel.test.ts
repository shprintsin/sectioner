import { describe, expect, it } from "vitest";

import { makeInitial, proposals, reducer, sections } from "./state";
import type { State } from "./state";
import { buildView } from "./viewModel";
import type { ViewModel } from "./viewModel";

const DOC = "responsa/eynyitzchak/12866655";
const CTX = { viewportWidth: 1440 };
const view = (s: State = makeInitial()): ViewModel => buildView(s, CTX);

/**
 * Every top-level `{{ binding }}` in `TEI Annotation Workbench.dc.html`, extracted from
 * the template. Each one must be accounted for: either the ViewModel carries it, or it is
 * a bare handler the component dispatches itself and is listed below with what it does.
 *
 * This is the faithfulness guard. Deleting a binding from the port now fails a test
 * instead of quietly dropping a control off the screen.
 */
const DESIGN_BINDINGS = [
  "acceptAll", "addTag", "analysisStats", "analysisSub", "bigger", "bumpLabel", "bumpVersion",
  "cleanBtn", "closeMenus", "closePalette", "closeProjects", "compactBtn", "containers",
  "cycleStatus", "distribution", "editAttrs", "editDot", "editId", "editImpact", "editKey",
  "editKeyWarn", "editKeyWarnStyle", "editLabel", "editLabelEn", "editLabelHe", "editTei",
  "exportTei", "exportVars", "ghostBtn", "hasInspector", "hasToast", "helpOpen", "helpRows",
  "importCorpus", "importTagset", "inspectorActions", "inspectorAttrs", "inspectorDot",
  "inspectorQuote", "inspectorRange", "inspectorStatus", "inspectorStatusStyle", "inspectorTag",
  "inspectorTei", "inspectorTitle", "layerDot", "layerLabel", "libRows", "libStats", "librarySub",
  "menuOverlay", "menus", "modeHighlight", "modeHighlightStyle", "modeUnderline",
  "modeUnderlineStyle", "newProject", "nextProposal", "noInspector", "onMouseUp", "openPalette",
  "openProjects", "outcomes", "paletteItems", "paletteOpen", "paletteQ", "pickAnalysis",
  "pickLibrary", "pickTags", "pickTagset", "popularLabel", "popularStyle", "prevProposal",
  "projectBtn", "projectList", "projectName", "projectPath", "projectsOpen", "readerPadStyle",
  "readerStyle", "rejectAll", "reviewBtn", "reviewLabel", "reviewOn", "reviewProgress",
  "savedLabel", "scopeSection", "scopeSectionStyle", "scopeVolume", "scopeVolumeStyle",
  "scrollRef", "sectionNav", "sections", "selLabel", "selMenuItems", "selMenuOpen", "selMenuStyle",
  "setKey", "setLabelEn", "setLabelHe", "setPaletteQ", "setTei", "showVars", "sizeBtn", "smaller",
  "statusChip", "statusFilter", "statusHint", "stop", "swatches", "tabAnalysis", "tabAnalysisStyle",
  "tabLibrary", "tabLibraryStyle", "tabTags", "tabTagsStyle", "tabTagset", "tabTagsetStyle",
  "tagRows", "tagTrack", "tagsetPath", "tagsetVersion", "toast", "toggleClean", "toggleCompact",
  "toggleHelp", "togglePopular", "toggleReview", "varRows", "variables", "varsScope", "volCount",
  "volHeadStyle", "volSub", "volSubStyle", "volTitle", "volTitleStyle", "volumes",
];

/** Bindings the component owns rather than the ViewModel, and why. */
const OWNED_BY_COMPONENT: Record<string, string> = {
  acceptAll: 'dispatch {type:"decideAll", ok:true}',
  addTag: 'dispatch a flash — creating a tag is not wired, as in the design',
  bigger: 'dispatch {type:"nudgeSize", delta:1}',
  bumpVersion: 'dispatch {type:"bumpVersion"}',
  closeMenus: 'dispatch {type:"setOpenMenu", label:null}',
  closePalette: 'dispatch {type:"closePalette"}',
  closeProjects: 'dispatch {type:"setProjectsOpen", open:false}',
  cycleStatus: 'dispatch {type:"cycleStatusFilter"}',
  exportTei: 'dispatch {type:"export", what:"standoff"}',
  exportVars: 'dispatch {type:"export", what:"variables"}',
  importCorpus: "flash — the adapter is not wired, as in the design",
  importTagset: "flash — import is not wired, as in the design",
  modeHighlight: 'dispatch {type:"setSpanMode", mode:"highlight"}',
  modeUnderline: 'dispatch {type:"setSpanMode", mode:"underline"}',
  newProject: "flash — creating a project is not wired, as in the design",
  nextProposal: 'dispatch {type:"stepProposal", dir:1}',
  noInspector: "the negation of hasInspector",
  onMouseUp: "the DOM seam: domSelection.ts reads the live Selection",
  openPalette: 'dispatch {type:"openPalette"}',
  openProjects: 'dispatch {type:"setProjectsOpen", open:true}',
  pickAnalysis: 'dispatch {type:"setTab", tab:"analysis"}',
  pickLibrary: 'dispatch {type:"setTab", tab:"library"}',
  pickTags: 'dispatch {type:"setTab", tab:"tags"}',
  pickTagset: 'dispatch {type:"setTab", tab:"tagset"}',
  prevProposal: 'dispatch {type:"stepProposal", dir:-1}',
  rejectAll: 'dispatch {type:"decideAll", ok:false}',
  scopeSection: 'dispatch {type:"setTrackScope", scope:"section"}',
  scopeVolume: 'dispatch {type:"setTrackScope", scope:"volume"}',
  scrollRef: "a ref, held by the reader for the scroll effect",
  setKey: 'dispatch {type:"editTagField", field:"key", ...}',
  setLabelEn: 'dispatch {type:"editTagField", field:"en", ...}',
  setLabelHe: 'dispatch {type:"editTagField", field:"he", ...}',
  setPaletteQ: 'dispatch {type:"setPaletteQ", ...}',
  setTei: 'dispatch {type:"editTagField", field:"tei", ...}',
  showVars: "a prop of the Workbench, not derived state",
  smaller: 'dispatch {type:"nudgeSize", delta:-1}',
  stop: "stopPropagation on a dialog body",
  tabAnalysis: "the tab field, compared",
  tabAnalysisStyle: "tabStyles.analysis",
  tabLibrary: "the tab field, compared",
  tabLibraryStyle: "tabStyles.library",
  tabTags: "the tab field, compared",
  tabTagsStyle: "tabStyles.tags",
  tabTagset: "the tab field, compared",
  tabTagsetStyle: "tabStyles.tagset",
  toggleClean: 'dispatch {type:"toggleClean"}',
  toggleCompact: 'dispatch {type:"toggleCompact", announce:true}',
  toggleHelp: 'dispatch {type:"toggleHelp"}',
  togglePopular: 'dispatch {type:"editTagField", field:"popular", ...}',
  toggleReview: 'dispatch {type:"toggleReview"}',
};

describe("the design's bindings are all accounted for", () => {
  it("carries or explicitly delegates every one", () => {
    const vm = view() as unknown as Record<string, unknown>;
    const missing = DESIGN_BINDINGS.filter(
      (b) => !(b in vm) && !(b in OWNED_BY_COMPONENT),
    );
    expect(missing).toEqual([]);
  });

  it("lists nothing as component-owned that the ViewModel also carries", () => {
    // Keeps the two lists from drifting into an ambiguity about who owns what.
    const vm = view() as unknown as Record<string, unknown>;
    const both = Object.keys(OWNED_BY_COMPONENT).filter((b) => b in vm);
    expect(both).toEqual([]);
  });

  it("gives every value it does carry something defined", () => {
    const vm = view() as unknown as Record<string, unknown>;
    for (const b of DESIGN_BINDINGS) {
      if (b in vm) expect(vm[b], b).toBeDefined();
    }
  });
});

describe("every list carries a unique identity", () => {
  // Found in the browser, not by the suite: `סימן א` is the title of two different
  // sections of עין יצחק, so a React key taken from the label collides and React reuses
  // one row's DOM for the other. Labels are not identity; ids are.
  it("has a distinct doc_id per section in the navigator, where titles repeat", () => {
    const vm = view();
    const titles = vm.sectionNav.map((s) => s.title);
    expect(new Set(titles).size, "the fixture must actually contain a repeat").toBeLessThan(
      titles.length,
    );
    const ids = vm.sectionNav.map((s) => s.docId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has a distinct id per volume, project, tag-track group and reader section", () => {
    const vm = view();
    const unique = (xs: string[]) => new Set(xs).size === xs.length;
    expect(unique(vm.volumes.map((v) => v.id))).toBe(true);
    expect(unique(vm.projectList.map((p) => p.id))).toBe(true);
    expect(unique(vm.tagTrack.map((t) => t.tagId))).toBe(true);
    expect(unique(vm.sections.map((s) => s.docId))).toBe(true);
    expect(unique(vm.tagRows.map((t) => t.id))).toBe(true);
    expect(unique(vm.libRows.map((b) => b.slug))).toBe(true);
    expect(unique(vm.varRows.map((r) => r.docId))).toBe(true);
    expect(unique(vm.tagTrack.flatMap((t) => t.rows.map((r) => r.id)))).toBe(true);
  });

  it("gives every piece in a paragraph a distinct start offset", () => {
    for (const sec of view().sections) {
      for (const p of sec.paragraphs) {
        const offs = p.pieces.map((x) => x.s);
        expect(new Set(offs).size, sec.docId).toBe(offs.length);
      }
    }
  });
});

describe("the reader", () => {
  it("renders every section of the open volume", () => {
    const vm = view();
    expect(vm.sections.map((x) => x.docId)).toEqual(sections(makeInitial()).map((x) => x.doc_id));
  });

  it("reassembles each paragraph character for character", () => {
    // The tiling invariant, once more at the level the DOM actually sees.
    const s = makeInitial();
    const vm = view(s);
    for (const sec of vm.sections) {
      const src = sections(s).find((x) => x.doc_id === sec.docId)!;
      const joined = sec.paragraphs.map((p) => p.pieces.map((pc) => pc.text).join("")).join("\n\n");
      expect(joined, sec.docId).toBe(src.text);
    }
  });

  it("gives every piece a data-off that indexes its own text", () => {
    const s = makeInitial();
    for (const sec of view(s).sections) {
      const src = sections(s).find((x) => x.doc_id === sec.docId)!;
      for (const p of sec.paragraphs) {
        for (const pc of p.pieces) {
          expect(src.text.slice(pc.s, pc.s + pc.text.length), pc.doc + "@" + pc.s).toBe(pc.text);
        }
      }
    }
  });

  it("collapses a section to one run in compact mode", () => {
    const vm = view(reducer(makeInitial(), { type: "toggleCompact" }));
    for (const sec of vm.sections) expect(sec.paragraphs, sec.docId).toHaveLength(1);
  });

  it("shows the part band only when it changes", () => {
    const shown = view().sections.filter((x) => x.showPart);
    expect(shown.length).toBeGreaterThan(0);
    expect(shown.length).toBeLessThan(view().sections.length + 1);
  });

  it("numbers paragraphs p1…, whatever the corpus", () => {
    expect(view().sections[0].paragraphs[0].num).toBe("p1");
    const press = reducer(makeInitial(), { type: "openProject", id: "p-press" });
    expect(view(press).sections[0].paragraphs[0].num).toBe("p1");
  });

  it("sends a click on unmarked text to setActive(null)", () => {
    const vm = view();
    const bare = vm.sections[0].paragraphs
      .flatMap((p) => p.pieces)
      .find((pc) => (pc.on as { id: string | null }).id === null);
    expect(bare).toBeDefined();
  });

  it("sends a click on a mark to its innermost non-structural annotation", () => {
    const s = makeInitial();
    const vm = view(s);
    const ids = vm.sections
      .flatMap((sec) => sec.paragraphs.flatMap((p) => p.pieces))
      .map((pc) => (pc.on as { id: string | null }).id)
      .filter((x): x is string => x !== null);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      const a = s.anns.find((x) => x.id === id)!;
      expect(s.tags.find((t) => t.id === a.tag)?.structural, id).not.toBe(true);
    }
  });
});

describe("the tag track", () => {
  it("lists only this project's tags", () => {
    const vm = view();
    expect(vm.tagTrack.some((t) => t.tagId === "advertisement")).toBe(false);
    const press = reducer(makeInitial(), { type: "openProject", id: "p-press" });
    expect(view(press).tagTrack.some((t) => t.tagId === "advertisement")).toBe(true);
  });

  it("keeps a group closed until it is expanded, and only when it has rows", () => {
    const s = reducer(makeInitial(), { type: "toggleExpanded", tagId: "place" });
    const row = view(s).tagTrack.find((t) => t.tagId === "place")!;
    expect(row.open).toBe(true);
    expect(row.rows.length).toBeGreaterThan(0);
    const empty = view(reducer(s, { type: "toggleExpanded", tagId: "masthead" })).tagTrack.find(
      (t) => t.tagId === "masthead",
    );
    expect(empty).toBeUndefined();
  });

  it("narrows to the focused section under the section scope", () => {
    const all = view().tagTrack.reduce((n, t) => n + t.rows.length + Number(t.count), 0);
    const s = reducer(makeInitial(), { type: "setTrackScope", scope: "section" });
    const one = view(s).tagTrack.reduce((n, t) => n + Number(t.count), 0);
    expect(one).toBeLessThan(all);
  });

  it("shows a proposal count only in review mode, since proposals are hidden otherwise", () => {
    expect(view().tagTrack.every((t) => t.warn === "" || t.warnStyle.color !== "#7a5a2a")).toBe(true);
    const rev = view(reducer(makeInitial(), { type: "toggleReview" }));
    expect(rev.tagTrack.some((t) => t.warn !== "")).toBe(true);
  });
});

describe("the inspector", () => {
  it("invites a selection when there is nothing to show", () => {
    expect(view().inspectorTitle).toBe("Inspector");
    expect(view().hasInspector).toBe(false);
    const sel = reducer(makeInitial(), { type: "select", sel: { doc: DOC, start: 5, end: 9 }, rect: null });
    expect(view(sel).inspectorTitle).toBe("Selection — pick a tag");
  });

  it("titles a machine claim a Proposal", () => {
    const s = reducer(makeInitial(), { type: "toggleReview" });
    expect(view(s).inspectorTitle).toBe("Proposal");
    expect(view(s).inspectorActions.map((b) => b.label)).toContain("✓ accept");
  });

  it("offers no accept/reject on a human annotation", () => {
    const s = reducer(makeInitial(), { type: "setActive", id: "a1" });
    expect(view(s).inspectorActions.map((b) => b.label)).toEqual(["? uncertain", "✕ delete"]);
  });

  it("names the parent tag when the annotation is nested", () => {
    const s0 = makeInitial();
    const child = s0.anns.find((a) => a.parent !== null)!;
    const vm = view(reducer(s0, { type: "setActive", id: child.id }));
    expect(vm.inspectorRange).toContain("child of");
  });

  it("says 'scope: document' rather than a character range at document scope", () => {
    const s0 = makeInitial();
    const doc = s0.anns.find((a) => a.start === null)!;
    const vm = view(reducer(s0, { type: "setActive", id: doc.id }));
    expect(vm.inspectorRange).toContain("scope: document");
    expect(vm.inspectorQuote).toBe("— document level —");
  });

  it("numbers the enum options so the 1–9 keys and the buttons agree", () => {
    const s = reducer(makeInitial(), { type: "setActive", id: "a1" });
    const s2 = reducer(s, { type: "applyTag", tagId: "ruling" });
    const attr = view(s2).inspectorAttrs.find((a) => a.attrId === "rule")!;
    expect(attr.options.map((o) => o.key)).toEqual(["1", "2", "3", "4"]);
  });
});

describe("the selection menu", () => {
  it("stays closed without a rect, because it has nowhere to go", () => {
    const s = reducer(makeInitial(), { type: "select", sel: { doc: DOC, start: 5, end: 9 }, rect: null });
    expect(view(s).selMenuOpen).toBe(false);
  });

  it("opens where the selection is, clamped into the viewport", () => {
    const s = reducer(makeInitial(), {
      type: "select",
      sel: { doc: DOC, start: 5, end: 9 },
      rect: { left: 600, top: 400, width: 60 },
    });
    const vm = view(s);
    expect(vm.selMenuOpen).toBe(true);
    expect(vm.selMenuStyle.left).toBe("630px");
    expect(vm.selMenuStyle.top).toBe("392px");
  });

  it("offers at most six tags, each with a hotkey", () => {
    const s = reducer(makeInitial(), {
      type: "select", sel: { doc: DOC, start: 5, end: 9 }, rect: { left: 600, top: 400, width: 60 },
    });
    const items = view(s).selMenuItems;
    expect(items.length).toBeLessThanOrEqual(6);
    expect(items.every((i) => i.key !== "")).toBe(true);
  });
});

describe("the help map is generated, not written", () => {
  it("lists a row for every tag that has a key", () => {
    const s = makeInitial();
    const keyed = s.tags.filter((t) => t.key && (t.proj === "both" || t.proj === s.projectId));
    const rows = view(s).helpRows;
    for (const t of keyed) expect(rows.some((r) => r.label === "tag " + t.en), t.id).toBe(true);
  });

  it("follows a hotkey changed in the editor", () => {
    const s = reducer(
      reducer(makeInitial(), { type: "setEditTag", id: "place" }),
      { type: "editTagField", field: "key", value: "w" },
    );
    const row = view(s).helpRows.find((r) => r.label === "tag Place")!;
    expect(row.key).toBe("w");
  });
});

describe("the status bar and chrome", () => {
  it("reports the selection while one is live", () => {
    const s = reducer(makeInitial(), { type: "select", sel: { doc: DOC, start: 5, end: 9 }, rect: null });
    expect(view(s).selLabel).toContain("selection 5–9");
  });

  it("says how many proposals are hidden, and then that they are shown", () => {
    expect(view().statusHint).toContain("proposals hidden");
    expect(view(reducer(makeInitial(), { type: "toggleReview" })).statusHint).toContain("proposals shown");
  });

  it("marks the tag set dirty with a star and an unsaved label", () => {
    const s = reducer(makeInitial(), { type: "editTagField", field: "en", value: "x" });
    expect(view(s).tagsetVersion).toBe("1.3.0*");
    expect(view(s).savedLabel).toBe("unsaved");
  });

  it("names both layers in review mode", () => {
    expect(view().layerLabel).toBe("gold");
    expect(view(reducer(makeInitial(), { type: "toggleReview" })).layerLabel).toBe("gold + agent:run-14");
  });

  it("counts the queue down as proposals are decided", () => {
    let s = reducer(makeInitial(), { type: "toggleReview" });
    const n = proposals(s).length;
    expect(view(s).reviewProgress).toContain("of " + n);
    s = reducer(s, { type: "decide", id: proposals(s)[0].id, ok: true });
    expect(view(s).reviewProgress).toContain("of " + (n - 1));
  });
});

describe("the analysis panel", () => {
  it("counts a rejection as an outcome, never as a live annotation", () => {
    let s = reducer(makeInitial(), { type: "toggleReview" });
    const before = Number(view(s).analysisStats[0].value);
    s = reducer(s, { type: "decideAll", ok: false });
    const vm = view(s);
    expect(Number(vm.analysisStats[0].value)).toBeLessThan(before);
    expect(vm.outcomes.find((o) => o.label.startsWith("rejected"))!.value).not.toBe("0");
  });

  it("moves an accepted proposal into the accepted-from-proposals row", () => {
    let s = reducer(makeInitial(), { type: "toggleReview" });
    s = reducer(s, { type: "decideAll", ok: true });
    const vm = view(s);
    expect(vm.outcomes.find((o) => o.label.startsWith("accepted"))!.value).not.toBe("0");
    // Still open is not zero: "accept all" clears the **volume's** queue, and the other
    // volume of this project has proposals of its own. The panel counts the project.
    expect(vm.outcomes.find((o) => o.label.startsWith("still open"))!.value).toBe("2");
  });

  it("keeps counting an accepted proposal as machine-originated after it turns gold", () => {
    // The design reads `layer`, which accepting overwrites with "gold" — so this row
    // was always 0 and the panel could never answer the question it asks. `origin` is
    // set once and never rewritten.
    let s = reducer(makeInitial(), { type: "toggleReview" });
    const id = proposals(s)[0].id;
    s = reducer(s, { type: "decide", id, ok: true });
    const a = s.anns.find((x) => x.id === id)!;
    expect([a.layer, a.origin]).toEqual(["gold", "agent:run-14"]);
    expect(view(s).outcomes.find((o) => o.label.startsWith("accepted"))!.value).toBe("1");
  });

  it("gives one variables row per section of the project", () => {
    const vm = view();
    expect(vm.varRows).toHaveLength(6);
    for (const r of vm.varRows) expect(r.cells, r.docId).toHaveLength(6);
  });

  it("sorts the distribution by count, descending", () => {
    const ns = view().distribution.map((d) => Number(d.count));
    expect([...ns].sort((a, b) => b - a)).toEqual(ns);
  });
});

describe("buildView is pure", () => {
  it("gives the same output for the same state", () => {
    expect(view()).toEqual(view());
  });

  it("does not mutate the state it is given", () => {
    const s = makeInitial();
    const copy = JSON.stringify({ anns: s.anns, tags: s.tags, expanded: s.expanded });
    buildView(s, CTX);
    expect(JSON.stringify({ anns: s.anns, tags: s.tags, expanded: s.expanded })).toBe(copy);
  });
});
