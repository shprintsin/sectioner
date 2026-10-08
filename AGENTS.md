# Sectioner — manual for AI agents

You are operating Sectioner, a local annotation app. A person annotates **regions on page
images** (`book`, `newspaper`) or **spans in text** (`text`, exported as TEI). You set up
the jobs, prepare machine proposals, check progress and read results. The person does the
annotating in the browser.

Everything is files in the **data folder** (`./data`, or `$SECTIONER_DATA`). Two JSON
files configure it; the rest is the person's work.

```
data/projects.json   data/worksets.json        configuration — you may write these (rules below)
data/sessions/  data/output/                   the person's work — never edit or delete
data/export/                                   written by `export` — yours to read
data/_archive/                                 automatic backups of the configuration
```

## Rules

1. **Never send keystrokes or clicks to a real working set to "try" something.** Every
   action autosaves, and many single keys are tags (in a page project `0` may be "Date",
   `U` "Unclear"). To test the UI, make a throwaway data folder (`--data /tmp/x`, then
   `example`) and use that.
2. **Never edit, regenerate or delete `sessions/` or `output/`.** They are human work. To
   start a page over, ask the person.
3. **Never rename an `id` or delete an entry that has work**, in `worksets.json` or
   `projects.json`. Sessions and outputs are filed under the ids. To retire a working set,
   set `"hidden": true` on it. Add working sets with `add-images` / `add-texts`, and attach
   proposals with `attach-proposals`; these are the only changes `worksets.json` needs.
   The CLI and the app copy a file to `_archive/<file>.<date>.<sha>.json` before every
   write. Before editing either file by hand, copy it to
   `_archive/<file>.<YYYY-MM-DD>.json` yourself.
4. **Prefer the CLI to hand edits.** It runs the app's own validators. After any hand edit,
   run `npm run sectioner -- validate` and fix everything it reports before telling the
   person it is ready.
5. **Write UTF-8 without a BOM.** Keep Hebrew, Arabic or any other script as it is: never
   transliterate or "clean" the text being annotated, because offsets depend on it.
6. **Report what you verified.** Say which commands you ran and what they printed; don't
   claim a project works because the JSON looks right.

## Commands

Run from the repository folder (`npm install` once).

```
npm run sectioner -- init                       create the data folder (optional: add-* does it)
npm run sectioner -- example                    two small example projects
npm run sectioner -- add-images <folder> [--project ID] [--name LABEL] [--id ID] [--tags "Label=base,…"]
npm run sectioner -- add-newspapers <image folder> [--xml PAGE-XML folder] [--project ID] [--name LABEL] [--id ID]
npm run sectioner -- add-texts <folder|corpus.jsonl> [--project ID] [--name LABEL] [--id ID]
                       [--tags "Label=TEIelement,…"] [--proposals FILE] [--direction rtl|ltr|auto]
npm run sectioner -- attach-proposals <working set> <file.jsonl>
npm run sectioner -- validate                   exit code 1 if anything is wrong
npm run sectioner -- status                     progress bars per working set
npm run sectioner -- export <project> [--out DIR]
npm run sectioner -- schema [book|newspaper|text]   built-in tags, allowed bases, icons (JSON)
npm run dev                                     the app, http://127.0.0.1:3040
```

Every command takes `--data <dir>` to work on a data folder other than `./data`.

**Ids.**
- `add-*` makes the working set's id, and a new project's, from `--name`: lower-cased,
  with every run of other characters turned into `-` (`"Merchant letters"` →
  `merchant-letters`). `--id` sets it instead.
- A tag's id is its label lower-cased with `_` (`"Sum of money"` → `sum_of_money`).
- The command prints every tag's id, key and base. You need the tag ids for proposals.
- Page and document ids are the file names without the extension, or the `id` of each
  corpus line.

**Material is not copied.** A working set points at your folder where it is. A folder
inside the data folder is recorded by a relative path, any other by its absolute path. For
a self-contained data folder (one you can commit, zip or move), put the material under it
first, e.g. `data/material/letters/`, and add it from there.

## Recipes

### A new image job (scans, photographs of pages, forms)

1. Look at a few images first and agree the tags with the person. Each tag needs a
   **base**, the page role the box is written as:
   - `figure`, `table`, `noise` or `separator` when reading order does not matter
     (stamps, photos, ornaments);
   - `main_text`, `title`, `subtitle`, `footnote`, `auxiliary_text`, `signature`, `date`,
     `page_number`, `running_header`, `page_footer`, `commentary` or `summary` for text,
     which must be placed in a reading order before a page can be finished;
   - avoid `unknown` as a base: it demands a written reason on every box.
