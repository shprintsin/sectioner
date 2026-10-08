"use client";

// The small shared pieces of the shell, each a transcription of one region of the
// design: labels, the action grid, the key list, the coverage ribbon, the working set,
// the tool rail, the zoom bar, the export dialog.

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { C, MONO, btn, keyCap, label } from "../_lib/tokens";
import type { PageSummary } from "../_lib/types";
import type { Tool } from "../_lib/ui";
import { I, Icon, TOGGLE_ICON, TOOL_ICON } from "./icons";

export function Label({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <span style={{ ...label, ...style }}>{children}</span>;
}

export function Row({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ display: "flex", alignItems: "center", gap: 6, ...style }}>{children}</div>;
}

export function Spacer() {
  return <div style={{ flex: 1 }} />;
}

export function Divider() {
  return <div style={{ width: 1, height: 22, background: C.borderSoft }} />;
}

export interface Action {
  label: string;
  hint: string;
  primary?: boolean;
  onClick: () => void;
  disabled?: boolean;
  /** Drawn before the label; the label and key stay beside it and in the tooltip. */
  icon?: ReactNode;
  /** The tooltip, where the label is a short form. */
  tip?: string;
}

export interface ActionGroup {
  label: string;
  actions: Action[];
  /** Buttons per row (default 2). */
  cols?: number;
}

