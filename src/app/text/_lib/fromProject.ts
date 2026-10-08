// From a project's configuration to the workbench's own shapes, and back. Pure.
//
// A text project is configured like every other project (`projects.json`): tags with an
// id, a label, a `base` — here the TEI element the span is exported as — a colour and a
// key. The workbench predates projects and speaks its own `TagDef` (colour as hex, a
// one-character key, the TEI target in `tei`). This module is the one place the two meet,
// so neither side has to know the other's vocabulary.
//
// Documents arrive as plain text. A paragraph is a run of lines between blank lines; the
// workbench's text for a document is its paragraphs joined by one blank line, and every
// offset an annotation carries counts code units of **that** text — which the export
// writes out beside the annotations, so the offsets can always be checked.

import { normalizeChord, type TagDef as ProjectTag, type TextDirection } from "../../_lib/project";
import { SEG_SEP } from "./corpus";
import type { Section, TagDef } from "./types";

/* ── colour ────────────────────────────────────────────────────────────────────────── */

/** `oklch(L C h)` as `#rrggbb`, clamped into sRGB. The workbench appends alpha digits to
 *  a tag's colour (`#2c5d862e`), so it must be six-digit hex. */
export function oklchHex(L: number, C: number, h: number): string {
  const a = C * Math.cos((h * Math.PI) / 180);
  const b = C * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return (
    "#" +
    lin
      .map((x) => {
        const v = x <= 0.0031308 ? 12.92 * x : 1.055 * Math.max(x, 0) ** (1 / 2.4) - 0.055;
        return Math.round(Math.min(1, Math.max(0, v)) * 255)
          .toString(16)
          .padStart(2, "0");
      })
      .join("")
  );
}

/* ── tags ──────────────────────────────────────────────────────────────────────────── */

/** The workbench reads one character per tag. A chord that is a plain letter or digit
 *  becomes that character; anything else leaves the tag to the palette and the menu. */
export function plainKey(chord: string): string {
  const c = chord ? normalizeChord(chord) : null;
  return c && /^[A-Z0-9]$/.test(c) ? c.toLowerCase() : "";
}

/** A project's text tags as the workbench's tag set. */
export function teiTags(tags: ProjectTag[]): TagDef[] {
  return tags.map((t) => {
    const key = plainKey(t.key);
    return {
      id: t.id,
      en: t.label,
      he: t.labelAlt ?? "",
      color: t.color ?? oklchHex(0.52, Math.min(t.chroma, 0.2), t.hue),
      key,
      tei: t.base,
      proj: "both",
      popular: t.popular ?? key !== "",
      ...(t.scope === "document" ? { scope: "document" as const } : {}),
      contain: ["doc"],
      auto: t.description ?? "",
      attrs: (t.attrs ?? []).map((a) => ({ ...a, values: a.values ? [...a.values] : undefined })),
    };
  });
}

/**
 * The workbench's tag set written back as project tags, after an edit in its Tagset tab.
 * What the workbench does not edit (icon, hue, chroma, a chord it cannot show) is kept
 * from the previous definition of the same tag.
 */
export function projectTags(tei: TagDef[], previous: ProjectTag[]): ProjectTag[] {
  const prev = new Map(previous.map((t) => [t.id, t]));
  return tei.map((t, i) => {
    const old = prev.get(t.id);
    const same = old && plainKey(old.key) === t.key;
    const out: ProjectTag = {
      ...(old ?? {}),
      id: t.id,
      label: t.en,
      base: t.tei,
      icon: old?.icon ?? "tag",
      hue: old?.hue ?? Math.round((i * 137.508 + 25) % 360),
      chroma: old?.chroma ?? 0.13,
      key: same ? old.key : t.key.toUpperCase(),
    };
    if (t.he) out.labelAlt = t.he;
    else delete out.labelAlt;
    // An explicit colour only when it differs from the one hue and chroma already give.
    const derived = old ? teiTags([{ ...old, color: undefined }])[0].color : null;
    if (t.color !== derived) out.color = t.color;
    else delete out.color;
    if (t.attrs.length) out.attrs = t.attrs.map((a) => ({ id: a.id, kind: a.kind === "vocab" ? "text" : a.kind, label: a.label, tei: a.tei, ...(a.values ? { values: [...a.values] } : {}) }));
    else delete out.attrs;
    if (t.scope === "document") out.scope = "document";
    else delete out.scope;
    if (old?.popular !== undefined || (t.popular !== undefined && t.popular !== (t.key !== ""))) out.popular = t.popular === true;
    else delete out.popular;
    if (t.auto) out.description = t.auto;
    else delete out.description;
    return out;
  });
}

/** A value with its object keys sorted and undefined fields dropped: two tag lists that
 *  say the same thing compare equal however their JSON was written. */
export function canonical(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v).sort()) {
      const x = (v as Record<string, unknown>)[k];
      if (x !== undefined) out[k] = canonical(x);
    }
    return out;
  }
  return v;
}

/* ── documents ─────────────────────────────────────────────────────────────────────── */

/** Paragraphs: runs of lines between blank lines, trimmed, empty ones dropped. */
export function paragraphs(text: string): string[] {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n[ \t]*\n/)
    .map((p) => p.trim())
    .filter((p) => p !== "");
}

/** A document as the workbench's section. `text` is what every offset counts in. */
export function sectionOf(doc: { id: string; text: string; title?: string; part?: string }): Section {
  const segs = paragraphs(doc.text);
  return { doc_id: doc.id, part: doc.part ?? "", title: doc.title ?? doc.id, segs, text: segs.join(SEG_SEP), seeds: [] };
}

/** `auto` decided from the letters: right-to-left when Hebrew and Arabic letters outnumber
 *  Latin and Cyrillic ones in the first few thousand characters. */
export function resolveDirection(dir: TextDirection | undefined, texts: string[]): "rtl" | "ltr" {
  if (dir === "rtl" || dir === "ltr") return dir;
  let rtl = 0;
  let ltr = 0;
  let seen = 0;
  for (const t of texts) {
    for (const ch of t) {
      if (/[֐-ࣿיִ-﷿ﹰ-﻿]/.test(ch)) rtl++;
      else if (/[A-Za-zÀ-ɏЀ-ӿ]/.test(ch)) ltr++;
      if (++seen > 20000) return rtl > ltr ? "rtl" : "ltr";
    }
  }
  return rtl > ltr ? "rtl" : "ltr";
}
