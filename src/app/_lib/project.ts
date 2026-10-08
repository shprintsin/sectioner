// Projects: what an annotation job is, as configuration rather than code.
//
// A project names the engine its pages run on (`kind`: `book` regions on any scanned page,
// `newspaper` sections, `text` spans), the working sets it owns, its annotation schema (the
// tags a reviewer can give, each with a label, an icon, a colour and a key) and its key
// map (command id -> chords, overriding the engine's defaults).
//
// The engines' contracts do not change. Every tag has a `base`: the canonical role
// (book) or section type (newspaper) the record is written with, so a custom tag such as
// "responsum heading" is a `title` to every downstream reader and carries its own id
// beside it (`tag`). A built-in tag is its base (`id === base`) and adds nothing to the
// record, so a page annotated before projects existed exports byte-for-byte as before.
//
// Pure: no React, no I/O. The server reads and writes `projects.json` in the data folder
// (`_server/projects.ts`); the pages read the resolved project off their working set.

import type { KeyInput } from "./keys";
import { BOOK_HUE, NEWS_HUE } from "./tokens";
import type { BookRole, Kind, NewsType, RoleSpec } from "./types";
import { BOOK_ROLES, NEWS_TYPES } from "./types";

/* ── icons ─────────────────────────────────────────────────────────────────────────── */

/** The icon library a tag can wear. Drawn in `_components/tagIcons.tsx`. */
export const TAG_ICONS = [
  "paragraph", "heading", "subheading", "comment", "footnote", "header", "footer", "hash",
  "rule", "question", "aside", "signature", "summary", "calendar", "table", "noise", "image",
  "article", "megaphone", "masthead", "info", "folder", "list", "stamp",
  "star", "flag", "bookmark", "quote", "link", "user", "pin", "tag", "circle", "square",
  "triangle", "diamond", "check", "cross", "scroll", "book", "mail", "money", "eye", "bolt",
] as const;
export type TagIcon = (typeof TAG_ICONS)[number];

/* ── the schema ────────────────────────────────────────────────────────────────────── */

export interface TagDef {
  /** Stable id, written to the record as `tag` when it differs from `base`. */
  id: string;
  label: string;
  /** The canonical role (book) or section type (newspaper) the record carries. */
  base: string;
  icon: TagIcon;
  /** oklch hue, 0–360, and chroma; the ink of the tag on the page and in the panels. */
  hue: number;
  chroma: number;
  /** A chord (`M`, `Shift+1`, `Ctrl+Alt+T`); empty for none. */
  key: string;
  description?: string;
  /* ── text projects only ── */
  /** A second name shown beside the label (often the label in the text's language). */
  labelAlt?: string;
  /** A colour as `#rrggbb`, overriding hue and chroma. */
  color?: string;
  /** Fields the annotator fills on a span with this tag, exported as TEI attributes. */
  attrs?: TextAttrDef[];
  /** `"document"`: the tag classifies a whole document and carries no span. */
  scope?: "document";
  /** Offer it in the menu that opens at a fresh selection (at most six are shown). */
  popular?: boolean;
}

/** One field of a text tag. `tei` says where it lands in the export: `@type`, `@ref`, … */
export interface TextAttrDef {
  id: string;
  kind: "text" | "number" | "enum";
  label: string;
  tei: string;
  /** The choices, for `kind: "enum"`. */
  values?: string[];
}

/** Reading direction of a text project's documents; `auto` decides from the letters. */
export type TextDirection = "rtl" | "ltr" | "auto";

export interface ProjectDef {
  id: string;
  label: string;
  kind: Kind;
  description?: string;
  /** Text projects: the documents' direction (default `auto`). */
  direction?: TextDirection;
  /** Working set ids from `worksets.json`; a working set belongs to one project. */
  worksets: string[];
  tags: TagDef[];
  /** Command id -> chords. Absent: the engine's default; `[]`: unbound. */
  keymap: Record<string, string[]>;
  created?: string;
  updated?: string;
}

/** What a page receives: the project its working set belongs to, resolved. */
export interface ResolvedProject {
  id: string;
  label: string;
  kind: Kind;
  tags: TagDef[];
  keymap: Record<string, string[]>;
  /** True when no projects.json entry owns the working set and this one was derived. */
  synthesized: boolean;
}

