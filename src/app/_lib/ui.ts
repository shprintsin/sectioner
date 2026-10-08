// The transient state of the shell: where the cursor is, what is selected, how the
// canvas is shown. Never persisted — the session holds the annotation, not the view.

import type { CSSProperties, ReactNode } from "react";
import type { Axis } from "./geometry";
import type { BBox } from "./types";

export type Tool = "select" | "lasso" | "draw" | "zone" | "column" | "cut-h" | "cut-v";

/** The axis a cut tool cuts along, or null when the tool is not a cut tool. */
export function cutAxisOf(tool: Tool): Axis | null {
  return tool === "cut-h" ? "h" : tool === "cut-v" ? "v" : null;
}

export function fitPageScale(width: number, height: number, view: { w: number; h: number }): number {
  return Math.min(Math.max(40, view.w - 32) / width, Math.max(40, view.h - 32) / height);
}

export interface UiState {
  /** Index into the mode's walk order. */
  cur: number;
  /** A range or lasso selection of ids; null when only the cursor counts. */
  sel: (number | string)[] | null;
  /** The active section (newspaper) or the stream being reviewed (book). */
  active: string | null;
  zoom: number;
  tool: Tool;
  showRules: boolean;
  showLines: boolean;
  showChips: boolean;
  showContainers: boolean;
  /** Newspaper: the line index the cut sits above. Book: the page y of the cut. */
  splitAt: number | null;
  /** Book: a relation being drawn from the current region. */
  linking: { type: "heads" | "continues" | "annotates"; from: string } | null;
  marquee: BBox | null;
  exportOpen: boolean;
  showKeys: boolean;
  leftW: number;
  rightW: number;
  drag: "left" | "right" | null;
  toast: string;
}

export const initialUi: UiState = {
  cur: 0,
  sel: null,
  active: null,
  zoom: 1,
  tool: "select",
  showRules: true,
  showLines: false,
  showChips: true,
  showContainers: true,
  splitAt: null,
  linking: null,
  marquee: null,
  exportOpen: false,
  showKeys: true,
  leftW: 268,
  rightW: 336,
  drag: null,
  toast: "Select a block to inspect it; changes can be undone.",
};

/** One rectangle on the canvas, already styled by its mode. */
export interface RectSpec {
  key: string;
  id: number | string;
  bbox: BBox;
  style: CSSProperties;
  chip?: string;
  chipStyle?: CSSProperties;
  /** Small structural label, separate from the section identifier. */
  badge?: string;
  badgeStyle?: CSSProperties;
  /** Non-interactive visual marks supplied by the mode, separate from text labels. */
  decoration?: ReactNode;
  /** Clickable; separators and read-only overlays are not. */
  pick: boolean;
  /** Show move/resize handles (book mode, current region). */
  handles?: boolean;
  /** Draw as an outline container (zone/column), under the regions. */
  under?: boolean;
  title?: string;
}

/** A non-interactive shape: printed lines, a cut, a relation arrow. */
export interface OverlaySpec {
  key: string;
  bbox: BBox;
  style: CSSProperties;
}

export interface ArrowSpec {
  key: string;
  from: BBox;
  to: BBox;
  color: string;
  label: string;
}

export const ZOOM_MIN = 0.35;
export const ZOOM_MAX = 10;

export function cycleZoom(z: number): number {
  return z >= 4 ? 1 : z >= 2 ? 4 : z >= 1 ? 2 : 1;
}
