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
3. **`worksets.json` is append-only.** Add entries; never rename an `id` or delete an
   entry that has work (hide it with `"hidden": true`). The CLI and the app archive the
   file before every write; if you edit it by hand, copy it to
   `_archive/worksets.<date>.json` first.
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
npm run sectioner -- init                       create the data folder
npm run sectioner -- example                    two small example projects
npm run sectioner -- add-images <folder> [--project ID] [--name LABEL] [--tags "Label=base,…"]
npm run sectioner -- add-texts <folder|corpus.jsonl> [--project ID] [--name LABEL]
                       [--tags "Label=TEIelement,…"] [--proposals FILE] [--direction rtl|ltr|auto]
npm run sectioner -- validate                   exit code 1 if anything is wrong
npm run sectioner -- status                     progress bars per working set
npm run sectioner -- export <project> [--out DIR]
npm run sectioner -- schema [book|newspaper|text]   built-in tags, allowed bases, icons (JSON)
npm run dev                                     the app, http://127.0.0.1:3040
```

Every command takes `--data <dir>` to work on a data folder other than `./data`.

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

### A new text job

1. Documents: a folder of `.txt` (one per document, paragraphs separated by blank lines),
   or one JSONL with `{"id", "text", "title"?}` per line. Prefer JSONL when you produce the
   documents yourself, e.g. from a CSV or a database: ids stay stable and titles are
   kept.
2. Tags: each is a TEI element (`persName`, `placeName`, `orgName`, `date`, `term`,
   `quote`, `bibl`, `measure`, `foreign`, `title`, or `seg[@type='…']` for anything else).
   Fields go in `attrs`; a whole-document category uses `"scope": "document"`. Give tags
   single-letter keys (`P`, `L`), avoiding `c d n p u y` for tags used without a
   selection.
3. Run:
   ```bash
   npm run sectioner -- add-texts ./letters.jsonl --name "Letters" --tags "Person=persName,Place=placeName,Date=date"
   ```
   `--tags` gives each tag the first free letter of its label as its key. Add `attrs`,
   or change keys, in `projects.json` if needed, and validate.

### Pre-annotating texts with a model

This is where agents help most: you propose, the person reviews (`Y` / `N`).

1. Read the documents the way the app does: export once (`npm run sectioner -- export
   <project>`) and use `documents.jsonl`. Its `text` is exactly what the annotator sees.
2. For each span you propose, write one line to a JSONL beside the documents:
   ```json
   {"doc": "letter-001", "tag": "person", "quote": "Samuel Levin", "confidence": 0.9}
   ```
   - Copy `quote` **verbatim** from the text. Do not compute offsets. If the phrase occurs
     more than once and you mean a later one, add `"nth": 2`.
   - `tag` is a tag **id** of the project; `attrs` uses the tag's field ids.
   - Name your run: `"layer": "agent:<model>-<date>"` (default: the file name).
3. Point the working set at the file: add `"proposal": "proposals.jsonl"` to its `files`
   in `worksets.json` (the path is relative to the working set's `root`), or pass
   `--proposals` to `add-texts` when you create it.
4. Run `npm run sectioner -- validate`. Every line that could not be placed is listed with
   its line number; fix them.
5. Tell the person to open the project and press **review**.

You may rewrite the proposals file at any time, for example after a better model. What
the person already accepted or rejected is never offered again. Proposals for documents
already marked done are still offered; filter them out yourself if that matters.

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

To measure a model against the person, compare your proposals with `annotations.jsonl`.
Each proposal ends up `accepted` or `rejected` under its `p…` id, or still `proposed` if
not yet reviewed.

### Checking progress

`npm run sectioner -- status`. A page or document counts as done only when the person
marked it done.

### Sharing with a team

Keep the data folder in its own git repository (or on a shared drive) and start the app
with `SECTIONER_DATA=<path> npm run dev`. Give each person their own working sets: an
image page open in two tabs refuses the older tab's save, but a text project has no such
guard, and the last save wins. `SECTIONER_READONLY=1` gives a look-only instance.

## Checking your work

- `npm run sectioner -- validate`: configuration and files.
- With the app running: `GET /api/projects` (the projects as the app resolves them, tag
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
