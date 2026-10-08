// JSON Schemas for projects.json and worksets.json, generated from the code's own lists
// (roles, types, icons), so an editor or an agent validates against what the app accepts.
//
//   npx tsx scripts/schemas.ts        rewrites schema/*.schema.json
//
// `scripts/schemas.test.ts` fails when the committed files differ from what this builds.
// The app's validators (`validateProject`, `readManifest`) remain the authority; the
// schemas catch shape errors before the app is started.

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { TAG_ICONS } from "../src/app/_lib/project";
import { BOOK_ROLES, NEWS_TYPES } from "../src/app/_lib/types";

const CHORD = { type: "string", description: "A key chord: M, Shift+1, Ctrl+Alt+T, ArrowDown, Space…" };

export function buildSchemas(): Record<string, unknown> {
  const tag = {
    type: "object",
    required: ["id", "label", "base"],
    additionalProperties: false,
    properties: {
      id: { type: "string", pattern: "^[a-z0-9][a-z0-9_]{0,47}$" },
      label: { type: "string", minLength: 1 },
      base: { type: "string", description: `book: a page role (${BOOK_ROLES.join(", ")}). newspaper: a section type (${NEWS_TYPES.join(", ")}). text: a TEI element name, optionally with one predicate, e.g. seg[@type='x'].` },
      key: { ...CHORD, description: "The tag's key; empty for none. Text projects read only a single letter or digit." },
      icon: { enum: [...TAG_ICONS] },
      hue: { type: "number", minimum: 0, maximum: 360 },
      chroma: { type: "number", minimum: 0, maximum: 0.4 },
      description: { type: "string" },
      labelAlt: { type: "string", description: "text: a second name shown beside the label" },
      color: { type: "string", pattern: "^#[0-9a-fA-F]{6}$", description: "text: overrides hue and chroma" },
      scope: { const: "document", description: "text: the tag classifies a whole document" },
      popular: { type: "boolean", description: "text: offer in the selection menu" },
      attrs: {
        type: "array",
        description: "text: fields filled on a span",
        items: {
          type: "object",
          required: ["id", "kind", "label", "tei"],
          additionalProperties: false,
          properties: {
            id: { type: "string", pattern: "^[A-Za-z_][A-Za-z0-9_]{0,47}$" },
            kind: { enum: ["text", "number", "enum"] },
            label: { type: "string" },
            tei: { type: "string", description: "where it lands in TEI, e.g. @when" },
            values: { type: "array", items: { type: "string" }, minItems: 1, description: "required for kind enum" },
          },
        },
      },
    },
  };
  const projects = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "https://github.com/shprintsin/sectioner/schema/projects.schema.json",
    title: "Sectioner projects.json",
    type: "object",
    required: ["projects"],
    properties: {
      $schema: { type: "string" },
      version: { const: 1 },
      projects: {
        type: "array",
        items: {
          type: "object",
          required: ["id", "label", "kind", "worksets", "tags"],
          additionalProperties: false,
          properties: {
            id: { type: "string", pattern: "^[a-z0-9][a-z0-9_.-]{0,62}$" },
            label: { type: "string", minLength: 1 },
            kind: { enum: ["book", "newspaper", "text"] },
            description: { type: "string" },
            direction: { enum: ["rtl", "ltr", "auto"], description: "text projects only" },
            worksets: { type: "array", items: { type: "string" }, uniqueItems: true },
            tags: { type: "array", minItems: 1, items: tag },
            keymap: { type: "object", additionalProperties: { type: "array", items: CHORD } },
            created: { type: "string" },
            updated: { type: "string" },
          },
        },
      },
    },
  };
  const files = Object.fromEntries(
    ["image", "layout", "proposal", "ocr", "existing", "text", "corpus"].map((k) => [k, { type: "string", description: "a path relative to root; {id} is the page or document id" }]),
  );
  const worksets = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "https://github.com/shprintsin/sectioner/schema/worksets.schema.json",
    title: "Sectioner worksets.json",
    type: "object",
    required: ["worksets"],
    properties: {
      $schema: { type: "string" },
      worksets: {
        type: "array",
        items: {
          type: "object",
          required: ["id", "kind", "root", "files"],
          additionalProperties: false,
          properties: {
            id: { type: "string", pattern: "^[A-Za-z0-9_.-]{1,80}$" },
            kind: { enum: ["book", "newspaper", "text"] },
            label: { type: "string" },
            root: { type: "string", description: "relative to $SECTIONER_ROOT (default: the data folder), or absolute" },
            files: { type: "object", additionalProperties: false, properties: files },
            pages: {
              type: "array",
              items: {
                type: "object",
                required: ["id"],
                properties: { id: { type: "string", pattern: "^[A-Za-z0-9_.-]{1,80}$" }, dir: { type: "string" }, files: { type: "object", properties: files, additionalProperties: false }, output: { type: "string" }, sessionWorkset: { type: "string" } },
              },
            },
            discover: { enum: ["image", "layout", "text"] },
            output: { type: "string" },
            labels: { type: "boolean" },
            hidden: { type: "boolean" },
            roles: { type: "array", description: "legacy (book): use a project's tags instead" },
          },
          allOf: [
            { if: { properties: { kind: { const: "book" } } }, then: { properties: { files: { required: ["image"] } } } },
            { if: { properties: { kind: { const: "newspaper" } } }, then: { properties: { files: { required: ["image", "layout"] } } } },
            { if: { properties: { kind: { const: "text" } } }, then: { properties: { files: { oneOf: [{ required: ["text"] }, { required: ["corpus"] }] } } } },
          ],
        },
      },
    },
  };
  return { "projects.schema.json": projects, "worksets.schema.json": worksets };
}

export function serialise(v: unknown): string {
  return JSON.stringify(v, null, 2) + "\n";
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "schema");
  for (const [name, s] of Object.entries(buildSchemas())) writeFileSync(join(dir, name), serialise(s), "utf8");
  console.log(`wrote ${dir}`);
}