export const PROJECT_ID = /^[a-z0-9][a-z0-9_.-]{0,62}$/;
export const TAG_ID = /^[a-z0-9][a-z0-9_]{0,47}$/;

/** The canonical values a tag of this kind may stand for. A text tag's base is any TEI
 *  element (`persName`, `seg[@type='ruling']`), so the list is only a suggestion there. */
export function bases(kind: Kind): readonly string[] {
  return kind === "book" ? BOOK_ROLES : kind === "newspaper" ? NEWS_TYPES : TEI_SUGGESTED;
}

/** A TEI element name, optionally with one attribute predicate: `seg[@type='ruling']`. */
export const TEI_BASE = /^[A-Za-z_][A-Za-z0-9_.-]*(\[@[A-Za-z_][A-Za-z0-9_:.-]*='[^'\]]*'\])?$/;

const TEI_SUGGESTED = ["persName", "placeName", "orgName", "date", "term", "quote", "bibl", "measure", "foreign", "title", "name", "seg", "note", "head", "num", "rs"] as const;

/** The starter library for text projects: common TEI elements with plain names. */
const TEXT_LIBRARY: TagDef[] = [
  { id: "person", label: "Person", base: "persName", icon: "user", hue: 25, chroma: 0.14, key: "P", popular: true },
  { id: "place", label: "Place", base: "placeName", icon: "pin", hue: 230, chroma: 0.13, key: "L", popular: true },
  { id: "org", label: "Organization", base: "orgName", icon: "folder", hue: 300, chroma: 0.12, key: "O", popular: true },
  { id: "date", label: "Date", base: "date", icon: "calendar", hue: 160, chroma: 0.12, key: "D", popular: true,
    attrs: [{ id: "when", kind: "text", label: "ISO date (YYYY-MM-DD)", tei: "@when" }] },
  { id: "term", label: "Term", base: "term", icon: "tag", hue: 75, chroma: 0.13, key: "T", popular: true },
  { id: "quote", label: "Quotation", base: "quote", icon: "quote", hue: 345, chroma: 0.12, key: "Q", popular: true },
  { id: "citation", label: "Citation", base: "bibl", icon: "book", hue: 200, chroma: 0.1, key: "C" },
  { id: "measure", label: "Number / measure", base: "measure", icon: "hash", hue: 120, chroma: 0.12, key: "N",
    attrs: [{ id: "quantity", kind: "number", label: "quantity", tei: "@quantity" }, { id: "unit", kind: "text", label: "unit", tei: "@unit" }] },
  { id: "foreign", label: "Foreign word", base: "foreign", icon: "flag", hue: 270, chroma: 0.1, key: "F" },
  { id: "title", label: "Title of a work", base: "title", icon: "bookmark", hue: 50, chroma: 0.12, key: "W" },
  { id: "note", label: "Note", base: "note", icon: "comment", hue: 0, chroma: 0.04, key: "" },
  { id: "doctype", label: "Document type", base: "classCode", icon: "folder", hue: 250, chroma: 0.06, key: "", scope: "document",
    attrs: [{ id: "value", kind: "enum", label: "type", tei: "@subtype", values: ["letter", "report", "other"] }] },
];

/** Defaults for the fields a person (or agent) may leave out of a tag: an icon, a colour
 *  spread around the wheel by position, no key. Everything else is required. */
export function normalizeTag(t: Partial<TagDef> & Pick<TagDef, "id">, index: number): TagDef {
  return {
    ...t,
    id: t.id,
    label: t.label ?? t.id,
    base: t.base ?? "",
    icon: t.icon ?? "tag",
    hue: typeof t.hue === "number" ? t.hue : Math.round((index * 137.508 + 25) % 360),
    chroma: typeof t.chroma === "number" ? t.chroma : 0.13,
    key: t.key ?? "",
  };
}

/** A project as read from disk: tag defaults filled, an absent key map an empty one. */
export function normalizeProject(p: ProjectDef): ProjectDef {
  return { ...p, worksets: p.worksets ?? [], keymap: p.keymap ?? {}, tags: (p.tags ?? []).map((t, i) => normalizeTag(t, i)) };
}

