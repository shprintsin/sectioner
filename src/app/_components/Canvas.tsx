"use client";

// The scan with rectangles on it. Mode-agnostic: it draws what it is given, reports
// clicks, drags and lassos in page pixels, and keeps the current rectangle in view.
//
// Rendering stays cheap at 170 blocks over a 2000×3500 image at 10×: the image is one
// <img> scaled by CSS (the decoded bitmap is the same at every zoom), rectangles are
// plain absolutely positioned divs, and printed lines are only drawn for the current
// block. Nothing re-measures on scroll.

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent as RMouseEvent } from "react";

import { handleCursor, intersection, normBox, pageToView, resizeBox as resized, shiftBox as shifted, viewSize as turnedSize, viewToPage, viewTransform, type ViewRotation } from "../_lib/geometry";
import { C } from "../_lib/tokens";
import type { BBox } from "../_lib/types";
import type { ArrowSpec, OverlaySpec, RectSpec, Tool } from "../_lib/ui";
import { cutAxisOf, fitPageScale } from "../_lib/ui";

const PAD = 16;

type Drag =
  | { kind: "marquee"; x0: number; y0: number; x1: number; y1: number; add: boolean; pick?: { id: number | string; shift: boolean; toggle: boolean } }
  | { kind: "move"; id: number | string; start: BBox; x0: number; y0: number; moved: boolean; shift: boolean; toggle: boolean }
  | { kind: "resize"; id: number | string; start: BBox; x0: number; y0: number; edges: string };

export interface CanvasProps {
  width: number;
  height: number;
  imageUrl: string;
  readOnly?: boolean;
  zoom: number;
  tool: Tool;
  rects: RectSpec[];
  overlays: OverlaySpec[];
  arrows: ArrowSpec[];
  /** Keep this box in view whenever `focusKey` changes. */
  focus: BBox | null;
  focusKey: string;
  /** `add`: Ctrl (⌘) was held, so the hits join the current selection instead of replacing it. */
  onMarquee: (box: BBox, add?: boolean) => void;
  /** `toggle`: Ctrl+click (⌘+click) adds this one block to the selection, or takes it out. */
  onPick: (id: number | string, shift: boolean, toggle?: boolean) => void;
  onDoublePick?: (id: number | string) => void;
  onBlankClick?: () => void;
  /** A cut tool is armed and the pointer was clicked inside this rectangle, at this page
   *  point; the mode reads the axis off `tool`. */
  onCut?: (id: number | string, x: number, y: number) => void;
  /** A cut tool clicked where no rectangle is. */
  onCutBlank?: (x: number, y: number) => void;
  dragSelectFromRect?: boolean;
  onBoxChange?: (id: number | string, box: BBox) => void;
  onZoom: (factor: number) => void;
  onFit: (fn: (view: { w: number; h: number }) => number) => void;
  onViewport: (view: { w: number; h: number }) => void;
  /** Read-only: a click at this page point (the companion page of a spread asks for focus). */
  onReadOnlyClick?: (x: number, y: number) => void;
  /** The pointer over the page, in page pixels; null when it leaves the page. */
  onHover?: (pt: readonly [number, number] | null) => void;
  /** Show the page turned this many degrees clockwise. The view only: every coordinate
   *  in and out of the canvas stays in the page's own frame. */
  rotation?: ViewRotation;
  /** Right-click on a rectangle (its id) or on blank page (null), at this screen point. */
  onContext?: (id: number | string | null, clientX: number, clientY: number) => void;
}