2. File names become page ids: only `[A-Za-z0-9_.-]`. Rename files with spaces first
   (ask before renaming someone's files).
3. Run:
   ```bash
   npm run sectioner -- add-images ./scans --name "Registers 1890" --tags "Entry=main_text,Marginal note=auxiliary_text,Stamp=figure,Heading=title"
   ```
4. `npm run sectioner -- validate`, then give the person the address the command printed.

`--tags` gives keys `1`…`9` in order. For better keys, colours or icons, edit the tags in
`projects.json` afterwards (see `docs/configuration.md`; `npm run sectioner -- schema
book` lists the icons), then validate.

### A newspaper job

The `newspaper` kind starts from a layout: blocks and their printed lines, which the
annotator groups into articles. Run eynollah (or any tool that writes PAGE-XML) on the
images first, then:

```bash
npm run sectioner -- add-newspapers ./scans --xml ./eynollah-out --name "Issue 12"
```

It converts each `<id>.xml` to `<id>.layout.json` beside the image, writing into the
image folder, and skips a page that already has one. A page with no layout is left out
and reported. The kind assumes right-to-left papers (`docs/newspaper/input.md`).

### A new text job

1. Documents: a folder of `.txt` (one per document, paragraphs separated by blank lines),
   or one JSONL with `{"id", "text", "title"?}` per line. Prefer JSONL when you produce the
   documents yourself, e.g. from a CSV or a database: ids stay stable and titles are
   kept.
2. Tags: each is a TEI element (`persName`, `placeName`, `orgName`, `date`, `term`,
   `quote`, `bibl`, `measure`, `foreign`, `title`, or `seg[@type='…']` for anything else).
   Fields go in `attrs`. A text tag's key must be a single letter or digit.
   - A key is read as a tag once text is selected, which is how spans are tagged anyway.
     So `P` for Person is fine.
   - With nothing selected, `c d n p u y` run commands instead (compact, done, next,
     previous, uncertain, accept). A tag that needs no selection, a document-level
     category, is reached from the palette (`Space`).
3. A **document-level category** (one value for the whole document):
   ```json
   { "id": "category", "label": "Letter type", "base": "classCode", "scope": "document",
     "attrs": [{ "id": "value", "kind": "enum", "label": "type", "tei": "@subtype",
                 "values": ["business", "family", "other"] }] }
   ```
   Keep `@subtype` (or `@n`) for the value. The standoff export writes the tag as
   `<span type="document" ana="#category" subtype="business">`, the inline export as
   `<note type="category" subtype="business"/>` at the head of the document. `@type` is
   taken by the span itself.
4. Run:
   ```bash
   npm run sectioner -- add-texts ./letters.jsonl --name "Letters" --tags "Person=persName,Place=placeName,Date=date"
   ```
   `--tags` gives each tag the first free letter of its label as its key. Add `attrs`,
   or change keys, in `projects.json` if needed, and validate.

### Pre-annotating texts with a model

This is where agents help most: you propose, the person reviews (`Y` / `N`).

1. Create the project first (`add-texts`, above), so the documents and the tag ids
   exist.
2. Read the documents the way the app does: `npm run sectioner -- export <project>`,
   then read `data/export/<project>/documents.jsonl`. Its `text` is exactly what the
   annotator sees.
3. For each span you propose, write one line to a JSONL **inside the working set's
   folder** (beside the documents):
   ```json
   {"doc": "letter-001", "tag": "person", "quote": "Samuel Levin", "confidence": 0.9}
   {"doc": "letter-001", "tag": "category", "attrs": {"value": "business"}}
   ```
   - Copy `quote` **verbatim** from the text, and do not compute offsets. A quote is found
     as a plain substring, so `Levin` also matches inside `Levinson` (useful for Hebrew
     prefixes, a trap in English). Quote enough words to be unique, or add `"nth": 2`
     for a later occurrence.
   - `tag` is a tag **id** of the project, and `attrs` uses that tag's field ids. An enum
     value must be one of its `values`, and a `number` field takes a JSON number.
   - A document-level tag takes no `quote` and no offsets, only `attrs`.
   - Name your run: `"layer": "agent:<model>-<date>"` (default: the file name).
4. Attach it: `npm run sectioner -- attach-proposals <working set> <file.jsonl>`.
   `add-texts --proposals FILE` does the same at creation.
5. Run `npm run sectioner -- validate`. It reports, per proposals file, how many lines
   are waiting for review, how many were already decided, and every line it could not
   place or whose fields do not fit, with the line number. Fix those until it says
   `all good`.
6. Tell the person to open the project and press **review**.

You may rewrite the proposals file at any time, for example after a better model. What
the person already accepted or rejected is never offered again. Matching is on the
document, the tag and the exact span, so a corrected span is offered as a new proposal.
Proposals for documents already marked done are still offered; filter them out yourself
if that matters. `export` merges the file too, so proposals show in `annotations.jsonl`
(as `proposed`) even before anyone opens the project.

### Pre-annotating page images

Write one JSON per page beside the images (format in `docs/formats.md`, "Machine
proposals"): `{"width", "height", "regions": [{"id", "role", "bbox_pixels": [x0, y0, x1,
y1]}]}`, with `width` and `height` equal to the image's pixel size. Add `"proposal":
"<template with {id}>"` to the working set's `files`. A proposal is used only the first
time a page is opened (a page with saved work keeps its work).

### Reading the results

```bash
npm run sectioner -- export <project>
```

- **Text:** `data/export/<project>/annotations.jsonl` (filter `status == "accepted"` for
  the gold set; `origin` tells a human-made span from an accepted proposal) and
  `documents.jsonl` (the text the offsets index, in UTF-16 code units, end-exclusive). TEI
  is in `tei-standoff.xml` and `tei-inline.xml`.
- **Images:** `data/export/<project>/<working set>.jsonl`, one finished page per line.
  Boxes are in `regions[].bbox_pixels` (image pixels) and `bbox` (0–1000 grid), in reading
  order. `role` is the base, and `tag` the project's tag id where it differs.

To measure a model against the person, join your proposals to `annotations.jsonl` on
`doc_id`, `tag`, `start` and `end`, using the line's `origin` (your `layer`). Each one
is `accepted`, `rejected`, or still `proposed`. Don't join on `ann_id`: a proposal's `p…`
id is numbered when the project loads and stays fixed only after the first save. The
person's own spans have `origin: "gold"`; they are what the model missed.

### Checking progress

`npm run sectioner -- status`. A page or document counts as **done** only when the person
marked it done. **In progress** means it has work but is not done. **Flagged** (newspaper
pages) means the annotator flagged the page for a second look (`F`, with a note).

### Sharing with a team

Keep the data folder in its own git repository (or on a shared drive) and start the app
with `SECTIONER_DATA=<path> npm run dev`. Give each person their own working sets: an
image page open in two tabs refuses the older tab's save, but a text project has no such
guard, and the last save wins. `SECTIONER_READONLY=1` gives a look-only instance.

## Checking your work

- `npm run sectioner -- validate`: configuration, files and proposals. It needs no
  server.
- `npm run sectioner -- export <project>`: the merged annotations as the app will show
  them. It also needs no server.
- Only with the app running (`npm run dev`): `GET /api/projects` (the projects as the app resolves them, tag
  defaults filled), `GET /api/worksets` (every working set with its pages and their
  status), `GET /text/api/annotations?project=<id>` (a text project's annotations, plus
  `errors` for proposals that could not be placed). These are read-only.
- A page that fails to load says why in the browser, and the same message is in the
  terminal running `npm run dev`.

## Troubleshooting

| symptom | cause |
|---|---|
| `add-images` skipped files | names outside `[A-Za-z0-9_.-]`, or a second image extension |
| a working set shows 0 pages | `root` is relative to the data folder (or `$SECTIONER_ROOT`), not to where you ran the command; or `{id}` sits in a folder name |
| a book page cannot be marked done | a text box has no reading order, or an `unknown` box has no reason: the page's checklist says which |
| proposals do not appear | the working set has no `files.proposal`, the quote is not verbatim, or the tag id is wrong: run `validate` |
| Hebrew shows left to right | set `"direction": "rtl"` on the text project (default `auto` counts letters) |
| text offsets look shifted | offsets index the paragraph-normalised text in `documents.jsonl`, not the original file |

## Changing the code

Next.js 15, React 19, TypeScript. No database, no network calls. `npm run check` (lint,
types, 600+ tests) must pass before and after a change.

```
src/server/store.ts                 the data folder and the write rules
src/app/_lib/project.ts             projects, tags, validation, key chords (pure, tested)
src/app/_server/worksets.ts         worksets.json, page discovery, paths
src/app/_server/projects.ts         projects.json read/write (archives first)
src/app/_server/newWorkset.ts       appending a working set
src/app/_components/                the image engines: BookPage, NewsPage, Shell, ProjectsHome
src/app/text/                       the text workbench; _server/textProject.ts loads and saves it
src/app/text/_lib/fromProject.ts    project tags ↔ workbench tags, documents
src/app/text/_lib/proposals.ts      text proposals: placing quotes
scripts/cli.ts                      the command line; scripts/schemas.ts the JSON Schemas
```

After changing the role, type or icon lists, run `npx tsx scripts/schemas.ts`. A test
fails until you do.