const BOOK_LABEL: Record<BookRole, string> = { main_text: "Main text", title: "Title / heading", subtitle: "Subtitle / subheading", commentary: "Commentary", footnote: "Footnote", running_header: "Page header", page_number: "Page number", separator: "Rule / separator", unknown: "Unclear", auxiliary_text: "Auxiliary text", signature: "Signature / author", page_footer: "Page footer", summary: "Summary", date: "Date / dateline", table: "Table area", noise: "Noise (speck, stain, bleed-through)", figure: "Figure (illustration, picture, logo, emblem)" };
const BOOK_KEY: Record<BookRole, string> = { main_text: "M", title: "H", subtitle: "6", commentary: "C", footnote: "F", running_header: "R", page_number: "N", separator: "D", unknown: "U", auxiliary_text: "E", signature: "I", page_footer: "Q", summary: "Z", date: "0", table: "9", noise: "8", figure: "7" };
const BOOK_ICON: Record<BookRole, TagIcon> = { main_text: "paragraph", title: "heading", subtitle: "subheading", commentary: "comment", footnote: "footnote", running_header: "header", page_number: "hash", separator: "rule", unknown: "question", auxiliary_text: "aside", signature: "signature", page_footer: "footer", summary: "summary", date: "calendar", table: "table", noise: "noise", figure: "image" };

const NEWS_LABEL: Record<NewsType, string> = { ARTICLE: "Article", ADVERTISEMENT: "Advertisement", MASTHEAD: "Name / logo", RUNNING_HEAD: "Page header", SECTION: "Department", TABLE_OF_CONTENTS: "Table of contents", IMPRINT: "Imprint", ILLUSTRATION: "Illustration", NOISE: "Noise", PUBLICATION_INFO: "Publication info" };
const NEWS_ICON: Record<NewsType, TagIcon> = { ARTICLE: "article", ADVERTISEMENT: "megaphone", MASTHEAD: "masthead", RUNNING_HEAD: "header", SECTION: "folder", TABLE_OF_CONTENTS: "list", IMPRINT: "stamp", ILLUSTRATION: "image", NOISE: "noise", PUBLICATION_INFO: "info" };
/** Department, Imprint and TOC are no longer offered by default (NewsPage explains why);
 *  they stay in the library so a project can bring them back. */
export const NEWS_RETIRED: readonly NewsType[] = ["SECTION", "IMPRINT", "TABLE_OF_CONTENTS"];

/** Every built-in tag of a kind — the library the schema editor offers. Newspaper types
 *  keep their old digits (1–9 over NEWS_TYPES). */
export function tagLibrary(kind: Kind): TagDef[] {
  if (kind === "book") {
    return BOOK_ROLES.map((r) => ({ id: r, label: BOOK_LABEL[r], base: r, icon: BOOK_ICON[r], hue: BOOK_HUE[r][0], chroma: BOOK_HUE[r][1], key: BOOK_KEY[r] }));
  }
  if (kind === "newspaper") {
    return NEWS_TYPES.map((t, i) => ({ id: t.toLowerCase(), label: NEWS_LABEL[t], base: t, icon: NEWS_ICON[t], hue: NEWS_HUE[t][0], chroma: NEWS_HUE[t][1], key: i < 9 && !NEWS_RETIRED.includes(t) ? String(i + 1) : "" }));
  }
  return TEXT_LIBRARY.map((t) => ({ ...t, attrs: t.attrs?.map((a) => ({ ...a, values: a.values ? [...a.values] : undefined })) }));
}

/** The schema a new project of this kind starts with: what the engine offered before. */
export function defaultTags(kind: Kind): TagDef[] {
  const lib = tagLibrary(kind);
  if (kind === "text") return lib.filter((t) => t.popular);
  return kind === "newspaper" ? lib.filter((t) => !NEWS_RETIRED.includes(t.base as NewsType)) : lib;
}

/** A built-in tag is its base: nothing extra goes into the record. A text tag always
 *  writes its own id (the standoff record names the tag, the TEI the element). */
