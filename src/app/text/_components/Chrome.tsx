"use client";

import type { Dispatch } from "react";

import { C, F } from "../_lib/designTokens";
import type { Action } from "../_lib/state";
import type { ViewModel } from "../_lib/viewModel";

interface P {
  vm: ViewModel;
  dispatch: Dispatch<Action>;
}

/* ── the menu bar ──────────────────────────────────────────────────────────────────── */

export function MenuBar({ vm, dispatch }: P) {
  return (
    <div
      style={{
        display: "flex", alignItems: "stretch", height: "26px", flex: "0 0 26px",
        padding: "0 8px", background: C.keyBg, borderBottom: "1px solid #d6cdbb",
        position: "relative", zIndex: 80,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "6px", paddingRight: "12px" }}>
        <svg width="13" height="13" aria-hidden>
          <rect x="0" y="0" width="8" height="8" rx="1.5" fill="#8a6a1f" opacity="0.4" />
          <rect x="5" y="5" width="8" height="8" rx="1.5" fill="#8a6a1f" />
        </svg>
        <a href="/" title="All projects" style={{ fontWeight: 600, fontSize: "11px", color: "inherit", textDecoration: "none" }}>Sectioner</a>
        <span style={{ fontSize: "11px", color: "#8b8275" }}>· text</span>
      </div>

      {vm.menus.map((mn) => (
        <div key={mn.label} style={{ position: "relative", display: "flex" }}>
          <button onClick={() => dispatch(mn.toggle)} style={mn.style}>
            {mn.label}
          </button>
          {mn.open && (
            <div
              style={{
                position: "absolute", top: "100%", left: 0, minWidth: "252px",
                background: C.rowActive, border: "1px solid #cdc3b0", borderRadius: "4px",
                boxShadow: "0 12px 30px rgba(35,32,27,.22)", zIndex: 90, padding: "4px 0",
              }}
            >
              {mn.items.map((it, i) =>
                it.sep ? (
                  <div key={i} style={it.style} />
                ) : (
                  <div key={i} onClick={() => it.on && dispatch(it.on)} style={it.style}>
                    <span>{it.label}</span>
                    <div style={{ flex: 1 }} />
                    <span style={{ fontFamily: F.mono, fontSize: "9px", color: C.faint }}>
                      {it.key}
                    </span>
                  </div>
                ),
              )}
            </div>
          )}
        </div>
      ))}

      <div style={{ flex: 1 }} />
      <div
        style={{
          display: "flex", alignItems: "center", gap: "8px", fontFamily: F.mono,
          fontSize: "10px", color: C.muted,
        }}
      >
        <span style={vm.layerDot} />
        <span>{vm.layerLabel}</span>
        <span>tagset {vm.tagsetVersion}</span>
        <span>{vm.savedLabel}</span>
      </div>
    </div>
  );
}

/* ── the toolbar ───────────────────────────────────────────────────────────────────── */

