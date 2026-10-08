// The six menu-bar menus.
//
// Transcribed from `menuDef()`. The design closes over `this` and calls `flash` inline;
// here every item resolves to an `Action`, so the whole menu bar is a value a test can
// walk. Items whose feature is not built yet resolve to a `flash` describing what the
// real thing will do — the design's own text, kept verbatim, because it is the clearest
// statement anywhere of what each of those buttons is for.

import type { Action } from "./state";
import type { State } from "./state";
import { projectSections, project } from "./state";

export interface MenuItemDef {
  label: string;
  /** The keycap shown on the right. Display only — the keymap is the authority. */
  key: string;
  action: Action;
}

export type MenuEntry = MenuItemDef | { sep: true };

export interface MenuDef {
  label: string;
  items: MenuEntry[];
}

export function isSeparator(e: MenuEntry): e is { sep: true } {
  return "sep" in e;
}

const soon = (msg: string): Action => ({ type: "flash", msg });

export function menuDefs(s: State): MenuDef[] {
  const go = (tab: "tags" | "tagset" | "library" | "analysis"): Action => ({ type: "setTab", tab });
  const nSections = projectSections(s).length;

  return [
    {
      label: "File",
      items: [
        { label: "Open project…", key: "⌘O", action: { type: "setProjectsOpen", open: true } },
        { label: "Save project", key: "⌘S", action: { type: "save" } },
        { sep: true },
        { label: "Export TEI — standoff", key: "", action: { type: "export", what: "standoff" } },
        { label: "Export TEI — inline", key: "", action: { type: "export", what: "inline" } },
      ],
    },
    {
      label: "Edit",
      items: [
        { label: "Undo", key: "⌘Z", action: { type: "undo" } },
        { label: "Redo", key: "⇧⌘Z", action: { type: "redo" } },
        { sep: true },
        {
          label: "Delete annotation",
          key: "del",
          action: s.activeId ? { type: "remove", id: s.activeId } : soon("nothing selected"),
        },
        { label: "Flag uncertain", key: "u", action: { type: "toggleUncertain" } },
        { label: "Tag palette", key: "space", action: { type: "openPalette" } },
      ],
    },
    {
      label: "View",
      items: [
        { label: "Tags panel", key: "", action: go("tags") },
        { label: "Tag set panel", key: "", action: go("tagset") },
        { label: "Library panel", key: "", action: go("library") },
        { label: "Analysis panel", key: "", action: go("analysis") },
        { sep: true },
        {
          label: s.spanMode === "underline" ? "Highlight marks" : "Underline marks",
          key: "",
          action: { type: "setSpanMode", mode: s.spanMode === "underline" ? "highlight" : "underline" },
        },
        { label: s.cleanRead ? "Show marks" : "Clean read", key: "`", action: { type: "toggleClean" } },
        { label: s.compact ? "Normal reading" : "Compact mode", key: "c", action: { type: "toggleCompact" } },
        { label: "Larger text", key: "", action: { type: "nudgeSize", delta: 1 } },
        { label: "Smaller text", key: "", action: { type: "nudgeSize", delta: -1 } },
      ],
    },
    {
      label: "Annotate",
      items: [
        {
          label: s.review ? "Exit review mode" : "Review proposals…",
          key: "",
          action: { type: "toggleReview" },
        },
        {
          label: "Add machine proposals…",
          key: "",
          action: soon("write a proposals JSONL and name it as files.proposal of the working set — see AGENTS.md and docs/formats.md"),
        },
        { sep: true },
        { label: "Mark document done", key: "d", action: { type: "toggleDone", doc: s.focusDoc } },
        { label: "Next document", key: "n", action: { type: "stepSection", dir: 1 } },
        { label: "Previous document", key: "p", action: { type: "stepSection", dir: -1 } },
      ],
    },
    {
      label: "Analysis",
      items: [
        { label: "Tag distribution", key: "", action: go("analysis") },
      ],
    },
    {
      label: "Help",
      items: [
        { label: "Keyboard map", key: "?", action: { type: "toggleHelp" } },
        {
          label: "About",
          key: "",
          action: soon(
            "Sectioner · text spans, exported as TEI P5 · " + nSections + " documents in " + project(s).name,
          ),
        },
      ],
    },
  ];
}