export function isBuiltin(t: Pick<TagDef, "id" | "base">, kind: Kind): boolean {
  if (kind === "text") return false;
  return kind === "newspaper" ? t.id === t.base.toLowerCase() : t.id === t.base;
}

/** A working set's legacy `roles` list (book) as a schema: same order, titles and keys. */
export function tagsFromRoles(roles: RoleSpec[]): TagDef[] {
  const lib = new Map(tagLibrary("book").map((t) => [t.id, t]));
  const out: TagDef[] = [];
  for (const r of roles) {
    const base = lib.get(r.role);
    if (!base || out.some((t) => t.id === r.role)) continue;
    out.push({ ...base, label: r.title?.trim() ? r.title.trim() : base.label, key: r.key !== undefined ? r.key.toUpperCase() : base.key });
  }
  return out;
}

/** The tag a unit shows: its own when it still stands for the unit's base, else the
 *  schema's tag for the base, else a library tag (a role the schema left out still loads). */
export function tagFor(tags: TagDef[], kind: Kind, base: string, tagId?: string | null): TagDef {
  if (tagId) {
    const own = tags.find((t) => t.id === tagId && t.base === base);
    if (own) return own;
  }
  return tags.find((t) => t.base === base && isBuiltin(t, kind)) ?? tags.find((t) => t.base === base) ?? tagLibrary(kind).find((t) => t.base === base) ?? { id: base, label: base, base, icon: "tag", hue: 72, chroma: 0.1, key: "" };
}

export function tagColor(t: Pick<TagDef, "hue" | "chroma">, alpha?: number): string {
  return `oklch(0.60 ${t.chroma} ${t.hue}${alpha == null ? "" : ` / ${alpha}`})`;
}
export function tagInk(t: Pick<TagDef, "hue">): string {
  return `oklch(0.36 0.06 ${t.hue})`;
}

