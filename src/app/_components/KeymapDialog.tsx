"use client";

// Keyboard shortcuts, editable: every command the page offers with the chords it answers
// to. A chord is recorded by pressing it; "default" returns a command to the engine's
// keys. Saving writes the project's `keymap` (only the commands that differ from their
// default), so every working set of the project gets the same keys.

import { useEffect, useMemo, useState } from "react";

import { bindings, chordOf, formatChord, keysOf, normalizeChord } from "../_lib/project";
import { C, MONO, btn } from "../_lib/tokens";
import type { Command } from "./CommandPalette";

export interface KeymapDialogProps {
  commands: Command[];
  keymap: Record<string, string[]>;
  projectLabel: string;
  canSave: boolean;
  onSave: (keymap: Record<string, string[]>) => Promise<void>;
  onClose: () => void;
}

export default function KeymapDialog(p: KeymapDialogProps) {
  const [map, setMap] = useState<Record<string, string[]>>(() => ({ ...p.keymap }));
  const [recording, setRecording] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [state, setState] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });
  // A command id appears once, even when the mode and the shell both name it.
  const cmds = useMemo(() => p.commands.filter((c, i, a) => a.findIndex((x) => x.id === c.id) === i), [p.commands]);
  const b = useMemo(() => bindings(cmds, map), [cmds, map]);
  const dirty = JSON.stringify(clean(map, cmds)) !== JSON.stringify(clean(p.keymap, cmds));

  useEffect(() => {
    if (!recording) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape" && !e.shiftKey && !e.ctrlKey && !e.altKey) { setRecording(null); return; }
      const c = chordOf(e);
      if (!c) return;
      const cmd = cmds.find((x) => x.id === recording);
      const now = cmd ? keysOf(cmd, map) : [];
      if (!now.includes(c)) setMap((m) => ({ ...m, [recording]: [...now, c] }));
      setRecording(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [recording, cmds, map]);

  const remove = (id: string, chord: string) => {
    const cmd = cmds.find((x) => x.id === id);
    setMap((m) => ({ ...m, [id]: (cmd ? keysOf(cmd, m) : []).filter((k) => k !== chord) }));
  };
  const reset = (id: string) => setMap((m) => { const n = { ...m }; delete n[id]; return n; });

  const q = query.trim().toLowerCase();
  const shown = cmds.filter((c) => !q || `${c.label} ${c.group} ${keysOf(c, map).join(" ")}`.toLowerCase().includes(q));
  const groups = new Map<string, Command[]>();
  for (const c of shown) groups.set(c.group, [...(groups.get(c.group) ?? []), c]);

  const save = async () => {
    setState({ busy: true, error: null });
    try {
      await p.onSave(clean(map, cmds));
      p.onClose();
    } catch (e) {
      setState({ busy: false, error: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <div onMouseDown={p.onClose} style={{ position: "fixed", inset: 0, background: "rgba(30,27,22,0.28)", zIndex: 90, display: "grid", placeItems: "center" }}>
      <div role="dialog" aria-label="Keyboard shortcuts" onMouseDown={(e) => e.stopPropagation()} style={{ width: "min(760px, calc(100vw - 32px))", height: "min(720px, calc(100vh - 48px))", display: "grid", gridTemplateRows: "auto auto 1fr auto", background: C.bar, border: `1px solid ${C.bar2}`, borderRadius: 8, boxShadow: "0 24px 60px rgba(30,27,22,0.28)", fontSize: 12, overflow: "hidden" }}>
        <div style={{ padding: "12px 16px 6px" }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Keyboard shortcuts</div>
          <div style={{ color: C.muted, marginTop: 2 }}>Project <b>{p.projectLabel}</b> — the keys apply to every working set of the project. Click <b>+</b> and press a key to add it; letters are read by their position, so a Hebrew layout types the same shortcut.</div>
        </div>
        <div style={{ padding: "4px 16px 8px", display: "flex", gap: 8, alignItems: "center" }}>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter commands or keys…" style={{ flex: 1, height: 28, padding: "0 8px", border: `1px solid ${C.border}`, borderRadius: 5, fontFamily: "inherit", fontSize: 12, background: "#fff" }} />
          {b.conflicts.size ? <span style={{ color: C.warnInk, background: C.warnBg, padding: "3px 8px", borderRadius: 4 }}>{b.conflicts.size} key{b.conflicts.size > 1 ? "s" : ""} used twice — the first command keeps it</span> : null}
        </div>
        <div className="om-scroll" style={{ overflowY: "auto", padding: "0 16px 8px", borderTop: `1px solid ${C.borderSoft}` }}>
          {[...groups].map(([g, list]) => (
            <div key={g} style={{ marginTop: 10 }}>
              <div style={{ fontSize: 9.5, letterSpacing: "0.08em", textTransform: "uppercase", color: C.faint, marginBottom: 3 }}>{g}</div>
              {list.map((c) => {
                const keys = keysOf(c, map);
                const changed = map[c.id] !== undefined;
                return (
                  <div key={c.id} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto auto", alignItems: "center", gap: 8, padding: "3px 6px", borderRadius: 4, background: recording === c.id ? "#fff" : "transparent" }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: C.text }}>{c.label}</span>
                    <span style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "flex-end" }}>
                      {keys.map((k) => {
                        const clash = (b.conflicts.get(k)?.length ?? 0) > 1;
                        return <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 3, fontFamily: MONO, fontSize: 10.5, padding: "1px 2px 1px 6px", borderRadius: 3, border: `1px solid ${clash ? C.warnBorder : C.borderKey}`, background: clash ? C.warnBg : "#fff", color: clash ? C.warnInk : C.text }} title={clash ? `also: ${b.conflicts.get(k)!.filter((x) => x !== c.id).map((x) => cmds.find((y) => y.id === x)?.label ?? x).join(", ")}` : k}>
                          {formatChord(k)}
                          <button aria-label={`remove ${k}`} onClick={() => remove(c.id, k)} style={{ border: "none", background: "transparent", cursor: "pointer", color: C.muted2, padding: "0 2px", fontSize: 10 }}>×</button>
                        </span>;
                      })}
                      {recording === c.id ? <span style={{ fontSize: 10.5, color: C.focus }}>press a key… (Esc cancels)</span> : null}
                    </span>
                    <span style={{ display: "flex", gap: 3 }}>
                      <button title="Add a key" onClick={() => setRecording(c.id)} style={btn(recording === c.id, { width: 24, padding: 0 })}>+</button>
                      <button title={`Default: ${(c.defaultKeys ?? []).map((k) => formatChord(normalizeChord(k) ?? k)).join(" ") || "none"}`} disabled={!changed} onClick={() => reset(c.id)} style={btn(false, { opacity: changed ? 1 : 0.4 })}>default</button>
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", borderTop: `1px solid ${C.borderSoft}` }}>
          {state.error ? <span style={{ color: C.cutInk }}>{state.error}</span> : !p.canSave ? <span style={{ color: C.muted }}>This instance is read-only; the keys cannot be saved.</span> : <span style={{ color: C.muted }}>Keys still work in the command palette (Ctrl+K) and the menus whatever they are bound to.</span>}
          <span style={{ flex: 1 }} />
          <button onClick={() => setMap({})} style={btn(false, { height: 26 })}>All defaults</button>
          <button onClick={p.onClose} style={btn(false, { height: 26 })}>Cancel</button>
          <button disabled={!p.canSave || !dirty || state.busy} onClick={() => void save()} style={btn(true, { height: 26, opacity: !p.canSave || !dirty ? 0.5 : 1 })}>{state.busy ? "Saving…" : "Save to project"}</button>
        </div>
      </div>
    </div>
  );
}

/** Only what differs from the defaults goes into the project, normalised. */
function clean(map: Record<string, string[]>, cmds: Command[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const c of cmds) {
    const over = map[c.id];
    if (over === undefined) continue;
    const norm = over.map(normalizeChord).filter((k): k is string => !!k);
    const def = (c.defaultKeys ?? []).map(normalizeChord).filter((k): k is string => !!k);
    if (norm.length === def.length && norm.every((k, i) => k === def[i])) continue;
    out[c.id] = norm;
  }
  // overrides for commands this page does not show (another mode's) are kept
  for (const [id, keys] of Object.entries(map)) if (!cmds.some((c) => c.id === id)) out[id] = keys;
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}
