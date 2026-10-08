# Sectioner

A local annotation app for two kinds of material:

- **Images.** Scanned pages. Draw a box around each part of a page, give it a tag (heading,
  body text, stamp, table, …), and put the boxes in reading order. Newspaper pages that
  come with an automatic layout (the PAGE-XML of
  [eynollah](https://github.com/qurator-spk/eynollah) or a similar tool) can also be
  grouped into articles: `npm run sectioner -- add-newspapers <folder> --xml <PAGE-XML folder>`.
- **Texts.** Plain-text documents. Select a passage, give it a tag (person, place, date,
  …), fill in its fields, and review what a model proposed. Annotations are kept as
  standoff JSONL and export to TEI.

Everything runs on your own computer: the app reads and writes plain files in one folder,
and nothing is sent anywhere. A project is configured in two small JSON files, so a person
can set one up from the app's forms and an AI agent can set one up from the command line.
`AGENTS.md` is the agents' manual.

## Quick start

You need [Node.js](https://nodejs.org) 20 or newer.

```bash
npm install
```

```bash
npm run sectioner -- example
```

```bash
npm run dev
```

Open <http://127.0.0.1:3040>. The `example` command adds two small projects: three
synthetic page scans to draw boxes on, and three short letters (two English, one Hebrew)
with machine proposals waiting for review.

## Your own material

**A folder of page images** (`.png` or `.jpg`, one file per page):

```bash
npm run sectioner -- add-images path/to/scans --name "Parish registers" --tags "Heading=title,Entry=main_text,Stamp=figure,Marginal note=auxiliary_text"
```

**A folder of texts** (`.txt`, one file per document; paragraphs separated by blank lines):

```bash
npm run sectioner -- add-texts path/to/letters --name "Letters 1880-1900" --tags "Person=persName,Place=placeName,Date=date"
```

Several thousand short texts can also be one JSONL file, one `{"id": "...", "text": "..."}`
per line (`"title"` is optional): `npm run sectioner -- add-texts corpus.jsonl`.

Both commands create a **working set** (the list of pages or documents) and a **project**
(what to annotate in them), and print the address to open. Leave `--tags` out to start
with the built-in tags, and change everything later on the projects page (**Edit
schema**). File names become ids, so they may use only letters, digits, `-`, `_` and `.`.

To add a working set to a project that already exists, pass `--project <id>`.

## How it is organised

| | what it is | where |
|---|---|---|
| **Project** | one annotation job: its kind, its tags (each with a colour and a key), its keyboard shortcuts | `data/projects.json` |
| **Working set** | a list of pages or documents and where their files are | `data/worksets.json` |
| **Kind** | what a page is: `book` (boxes on any page image), `newspaper` (layout blocks grouped into articles), `text` (spans in text) | set once per project |

Everything lives in the **data folder**: `./data` by default, or wherever `SECTIONER_DATA`
points.

```
data/
  projects.json  worksets.json     the configuration
  sessions/<working set>/          your work in progress, saved after every action
  output/<working set>/            the results: one JSON per finished page;
                                   annotations.jsonl for a text working set
  export/<project>/                what `npm run sectioner -- export` writes
  _archive/                        a copy of the configuration before every change
```

`add-images` and `add-texts` do not copy your material: a working set points at the
folder where it is. To keep everything together, put the material inside the data folder
(for example `data/material/`) before adding it; it is then recorded by a relative path.

`data/` is not part of this repository. To share annotation work with a team, make the
data folder a git repository of its own, or put it on a shared drive, and start the app
with `SECTIONER_DATA=/path/to/it npm run dev`. Give each person their own working sets.

## Working in the app

**Images.** Press `B` and drag to draw a box, then press the key of a tag (shown beside
each tag in the right panel). `A` accepts a box, `Enter` goes to the next page, `Ctrl+Z`
undoes. A page counts as finished when you **mark it done** (File menu). Only then is its
record written to `output/`. `Ctrl+K` searches every command, and **Help ▸ Keyboard
shortcuts** lists and rebinds them.

**Texts.** Select a passage with the mouse and press a tag's key, or pick the tag from the
menu that opens at the selection. `Tab` steps through annotations, `[` and `]` move a
boundary, `D` marks the document done, `N` and `P` go to the next and previous document.
**Review proposals** (toolbar) walks through what a model suggested: `Y` accepts, `N`
rejects. A tag's fields (a date's ISO value, a measure's unit) are filled in the left
panel. `?` shows every key.

Shortcuts read the key's position, so they work the same with a Hebrew or any other
keyboard layout.

## Machine proposals

A model or an AI agent can pre-annotate, and a person then reviews. For texts, write a
JSONL file beside the documents and attach it with `npm run sectioner -- attach-proposals
<working set> proposals.jsonl` (or `--proposals` when running `add-texts`):

```json
{"doc": "letter-001", "tag": "place", "quote": "Vilna", "confidence": 0.97}
{"doc": "letter-001", "tag": "date", "quote": "3 March 1887", "attrs": {"when": "1887-03-03"}}
```

A proposal names its span by **quote**, the exact text (`"nth": 2` takes the second
occurrence). Offsets are not needed. A proposal that has already been accepted or
rejected is not offered again when the file is regenerated. For page images, a detector's
boxes go in a per-page `proposal` file. The formats are in `docs/formats.md`.

## Results

```bash
npm run sectioner -- export <project-id>
```

For a text project this writes `data/export/<project>/`:

- `annotations.jsonl`: every annotation with its status, offsets and quote.
- `documents.jsonl`: the exact text every offset counts in.
- `tei-standoff.xml` and `tei-inline.xml`: TEI P5.

For an image project it writes one JSONL per working set, one line per finished page.
Field-by-field descriptions are in `docs/formats.md`.

`npm run sectioner -- status` shows progress, and `npm run sectioner -- validate` checks
the configuration and that every file is where the working sets say.

## Settings

| variable | default | meaning |
|---|---|---|
| `SECTIONER_DATA` | `./data` | the data folder |
| `SECTIONER_ROOT` | the data folder | what a relative working-set `root` is resolved against (for material kept outside the data folder) |
| `SECTIONER_READONLY` | — | `1` makes the instance look-only: nothing can be saved |
| `PORT` | `3040` | used by the CLI when it prints addresses (`npm run dev -- -p <port>` changes the server's) |

## More

- `AGENTS.md`: setting up and running annotation jobs with an AI agent (Claude Code,
  Codex, …).
- `docs/configuration.md`: every field of `projects.json` and `worksets.json`, key syntax,
  command ids.
- `docs/formats.md`: input and output formats.
- `docs/newspaper/`: the newspaper kind's input (layout from eynollah's PAGE-XML) and output.

For development, `npm run check` runs lint, the type check and the tests. The app is
Next.js 15 and React 19, with no database and no network calls.

## License

MIT — see `LICENSE`.