/** Problems that would make a schema unusable; empty when it is fine. */
export function validateTags(tags: TagDef[], kind: Kind): string[] {
  const errs: string[] = [];
  const ok = new Set(bases(kind));
  const ids = new Set<string>();
  const keys = new Map<string, string>();
  for (const t of tags) {
    if (!TAG_ID.test(t.id)) errs.push(`tag id ${JSON.stringify(t.id)}: lower-case letters, digits and _ only`);
    if (ids.has(t.id)) errs.push(`tag id ${t.id} is used twice`);
    ids.add(t.id);
    if (!t.label?.trim()) errs.push(`tag ${t.id} has no label`);
    if (kind === "text") {
      if (!TEI_BASE.test(t.base ?? "")) errs.push(`tag ${t.id}: base ${JSON.stringify(t.base)} is not a TEI element name (persName, seg[@type='x'])`);
      errs.push(...validateAttrs(t));
      if (t.scope !== undefined && t.scope !== "document") errs.push(`tag ${t.id}: scope must be "document" or absent`);
      if (t.color !== undefined && !/^#[0-9a-fA-F]{6}$/.test(t.color)) errs.push(`tag ${t.id}: color must be #rrggbb`);
    } else if (!ok.has(t.base)) errs.push(`tag ${t.id}: ${JSON.stringify(t.base)} is not a ${kind} ${kind === "book" ? "role" : "type"}`);
    if (!(TAG_ICONS as readonly string[]).includes(t.icon)) errs.push(`tag ${t.id}: unknown icon ${JSON.stringify(t.icon)}`);
    if (!(t.hue >= 0 && t.hue <= 360) || !(t.chroma >= 0 && t.chroma <= 0.4)) errs.push(`tag ${t.id}: colour out of range`);
    if (t.key) {
      const c = normalizeChord(t.key);
      if (!c) errs.push(`tag ${t.id}: ${JSON.stringify(t.key)} is not a key`);
      else if (keys.has(c)) errs.push(`tag ${t.id}: key ${c} is already ${keys.get(c)}`);
      else keys.set(c, t.id);
    }
  }
  if (!tags.length) errs.push("the schema needs at least one tag");
  return errs;
}

function validateAttrs(t: TagDef): string[] {
  if (t.attrs === undefined) return [];
  if (!Array.isArray(t.attrs)) return [`tag ${t.id}: attrs must be a list`];
  const errs: string[] = [];
  const ids = new Set<string>();
  for (const a of t.attrs) {
    if (!a || !/^[A-Za-z_][A-Za-z0-9_]{0,47}$/.test(a.id ?? "")) { errs.push(`tag ${t.id}: attribute id ${JSON.stringify(a?.id)} must be letters, digits, _`); continue; }
    if (ids.has(a.id)) errs.push(`tag ${t.id}: attribute ${a.id} is used twice`);
    ids.add(a.id);
    if (!["text", "number", "enum"].includes(a.kind)) errs.push(`tag ${t.id}: attribute ${a.id}: kind must be text, number or enum`);
    if (typeof a.tei !== "string" || !a.tei) errs.push(`tag ${t.id}: attribute ${a.id}: tei is required (e.g. "@type")`);
    if (a.kind === "enum" && (!Array.isArray(a.values) || !a.values.length || a.values.some((v) => typeof v !== "string"))) errs.push(`tag ${t.id}: attribute ${a.id}: an enum needs a list of string values`);
  }
  return errs;
}

export const KINDS: readonly Kind[] = ["book", "newspaper", "text"];

export function validateProject(p: ProjectDef): string[] {
  const errs: string[] = [];
  if (!PROJECT_ID.test(p.id)) errs.push(`project id ${JSON.stringify(p.id)}: lower-case letters, digits, - _ . only`);
  if (!p.label?.trim()) errs.push("the project needs a name");
  if (!KINDS.includes(p.kind)) errs.push(`unknown kind ${JSON.stringify(p.kind)} (book, newspaper or text)`);
  if (p.direction !== undefined && !["rtl", "ltr", "auto"].includes(p.direction)) errs.push(`direction must be rtl, ltr or auto`);
  if (!Array.isArray(p.worksets)) errs.push("worksets must be a list");
  errs.push(...validateTags(p.tags ?? [], p.kind));
  for (const [cmd, chords] of Object.entries(p.keymap ?? {})) {
    if (!Array.isArray(chords)) { errs.push(`keymap ${cmd}: must be a list of keys`); continue; }
    for (const c of chords) if (!normalizeChord(c)) errs.push(`keymap ${cmd}: ${JSON.stringify(c)} is not a key`);
  }
  return errs;
}

/** A tag id from a label: `Responsum heading` -> `responsum_heading`, unique in `taken`. */
export function slugTag(label: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const base = label.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "tag";
  const stem = /^[a-z0-9]/.test(base) ? base : `t_${base}`;
  let id = stem, n = 2;
  while (used.has(id)) id = `${stem}_${n++}`;
  return id;
}

export function slugProject(label: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const stem = label.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50) || "project";
  let id = stem, n = 2;
  while (used.has(id)) id = `${stem}-${n++}`;
  return id;
}

/* ── which project a working set belongs to ────────────────────────────────────────── */

export interface WorksetRef {
  id: string;
  kind: Kind;
  label?: string;
  roles?: RoleSpec[];
}

const KIND_DEFAULT: Record<Kind, { id: string; label: string; description: string }> = {
  newspaper: { id: "newspaper-sections", label: "Newspaper sectioning", description: "Newspaper pages: layout blocks grouped into articles and advertisements." },
  book: { id: "page-regions", label: "Page regions", description: "Scanned pages: regions drawn or repaired, given a tag, streamed and ordered." },
  text: { id: "text-spans", label: "Text spans", description: "Plain-text documents: spans tagged, reviewed and exported as TEI." },
};

/**
 * The projects as the app shows them: every persisted project, then derived ones for the
 * working sets no project owns — one per kind, and one per book working set that carries
 * its own `roles` list (its schema already differs). Derived projects are what the app
 * did before projects existed; saving one writes it to projects.json.
 */