export function Toolbar({ vm, dispatch }: P) {
  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: "10px", height: "34px", flex: "0 0 34px",
        padding: "0 10px", background: "#e9e3d7", borderBottom: "1px solid #d6cdbb",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "7px", flex: "0 0 auto" }}>
        <span style={{ fontSize: "10px", color: C.muted3, textTransform: "uppercase", letterSpacing: ".05em" }}>
          project
        </span>
        <button onClick={() => dispatch({ type: "setProjectsOpen", open: true })} style={vm.projectBtn}>
          {vm.projectName} ▾
        </button>
      </div>

      <div style={{ display: "flex", gap: "2px", background: "#ded6c6", padding: "2px", borderRadius: "3px" }}>
        <button
          onClick={() => dispatch({ type: "setSpanMode", mode: "underline" })}
          style={vm.modeUnderlineStyle}
          title="underline marks"
        >
          <svg width="15" height="15" aria-hidden>
            <rect x="2" y="3.5" width="11" height="1.4" rx="0.7" fill="currentColor" opacity="0.35" />
            <rect x="2" y="7" width="7" height="1.4" rx="0.7" fill="currentColor" opacity="0.35" />
            <rect x="2" y="11" width="11" height="2" rx="1" fill="currentColor" />
          </svg>
        </button>
        <button
          onClick={() => dispatch({ type: "setSpanMode", mode: "highlight" })}
          style={vm.modeHighlightStyle}
          title="highlight marks"
        >
          <svg width="15" height="15" aria-hidden>
            <rect x="1" y="3" width="13" height="9" rx="2" fill="currentColor" opacity="0.28" />
            <rect x="3" y="6.8" width="9" height="1.6" rx="0.8" fill="currentColor" />
          </svg>
        </button>
        <button
          onClick={() => dispatch({ type: "toggleClean" })}
          style={vm.cleanBtn}
          title="clean read — hide all marks (`)"
        >
          <svg width="15" height="15" aria-hidden>
            <rect x="2" y="3.5" width="11" height="1.3" rx="0.65" fill="currentColor" opacity="0.55" />
            <rect x="2" y="7" width="11" height="1.3" rx="0.65" fill="currentColor" opacity="0.55" />
            <rect x="2" y="10.5" width="7" height="1.3" rx="0.65" fill="currentColor" opacity="0.55" />
          </svg>
        </button>
        <button
          onClick={() => dispatch({ type: "toggleCompact", announce: true })}
          style={vm.compactBtn}
          title="compact mode — line breaks ignored, maximum text in view (c)"
        >
          <svg width="15" height="15" aria-hidden>
            {[2.5, 4.6, 6.7, 8.8].map((y) => (
              <rect key={y} x="1.5" y={y} width="12" height="1.1" rx="0.55" fill="currentColor" />
            ))}
            <rect x="1.5" y="10.9" width="8" height="1.1" rx="0.55" fill="currentColor" />
          </svg>
        </button>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "3px" }}>
        <button onClick={() => dispatch({ type: "nudgeSize", delta: -1 })} style={vm.sizeBtn} title="smaller text">
          A−
        </button>
        <button onClick={() => dispatch({ type: "nudgeSize", delta: 1 })} style={vm.sizeBtn} title="larger text">
          A+
        </button>
      </div>

      <button onClick={() => dispatch({ type: "toggleReview" })} style={vm.reviewBtn} title="review machine proposals">
        <svg width="14" height="14" aria-hidden>
          <rect x="1.5" y="1.5" width="11" height="11" rx="3" fill="currentColor" opacity="0.18" />
          <rect x="4" y="6.6" width="4.6" height="1.7" rx="0.8" fill="currentColor" transform="rotate(45 4 6.6)" />
          <rect x="6.4" y="9.4" width="6.4" height="1.7" rx="0.8" fill="currentColor" transform="rotate(-45 6.4 9.4)" />
        </svg>
        <span>{vm.reviewLabel}</span>
      </button>

      <div style={{ flex: 1 }} />
      <div
        style={{
          fontFamily: F.mono, fontSize: "10px", color: C.muted3, whiteSpace: "nowrap",
          overflow: "hidden", textOverflow: "ellipsis",
        }}
      >
        {vm.projectPath}
      </div>
    </div>
  );
}

/* ── the review bar ────────────────────────────────────────────────────────────────── */

export function ReviewBar({ vm, dispatch }: P) {
  if (!vm.reviewOn) return null;
  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: "8px", padding: "5px 14px",
        background: "#efe7d6", borderBottom: "1px solid #e2d8c2", fontSize: "11px", flexWrap: "wrap",
      }}
    >
      <span style={{ fontWeight: 600, whiteSpace: "nowrap" }}>Review mode</span>
      <span style={{ fontFamily: F.mono, fontSize: "10px", color: C.muted, whiteSpace: "nowrap" }}>
        {vm.reviewProgress}
      </span>
      <span
        style={{
          fontFamily: F.mono, fontSize: "10px", color: C.faint2, whiteSpace: "nowrap",
          overflow: "hidden", textOverflow: "ellipsis", minWidth: 0, flex: "0 1 auto",
        }}
      >
        y accept · n reject · tab next
      </span>
      <div style={{ flex: 1 }} />
      <button onClick={() => dispatch({ type: "stepProposal", dir: -1 })} style={vm.ghostBtn}>‹</button>
      <button onClick={() => dispatch({ type: "stepProposal", dir: 1 })} style={vm.ghostBtn}>›</button>
      <button
        onClick={() => dispatch({ type: "decideAll", ok: true })}
        style={{ border: "1px solid #b9c9ae", background: "#eef3e8", color: C.accept, borderRadius: "3px", padding: "2px 8px", cursor: "pointer", whiteSpace: "nowrap" }}
      >
        ✓ all
      </button>
      <button
        onClick={() => dispatch({ type: "decideAll", ok: false })}
        style={{ border: "1px solid #d9c0b6", background: "#f6ece8", color: C.reject, borderRadius: "3px", padding: "2px 8px", cursor: "pointer", whiteSpace: "nowrap" }}
      >
        ✕ all
      </button>
      <button onClick={() => dispatch({ type: "toggleReview" })} style={vm.ghostBtn}>exit</button>
    </div>
  );
}

/* ── the status bar ────────────────────────────────────────────────────────────────── */

