// The 15 tag definitions, transcribed from `tagDefs()` in the design file.
//
// This is the whole vocabulary of the app: colour, hotkey, TEI target, attribute forms,
// nesting rules and the note on what fills the tag automatically all come from here, and
// nothing about a tag is hardcoded anywhere else. That is SPEC §4.4 — adding a tag is a
// data change, not a code change.
//
// The `contain` lists name tag ids, the pseudo-container "doc", and the four values of
// the `structure` tag's `part` attribute (opener / salute / body / closer), which are
// where a span actually sits in a letter.

import type { TagDef } from "./types";

export const TAG_DEFS: TagDef[] = [
  {
    id: "topic",
    en: "Topic",
    he: "נושא",
    color: "#8a6a1f",
    key: "t",
    tei: "head",
    proj: "both",
    popular: true,
    attrs: [],
    contain: ["doc"],
    auto: "rules: HEAD_LINE",
  },
  {
    id: "date",
    en: "Date",
    he: "תאריך",
    color: "#2f6b58",
    key: "d",
    tei: "date",
    proj: "both",
    popular: true,
    contain: ["opener", "body", "closer"],
    auto: "rules: DATELINE_OPENER",
    attrs: [
      { id: "year_he", kind: "text", label: "שנה עברית", tei: "@when-custom" },
      { id: "year_ce", kind: "number", label: "year (CE)", tei: "@when" },
      {
        id: "basis",
        kind: "enum",
        label: "basis",
        values: ["dateline", "colophon", "inferred"],
        tei: "@cert",
      },
    ],
  },
  {
    id: "place",
    en: "Place",
    he: "מקום",
    color: "#2c5d86",
    key: "m",
    tei: "placeName",
    proj: "both",
    popular: true,
    contain: ["person", "org", "opener", "body", "closer"],
    auto: "rules: STRONG_PLACE · gazetteer",
    attrs: [
      {
        id: "type",
        kind: "enum",
        label: "type",
        values: ["city", "region", "country", "institution"],
        tei: "@type",
      },
      {
        id: "role",
        kind: "enum",
        label: "role",
        values: ["writing_place", "residence", "case_place", "mentioned"],
        tei: "@role",
      },
      { id: "ref", kind: "vocab", label: "gazetteer ref", tei: "@ref" },
    ],
  },
  {
    id: "person",
    en: "Person",
    he: "אדם",
    color: "#8f3f55",
    key: "p",
    tei: "persName",
    proj: "both",
    popular: true,
    contain: ["opener", "body", "closer"],
    auto: "agent_prompt: prompts/person.md",
    attrs: [
      {
        id: "role",
        kind: "enum",
        label: "role",
        values: ["author", "recipient", "certifying_agent", "mentioned"],
        tei: "@role",
      },
      { id: "ref", kind: "vocab", label: "authority ref", tei: "@ref" },
    ],
  },
  {
    id: "org",
    en: "Organisation",
    he: "ארגון",
    color: "#5a4a86",
    key: "o",
    tei: "orgName",
    proj: "both",
    contain: ["person", "body"],
    auto: "—",
    attrs: [
      {
        id: "kind",
        kind: "enum",
        label: "kind",
        values: ["community", "court", "firm", "guild"],
        tei: "@type",
      },
    ],
  },
  {
    id: "measure",
    en: "Measure",
    he: "כמות/מטבע",
    color: "#9a6a24",
    key: "u",
    tei: "measure",
    proj: "both",
    contain: ["body"],
    auto: "rules: NUM_UNIT",
    attrs: [
      {
        id: "type",
        kind: "enum",
        label: "type",
        values: ["currency", "weight", "length", "count"],
        tei: "@type",
      },
      { id: "quantity", kind: "number", label: "quantity", tei: "@quantity" },
      { id: "unit", kind: "text", label: "unit", tei: "@unit" },
    ],
  },
  {
    id: "term",
    en: "Term",
    he: "מונח",
    color: "#3f6b2c",
    key: "x",
    tei: "term",
    proj: "both",
    contain: ["body"],
    auto: "vocab: vocab_terms.json",
    attrs: [
      {
        id: "type",
        kind: "enum",
        label: "type",
        values: ["industry", "halakhic", "commercial"],
        tei: "@type",
      },
      { id: "concept", kind: "vocab", label: "concept", tei: "@ref" },
    ],
  },
  {
    id: "ruling",
    en: "Ruling",
    he: "פסיקה",
    color: "#a4452a",
    key: "r",
    tei: 'seg type="ruling"',
    proj: "p-responsa",
    popular: true,
    contain: ["body"],
    auto: "agent_prompt: prompts/ruling.md",
    attrs: [
      {
        id: "rule",
        kind: "enum",
        label: "rule",
        values: ["permit", "forbid", "conditional", "defer"],
        tei: "@ana",
      },
      {
        id: "intensity",
        kind: "enum",
        label: "intensity",
        values: ["low", "normal", "high"],
        tei: "@cert",
      },
      {
        id: "temporal",
        kind: "enum",
        label: "temporal",
        values: ["past", "present", "future"],
        tei: "@when",
      },
    ],
  },
  {
    id: "quote",
    en: "Source quote",
    he: "ציטוט ממקור",
    color: "#4a6b7a",
    key: "q",
    tei: "quote + bibl",
    proj: "p-responsa",
    popular: true,
    contain: ["body"],
    auto: "rules: BIBL_REF",
    attrs: [{ id: "source", kind: "text", label: "source", tei: "bibl" }],
  },
  {
    id: "agent_group",
    en: "Economic group",
    he: "קבוצה כלכלית",
    color: "#6b5a3c",
    key: "g",
    tei: 'seg type="agentGroup"',
    proj: "both",
    contain: ["body"],
    auto: "agent_prompt: prompts/agents.md",
    attrs: [
      {
        id: "kind",
        kind: "enum",
        label: "kind",
        values: ["merchants", "jews", "guild", "community"],
        tei: "@subtype",
      },
    ],
  },
  {
    id: "structure",
    en: "Structure",
    he: "מבנה",
    color: "#9a9086",
    key: "k",
    tei: "opener / div / closer",
    proj: "both",
    contain: ["doc"],
    structural: true,
    auto: "rules: DATELINE_OPENER, SIGNATURE",
    attrs: [
      {
        id: "part",
        kind: "enum",
        label: "part",
        values: ["opener", "salute", "body", "closer"],
        tei: "element",
      },
    ],
  },
  {
    id: "doctype",
    en: "Document class",
    he: "סוג מסמך",
    color: "#6d6559",
    key: "",
    tei: "text@type",
    proj: "both",
    scope: "document",
    contain: [],
    auto: "—",
    attrs: [
      {
        id: "value",
        kind: "enum",
        label: "class",
        values: ["responsum", "letter", "approbation", "advertisement", "news"],
        tei: "@type",
      },
    ],
  },
  {
    id: "advertisement",
    en: "Advertisement",
    he: "מודעה",
    color: "#7a5a2a",
    key: "a",
    tei: 'div type="ad"',
    proj: "p-press",
    popular: true,
    contain: ["doc"],
    auto: "rules: AD_FRAME",
    attrs: [
      {
        id: "kind",
        kind: "enum",
        label: "kind",
        values: ["commercial", "personal", "official"],
        tei: "@subtype",
      },
    ],
  },
  {
    id: "masthead",
    en: "Masthead",
    he: "כותרת עיתון",
    color: "#4a4a4a",
    key: "h",
    tei: "titlePage",
    proj: "p-press",
    contain: ["doc"],
    auto: "rules: MASTHEAD",
    attrs: [],
  },
  {
    id: "price",
    en: "Price",
    he: "מחיר",
    color: "#846017",
    key: "v",
    tei: 'measure type="price"',
    proj: "p-press",
    popular: true,
    contain: ["advertisement"],
    auto: "rules: PRICE",
    attrs: [
      {
        id: "currency",
        kind: "enum",
        label: "currency",
        values: ["kop", "rub", "mark"],
        tei: "@unit",
      },
      { id: "amount", kind: "number", label: "amount", tei: "@quantity" },
    ],
  },
];

