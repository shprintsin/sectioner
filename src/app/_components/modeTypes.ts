import type { ReactNode } from "react";

import type { KeyInput } from "../_lib/keys";
import type { ViewRotation } from "../_lib/geometry";
import type { BBox } from "../_lib/types";
import type { ArrowSpec, OverlaySpec, RectSpec } from "../_lib/ui";
import type { Check, ToolDef } from "./bits";
import type { Command } from "./CommandPalette";

/** What a mode gives the shell to draw and to route input to. */
export interface ModeView {
  /** Second line of the top bar: dimensions, columns, counts. */
  meta: string;
  /** Units placed / total, for the progress bar and the working set. */
  progress: { placed: number; total: number; openLabel: string; complete: boolean };
  gotoOpen: () => void;
  proposal: { label: string; on: boolean; onClick: () => void } | null;
  done: boolean;
  canDone: boolean;
  toggleDone: () => void;
  focus: BBox | null;
  focusKey: string;
  /** Show the page turned this many degrees clockwise (view only; coordinates stay in the page frame). */
  rotation?: ViewRotation;
  rects: RectSpec[];
  overlays: OverlaySpec[];
  arrows: ArrowSpec[];
  tools: ToolDef[];
  toggles: { key: string; label: string; on: boolean; onClick: () => void }[];
  toolNote: string;
  modeHint: { text: string; on: boolean } | null;
  left: ReactNode;
  right: ReactNode;
  approval?: { verified: number; total: number; loose: number };
  /** Optional adjacent page. It is drawn read-only; a click on it (or Tab) makes it the
   *  page being edited, and the page left behind takes its place as the companion. */
  spread?: {
    enabled: boolean;
    onToggle: () => void;
    direction: "previous" | "next";
    onDirection: (direction: "previous" | "next") => void;
    previousId: string | null;
    nextId: string | null;
    neighborId: string | null;
    neighbor: { id: string; width: number; height: number; imageUrl: string; rects: RectSpec[] } | null;
    error: string | null;
    /** Move the editing focus to the companion page, optionally onto one of its blocks. */
    onFocus: (blockId: number | string | null) => void;
  };
  /** What the command palette (Ctrl+K) offers from this mode; the shell adds its own. */
  commands?: Command[];
  /** Commands made from what was typed (e.g. a stream name that is not in the list). */
  extraCommands?: (query: string) => Command[];
  /** True when the key was consumed. */
  onKey: (e: KeyInput) => boolean;
  /** The mode is in the middle of an act (a split being placed) and reads keys before
   *  the key map does: arrows move the cut, Enter commits, Esc cancels. */
  modal?: boolean;
  /** The heading of the right-click menu for a unit (or blank page, null). */
  contextTitle?: (id: number | string | null) => string;
  onMarquee: (box: BBox, add?: boolean) => void;
  onPick: (id: number | string, shift: boolean, toggle?: boolean) => void;
  onDoublePick?: (id: number | string) => void;
  onBlankClick?: () => void;
  /** The pointer over the page, in page pixels (null off the page). */
  onHover?: (pt: readonly [number, number] | null) => void;
  /** A click with a cut tool armed: cut this rectangle at that page point, along the
   *  axis the mode reads off its own tool state. */
  onCut?: (id: number | string, x: number, y: number) => void;
  /** A cut tool clicked where no rectangle is, at this page point. */
  onCutBlank?: (x: number, y: number) => void;
  dragSelectFromRect?: boolean;
  onBoxChange?: (id: number | string, box: BBox) => void;
  export: { title: string; subtitle: string; checks: Check[]; note: string; build: () => unknown };
  opsLabel: string;
}
