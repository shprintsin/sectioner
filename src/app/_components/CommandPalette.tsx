"use client";

// The command palette (Ctrl+K): every act the page can do, searchable by name, group or
// key, and run with Enter. It replaces the key list: the shortcut is shown beside each
// command, so the palette is also where a key is looked up.

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { C, MONO } from "../_lib/tokens";
import { I, Icon } from "./icons";

export interface Command {
  id: string;
  label: string;
  group: string;
  /** The shortcut, as printed. The shell fills it from the project's key map. */
  keys?: string;
  /** The chords this command answers to unless the project's key map says otherwise
   *  (`_lib/project.ts`: `M`, `Shift+A`, `Ctrl+G`). The shell routes them. */
  defaultKeys?: string[];
  /** Shown with a tick in the menus (a toggle that is on, the tag a unit has). */
  checked?: boolean;
  /** Shown before the label in the menus. */
  icon?: ReactNode;
  /** Offered on right-click: on a unit, on blank page, or both. */
  context?: "unit" | "blank" | "both";
  /** More words the search should find this by. */
  keywords?: string;
  run: () => void;
  disabled?: boolean;
}

function haystack(c: Command): string {
  return `${c.label} ${c.group} ${c.keywords ?? ""} ${c.keys ?? ""}`.toLowerCase();
}

/** Every word of the query must appear; a label that starts with the query ranks first. */
export function filterCommands(cmds: Command[], query: string): Command[] {
  const q = query.trim().toLowerCase();
  if (!q) return cmds;
  const words = q.split(/\s+/);
  const hit = cmds.filter((c) => { const h = haystack(c); return words.every((w) => h.includes(w)); });
  const rank = (c: Command) => (c.label.toLowerCase().startsWith(q) ? 0 : c.label.toLowerCase().includes(q) ? 1 : 2);
  return hit.map((c, i) => ({ c, i })).sort((a, b) => rank(a.c) - rank(b.c) || a.i - b.i).map((x) => x.c);
}

export function CommandTrigger({ onOpen }: { onOpen: () => void }) {
  return (
    <button onClick={onOpen} title="Search and run a command · Ctrl+K" style={{ display: "flex", alignItems: "center", gap: 7, width: 230, height: 26, padding: "0 6px 0 8px", flexShrink: 0, border: `1px solid ${C.border}`, borderRadius: 5, background: "#fff", color: C.muted2, cursor: "pointer", fontFamily: "inherit", fontSize: 11 }}>
      <Icon size={14}>{I.search}</Icon>
      <span style={{ flex: 1, textAlign: "left" }}>Search commands…</span>
      <kbd style={kbd}>Ctrl K</kbd>
    </button>
  );
}

export default function CommandPalette(p: { commands: Command[]; extra?: (query: string) => Command[]; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const list = useRef<HTMLDivElement | null>(null);
  const shown = useMemo(() => [...(p.extra?.(query) ?? []), ...filterCommands(p.commands, query)], [p, query]);
  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const run = (c: Command | undefined) => {
    if (!c || c.disabled) return;
    p.onClose();
    // After the palette is gone, so a command that focuses a field keeps the focus.
    setTimeout(c.run, 0);
  };

  // Group headings in first-seen order, rows keeping their rank inside a group.
  const groups: { name: string; rows: { c: Command; i: number }[] }[] = [];
  shown.forEach((c, i) => {
    const g = groups.find((x) => x.name === c.group) ?? groups[groups.push({ name: c.group, rows: [] }) - 1];
    g.rows.push({ c, i });
  });

  return (
    <div onMouseDown={p.onClose} style={{ position: "fixed", inset: 0, background: "rgba(30,27,22,0.28)", zIndex: 50, display: "flex", justifyContent: "center", alignItems: "flex-start", paddingTop: "12vh" }}>
      <div role="dialog" aria-label="Command palette" onMouseDown={(e) => e.stopPropagation()} style={{ width: "min(560px, calc(100vw - 32px))", background: C.bar, border: `1px solid ${C.bar2}`, borderRadius: 8, boxShadow: "0 24px 60px rgba(30,27,22,0.28)", overflow: "hidden", fontSize: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 12px", borderBottom: `1px solid ${C.borderSoft}`, color: C.muted2 }}>
          <Icon size={16}>{I.search}</Icon>
          <input
            autoFocus
            value={query}
            placeholder="Type a command or search…"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(shown.length - 1, a + 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
              else if (e.key === "Enter") { e.preventDefault(); run(shown[active]); }
              else if (e.key === "Escape") { e.preventDefault(); p.onClose(); }
            }}
            style={{ flex: 1, height: 42, border: "none", outline: "none", background: "transparent", fontFamily: "inherit", fontSize: 13, color: C.ink }}
          />
          <kbd style={kbd}>Esc</kbd>
        </div>
        <div ref={list} className="om-scroll" style={{ maxHeight: "min(380px, 60vh)", overflowY: "auto", padding: 4 }}>
          {!shown.length ? <div style={{ padding: "22px 0", textAlign: "center", color: C.muted2 }}>No commands found.</div> : null}
          {groups.map((g) => (
            <div key={g.name} style={{ padding: "2px 0 4px" }}>
              <div style={{ padding: "6px 8px 3px", fontSize: 9.5, letterSpacing: "0.08em", textTransform: "uppercase", color: C.faint }}>{g.name}</div>
              {g.rows.map(({ c, i }) => (
                <div
                  key={c.id}
                  data-i={i}
                  role="option"
                  aria-selected={i === active}
                  aria-disabled={c.disabled}
                  onMouseMove={() => i !== active && setActive(i)}
                  onClick={() => run(c)}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 5, cursor: c.disabled ? "default" : "pointer", background: i === active ? "#fff" : "transparent", boxShadow: i === active ? `inset 0 0 0 1px ${C.borderRow}` : "none", color: c.disabled ? C.faint : C.text }}
                >
                  <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.label}</span>
                  {c.keys ? <kbd style={kbd}>{c.keys}</kbd> : null}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const kbd: React.CSSProperties = { fontFamily: MONO, fontSize: 9.5, padding: "1px 5px", borderRadius: 3, border: `1px solid ${C.borderKey}`, background: C.panel, color: C.muted, whiteSpace: "nowrap" };
