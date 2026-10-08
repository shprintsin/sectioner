// The sectioner's icons: inline SVG on a 24-unit grid, stroked in currentColor, so a
// button's ink colours them and nothing is fetched (the tool must run offline).
// A dashed outline always means "not yet reviewed", as it does on the page.

import type { ReactNode } from "react";

import type { Tool } from "../_lib/ui";

export function Icon({ children, size = 16, title }: { children: ReactNode; size?: number; title?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden={title ? undefined : true} role={title ? "img" : undefined} style={{ flex: "0 0 auto", display: "block" }}>
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

const dash = { strokeDasharray: "3 2.4" };

export const I = {
  select: <path d="M5 3.5 18.5 12l-6 1.6-3.1 5.9Z" />,
  draw: <><rect x="3.5" y="3.5" width="14" height="14" rx="1" {...dash} /><path d="M19 15v6M16 18h6" /></>,
  zone: <><rect x="3.5" y="3.5" width="17" height="17" rx="1.5" /><path d="M3.5 9h17M3.5 15h17" /></>,
  column: <><rect x="3.5" y="3.5" width="17" height="17" rx="1.5" /><path d="M9.2 3.5v17M14.8 3.5v17" /></>,
  cutAcross: <><rect x="3.5" y="4" width="17" height="16" rx="1.5" /><path d="M1.5 12h21" strokeWidth={2.2} /></>,
  cutDown: <><rect x="4" y="3.5" width="16" height="17" rx="1.5" /><path d="M12 1.5v21" strokeWidth={2.2} /></>,
  lasso: <><path d="M12 4c5 0 8.5 2.4 8.5 5.5S17 15 12 15s-8.5-2.4-8.5-5.5S7 4 12 4Z" {...dash} /><path d="M7 14.5c-.6 2.4.4 4.5 3 5.5" /></>,
  check: <path d="M4.5 12.5 9.5 17.5 19.5 6.5" />,
  checkAllNext: <><path d="M2 12.5 6 16.5 13.5 8" /><path d="M9.5 16.5 10.2 16.5 17.5 8" /><path d="M18 15h4.5M20.2 12.7 22.5 15l-2.3 2.3" /></>,
  nextPage: <><path d="M6 3.5h8l4 4v13H6Z" /><path d="M14 3.5v4h4" /><path d="M9 14h6M12.7 11.7 15 14l-2.3 2.3" /></>,
  merge: <><rect x="2.5" y="4" width="7" height="6" rx="1" /><rect x="2.5" y="14" width="7" height="6" rx="1" /><path d="M9.5 7h3v10h-3M12.5 12h2" /><rect x="14.5" y="7" width="7" height="10" rx="1" /></>,
  reorder: <><path d="M10 6h10M10 12h10M10 18h10" /><path d="M4 4.5v15M2 17.5l2 2 2-2" /></>,
  nextOpen: <><rect x="3" y="5" width="11" height="14" rx="1" {...dash} /><path d="M16 12h6M19.7 9.7 22 12l-2.3 2.3" /></>,
  fitPage: <><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /><rect x="8.5" y="8.5" width="7" height="7" rx="1" /></>,
  fitWidth: <><path d="M3 4v16M21 4v16" /><path d="M6.5 12h11M9 9.5 6.5 12 9 14.5M15 9.5l2.5 2.5-2.5 2.5" /></>,
  rules: <><path d="M3 12h18" strokeWidth={2.2} /><path d="M9 7l3-3 3 3M9 17l3 3 3-3" /></>,
  containers: <><rect x="2.5" y="2.5" width="19" height="19" rx="2" {...dash} /><rect x="6" y="6" width="5" height="12" rx="0.8" /><rect x="13" y="6" width="5" height="12" rx="0.8" /></>,
  labels: <><path d="M3 4.5v6.3l9.3 9.2 7.2-7.2L10.3 3.5H4a1 1 0 0 0-1 1Z" /><circle cx="7.5" cy="8" r="1.3" /></>,
  lines: <path d="M4 6h16M4 10h16M4 14h16M4 18h10" />,
  turnPage: <><path d="M5 6.5h8.5l3 3V20H5Z" /><path d="M17 3.5a5 5 0 0 1 4 5" /><path d="M21.2 5.2 21 8.6l-3.3-.6" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></>,
  zoomIn: <path d="M12 5v14M5 12h14" />,
  zoomOut: <path d="M5 12h14" />,
  panelLeft: (open: boolean) => <><rect x="3" y="4" width="18" height="16" rx="2" /><rect x="3" y="4" width="6.5" height="16" rx="2" fill={open ? "currentColor" : "none"} /></>,
  panelRight: (open: boolean) => <><rect x="3" y="4" width="18" height="16" rx="2" /><rect x="14.5" y="4" width="6.5" height="16" rx="2" fill={open ? "currentColor" : "none"} /></>,
};

/** The rail's icon for a tool, where one is drawn; the mode's glyph is the fallback. */
export const TOOL_ICON: Partial<Record<Tool, ReactNode>> = {
  select: I.select,
  draw: I.draw,
  zone: I.zone,
  column: I.column,
  "cut-h": I.cutAcross,
  "cut-v": I.cutDown,
  lasso: I.lasso,
};

/** The zoom bar's icon for a view toggle, by its key. */
export const TOGGLE_ICON: Record<string, ReactNode> = {
  rules: I.rules,
  containers: I.containers,
  chips: I.labels,
  lines: I.lines,
  turn: I.turnPage,
};