/** The actions panel: one flat grid, or named groups each on its own rows. */
export function ActionGrid({ actions, groups }: { actions?: Action[]; groups?: ActionGroup[] }) {
  const sets: ActionGroup[] = groups ?? [{ label: "", actions: actions ?? [] }];
  return (
    <div style={{ padding: 10, borderBottom: `1px solid ${C.borderSoft}` }}>
      <Row style={{ alignItems: "baseline", marginBottom: 6 }}>
        <Label>Actions</Label>
        <Spacer />
        <span style={{ fontSize: 9.5, color: C.faint }}>every one has a key</span>
      </Row>
      {sets.map((g, gi) => (
        <div key={g.label || gi} style={{ marginTop: gi ? 7 : 0 }}>
          {g.label ? <div style={{ fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: C.faint, marginBottom: 3 }}>{g.label}</div> : null}
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${g.cols ?? 2}, minmax(0, 1fr))`, gap: 3 }}>
            {g.actions.map((a) => <ActionButton key={a.label} a={a} />)}
          </div>
        </div>
      ))}
    </div>
  );
}

function ActionButton({ a }: { a: Action }) {
  return (
    <button
      onClick={a.onClick}
      disabled={a.disabled}
      title={a.hint ? `${a.tip ?? a.label} · ${a.hint}` : a.tip ?? a.label}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 5,
        minHeight: 26,
        padding: "3px 6px",
        borderRadius: 4,
        cursor: a.disabled ? "default" : "pointer",
        fontFamily: "inherit",
        fontSize: 10.5,
        textAlign: "left",
        overflow: "hidden",
        border: `1px solid ${a.primary ? C.borderRow : C.borderFaint}`,
        background: a.primary ? "#fff" : "#fcfbf9",
        color: C.text,
        opacity: a.disabled ? 0.5 : 1,
      }}
    >
      {a.icon ? <span style={{ color: C.text2, display: "grid" }}>{a.icon}</span> : null}
      <span style={{ flex: "1 1 auto", minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.label}</span>
      <span style={{ flex: "0 0 auto", marginLeft: "auto", fontFamily: MONO, fontSize: 9, color: C.faint }}>{a.hint}</span>
    </button>
  );
}

export function KeyRows({ rows, open, toggle }: { rows: [string, string][]; open: boolean; toggle: () => void }) {
  return (
    <div style={{ padding: 10 }}>
      <Row style={{ alignItems: "baseline", marginBottom: 6 }}>
        <Label>Keys</Label>
        <Spacer />
        <button onClick={toggle} style={{ border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", fontSize: 10, color: C.muted2, textDecoration: "underline", padding: 0 }}>
          {open ? "hide" : "show"}
        </button>
      </Row>
      {open ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {rows.map(([k, d]) => (
            <div key={k} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 10.5, padding: "1px 0" }}>
              <span style={keyCap}>{k}</span>
              <span style={{ color: C.text2 }}>{d}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export interface Tick {
  key: string;
  color: string;
  dim?: boolean;
  cur: boolean;
  sel: boolean;
  onClick: () => void;
}

/** One tick per unit in walk order; amber ticks are what is left. */
export function Ribbon({ ticks, note, tally }: { ticks: Tick[]; note: string; tally: { key: string; label: string; style: CSSProperties }[] }) {
  return (
    <div style={{ padding: "9px 10px 10px", borderBottom: `1px solid ${C.borderSoft}` }}>
      <Row style={{ alignItems: "baseline", marginBottom: 6 }}>
        <Label>Coverage</Label>
        <Spacer />
        <span style={{ fontSize: 9.5, color: C.faint }}>{note}</span>
      </Row>
      <div className="om-scroll" style={{ display: "flex", flexWrap: "wrap", gap: 2, alignContent: "flex-start", background: "#fff", border: `1px solid ${C.borderFaint}`, borderRadius: 4, padding: "5px 6px", maxHeight: 106, overflowY: "auto" }}>
        {ticks.map((t) => (
          <div
            key={t.key}
            onClick={t.onClick}
            style={{
              width: 7,
              height: t.cur ? 17 : 13,
              borderRadius: 1,
              cursor: "pointer",
              flex: "0 0 auto",
              alignSelf: "center",
              background: t.color,
              opacity: t.dim ? 0.5 : 1,
              outline: t.cur ? `2px solid ${C.ink}` : t.sel ? "1.5px solid #6b6355" : "none",
              outlineOffset: 1,
            }}
          />
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: 6 }}>
        {tally.map((t) => (
          <span key={t.key} style={t.style}>
            {t.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export function WorkingSet({
  pages,
  current,
  label: lbl,
  kind,
  approval,
  onPick,
}: {
  pages: PageSummary[];
  current: string | null;
  label: string;
  kind?: "newspaper" | "book";
  approval?: { verified: number; total: number; loose: number };
  onPick: (id: string) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>("[data-current='1']")?.scrollIntoView({ block: "nearest" });
  }, [current]);
  const nDone = pages.filter((p) => p.status === "done").length;
  const shownPages = pages.map(p => p.id === current && approval
    ? { ...p, n_units: approval.total, n_verified: approval.verified, n_open: approval.total - approval.verified + approval.loose }
    : p);
  const approved = shownPages.reduce((n, p) => n + (p.n_verified ?? 0), 0);
  const knownSections = shownPages.reduce((n, p) => n + (p.n_verified === undefined ? 0 : p.n_units), 0);
  const annotatedPages = shownPages.filter(p => p.n_verified !== undefined).length;
  return (
    <div style={{ height: "100%", boxSizing: "border-box", padding: "8px 10px 10px", borderBottom: `1px solid ${C.borderSoft}`, display: "grid", gridTemplateRows: "auto auto minmax(0, 1fr)", minHeight: 0 }}>
      <div style={{ ...label, marginBottom: 6, display: "flex", gap: 6 }}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lbl} · {pages.length} pages</span>
        <Spacer />
        <span style={{ fontFamily: MONO, textTransform: "none", letterSpacing: 0 }}>{nDone} done</span>
      </div>
      {kind === "newspaper" ? <div title="Across pages with saved annotations and the current page" style={{ marginBottom: 7, color: C.text2, fontSize: 10.5 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 3, whiteSpace: "nowrap" }}><span>Approved articles</span><strong style={{ fontFamily: MONO, flexShrink: 0 }}>{approved}/{knownSections}</strong></div>
        <div role="progressbar" aria-label="Approved articles in annotated pages" aria-valuenow={approved} aria-valuemax={Math.max(knownSections, 1)} style={{ height: 5, borderRadius: 3, background: C.track, overflow: "hidden" }}>
          <div style={{ width: `${knownSections ? approved / knownSections * 100 : 0}%`, height: "100%", background: C.ok }} />
        </div>
        <div style={{ marginTop: 3, color: C.muted2, fontSize: 9.5 }}>{annotatedPages}/{pages.length} pages with annotations</div>
      </div> : <div title="Completed pages in this working set" style={{ marginBottom: 7, color: C.text2, fontSize: 10.5 }}>
        <div style={{ display: "flex", gap: 6, alignItems: "baseline", marginBottom: 3 }}><span>Completed pages</span><strong style={{ fontFamily: MONO }}>{nDone}/{pages.length}</strong></div>
        <div role="progressbar" aria-label="Completed book pages" aria-valuenow={nDone} aria-valuemax={Math.max(pages.length, 1)} style={{ height: 5, borderRadius: 3, background: C.track, overflow: "hidden" }}>
          <div style={{ width: `${pages.length ? nDone / pages.length * 100 : 0}%`, height: "100%", background: C.ok }} />
        </div>
      </div>}
      <div ref={ref} className="om-scroll" style={{ display: "flex", flexDirection: "column", gap: 3, overflowY: "auto", minHeight: 0 }}>
        {shownPages.map((p) => {
          const on = p.id === current;
          const dot = p.status === "done" ? C.ok : p.status === "flagged" ? C.cut : p.status === "wip" ? C.un : C.bar2;
          const loose = p.n_verified === undefined ? 0 : Math.max(0, p.n_open - (p.n_units - p.n_verified));
          const detail = kind === "newspaper" && p.n_verified !== undefined
            ? `${p.n_verified}/${p.n_units} approved${loose ? ` · ${loose} loose` : ""}`
            : p.status === "new" ? "" : `${p.n_units}${p.n_open ? ` · ${p.n_open} left` : " · ✓"}`;
          return (
            <div
              key={p.id}
              data-current={on ? "1" : "0"}
              onClick={() => onPick(p.id)}
              title={[p.flag, detail].filter(Boolean).join(" · ") || undefined}
              style={{ display: "flex", alignItems: "center", gap: 7, padding: "4px 6px", borderRadius: 5, cursor: "pointer", fontSize: 11, background: on ? "#fff" : "transparent", border: `1px solid ${on ? C.borderRow : "transparent"}` }}
            >
              <span style={{ width: 7, height: 7, borderRadius: 4, flex: "0 0 auto", background: dot }} />
              <span style={{ fontFamily: MONO, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.id}</span>
              <span style={{ color: C.muted2, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                {kind === "newspaper" && p.n_verified !== undefined ? `${p.n_verified}/${p.n_units}${loose ? ` · ${loose} loose` : ""}` : p.status === "new" ? "" : `${p.n_units}${p.n_open ? ` · ${p.n_open} left` : " · ✓"}`}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export interface ToolDef {
  tool: Tool;
  key: string;
  glyph: string;
  name: string;
  hint: string;
}

export function ToolRail({ tools, tool, onPick }: { tools: ToolDef[]; tool: Tool; onPick: (t: ToolDef) => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, padding: "8px 0", background: C.rail, borderRight: `1px solid ${C.border}` }}>
      {tools.map((t) => {
        const on = tool === t.tool;
        return (
          <button
            key={t.tool}
            title={`${t.name} (${t.key}) — ${t.hint}`}
            onClick={() => onPick(t)}
            style={{ width: 34, height: 34, display: "grid", placeItems: "center", cursor: "pointer", borderRadius: 5, border: `1px solid ${on ? C.dark : C.borderKey}`, background: on ? C.dark : "#fff", color: on ? C.onDark : C.text2, fontFamily: "inherit", lineHeight: 1 }}
          >
            {TOOL_ICON[t.tool] ? <Icon size={17}>{TOOL_ICON[t.tool]}</Icon> : <span style={{ fontSize: 14 }}>{t.glyph}</span>}
            <span style={{ fontSize: 8, fontFamily: MONO, opacity: 0.7 }}>{t.key}</span>
          </button>
        );
      })}
      <div style={{ width: 22, height: 1, background: C.borderKey, margin: "3px 0" }} />
      <div style={{ writingMode: "vertical-rl", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: C.faint }}>tools</div>
    </div>
  );
}

export function ZoomBar(p: {
  pct: string;
  zoom: number;
  setZoom: (z: number) => void;
  fitPage: () => void;
  fitWidth: () => void;
  toggles: { key: string; label: string; on: boolean; onClick: () => void }[];
  /** What the pointer does now; shown as the canvas controls' tooltip, not as text. */
  toolNote: string;
  modeHint: { text: string; on: boolean } | null;
}) {
  const ibtn = (on: boolean) => btn(on, { padding: "0 5px", flex: "0 0 auto", display: "grid", placeItems: "center" });
  return (
    <div className="om-scroll" title={p.toolNote} style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 10px", background: C.panel, borderBottom: `1px solid ${C.border}`, minWidth: 0, overflowX: "auto" }}>
      <Label>Zoom</Label>
      <div title="Z cycles · + − 0 · ⌘wheel" style={{ display: "flex", alignItems: "center", flex: "0 0 auto", border: `1px solid ${C.border}`, borderRadius: 4, overflow: "hidden", background: "#fff" }}>
        <button onClick={() => p.setZoom(p.zoom / 1.25)} title="Zoom out · −" style={zbtn}>−</button>
        <span style={{ width: 46, textAlign: "center", fontFamily: MONO, fontSize: 10.5, color: C.text, borderLeft: `1px solid ${C.borderPale}`, borderRight: `1px solid ${C.borderPale}`, lineHeight: "22px" }}>{p.pct}</span>
        <button onClick={() => p.setZoom(p.zoom * 1.25)} title="Zoom in · +" style={zbtn}>+</button>
      </div>
      <button onClick={p.fitPage} title="Fit page · 0" aria-label="Fit page" style={ibtn(false)}><Icon>{I.fitPage}</Icon></button>
      <button onClick={p.fitWidth} title="Fit width" aria-label="Fit width" style={ibtn(false)}><Icon>{I.fitWidth}</Icon></button>
      {[2, 4, 8].map((z) => (
        <button key={z} onClick={() => p.setZoom(z)} title={`Zoom ${z}× · Z cycles`} style={btn(Math.abs(p.zoom - z) < 0.01, { padding: "0 7px", flex: "0 0 auto" })}>
          {z}×
        </button>
      ))}
      <div style={{ width: 1, height: 18, background: C.borderSoft, margin: "0 2px" }} />
      {p.toggles.map((t) =>
        TOGGLE_ICON[t.key] ? (
          <button key={t.key} onClick={t.onClick} title={t.label} aria-label={t.label} aria-pressed={t.on} style={ibtn(t.on)}>
            <Icon>{TOGGLE_ICON[t.key]}</Icon>
          </button>
        ) : (
          <button key={t.key} onClick={t.onClick} aria-pressed={t.on} style={btn(t.on, { padding: "0 7px", flex: "0 0 auto" })}>
            {t.label}
          </button>
        ),
      )}
      <div style={{ flex: 1, minWidth: 4 }} />
      {p.modeHint ? (
        <span style={{ fontSize: 10.5, padding: "2px 7px", borderRadius: 3, whiteSpace: "nowrap", background: p.modeHint.on ? "oklch(0.94 0.04 75)" : C.chip, color: p.modeHint.on ? "oklch(0.42 0.10 55)" : C.muted }}>
          {p.modeHint.text}
        </span>
      ) : null}
    </div>
  );
}

const zbtn: CSSProperties = { width: 22, height: 22, flex: "0 0 auto", border: "none", background: "transparent", cursor: "pointer", fontFamily: MONO, fontSize: 13, color: C.text2 };

export interface Check {
  key: string;
  ok: boolean;
  soft?: boolean;
  label: string;
}

export function ExportDialog(p: { title: string; subtitle: string; checks: Check[]; preview: string; note: string; writeLabel: string; onClose: () => void; onWrite: () => void; onDownload: () => void }) {
  return (
    <div onClick={p.onClose} style={{ position: "fixed", inset: 0, background: "rgba(30,27,22,0.42)", display: "grid", placeItems: "center", padding: 40, zIndex: 40 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 760, maxHeight: "78vh", display: "grid", gridTemplateRows: "auto auto 1fr auto", background: C.bar, border: `1px solid ${C.bar2}`, borderRadius: 8, boxShadow: "0 24px 60px rgba(30,27,22,0.28)", overflow: "hidden" }}>
        <Row style={{ gap: 8, padding: "12px 14px", borderBottom: `1px solid ${C.borderSoft}` }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{p.title}</span>
          <Spacer />
          <span style={{ fontSize: 10, color: C.muted2 }}>{p.subtitle}</span>
        </Row>
        <div style={{ display: "flex", gap: 6, padding: "10px 14px", borderBottom: `1px solid ${C.borderSoft}`, flexWrap: "wrap" }}>
          {p.checks.map((v) => {
            const ok = v.ok || v.soft;
            return (
              <span key={v.key} style={{ fontSize: 10.5, padding: "3px 7px", borderRadius: 4, background: v.ok ? C.okBg : C.warnBg, color: v.ok ? C.okInk : C.warnInk, border: `1px solid ${v.ok ? "oklch(0.85 0.05 150)" : C.warnBorder}`, fontWeight: ok ? 400 : 500 }}>
                {v.label}
              </span>
            );
          })}
        </div>
        <div className="om-scroll" style={{ overflow: "auto", padding: "10px 14px", background: "#fff" }}>
          <pre style={{ margin: 0, fontFamily: MONO, fontSize: 10.5, lineHeight: 1.5, color: C.text, whiteSpace: "pre-wrap" }}>{p.preview}</pre>
        </div>
        <Row style={{ gap: 8, padding: "11px 14px", borderTop: `1px solid ${C.borderSoft}` }}>
          <span style={{ fontSize: 10.5, color: C.muted }}>{p.note}</span>
          <Spacer />
          <button onClick={p.onClose} style={{ height: 26, padding: "0 12px", border: `1px solid ${C.border}`, background: "#fff", borderRadius: 4, cursor: "pointer", fontFamily: "inherit", fontSize: 11 }}>Close</button>
          <button onClick={p.onDownload} style={{ height: 26, padding: "0 12px", border: `1px solid ${C.border}`, background: "#fff", borderRadius: 4, cursor: "pointer", fontFamily: "inherit", fontSize: 11 }}>Download</button>
          <button onClick={p.onWrite} style={{ height: 26, padding: "0 12px", border: `1px solid ${C.link}`, background: C.link, color: "#fff", borderRadius: 4, cursor: "pointer", fontFamily: "inherit", fontSize: 11, fontWeight: 500 }}>{p.writeLabel}</button>
        </Row>
      </div>
    </div>
  );
}

/** A text field that returns the keyboard to the shell on Enter and Escape, and
 *  commits on blur. Used for the few things that are typed: a flag, a basis, a reason. */
export function Field(p: { value: string; placeholder?: string; rtl?: boolean; multiline?: boolean; onCommit: (v: string) => void; style?: CSSProperties; autoFocus?: boolean }) {
  const [v, setV] = useState(p.value);
  useEffect(() => setV(p.value), [p.value]);
  const commit = (el: HTMLElement) => {
    if (v !== p.value) p.onCommit(v);
    el.blur();
  };
  const common = {
    value: v,
    placeholder: p.placeholder,
    dir: p.rtl ? ("rtl" as const) : ("ltr" as const),
    autoFocus: p.autoFocus,
    onChange: (e: { target: { value: string } }) => setV(e.target.value),
    onBlur: (e: { target: HTMLElement }) => {
      if (v !== p.value) p.onCommit(v);
      void e;
    },
    onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => {
      e.stopPropagation();
      if (e.key === "Escape") {
        setV(p.value);
        (e.target as HTMLElement).blur();
      } else if (e.key === "Enter" && (!p.multiline || e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        commit(e.target as HTMLElement);
      }
    },
    style: { width: "100%", boxSizing: "border-box" as const, fontFamily: p.rtl ? "'Frank Ruhl Libre', 'David', serif" : "inherit", fontSize: p.rtl ? 13 : 11, padding: "3px 6px", border: `1px solid ${C.border}`, borderRadius: 4, background: "#fff", color: C.ink, resize: "vertical" as const, ...p.style },
  };
  return p.multiline ? <textarea rows={3} {...common} /> : <input type="text" {...common} />;
}