export function withDerived(persisted: ProjectDef[], worksets: WorksetRef[]): (ProjectDef & { synthesized: boolean })[] {
  const out: (ProjectDef & { synthesized: boolean })[] = persisted.map((p) => ({ ...p, synthesized: false }));
  const owned = new Set(persisted.flatMap((p) => p.worksets));
  const taken = new Set(persisted.map((p) => p.id));
  const free = worksets.filter((w) => !owned.has(w.id));
  const fresh = (id: string) => { const v = slugProject(id, taken); taken.add(v); return v; };
  for (const kind of ["newspaper", "book", "text"] as Kind[]) {
    const mine = free.filter((w) => w.kind === kind && !(kind === "book" && w.roles?.length));
    if (!mine.length) continue;
    const d = KIND_DEFAULT[kind];
    out.push({ id: fresh(d.id), label: d.label, description: d.description, kind, worksets: mine.map((w) => w.id), tags: defaultTags(kind), keymap: {}, synthesized: true });
  }
  for (const w of free.filter((x) => x.kind === "book" && x.roles?.length)) {
    out.push({ id: fresh(w.id), label: w.label ?? w.id, description: "Derived from the working set's own block-type list.", kind: "book", worksets: [w.id], tags: tagsFromRoles(w.roles!), keymap: {}, synthesized: true });
  }
  return out;
}

export function projectOf(projects: (ProjectDef & { synthesized?: boolean })[], w: WorksetRef): ResolvedProject {
  const p = projects.find((x) => x.kind === w.kind && x.worksets.includes(w.id));
  if (p) return { id: p.id, label: p.label, kind: p.kind, tags: p.tags, keymap: p.keymap ?? {}, synthesized: !!p.synthesized };
  const tags = w.kind === "book" && w.roles?.length ? tagsFromRoles(w.roles) : defaultTags(w.kind);
  return { id: KIND_DEFAULT[w.kind].id, label: KIND_DEFAULT[w.kind].label, kind: w.kind, tags, keymap: {}, synthesized: true };
}

/* ── chords ────────────────────────────────────────────────────────────────────────── */

// A chord is the modifiers in a fixed order and one key: `Ctrl+Shift+K`, `Shift+/`,
// `ArrowDown`, `1`. Letters and digits are read by their physical key (`e.code`), so a
// Hebrew layout and Caps Lock leave them alone (see `keys.ts`); Ctrl and ⌘ are one
// modifier; punctuation is named by its unshifted character, so `?` is `Shift+/`.