export function StatusBar({ vm }: { vm: ViewModel }) {
  return (
    <div
      style={{
        flex: "0 0 26px", display: "flex", alignItems: "center", gap: "14px", padding: "0 14px",
        background: "#e9e3d7", borderTop: "1px solid #d6cdbb", fontFamily: F.mono,
        fontSize: "10px", color: C.muted,
      }}
    >
      <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: "1 1 auto", minWidth: 0 }}>
        {vm.selLabel}
      </span>
      <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: "0 1 auto", minWidth: 0 }}>
        {vm.statusHint}
      </span>
    </div>
  );
}

/* ── the right-hand navigator ──────────────────────────────────────────────────────── */

export function RightNav({ vm, dispatch }: P) {
  return (
    <div
      style={{
        width: "224px", flex: "0 0 224px", borderLeft: "1px solid #ddd5c6", background: C.chrome,
        display: "flex", flexDirection: "column", minHeight: 0,
      }}
    >
      <div style={{ padding: "7px 10px", borderBottom: "1px solid " + C.lineMid, display: "flex", alignItems: "center", gap: "6px" }}>
        <svg width="12" height="12" aria-hidden>
          <rect x="0.4" y="0.5" width="2.6" height="11" rx="0.7" fill="#8b8275" opacity="0.45" />
          <rect x="4.2" y="0.5" width="2.6" height="11" rx="0.7" fill="#8b8275" opacity="0.7" />
          <rect x="8" y="0.5" width="2.6" height="11" rx="0.7" fill="#8b8275" />
        </svg>
        <span style={{ fontWeight: 600, fontSize: "11px", letterSpacing: ".04em", textTransform: "uppercase", color: C.muted3 }}>
          Titles
        </span>
        <div style={{ flex: 1 }} />
        <span style={{ fontFamily: F.mono, fontSize: "10px", color: C.muted3 }}>{vm.volCount}</span>
      </div>

      <div style={{ flex: "0 0 auto", maxHeight: "34%", overflowY: "auto", overflowX: "hidden", borderBottom: "1px solid #ddd5c6" }}>
        {vm.volumes.map((v) => (
          <div key={v.id} onClick={() => dispatch(v.on)} style={v.style}>
            <span style={v.dot} />
            <span
              style={{
                flex: 1, unicodeBidi: "plaintext", textAlign: "start", fontFamily: F.serif, fontSize: "14px",
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}
            >
              {v.title}
            </span>
            <span style={{ fontFamily: F.mono, fontSize: "9px", color: C.faint2 }}>{v.meta}</span>
          </div>
        ))}
      </div>

      <div style={{ padding: "6px 10px", borderBottom: "1px solid " + C.lineMid, display: "flex", alignItems: "center", gap: "6px" }}>
        <span style={{ fontWeight: 600, fontSize: "11px", letterSpacing: ".04em", textTransform: "uppercase", color: C.muted3 }}>
          Sections
        </span>
        <div style={{ flex: 1 }} />
        <span style={{ fontFamily: F.mono, fontSize: "9px", color: C.faint }}>n · date · place</span>
      </div>

      <div style={{ flex: "1 1 0", overflowY: "auto", overflowX: "hidden" }}>
        {vm.sectionNav.map((s) => (
          <div key={s.docId} onClick={() => dispatch(s.on)} style={s.style}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={s.dot} />
              <span
                style={{
                  flex: 1, unicodeBidi: "plaintext", textAlign: "start", fontFamily: F.serif, fontSize: "14px",
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}
              >
                {s.title}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "5px", marginTop: "3px" }}>
              <span style={{ fontFamily: F.mono, fontSize: "9px", color: C.muted3, width: "18px" }}>{s.count}</span>
              <span style={s.dateChip} title="has a date tag">
                <svg width="9" height="9" aria-hidden>
                  <rect x="0.5" y="1.5" width="8" height="7" rx="1.2" fill="currentColor" opacity="0.35" />
                  <rect x="0.5" y="1.5" width="8" height="2" rx="1" fill="currentColor" />
                </svg>
              </span>
              <span style={s.placeChip} title="has a place tag">
                <svg width="9" height="9" aria-hidden>
                  <rect x="1.6" y="1.6" width="5.8" height="5.8" rx="2.9" fill="currentColor" opacity="0.35" />
                  <rect x="3.4" y="3.4" width="2.2" height="2.2" rx="1.1" fill="currentColor" />
                </svg>
              </span>
              <div style={{ flex: 1 }} />
              <span style={s.propChipStyle}>{s.propChip}</span>
            </div>
          </div>
        ))}
      </div>

      <div style={{ borderTop: "1px solid " + C.lineMid, padding: "6px 10px", fontFamily: F.mono, fontSize: "10px", color: C.muted3 }}>
        n / p — next, prev
      </div>
    </div>
  );
}
