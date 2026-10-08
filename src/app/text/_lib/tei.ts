// TEI P5 serialisation, and the variables table.
//
// Two exports of the same annotations, because they answer different questions:
//
//   **standoff** — `<standOff>` with one `<span from to>` per annotation. Lossless. Every
//   annotation survives, overlaps and all, because a standoff span is a pointer and
//   pointers may cross freely.
//
//   **inline** — the marks nested inside the text, which is what most TEI tooling expects
//   and what a reader wants to see. It cannot represent an overlap: XML is a tree. Where
//   two spans cross, the outer one is emitted and the inner is reported, never silently
//   dropped — a lossy export that does not say what it lost is worse than no export.
//
// The gershayim hazard applies here too: `''` is two characters, and `escapeXml` must not
// touch an apostrophe in text content. It escapes `&`, `<` and `>` only.

import { SEG_SEP } from "./corpus";
import { piecesIn } from "./pieces";
import type { Ann, Project, Section, TagDef } from "./types";
import { variables } from "./variables";

/** Escape for an XML **text node**: the three characters that can end one. */
export function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Escape for a double-quoted XML **attribute value**. */
export function escapeAttr(s: string): string {
  return escapeXml(s).replace(/"/g, "&quot;");
}

/**
 * The element name out of a TagDef's `tei`.
 *
 * A target is not always a single element name. Two of the fifteen tags describe theirs
 * in prose — `quote + bibl`, `opener / div / closer` — because one annotation genuinely
 * maps to more than one element depending on where it sits. The first name is taken and
 * the rest recorded in the standoff export, which can say what a tree cannot.
 */
export function teiElement(tei: string): string {
  return /^[\w:.-]+/.exec(tei.trim())?.[0] ?? "seg";
}

/**
 * The attributes a TagDef's `tei` declares beyond the element name:
 * `seg type="ruling"` → ` type="ruling"`.
 *
 * Only real `name="value"` pairs count. Taking "everything after the first space" — the
 * obvious reading — turns `opener / div / closer` into the open tag
 * `<opener / div / closer>` against a close tag of `</opener>`, which is not XML at all
 * and which no schema check downstream would have blamed on this function.
 */
export function teiPredicate(tei: string): string {
  const rest = tei.trim().slice(teiElement(tei).length);
  const pairs: string[] = [...(rest.match(/[\w:.-]+="[^"]*"/g) ?? [])];
  // The XPath-like form a project config uses: `seg[@type='ruling']`.
  for (const m of rest.matchAll(/\[@([\w:.-]+)='([^']*)'\]/g)) pairs.push(`${m[1]}="${escapeAttr(m[2])}"`);
  return pairs.length ? " " + pairs.join(" ") : "";
}

/** The attributes the standoff `<span>` writes itself; a tag field with one of these names
 *  goes into a `<note>` inside the span instead of a second, invalid attribute. */
const SPAN_OWN = new Set(["xml:id", "from", "to", "type", "ana", "resp", "source", "change", "cert", "corresp"]);

function attrsOf(a: Ann, t: TagDef, skip?: Set<string>): string {
  const out: string[] = [];
  for (const def of t.attrs) {
    const v = a.attrs[def.id];
    if (v === undefined || v === "") continue;
    if (skip?.has(def.tei.slice(1))) continue;
    // `@ana`, `@when`, `@ref` — the tag set says where each attribute lands. Anything
    // that is not an @-attribute (a `bibl`, an `element`) is not expressible here and
    // is carried in the standoff export instead.
    if (def.tei.startsWith("@")) out.push(`${def.tei.slice(1)}="${escapeAttr(String(v))}"`);
  }
  if (a.uncertain) out.push('cert="low"');
  return out.length ? " " + out.join(" ") : "";
}

const HEADER = (title: string, version: string, n: number) =>
  `  <teiHeader>
    <fileDesc>
      <titleStmt><title>${escapeXml(title)}</title></titleStmt>
      <publicationStmt><p>Exported from Sectioner</p></publicationStmt>
      <sourceDesc><p>${n} document${n === 1 ? "" : "s"}</p></sourceDesc>
    </fileDesc>
    <encodingDesc>
      <appInfo>
        <application ident="sectioner-text" version="${escapeAttr(version)}">
          <label>tag set ${escapeXml(version)}</label>
        </application>
      </appInfo>
    </encodingDesc>
  </teiHeader>`;

/** Tag fields whose TEI name the standoff `<span>` already uses, as `<note type="name">`. */
function collidingNotes(a: Ann, t: TagDef): string {
  return t.attrs
    .filter((d) => d.tei.startsWith("@") && SPAN_OWN.has(d.tei.slice(1)) && a.attrs[d.id] !== undefined && a.attrs[d.id] !== "")
    .map((d) => `<note type="${escapeAttr(d.tei.slice(1))}">${escapeXml(String(a.attrs[d.id]))}</note>`)
    .join("");
}

/* ── standoff ──────────────────────────────────────────────────────────────────────── */

export interface ExportInput {
  project: Project;
  sections: Section[];
  anns: Ann[];
  tags: TagDef[];
  version: string;
}

/**
 * `<standOff>` — the lossless form.
 *
 * Rejections are included and marked. They are evidence about the model that made them
 * (SPEC §3.5), and an export that dropped them would make an agent's error rate
 * unrecoverable from the archive.
 */
export function exportStandoff(input: ExportInput): string {
  const { sections, anns, tags, version, project } = input;
  const byId = new Map(tags.map((t) => [t.id, t]));

  const body = sections
    .map((sec) => {
      const mine = anns.filter((a) => a.doc === sec.doc_id);
      const spans = mine
        .map((a) => {
          const t = byId.get(a.tag);
          const el = t ? teiElement(t.tei) : "seg";
          const range =
            a.start === null
              ? ' type="document"'
              : ` from="#char${a.start}" to="#char${a.end}"`;
          const attrs = t ? attrsOf(a, t, SPAN_OWN) : "";
          const quote = a.quote === null ? "" : `<quote>${escapeXml(a.quote)}</quote>`;
          const notes = t ? collidingNotes(a, t) : "";
          return (
            `        <span xml:id="${escapeAttr(a.id)}"${range} ana="#${escapeAttr(a.tag)}"` +
            ` resp="#${escapeAttr(a.prov)}" source="#${escapeAttr(a.origin)}"` +
            ` change="${escapeAttr(a.status)}"${a.conf === null ? "" : ` cert="${a.conf.toFixed(2)}"`}` +
            `${attrs} corresp="#${escapeAttr(el)}">${quote}${notes}</span>`
          );
        })
        .join("\n");
      return `      <spanGrp type="annotations" corresp="#${escapeAttr(sec.doc_id)}">
${spans}
      </spanGrp>`;
    })
    .join("\n");

  const texts = sections
    .map(
      (sec) =>
        `    <text xml:id="${escapeAttr(sec.doc_id)}"><body><p>${sec.text.split(SEG_SEP).map(escapeXml).join(`</p>${SEG_SEP}<p>`)}</p></body></text>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<teiCorpus xmlns="http://www.tei-c.org/ns/1.0">
${HEADER(project.name, version, sections.length)}
${texts}
    <standOff>
${body}
    </standOff>
</teiCorpus>
`;
}

/* ── inline ────────────────────────────────────────────────────────────────────────── */

export interface InlineResult {
  xml: string;
  /** Annotations that could not be nested, with the annotation they crossed. */
  dropped: { id: string; tag: string; crosses: string }[];
}

/** Two spans overlap without either containing the other. */
function crosses(a: Ann, b: Ann): boolean {
  if (a.start === null || a.end === null || b.start === null || b.end === null) return false;
  if (a.doc !== b.doc) return false;
  return a.start < b.start && b.start < a.end && a.end < b.end;
}

/**
 * Inline TEI, nesting what nests and reporting what does not.
 *
 * The kept/dropped decision is greedy over the corpus order, so it is deterministic and
 * the same annotation is dropped on every run — which is what makes `dropped` a stable
 * thing to act on rather than a lottery.
 */
export function exportInline(input: ExportInput): InlineResult {
  const { sections, anns, tags, version, project } = input;
  const byId = new Map(tags.map((t) => [t.id, t]));
  const dropped: InlineResult["dropped"] = [];

  const texts = sections.map((sec) => {
    const all = anns.filter(
      (a) => a.doc === sec.doc_id && a.start !== null && a.status !== "rejected",
    );

    const keep: Ann[] = [];
    for (const a of all) {
      const clash = keep.find((b) => crosses(a, b) || crosses(b, a));
      if (clash) {
        dropped.push({ id: a.id, tag: a.tag, crosses: clash.id });
        continue;
      }
      keep.push(a);
    }

    // The same boundary sweep the reader uses. One algorithm for what the screen shows
    // and what the file contains, so the two can never disagree about where a mark ends.
    const pieces = piecesIn(sec.doc_id, 0, sec.text.length, keep, null);
    let out = "";
    let open: Ann[] = [];

    const openTag = (a: Ann) => {
      const t = byId.get(a.tag);
      const el = t ? teiElement(t.tei) : "seg";
      const pred = t ? teiPredicate(t.tei) : "";
      const attrs = t ? attrsOf(a, t) : "";
      return `<${el}${pred}${attrs} xml:id="${escapeAttr(a.id)}">`;
    };
    const closeTag = (a: Ann) => {
      const t = byId.get(a.tag);
      return `</${t ? teiElement(t.tei) : "seg"}>`;
    };

    for (const p of pieces) {
      // Outermost first here — the opposite of the reader, which wants the innermost
      // mark's colour. Nesting order is containment order.
      const want = [...p.cov].reverse();
      let shared = 0;
      while (shared < open.length && shared < want.length && open[shared].id === want[shared].id) {
        shared++;
      }
      for (let i = open.length - 1; i >= shared; i--) out += closeTag(open[i]);
      for (let i = shared; i < want.length; i++) out += openTag(want[i]);
      open = want;
      // A paragraph break becomes `</p><p>` where no element is open across it; inside an
      // open element it stays as the blank line it is, so the text is never altered.
      const chunk = escapeXml(sec.text.slice(p.s, p.e));
      out += open.length ? chunk : chunk.split(SEG_SEP).join(`</p>${SEG_SEP}<p>`);
    }
    for (let i = open.length - 1; i >= 0; i--) out += closeTag(open[i]);

    const docAnns = anns.filter((a) => a.doc === sec.doc_id && a.start === null && a.status !== "rejected");
    const docTags = docAnns.length ? ` ana="${docAnns.map((a) => "#" + escapeAttr(a.tag)).join(" ")}"` : "";
    // A document-scope tag's fields: one empty `<note>` per tag at the head of the body.
    const docNotes = docAnns
      .map((a) => {
        const t = byId.get(a.tag);
        return `<note type="${escapeAttr(a.tag)}"${t ? attrsOf(a, t, new Set(["type"])) : ""}/>`;
      })
      .join("");

    return `    <text xml:id="${escapeAttr(sec.doc_id)}"${docTags}>
      <body>${docNotes}<p>${out}</p></body>
    </text>`;
  });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<teiCorpus xmlns="http://www.tei-c.org/ns/1.0">
${HEADER(project.name, version, sections.length)}
${texts.join("\n")}
</teiCorpus>
`;
  return { xml, dropped };
}

/* ── variables.csv ─────────────────────────────────────────────────────────────────── */

/** RFC 4180: quote a field, and double any quote inside it. */
export function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/**
 * One row per section, keyed by `doc_id` so the table joins straight to `shut_units.csv`.
 *
 * The Hebrew title travels with it: a table of ids and numbers cannot be checked by a
 * human, and this project's convention is that the Hebrew original stays beside every
 * rendered field.
 */
export function exportVariablesCsv(sections: Section[], anns: Ann[]): string {
  if (sections.length === 0) return "";
  const cols = variables(sections[0].doc_id, anns).map((v) => v.id);
  const head = ["doc_id", "title_he", ...cols].map(csvCell).join(",");
  const rows = sections.map((sec) =>
    [
      sec.doc_id,
      sec.title,
      ...variables(sec.doc_id, anns).map((v) => v.value),
    ]
      .map(csvCell)
      .join(","),
  );
  return [head, ...rows].join("\n") + "\n";
}