export default function Canvas(p: CanvasProps) {
  const view = useRef<HTMLDivElement | null>(null);
  const [viewSize, setViewSize] = useState({ w: 900, h: 760 });
  const [drag, setDrag] = useState<Drag | null>(null);
  // Where a cut tool would cut, in page pixels — the preview line follows the pointer.
  const [cutPt, setCutPt] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<Drag | null>(null);
  dragRef.current = drag;
  // The window listeners below are registered once; they read the latest props here.
  const pRef = useRef(p);
  pRef.current = p;

  const rot: ViewRotation = p.rotation ?? 0;
  const [turnedW, turnedH] = turnedSize(p.width, p.height, rot);
  const scale = fitPageScale(turnedW, turnedH, viewSize) * p.zoom;
  const scaleRef = useRef(scale);
  scaleRef.current = scale;
  // A page smaller than the well sits in its middle; the page origin is where its top-left
  // corner lands in the scrolled content, and every page↔screen conversion goes through it.
  const origin = {
    x: PAD + Math.max(0, (viewSize.w - 2 * PAD - turnedW * scale) / 2),
    y: PAD + Math.max(0, (viewSize.h - 2 * PAD - turnedH * scale) / 2),
  };
  const originRef = useRef(origin);
  originRef.current = origin;
  const previousOrigin = useRef(origin);
  const zoomAnchor = useRef<{ pageX: number; pageY: number; viewX: number; viewY: number } | null>(null);
  const previousScale = useRef(scale);

  useLayoutEffect(() => {
    const el = view.current;
    if (!el) return;
    let lastW = -1, lastH = -1;
    const measure = () => {
      const w = el.clientWidth, h = el.clientHeight;
      if (w === lastW && h === lastH) return;
      lastW = w; lastH = h;
      setViewSize({ w, h });
      pRef.current.onViewport({ w, h });
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);

  // Ctrl/⌘ + wheel zooms; a plain wheel scrolls. Registered non-passive so the browser's
  // own page zoom does not fire as well.
  useEffect(() => {
    const el = view.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      if (e.deltaY === 0) return;
      const bounds = el.getBoundingClientRect();
      const viewX = e.clientX - bounds.left, viewY = e.clientY - bounds.top;
      zoomAnchor.current = {
        pageX: (el.scrollLeft + viewX - originRef.current.x) / scaleRef.current,
        pageY: (el.scrollTop + viewY - originRef.current.y) / scaleRef.current,
        viewX, viewY,
      };
      pRef.current.onZoom(e.deltaY < 0 ? 1.12 : 0.89);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Adjust scroll before paint, keeping the same image point under the pointer.
  // Toolbar zoom uses the viewport centre instead of recentering a selected block.
  useLayoutEffect(() => {
    const el = view.current;
    const oldScale = previousScale.current;
    previousScale.current = scale;
    const oldOrigin = previousOrigin.current;
    previousOrigin.current = originRef.current;
    if (!el || scale === oldScale) { zoomAnchor.current = null; return; }
    const anchor = zoomAnchor.current ?? {
      pageX: (el.scrollLeft + el.clientWidth / 2 - oldOrigin.x) / oldScale,
      pageY: (el.scrollTop + el.clientHeight / 2 - oldOrigin.y) / oldScale,
      viewX: el.clientWidth / 2,
      viewY: el.clientHeight / 2,
    };
    zoomAnchor.current = null;
    el.scrollLeft = Math.max(0, anchor.pageX * scale + originRef.current.x - anchor.viewX);
    el.scrollTop = Math.max(0, anchor.pageY * scale + originRef.current.y - anchor.viewY);
  }, [scale, p.zoom]);

  // Bring a newly selected rectangle into view; zoom has its own stable anchor.
  const lastFocus = useRef("");
  useEffect(() => {
    const v = view.current;
    if (!v || !p.focus || p.focusKey === lastFocus.current) return;
    lastFocus.current = p.focusKey;
    const b = p.focus;
    const [fx, fy] = pageToView((b[0] + b[2]) / 2, (b[1] + b[3]) / 2, rot, p.width, p.height);
    const cx = fx * scale + originRef.current.x;
    const cy = fy * scale + originRef.current.y;
    const [tw, th] = turnedSize(b[2] - b[0], b[3] - b[1], rot);
    const bw = tw * scale;
    const bh = th * scale;
    // Only scroll when the box is not already comfortably visible — a walk down a column
    // should not jitter the page on every step.
    const inX = cx - bw / 2 > v.scrollLeft + 24 && cx + bw / 2 < v.scrollLeft + v.clientWidth - 24;
    const inY = cy - bh / 2 > v.scrollTop + 24 && cy + bh / 2 < v.scrollTop + v.clientHeight - 24;
    if (inX && inY) return;
    v.scrollLeft = Math.max(0, cx - v.clientWidth / 2);
    v.scrollTop = Math.max(0, cy - v.clientHeight / 2);
  }, [p.focus, p.focusKey, scale, rot, p.width, p.height]);

  const toPage = useCallback((e: { clientX: number; clientY: number }): [number, number] => {
    const v = view.current!;
    const r = v.getBoundingClientRect();
    const s = scaleRef.current;
    const q = pRef.current;
    const o = originRef.current;
    return viewToPage((e.clientX - r.left + v.scrollLeft - o.x) / s, (e.clientY - r.top + v.scrollTop - o.y) / s, q.rotation ?? 0, q.width, q.height);
  }, []);

  const cutAxis = cutAxisOf(p.tool);

  /** The rectangle a cut would land in: the smallest pickable one under the point, so a
   *  block inside a larger frame is what the pointer means. */
  const cutTarget = (x: number, y: number): RectSpec | null => {
    let best: RectSpec | null = null;
    let bestArea = Infinity;
    for (const r of p.rects) {
      const b = r.bbox;
      if (!r.pick || x < b[0] || x > b[2] || y < b[1] || y > b[3]) continue;
      const a = (b[2] - b[0]) * (b[3] - b[1]);
      if (a <= bestArea) { best = r; bestArea = a; }
    }
    return best;
  };

  const tryCut = (e: RMouseEvent): boolean => {
    if (!cutAxis) return false;
    const [x, y] = toPage(e);
    const hit = cutTarget(x, y);
    if (hit) p.onCut?.(hit.id, x, y);
    else p.onCutBlank?.(x, y);
    return true;
  };

  const onWellDown = (e: RMouseEvent) => {
    if (p.readOnly) {
      if (e.button === 0 && p.onReadOnlyClick) p.onReadOnlyClick(...toPage(e));
      return;
    }
    if (e.button !== 0) return;
    if (tryCut(e)) return;
    const [x, y] = toPage(e);
    setDrag({ kind: "marquee", x0: x, y0: y, x1: x, y1: y, add: e.ctrlKey || e.metaKey });
  };

  const onRectContext = (r: RectSpec, e: RMouseEvent) => {
    if (p.readOnly || !p.onContext || !r.pick) return;
    e.preventDefault();
    e.stopPropagation();
    p.onContext(r.id, e.clientX, e.clientY);
  };

  const onRectDown = (r: RectSpec, e: RMouseEvent) => {
    if (p.readOnly) return;
    if (e.button !== 0) return;
    e.stopPropagation();
    if (tryCut(e)) return;
    if (p.tool !== "select") {
      // In a drawing tool the rectangle is not a target: the drag starts underneath it.
      const [x, y] = toPage(e);
      setDrag({ kind: "marquee", x0: x, y0: y, x1: x, y1: y, add: false });
      return;
    }
    if (r.handles && p.onBoxChange) {
      const [x, y] = toPage(e);
      setDrag({ kind: "move", id: r.id, start: [...r.bbox] as BBox, x0: x, y0: y, moved: false, shift: e.shiftKey, toggle: e.ctrlKey || e.metaKey });
      return;
    }
    if (p.dragSelectFromRect) {
      const [x, y] = toPage(e);
      setDrag({ kind: "marquee", x0: x, y0: y, x1: x, y1: y, add: e.ctrlKey || e.metaKey, pick: { id: r.id, shift: e.shiftKey, toggle: e.ctrlKey || e.metaKey } });
    } else p.onPick(r.id, e.shiftKey, e.ctrlKey || e.metaKey);
  };

  const onHandleDown = (r: RectSpec, edges: string, e: RMouseEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const [x, y] = toPage(e);
    setDrag({ kind: "resize", id: r.id, start: [...r.bbox] as BBox, x0: x, y0: y, edges });
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const [x, y] = toPage(e);
      if (d.kind === "marquee") setDrag({ ...d, x1: x, y1: y });
      else if (d.kind === "move") {
        const moved = d.moved || Math.abs(x - d.x0) * scaleRef.current > 3 || Math.abs(y - d.y0) * scaleRef.current > 3;
        setDrag({ ...d, moved, x0: d.x0, y0: d.y0, start: d.start });
        setLive(moved ? shifted(d.start, x - d.x0, y - d.y0) : null);
      } else setLive(resized(d.start, d.edges, x - d.x0, y - d.y0));
    };
    const onUp = (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      setDrag(null);
      setLive(null);
      const [x, y] = toPage(e);
      const q = pRef.current;
      if (d.kind === "marquee") {
        const w = Math.abs(x - d.x0), h = Math.abs(y - d.y0);
        const drawing = q.tool === "draw";
        const accepted = drawing
          ? Math.max(w, h) * scaleRef.current >= 6
          : w * scaleRef.current >= 6 && h * scaleRef.current >= 6;
        if (accepted) {
          const box = normBox(d.x0, d.y0, x, y);
          if (drawing) {
            // A line gesture is a thin box, not a zero-area rectangle.
            if (box[2] - box[0] < 2) { const cx = (box[0] + box[2]) / 2; box[0] = cx - 1; box[2] = cx + 1; }
            if (box[3] - box[1] < 2) { const cy = (box[1] + box[3]) / 2; box[1] = cy - 1; box[3] = cy + 1; }
          }
          q.onMarquee(box, d.add);
        }
        else if (d.pick) q.onPick(d.pick.id, d.pick.shift, d.pick.toggle);
        else if (!d.add) q.onBlankClick?.();
      } else if (d.kind === "move") {
        if (!d.moved) q.onPick(d.id, d.shift, d.toggle);
        else q.onBoxChange?.(d.id, shifted(d.start, x - d.x0, y - d.y0));
      } else q.onBoxChange?.(d.id, resized(d.start, d.edges, x - d.x0, y - d.y0));
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    const onCancel = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      dragRef.current = null;
      setDrag(null);
      setLive(null);
    };
    window.addEventListener("keydown", onCancel);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("keydown", onCancel);
    };
  }, [toPage]);

  const [live, setLive] = useState<BBox | null>(null);

  // A cut is along the page's axes; on a page turned a quarter the line runs the other way on screen.
  const quarter = rot === 90 || rot === 270;
  const screenAxis = cutAxis && quarter ? (cutAxis === "h" ? "v" : "h") : cutAxis;
  const cursor = p.readOnly ? (p.onReadOnlyClick ? "pointer" : "default") : screenAxis === "h" ? "row-resize" : screenAxis === "v" ? "col-resize" : p.tool === "draw" || p.tool === "zone" || p.tool === "column" ? "crosshair" : p.tool === "lasso" ? "cell" : "default";
  // The wrapper takes the turned size in the scroll well; the page layer inside keeps the
  // page's own frame and is turned onto it by CSS, so every rectangle below is placed in
  // page pixels exactly as when upright.
  const wrapStyle: CSSProperties = {
    position: "relative",
    marginLeft: origin.x - PAD,
    marginTop: origin.y - PAD,
    width: turnedW * scale,
    height: turnedH * scale,
    boxShadow: "0 2px 14px rgba(30,27,22,0.22)",
    background: "#fff",
    cursor,
  };
  const canvasStyle: CSSProperties = {
    position: "absolute",
    left: 0,
    top: 0,
    width: p.width * scale,
    height: p.height * scale,
    transformOrigin: "0 0",
    transform: viewTransform(rot, p.width * scale, p.height * scale),
  };

  const px = (b: BBox): CSSProperties => ({
    position: "absolute",
    left: b[0] * scale,
    top: b[1] * scale,
    width: (b[2] - b[0]) * scale,
    height: (b[3] - b[1]) * scale,
  });

  // The cut preview: the line the pointer would draw, and a ring round the box it cuts.
  const cutRect = cutAxis && cutPt ? cutTarget(cutPt.x, cutPt.y) : null;
  const cutLine: BBox | null = cutRect && cutPt
    ? cutAxis === "h"
      ? [cutRect.bbox[0] - 6, cutPt.y - 1, cutRect.bbox[2] + 6, cutPt.y + 1]
      : [cutPt.x - 1, cutRect.bbox[1] - 6, cutPt.x + 1, cutRect.bbox[3] + 6]
    : null;

  const marquee = drag?.kind === "marquee" ? normBox(drag.x0, drag.y0, drag.x1, drag.y1) : null;
  // Use the same partial-overlap rule and drag threshold as committed selection.
  // This is a visual preview only: no annotation or selection state is saved on move.
  const previewing = !!(p.dragSelectFromRect && (p.tool === "select" || p.tool === "lasso") && marquee &&
    (marquee[2] - marquee[0]) * scale >= 6 && (marquee[3] - marquee[1]) * scale >= 6);
  const previewStyle = (r: RectSpec): CSSProperties => {
    if (!previewing || !r.pick) return {};
    return intersection(r.bbox, marquee) > 0
      ? { background: "rgba(35, 120, 225, 0.22)", boxShadow: `0 0 0 2px ${C.focus}`, opacity: 1 }
      : { boxShadow: "none" };
  };
  const under = p.rects.filter((r) => r.under);
  const over = p.rects.filter((r) => !r.under);

  return (
    <div
      ref={view}
      className="om-scroll"
      onMouseDown={onWellDown}
      onContextMenu={(e) => {
        if (p.readOnly || !p.onContext) return;
        e.preventDefault();
        p.onContext(null, e.clientX, e.clientY);
      }}
      onMouseMove={(e) => {
        if (!cutAxis && !p.onHover) return;
        const [x, y] = toPage(e);
        p.onHover?.(x >= 0 && y >= 0 && x <= p.width && y <= p.height ? [x, y] : null);
        if (!cutAxis) return;
        setCutPt((prev) => (prev && Math.round(prev.x) === Math.round(x) && Math.round(prev.y) === Math.round(y) ? prev : { x: Math.round(x), y: Math.round(y) }));
      }}
      onMouseLeave={() => { setCutPt(null); p.onHover?.(null); }}
      style={{ position: "relative", overflow: "scroll", overflowAnchor: "none", scrollBehavior: "auto", padding: PAD, minWidth: 0, minHeight: 0, background: C.well, userSelect: "none" }}
    >
      <div style={wrapStyle}>
      <div style={canvasStyle}>
        { }
        <img
          src={p.imageUrl}
          alt=""
          draggable={false}
          width={p.width}
          height={p.height}
          style={{ position: "absolute", left: 0, top: 0, width: p.width * scale, height: p.height * scale, imageRendering: scale > 2.5 ? "pixelated" : "auto", pointerEvents: "none" }}
        />
        {under.map((r) => (
          <div key={r.key} title={r.title} onMouseDown={(e) => onRectDown(r, e)} onContextMenu={(e) => onRectContext(r, e)} style={{ ...px(r.bbox), ...r.style, pointerEvents: r.pick ? "auto" : "none" }}>
            {r.chip ? <span style={r.chipStyle}>{r.chip}</span> : null}
            {r.badge ? <span style={r.badgeStyle}>{r.badge}</span> : null}
            {r.decoration}
            {r.handles ? handles(r, onHandleDown, rot) : null}
          </div>
        ))}
        {over.map((r) => {
          const b = live && drag && drag.kind !== "marquee" && drag.id === r.id ? live : r.bbox;
          return (
            <div key={r.key} data-block-id={r.id} title={r.title} onDoubleClick={(e) => { e.stopPropagation(); if (!p.readOnly && p.tool === "select") p.onDoublePick?.(r.id); }} onMouseDown={(e) => onRectDown(r, e)} onContextMenu={(e) => onRectContext(r, e)} style={{ ...px(b), ...r.style, ...previewStyle(r), pointerEvents: r.pick && !p.readOnly ? "auto" : "none" }}>
              {r.chip ? <span style={r.chipStyle}>{r.chip}</span> : null}
              {r.badge ? <span style={r.badgeStyle}>{r.badge}</span> : null}
              {r.decoration}
              {r.handles ? handles(r, onHandleDown, rot) : null}
            </div>
          );
        })}
        {p.overlays.map((o) => (
          <div key={o.key} style={{ ...px(o.bbox), ...o.style, pointerEvents: "none" }} />
        ))}
        {p.arrows.length ? (
          <svg width={p.width * scale} height={p.height * scale} style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none", zIndex: 25, overflow: "visible" }}>
            {p.arrows.map((a) => {
              const [x1, y1] = [((a.from[0] + a.from[2]) / 2) * scale, ((a.from[1] + a.from[3]) / 2) * scale];
              const [x2, y2] = [((a.to[0] + a.to[2]) / 2) * scale, ((a.to[1] + a.to[3]) / 2) * scale];
              const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
              return (
                <g key={a.key}>
                  <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#fff" strokeWidth={4} strokeLinecap="round" opacity={0.8} />
                  <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={a.color} strokeWidth={2} strokeLinecap="round" />
                  <circle cx={x2} cy={y2} r={4} fill={a.color} stroke="#fff" strokeWidth={1.5} />
                  <text x={mx} y={my - 4} fontSize={10} fontFamily="'IBM Plex Mono', monospace" fill={a.color} textAnchor="middle" stroke="#fff" strokeWidth={3} paintOrder="stroke">
                    {a.label}
                  </text>
                </g>
              );
            })}
          </svg>
        ) : null}
        {cutRect && cutLine ? (
          <>
            <div style={{ ...px(cutRect.bbox), border: `1.5px solid ${C.cut}`, borderRadius: 2, zIndex: 28, pointerEvents: "none" }} />
            <div style={{ ...px(cutLine), background: C.cut, boxShadow: "0 0 0 1px #fff", zIndex: 29, pointerEvents: "none", minHeight: cutAxis === "h" ? 3 : undefined, minWidth: cutAxis === "v" ? 3 : undefined }} />
          </>
        ) : null}
        {marquee ? (
          <div
            style={{
              ...px(marquee),
              border: `1.5px solid ${C.focus}`,
              background: "oklch(0.52 0.16 250 / 0.12)",
              zIndex: 30,
              pointerEvents: "none",
            }}
          />
        ) : null}
      </div>
      </div>
    </div>
  );
}

const HANDLES: [string, CSSProperties][] = [
  ["nw", { left: -4, top: -4, cursor: "nwse-resize" }],
  ["n", { left: "calc(50% - 4px)", top: -4, cursor: "ns-resize" }],
  ["ne", { right: -4, top: -4, cursor: "nesw-resize" }],
  ["e", { right: -4, top: "calc(50% - 4px)", cursor: "ew-resize" }],
  ["se", { right: -4, bottom: -4, cursor: "nwse-resize" }],
  ["s", { left: "calc(50% - 4px)", bottom: -4, cursor: "ns-resize" }],
  ["sw", { left: -4, bottom: -4, cursor: "nesw-resize" }],
  ["w", { left: -4, top: "calc(50% - 4px)", cursor: "ew-resize" }],
];

function handles(r: RectSpec, onDown: (r: RectSpec, edges: string, e: RMouseEvent) => void, rot: ViewRotation) {
  return HANDLES.map(([edges, pos]) => (
    <span
      key={edges}
      aria-label={`Resize ${r.id} ${edges}`}
      onMouseDown={(e) => onDown(r, edges, e)}
      style={{ position: "absolute", width: 8, height: 8, background: "#fff", border: `1.5px solid ${C.focus}`, borderRadius: 1, zIndex: 12, ...pos, cursor: handleCursor(edges, rot) }}
    />
  ));
}
