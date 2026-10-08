"use client";

// The magnifier in the side panel. While the pointer is over the page it shows the
// scan around the pointer, enlarged; otherwise the whole current region, fitted to the
// panel. The pointer arrives through a small store, so a mouse move redraws this box
// and nothing else of the page.

import { useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";

import type { ViewRotation } from "../_lib/geometry";
import { C } from "../_lib/tokens";
import type { BBox } from "../_lib/types";

export type PagePoint = readonly [number, number] | null;

export interface PointStore {
  get: () => PagePoint;
  set: (p: PagePoint) => void;
  subscribe: (f: () => void) => () => void;
}

export function createPointStore(): PointStore {
  let v: PagePoint = null;
  const subs = new Set<() => void>();
  return {
    get: () => v,
    set: (p) => {
      if (p === v || (p && v && Math.round(p[0]) === Math.round(v[0]) && Math.round(p[1]) === Math.round(v[1]))) return;
      v = p;
      subs.forEach((f) => f());
    },
    subscribe: (f) => { subs.add(f); return () => { subs.delete(f); }; },
  };
}

// One height in both modes, so the panel below does not jump as the pointer comes and goes.
const H = 170;

export default function Loupe(p: { store: PointStore; imageUrl: string; width: number; height: number; region: BBox | null; rotation: ViewRotation }) {
  const pt = useSyncExternalStore(p.store.subscribe, p.store.get, () => null);
  const box = useRef<HTMLDivElement | null>(null);
  const [w, setW] = useState(260);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const quarter = p.rotation === 90 || p.rotation === 270;
  let view: { cx: number; cy: number; k: number; h: number; outline?: [number, number] } | null = null;
  if (pt) {
    // A window about a quarter of the page wide: a few printed lines, legible.
    const span = Math.min(900, Math.max(360, (quarter ? p.height : p.width) * 0.28));
    view = { cx: pt[0], cy: pt[1], k: w / span, h: H };
  } else if (p.region) {
    const b = p.region;
    const [bw, bh] = quarter ? [b[3] - b[1], b[2] - b[0]] : [b[2] - b[0], b[3] - b[1]];
    const k = Math.min((w - 8) / bw, (H - 8) / bh, 6);
    view = { cx: (b[0] + b[2]) / 2, cy: (b[1] + b[3]) / 2, k, h: H, outline: [bw * k, bh * k] };
  }

  const frame: CSSProperties = { position: "relative", width: "100%", height: H, overflow: "hidden", borderRadius: 4, border: `1px solid ${view ? C.bar2 : C.borderSoft}`, background: view ? "#fff" : C.well };
  // The scan is laid out in the page's own frame, centred on the point, then turned with
  // the page about that centre — the same view the canvas shows.
  if (!view) {
    return (
      <div ref={box} style={{ ...frame, display: "grid", placeItems: "center", fontSize: 10.5, color: C.faint }}>
        hover the page to magnify
      </div>
    );
  }
  const [iw, ih] = quarter ? [view.h, w] : [w, view.h];
  const inner: CSSProperties = {
    position: "absolute",
    left: (w - iw) / 2,
    top: (view.h - ih) / 2,
    width: iw,
    height: ih,
    backgroundImage: `url("${p.imageUrl}")`,
    backgroundRepeat: "no-repeat",
    backgroundSize: `${p.width * view.k}px ${p.height * view.k}px`,
    backgroundPosition: `${iw / 2 - view.cx * view.k}px ${ih / 2 - view.cy * view.k}px`,
    transform: p.rotation ? `rotate(${p.rotation}deg)` : undefined,
    imageRendering: view.k > 2.5 ? "pixelated" : "auto",
  };
  return (
    <div ref={box} style={frame} title={pt ? `x ${Math.round(pt[0])}, y ${Math.round(pt[1])}` : undefined}>
      <div style={inner} />
      {view.outline ? <div style={{ position: "absolute", left: (w - view.outline[0]) / 2, top: (view.h - view.outline[1]) / 2, width: view.outline[0], height: view.outline[1], boxShadow: `0 0 0 1px ${C.focus}, 0 0 0 999px rgba(255,255,255,0.55)`, pointerEvents: "none" }} /> : null}
      {pt ? (
        <>
          <div style={{ position: "absolute", left: w / 2 - 0.5, top: view.h / 2 - 9, width: 1, height: 18, background: C.focus, opacity: 0.7, pointerEvents: "none" }} />
          <div style={{ position: "absolute", left: w / 2 - 9, top: view.h / 2 - 0.5, width: 18, height: 1, background: C.focus, opacity: 0.7, pointerEvents: "none" }} />
        </>
      ) : null}
    </div>
  );
}
