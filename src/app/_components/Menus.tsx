"use client";

// The application menus: a menu bar across the top and a context menu on right-click.
// Both are built from the same commands the palette searches, so a command is written
// once — its label, its keys (from the project's key map) and whether it can run now —
// and appears in every place a reviewer might look for it.

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { C, MONO } from "../_lib/tokens";
import type { Command } from "./CommandPalette";

export interface MenuSection {
  title?: string;
  items: Command[];
  /** Drawn as one entry that opens to the side. */
  submenu?: boolean;
}

export interface MenuDef {
  title: string;
  sections: MenuSection[];
}

/** Which menu a command group lives in; a group not named here goes to Annotate. */
const MENU_OF: Record<string, string> = {
  Project: "File", Pages: "File", File: "File",
  Edit: "Edit", Selection: "Edit", Regions: "Edit", Blocks: "Edit", Sections: "Edit", Groups: "Edit",
  View: "View", Tools: "Tools", Help: "Help", Go: "Go",
};
const MENU_ORDER = ["File", "Edit", "Annotate", "View", "Tools", "Go", "Help"];
/** A group longer than this opens to the side instead of filling the menu. */
const INLINE_MAX = 7;

/** Group commands into menus, keeping the order in which groups first appear. */
export function buildMenus(cmds: Command[]): MenuDef[] {
  const groups = new Map<string, Command[]>();
  for (const c of cmds) groups.set(c.group, [...(groups.get(c.group) ?? []), c]);
  const menus = new Map<string, MenuSection[]>();
  for (const [group, items] of groups) {
    const m = MENU_OF[group] ?? "Annotate";
    menus.set(m, [...(menus.get(m) ?? []), { title: group, items, submenu: items.length > INLINE_MAX }]);
  }
  return MENU_ORDER.filter((t) => menus.has(t)).map((title) => ({ title, sections: menus.get(title)! }));
}