/** Colour of a tag the current tag set no longer defines. */
const ORPHAN_COLOR = "#8b8275";

/** Is this tag offered in the given project? */
export function inProject(t: TagDef, projectId: string): boolean {
  return t.proj === "both" || t.proj === projectId;
}

/**
 * Look a tag up by id, never failing.
 *
 * An annotation can outlive the tag that made it — a tag-set edit, or a file imported
 * from another project. SPEC §7.2 requires those to be shown as orphans rather than
 * dropped, so this returns a grey stand-in instead of throwing or returning undefined.
 */
export function tagById(tags: TagDef[], id: string): TagDef {
  const hit = tags.find((t) => t.id === id);
  if (hit) return hit;
  return {
    id,
    en: id,
    he: id,
    color: ORPHAN_COLOR,
    key: "",
    tei: "seg",
    proj: "both",
    contain: [],
    auto: "—",
    attrs: [],
  };
}

/** The tags shown in the floating menu at the selection: popular, keyed, first six. */
export function popularTags(tags: TagDef[], projectId: string): TagDef[] {
  return tags.filter((t) => inProject(t, projectId) && t.popular && t.key).slice(0, 6);
}

/** Default attribute values for a newly applied tag: the first value of each enum. */
export function defaultAttrs(t: TagDef): Record<string, string> {
  const out: Record<string, string> = {};
  for (const a of t.attrs) {
    if (a.kind === "enum" && a.values?.length) out[a.id] = a.values[0];
  }
  return out;
}