const PUNCT_CODE: Record<string, string> = { Comma: ",", Period: ".", Slash: "/", Semicolon: ";", Quote: "'", Minus: "-", Equal: "=", BracketLeft: "[", BracketRight: "]", Backquote: "`", Backslash: "\\" };
const NAMED = new Set(["Enter", "Escape", "Tab", "Delete", "Backspace", "Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown", "Insert", ...Array.from({ length: 12 }, (_, i) => `F${i + 1}`)]);
const SHIFTED: Record<string, string> = { "!": "1", "@": "2", "#": "3", $: "4", "%": "5", "^": "6", "&": "7", "*": "8", "(": "9", ")": "0", "<": ",", ">": ".", "?": "/", ":": ";", '"': "'", _: "-", "+": "=", "{": "[", "}": "]", "~": "`", "|": "\\" };
const ALIAS: Record<string, string> = { esc: "Escape", del: "Delete", return: "Enter", space: "Space", up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight", "↑": "ArrowUp", "↓": "ArrowDown", "←": "ArrowLeft", "→": "ArrowRight", "⏎": "Enter", pgup: "PageUp", pgdn: "PageDown" };

/** The chord a key press is, or null for a bare modifier. */
export function chordOf(e: KeyInput): string | null {
  if (["Shift", "Control", "Alt", "Meta", "CapsLock", "AltGraph"].includes(e.key)) return null;
  let key: string | null = null;
  const letter = /^Key([A-Z])$/.exec(e.code);
  const digit = /^(?:Digit|Numpad)([0-9])$/.exec(e.code);
  if (letter) key = letter[1];
  else if (digit) key = digit[1];
  else if (PUNCT_CODE[e.code]) key = PUNCT_CODE[e.code];
  else if (e.key === " ") key = "Space";
  else if (NAMED.has(e.key)) key = e.key;
  else if (e.key.length === 1) {
    // No physical code to go by (synthetic events): undo the shift the character carries.
    if (SHIFTED[e.key]) return join(e, true, SHIFTED[e.key]);
    key = e.key.toUpperCase();
  } else key = e.key;
  return join(e, e.shiftKey, key);
}

function join(m: Pick<KeyInput, "ctrlKey" | "metaKey" | "altKey">, shift: boolean, key: string): string {
  return [m.ctrlKey || m.metaKey ? "Ctrl" : "", m.altKey ? "Alt" : "", shift ? "Shift" : "", key].filter(Boolean).join("+");
}

/** A chord as written in a config, normalised; null when it is not one. */
export function normalizeChord(s: string): string | null {
  if (typeof s !== "string") return null;
  const raw = s.trim();
  if (!raw) return null;
  // `+` alone, or `Shift++`, is the plus key
  const parts = raw === "+" ? ["+"] : raw.endsWith("++") ? [...raw.slice(0, -2).split("+"), "+"] : raw.split("+");
  let ctrl = false, alt = false, shift = false, key: string | null = null;
  for (const p0 of parts) {
    const p = p0.trim();
    const l = p.toLowerCase();
    if (["ctrl", "control", "cmd", "meta", "⌘", "mod"].includes(l)) ctrl = true;
    else if (["alt", "option", "opt", "⌥"].includes(l)) alt = true;
    else if (["shift", "⇧"].includes(l)) shift = true;
    else if (key !== null || !p) return null;
    else key = p;
  }
  if (key === null) return null;
  if (ALIAS[key.toLowerCase()]) key = ALIAS[key.toLowerCase()];
  else if (SHIFTED[key]) { shift = true; key = SHIFTED[key]; }
  else if (key.length === 1) key = key.toUpperCase();
  else {
    const named = [...NAMED].find((n) => n.toLowerCase() === key!.toLowerCase());
    if (!named) return null;
    key = named;
  }
  if (key.length === 1 && !/^[A-Z0-9,./;'\-=[\]`\\]$/.test(key)) return null;
  return join({ ctrlKey: ctrl, metaKey: false, altKey: alt }, shift, key);
}

/** A chord as printed beside a command: `⇧A`, `Ctrl+⇧G`, `↓`. */
export function formatChord(c: string): string {
  const parts = c.split("+");
  const key = parts.pop() ?? "";
  const shown = ({ ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→", Escape: "Esc", Delete: "Del", Enter: "Enter", Space: "Space", Backspace: "⌫" } as Record<string, string>)[key] ?? key;
  const mods = parts.map((m) => (m === "Shift" ? "⇧" : m === "Alt" ? "Alt+" : "Ctrl+")).join("");
  return `${mods}${shown}`;
}

/** Anything with an id and default chords: a command. */
export interface Bindable {
  id: string;
  defaultKeys?: string[];
}

/** The chords a command answers to under a project's key map. */
export function keysOf(cmd: Bindable, keymap: Record<string, string[]>): string[] {
  const over = keymap[cmd.id];
  const list = over ?? cmd.defaultKeys ?? [];
  return list.map(normalizeChord).filter((c): c is string => !!c);
}

export interface Bindings {
  /** chord -> command id; the first command to claim a chord keeps it. */
  byChord: Map<string, string>;
  /** Chords some command answers to by default but that the key map moved away. */
  released: Set<string>;
  /** chord -> every command that wanted it, where more than one did. */
  conflicts: Map<string, string[]>;
}

export function bindings(cmds: Bindable[], keymap: Record<string, string[]>): Bindings {
  const byChord = new Map<string, string>();
  const claims = new Map<string, string[]>();
  for (const c of cmds) {
    for (const k of keysOf(c, keymap)) {
      claims.set(k, [...(claims.get(k) ?? []), c.id]);
      if (!byChord.has(k)) byChord.set(k, c.id);
    }
  }
  const released = new Set<string>();
  for (const c of cmds) for (const k of (c.defaultKeys ?? []).map(normalizeChord)) if (k && !byChord.has(k)) released.add(k);
  const conflicts = new Map([...claims].filter(([, ids]) => new Set(ids).size > 1).map(([k, ids]) => [k, [...new Set(ids)]]));
  return { byChord, released, conflicts };
}
