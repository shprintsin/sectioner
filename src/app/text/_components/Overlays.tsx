"use client";

import type { Dispatch, MouseEvent } from "react";

import { C, F } from "../_lib/designTokens";
import type { Action } from "../_lib/state";
import type { ViewModel } from "../_lib/viewModel";

interface P {
  vm: ViewModel;
  dispatch: Dispatch<Action>;
}

const stop = (e: MouseEvent) => e.stopPropagation();

const SCRIM = {
  position: "fixed" as const, inset: 0, display: "flex", justifyContent: "center",
};
const CARD = {
  background: C.paper, border: "1px solid #cdc3b0", borderRadius: "6px",
  boxShadow: "0 18px 48px rgba(35,32,27,.3)", overflow: "hidden",
};

export function Overlays({ vm, dispatch }: P) {
  return (
    <>
      {vm.projectsOpen && <ProjectsDialog vm={vm} dispatch={dispatch} />}
      {/* An invisible full-screen catcher, below the menus and above everything else:
          clicking anywhere closes an open menu without every other control having to
          know that a menu exists. */}
      {vm.menuOverlay && (
        <div
          onClick={() => dispatch({ type: "setOpenMenu", label: null })}
          style={{ position: "fixed", inset: 0, zIndex: 70 }}
        />
      )}
      {vm.selMenuOpen && <SelectionMenu vm={vm} dispatch={dispatch} />}
      {vm.paletteOpen && <Palette vm={vm} dispatch={dispatch} />}
      {vm.helpOpen && <HelpDialog vm={vm} dispatch={dispatch} />}
      {vm.hasToast && <Toast text={vm.toast} />}
    </>
  );
}

function ProjectsDialog({ vm, dispatch }: P) {
  const close = () => dispatch({ type: "setProjectsOpen", open: false });
  return (
    <div onClick={close} style={{ ...SCRIM, background: "rgba(35,32,27,.36)", alignItems: "flex-start", paddingTop: "11vh", zIndex: 95 }}>
      <div onClick={stop} style={{ ...CARD, width: "560px" }}>
        <div style={{ padding: "12px 14px", borderBottom: "1px solid " + C.lineMid, display: "flex", alignItems: "baseline", gap: "9px" }}>
          <span style={{ fontWeight: 600, fontSize: "13px" }}>Open project</span>
          <span style={{ fontFamily: F.mono, fontSize: "10px", color: C.muted3 }}>
            projects.json
          </span>
        </div>
        {vm.projectList.map((p) => (
          <div key={p.id} onClick={() => dispatch(p.on)} style={p.style}>
            <span style={p.dot} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 500, fontSize: "12px" }}>{p.name}</div>
              <div style={{ fontFamily: F.mono, fontSize: "10px", color: C.muted3 }}>{p.meta}</div>
            </div>
            <span style={p.stateStyle}>{p.state}</span>
          </div>
        ))}
        <div style={{ display: "flex", gap: "6px", padding: "10px 14px", borderTop: "1px solid " + C.lineMid, background: C.chrome }}>
          <a href="/" style={{ ...dialogBtn, textDecoration: "none", color: "inherit", display: "inline-flex", alignItems: "center" }}>
            All projects…
          </a>
          <div style={{ flex: 1 }} />
          <button onClick={close} style={{ ...dialogBtn, color: C.muted }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

const dialogBtn = {
  border: "1px solid #cdc3b0", background: C.paper, borderRadius: "3px",
  padding: "5px 11px", cursor: "pointer", fontSize: "11px", color: C.head,
};

function SelectionMenu({ vm, dispatch }: P) {
  return (
    <div style={vm.selMenuStyle}>
      {vm.selMenuItems.map((m) => (
        <button key={m.label} onClick={() => dispatch(m.on)} style={m.style} title={m.title}>
          <span style={m.dot} />
          <span>{m.label}</span>
          <span style={m.keyStyle}>{m.key}</span>
        </button>
      ))}
      <div style={{ width: "1px", alignSelf: "stretch", background: "#3d3830", margin: "0 2px" }} />
      <button
        onClick={() => dispatch({ type: "openPalette" })}
        style={{ display: "flex", alignItems: "center", gap: "5px", background: "transparent", border: 0, color: "#d8d0c0", padding: "5px 8px", cursor: "pointer", fontSize: "11px" }}
      >
        more… <span style={{ fontFamily: F.mono, fontSize: "9px", opacity: 0.6 }}>space</span>
      </button>
    </div>
  );
}

function Palette({ vm, dispatch }: P) {
  return (
    <div
      onClick={() => dispatch({ type: "closePalette" })}
      style={{ ...SCRIM, background: "rgba(35,32,27,.34)", alignItems: "flex-start", paddingTop: "14vh", zIndex: 96 }}
    >
      <div onClick={stop} style={{ ...CARD, width: "460px" }}>
        <input
          value={vm.paletteQ}
          onChange={(e) => dispatch({ type: "setPaletteQ", q: e.target.value })}
          placeholder="tag the selection…"
          autoFocus
          style={{
            width: "100%", border: 0, borderBottom: "1px solid " + C.lineMid, background: "#fff",
            padding: "10px 12px", fontSize: "14px", outline: "none",
          }}
        />
        <div style={{ maxHeight: "300px", overflow: "auto" }}>
          {vm.paletteItems.map((p) => (
            <div
              key={p.label}
              onClick={() => {
                dispatch(p.on);
                dispatch({ type: "closePalette" });
              }}
              style={p.style}
            >
              <span style={p.dot} />
              <span style={{ fontWeight: 500 }}>{p.label}</span>
              <span style={{ unicodeBidi: "plaintext", fontFamily: F.serif, fontSize: "14px", color: C.muted }}>{p.he}</span>
              <div style={{ flex: 1 }} />
              <span style={{ fontFamily: F.mono, fontSize: "10px", color: C.muted3 }}>{p.tei}</span>
              <span style={p.keyStyle}>{p.key}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function HelpDialog({ vm, dispatch }: P) {
  return (
    <div
      onClick={() => dispatch({ type: "toggleHelp" })}
      style={{ ...SCRIM, background: "rgba(35,32,27,.4)", alignItems: "center", zIndex: 97 }}
    >
      <div onClick={stop} style={{ ...CARD, width: "660px", maxHeight: "78vh", overflow: "auto", padding: "18px 20px" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: "10px", marginBottom: "12px" }}>
          <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 600 }}>Keyboard</h3>
          <span style={{ fontSize: "11px", color: C.muted3 }}>generated from this project&apos;s tag set</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px 22px" }}>
          {vm.helpRows.map((h, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: "9px", padding: "3px 0", borderBottom: "1px solid " + C.fillSoft }}>
              <span style={h.keyStyle}>{h.key}</span>
              <span style={{ fontSize: "11px", color: C.head }}>{h.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Toast({ text }: { text: string }) {
  return (
    <div
      role="status"
      style={{
        position: "fixed", bottom: "38px", left: "50%", transform: "translateX(-50%)",
        background: C.menuBg, color: C.paper, padding: "6px 14px", borderRadius: "4px",
        fontSize: "11px", fontFamily: F.mono, zIndex: 99, boxShadow: "0 6px 18px rgba(35,32,27,.3)",
      }}
    >
      {text}
    </div>
  );
}