export function MenuBar({ menus, onOpenChange }: { menus: MenuDef[]; onOpenChange?: (open: boolean) => void }) {
  const [open, setOpen] = useState<number | null>(null);
  const bar = useRef<HTMLDivElement | null>(null);
  useEffect(() => { onOpenChange?.(open != null); }, [open, onOpenChange]);
  useEffect(() => {
    if (open == null) return;
    const away = (e: MouseEvent) => { if (!bar.current?.contains(e.target as Node)) setOpen(null); };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); setOpen(null); }
      else if (e.key === "ArrowRight" && !(e.target as HTMLElement)?.closest?.("[data-sub]")) setOpen((o) => (o == null ? o : (o + 1) % menus.length));
      else if (e.key === "ArrowLeft") setOpen((o) => (o == null ? o : (o - 1 + menus.length) % menus.length));
    };
    window.addEventListener("mousedown", away);
    window.addEventListener("keydown", key, true);
    return () => { window.removeEventListener("mousedown", away); window.removeEventListener("keydown", key, true); };
  }, [open, menus.length]);
  return (
    <div ref={bar} role="menubar" style={{ display: "flex", alignItems: "center", gap: 1, height: "100%" }}>
      {menus.map((m, i) => (
        <div key={m.title} style={{ position: "relative", height: "100%", display: "flex", alignItems: "center" }}>
          <button
            role="menuitem"
            aria-haspopup="menu"
            aria-expanded={open === i}
            onMouseDown={(e) => { e.preventDefault(); setOpen(open === i ? null : i); }}
            onMouseEnter={() => { if (open != null) setOpen(i); }}
            style={{ height: 22, padding: "0 8px", border: "none", borderRadius: 4, cursor: "default", fontFamily: "inherit", fontSize: 11.5, color: C.ink, background: open === i ? C.chip : "transparent" }}
          >{m.title}</button>
          {open === i ? (
            <div style={{ position: "absolute", top: "100%", left: 0, zIndex: 60 }}>
              <MenuList sections={m.sections} onDone={() => setOpen(null)} autoFocus />
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

/** A floating menu at a screen point, kept inside the window. */
export function ContextMenu({ x, y, sections, onClose, header }: { x: number; y: number; sections: MenuSection[]; onClose: () => void; header?: ReactNode }) {
  const box = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState({ left: x, top: y });
  useLayoutEffect(() => {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    setPos({ left: Math.max(4, Math.min(x, window.innerWidth - r.width - 4)), top: Math.max(4, Math.min(y, window.innerHeight - r.height - 4)) });
  }, [x, y]);
  useEffect(() => {
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) onClose(); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    const blur = () => onClose();
    window.addEventListener("mousedown", away);
    window.addEventListener("keydown", key, true);
    window.addEventListener("blur", blur);
    window.addEventListener("resize", blur);
    return () => { window.removeEventListener("mousedown", away); window.removeEventListener("keydown", key, true); window.removeEventListener("blur", blur); window.removeEventListener("resize", blur); };
  }, [onClose]);
  return (
    <div ref={box} onContextMenu={(e) => e.preventDefault()} style={{ position: "fixed", left: pos.left, top: pos.top, zIndex: 80 }}>
      <MenuList sections={sections} onDone={onClose} header={header} autoFocus />
    </div>
  );
}

/** The list both menus draw: sections divided by rules, long groups as submenus, the
 *  keys right-aligned. ↑↓ walk the enabled items, Enter runs, → opens a submenu. */
export function MenuList({ sections, onDone, header, autoFocus }: { sections: MenuSection[]; onDone: () => void; header?: ReactNode; autoFocus?: boolean }) {
  const [sub, setSub] = useState<number | null>(null);
  // A submenu is fixed to the window, beside its entry: the list scrolls, and a scrolling
  // box clips anything absolutely positioned inside it.
  const [subAt, setSubAt] = useState<{ left: number; top: number } | null>(null);
  const openSub = (si: number, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const w = 260;
    setSubAt({ left: r.right + w > window.innerWidth ? Math.max(4, r.left - w) : r.right - 2, top: Math.max(4, Math.min(r.top - 5, window.innerHeight - 320)) });
    setSub(si);
  };
  const root = useRef<HTMLDivElement | null>(null);
  useEffect(() => { if (autoFocus) root.current?.focus(); }, [autoFocus]);
  // After the menu is gone, so a command that focuses a field keeps the focus.
  const run = (c: Command) => { if (c.disabled) return; onDone(); setTimeout(c.run, 0); };
  const onKey = (e: React.KeyboardEvent) => {
    const items = [...(root.current?.querySelectorAll<HTMLElement>(":scope > [data-item]:not([data-disabled])") ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault(); e.stopPropagation();
      const n = items.length;
      if (n) items[(i + (e.key === "ArrowDown" ? 1 : -1) + n + (i < 0 && e.key === "ArrowUp" ? 1 : 0)) % n]?.focus();
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault(); e.stopPropagation();
      (document.activeElement as HTMLElement | null)?.click();
    } else if (e.key === "ArrowRight" && (document.activeElement as HTMLElement | null)?.dataset.sub) {
      e.preventDefault(); e.stopPropagation();
      openSub(Number((document.activeElement as HTMLElement).dataset.sub), document.activeElement as HTMLElement);
    }
  };
  const visible = sections.filter((s) => s.items.length);
  return (
    <div ref={root} role="menu" tabIndex={-1} onKeyDown={onKey} style={panel}>
      {header ? <div style={{ padding: "4px 10px 6px", fontSize: 10.5, color: C.muted2, borderBottom: `1px solid ${C.borderSoft}`, marginBottom: 3 }}>{header}</div> : null}
      {visible.map((s, si) => (
        <div key={`${s.title ?? ""}${si}`} style={{ display: "contents" }}>
          {si > 0 ? <div role="separator" style={{ height: 1, background: C.borderSoft, margin: "4px 0" }} /> : null}
          {s.submenu ? (
            <div
              data-item=""
              data-sub={si}
              tabIndex={-1}
              role="menuitem"
              aria-haspopup="menu"
              aria-expanded={sub === si}
              onMouseEnter={(e) => openSub(si, e.currentTarget)}
              onClick={(e) => (sub === si ? setSub(null) : openSub(si, e.currentTarget))}
              style={{ ...row, position: "relative", background: sub === si ? C.chip : undefined }}
            >
              <span style={check} />
              <span style={{ flex: 1 }}>{s.title}</span>
              <span style={{ color: C.muted2 }}>▸</span>
              {sub === si && subAt ? (
                <div onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()} style={{ position: "fixed", left: subAt.left, top: subAt.top, zIndex: 90 }}>
                  <MenuList sections={[{ items: s.items }]} onDone={onDone} />
                </div>
              ) : null}
            </div>
          ) : (
            <>
              {s.title && visible.length > 1 ? <div style={{ padding: "3px 10px 1px 28px", fontSize: 9.5, letterSpacing: "0.07em", textTransform: "uppercase", color: C.faint }}>{s.title}</div> : null}
              {s.items.map((c) => (
                <div
                  key={c.id}
                  data-item=""
                  data-disabled={c.disabled ? "" : undefined}
                  role="menuitem"
                  aria-disabled={c.disabled ? true : undefined}
                  tabIndex={-1}
                  onMouseEnter={(e) => { setSub(null); if (!c.disabled) e.currentTarget.focus(); }}
                  onClick={() => run(c)}
                  style={{ ...row, color: c.disabled ? C.faint : C.ink, cursor: c.disabled ? "default" : "pointer" }}
                >
                  <span style={check}>{c.checked ? "✓" : c.icon ?? null}</span>
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>{c.label}</span>
                  {c.keys ? <span style={{ fontFamily: MONO, fontSize: 10, color: C.muted2, paddingLeft: 14 }}>{c.keys}</span> : null}
                </div>
              ))}
            </>
          )}
        </div>
      ))}
    </div>
  );
}

const panel: CSSProperties = {
  minWidth: 230,
  maxWidth: 380,
  maxHeight: "calc(100vh - 60px)",
  overflowY: "auto",
  padding: "5px 0",
  background: C.bar,
  border: `1px solid ${C.border}`,
  borderRadius: 6,
  boxShadow: "0 10px 28px rgba(40,32,20,0.18), 0 2px 6px rgba(40,32,20,0.08)",
  fontSize: 11.5,
  outline: "none",
};
const row: CSSProperties = { display: "flex", alignItems: "center", gap: 6, padding: "4px 10px 4px 8px", margin: "0 4px", borderRadius: 4, whiteSpace: "nowrap", outline: "none", userSelect: "none" };
const check: CSSProperties = { width: 16, display: "inline-grid", placeItems: "center", flex: "0 0 auto", color: C.text2, fontSize: 11 };
