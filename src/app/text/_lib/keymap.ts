// The keyboard, as a pure function from (state, key event) to an action.
//
// This is where the design's subtlest rule lives:
//
//   **With text selected, every letter is a tag key first.**
//
// Six hotkeys — `c d n p u y` — are simultaneously tag keys and app commands. When a
// passage is highlighted the user is tagging, so `p` means "person", not "previous
// section". With nothing selected the same key runs the command. Both directions are
// asserted in the tests, for every colliding key.
//
// One correction to the design: it checks tag hotkeys *before* it checks for Ctrl/Cmd, so
// binding any tag to `z` would silently break undo while a selection is live. The
// modifier check is hoisted above the tag branch here — a modified key is never a tag key.

import { inProject } from "./tagset";
import type { Action, State } from "./state";
import type { TagDef } from "./types";

/** The parts of a KeyboardEvent this decision depends on. Nothing else is read. */
export interface KeyEvent {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  /** Tag name of the event target, uppercased, when it is an element. */
  targetTag?: string;
}

export interface KeyResult {
  action: Action | null;
  /** True when the browser's own handling of this key must be suppressed. */
  preventDefault: boolean;
  /** True when a text field should be blurred — Escape inside the palette input. */
  blur?: boolean;
}

const NONE: KeyResult = { action: null, preventDefault: false };
const go = (action: Action, preventDefault = true): KeyResult => ({ action, preventDefault });

/** Keys that are both a tag hotkey and an app command. Display only — see `keymap`. */
export const SHARED_KEYS = ["c", "d", "n", "p", "u", "y"] as const;

function tagFor(s: State, key: string): TagDef | undefined {
  return s.tags.find((t) => t.key === key && t.key !== "" && inProject(t, s.projectId));
}

/**
 * Decide what a keystroke does.
 *
 * Returns `null` for a key this app does not claim, so the caller leaves it to the
 * browser — which is what keeps Cmd+R, Cmd+L and tab-to-focus working.
 */
export function resolveKey(s: State, e: KeyEvent): KeyResult {
  const k = e.key;
  const mod = e.ctrlKey === true || e.metaKey === true;

  // Inside a text field the keyboard belongs to the field. Two exceptions, both about
  // leaving: Escape closes the palette, Enter takes its first result.
  if (e.targetTag === "INPUT" || e.targetTag === "TEXTAREA") {
    if (k === "Escape") return { action: { type: "closePalette" }, preventDefault: false, blur: true };
    if (k === "Enter" && s.palette) return go({ type: "acceptPaletteTop" });
    return NONE;
  }

  if (k === "?") return go({ type: "toggleHelp" });
  if (k === "Escape") return go({ type: "escape" }, false);
  if (k === " ") return go({ type: "openPalette" });

  // Hoisted above the tag branch: a modified key is a command, never a tag.
  if (mod && k.toLowerCase() === "z") {
    return go({ type: e.shiftKey === true ? "redo" : "undo" });
  }
  if (mod && k.toLowerCase() === "s") return go({ type: "save" });
  if (mod) return NONE;

  // The precedence rule. A live selection means the user is tagging.
  if (s.sel) {
    const hit = tagFor(s, k);
    if (hit) return go({ type: "applyTag", tagId: hit.id });
  }

  if (k === "`") return go({ type: "toggleClean" });
  if (k === "c") return go({ type: "toggleCompact" });

  if (k === "Tab") {
    const dir = e.shiftKey === true ? -1 : 1;
    return go(s.review ? { type: "stepProposal", dir } : { type: "stepAnnotation", dir });
  }
  if (k === "Enter") return go({ type: "repeatLastTag" });
  if (k === "Delete" || k === "Backspace") {
    return s.activeId ? go({ type: "remove", id: s.activeId }) : NONE;
  }

  if (k >= "1" && k <= "9" && s.activeId) {
    return go({ type: "pickEnum", index: parseInt(k, 10) });
  }

  const act = s.anns.find((a) => a.id === s.activeId) ?? null;
  if ((k === "y" || k === "n") && act?.status === "proposed") {
    return go({ type: "decide", id: act.id, ok: k === "y" }, false);
  }
  if (k === "u") return s.activeId ? go({ type: "toggleUncertain" }, false) : NONE;
  if (k === "[" || k === "]") {
    return act ? go({ type: "stepBoundary", dir: k === "]" ? 1 : -1 }) : NONE;
  }
  if (k === "n" || k === "p") return go({ type: "stepSection", dir: k === "n" ? 1 : -1 }, false);
  if (k === "d") return go({ type: "toggleDone", doc: s.focusDoc }, false);

  const hit = tagFor(s, k);
  if (hit) return go({ type: "applyTag", tagId: hit.id });

  return NONE;
}
