# Configuration reference

Sectioner is configured by two JSON files in the data folder (`./data`, or `$SECTIONER_DATA`):

| file | holds | written by |
|---|---|---|
| `worksets.json` | the working sets: lists of pages or documents and where their files are | the CLI (`add-images`, `add-texts`), the app (**+ New working set**), or by hand |
| `projects.json` | the projects: kind, working sets, tags, key map | the CLI, the app (**+ New project**, **Edit schema**), the text workbench's Tag set tab, or by hand |

Both are UTF-8 JSON without a BOM. JSON Schemas for editors and agents are in `schema/`.
`npm run sectioner -- validate` checks both files and every working set's files. `GET
/api/projects` and `GET /api/worksets` return what the app reads, and a bad file shows up
there as an error.

Before every change the app and the CLI copy the previous file to
`_archive/<file>.<date>.<sha>.json`. Before editing by hand, copy it yourself to
`_archive/<file>.<YYYY-MM-DD>.json`.

Sessions and outputs are filed under the ids, so never rename an id or delete an entry
that has work; set `"hidden": true` instead. The app only appends to `worksets.json`. The
CLI also appends, and its `attach-proposals` sets one entry's `files.proposal`; those are
the only changes a working set needs.

## The three kinds

| kind | a page / document is | the annotator | the result |
|---|---|---|---|
| `book` | a page image (`.png`, `.jpg`), optionally with a detector's boxes | draws boxes, tags them, puts them in reading order, can group them into units | one JSON per page in `output/<working set>/` when the page is marked done |
| `newspaper` | a page image and its layout (blocks and lines; from eynollah or any PAGE-XML tool, converted by `add-newspapers`). Right-to-left papers. | groups the layout's blocks into articles, advertisements and the rest; orders them | one JSON per page (`docs/newspaper/output.md`) |
| `text` | a plain-text document | tags spans of text, fills their fields, reviews machine proposals | `output/<working set>/annotations.jsonl`, saved after every action |

`book` is the general image kind: despite the name, any scanned page works (letters,
registers, forms, posters).

## `worksets.json`

```json
{
  "worksets": [
    {
      "id": "registers-1890",
      "kind": "book",
      "label": "Parish registers, 1890",
      "root": "material/registers",
      "files": { "image": "{id}.jpg", "proposal": "boxes/{id}.json" }
    },
    {
      "id": "letters-a",
      "kind": "text",
      "label": "Letters, batch A",
      "root": "material/letters",
      "files": { "text": "{id}.txt", "proposal": "proposals.jsonl" }
    }
  ]
}
```

| field | required | meaning |
|---|---|---|
| `id` | yes | letters, digits, `-` `_` `.` (up to 80). Names the folders in `sessions/` and `output/`. Never rename it once work exists. |
| `kind` | yes | `book`, `newspaper` or `text` |
| `label` | no | the name shown in the app |
| `root` | yes | the folder the file templates are relative to. A relative root is resolved against `$SECTIONER_ROOT` if set, else the data folder. Absolute paths work too. |
| `files` | yes | templates, one per file kind (below). `{id}` is the page or document id. |
| `pages` | no | list the pages instead of discovering them: `[{"id": "p1", "dir": "issue-3", "files": {...}}]`. `{dir}` in a template is the page's `dir`; a page's own `files` override the templates. |
| `discover` | no | which template to glob for ids when `pages` is absent (default `image` for `book`, `layout` for `newspaper`, `text` for `text`). `{id}` must be in the file name, not in a folder name. |
| `output` | no | a template for a page's result file (default `output/<id>/{id}.json` in the data folder) |
| `labels` | no | `book`: `false` opens pages with the box labels hidden (useful for line-level work) |
| `hidden` | no | `true` keeps the set out of the lists (its links still open) |

A template may not leave its root (`..` is refused). Ids are taken from the file names
that match the discovery template, so a file whose name has a space or another character
outside `[A-Za-z0-9_.-]` is skipped.

### Files per kind

| key | kinds | required | what |
|---|---|---|---|
| `image` | book, newspaper | yes | the page image, PNG or JPEG |
| `layout` | newspaper | yes | the layout JSON (`docs/newspaper/input.md`); `add-newspapers` makes it from eynollah's PAGE-XML |
| `proposal` | book, newspaper, text | no | machine proposals. book/newspaper: one JSON per page. text: **one JSONL for the whole set** (no `{id}`), see `docs/formats.md`. |
| `ocr` | newspaper | no | Page-schema JSON whose blocks carry OCR text |
| `existing` | book | no | an existing annotation (the output format) to re-review |
| `text` | text | one of these two | one `.txt` per document |
| `corpus` | text | one of these two | one JSONL holding every document: `{"id", "text", "title"?, "part"?}` per line |

A text document's paragraphs are separated by blank lines. Each paragraph is trimmed, and
the document's text becomes its paragraphs joined by one blank line. That joined text is
what every annotation offset counts in, and `export` writes it to `documents.jsonl`.
Document ids must be unique within a project.

## `projects.json`

```json
{
  "version": 1,
  "projects": [
    {
      "id": "registers",
      "label": "Parish registers",
      "kind": "book",
      "description": "Entries, marginal notes and stamps",
      "worksets": ["registers-1890"],
      "tags": [
        { "id": "entry", "label": "Entry", "base": "main_text", "key": "E" },
        { "id": "margin", "label": "Marginal note", "base": "auxiliary_text", "key": "M" },
        { "id": "stamp", "label": "Stamp", "base": "figure", "icon": "stamp", "hue": 25, "key": "7" }
      ],
      "keymap": { "next-page": ["Shift+Enter"] }
    },
    {
      "id": "letters",
      "label": "Names in letters",
      "kind": "text",
      "direction": "auto",
      "worksets": ["letters-a"],
      "tags": [
        { "id": "person", "label": "Person", "base": "persName", "key": "P" },
        { "id": "date", "label": "Date", "base": "date", "key": "D",
          "attrs": [{ "id": "when", "kind": "text", "label": "ISO date", "tei": "@when" }] }
      ],
      "keymap": {}
    }
  ]
}
```

| field | required | meaning |
|---|---|---|
| `id` | yes | lower-case `[a-z0-9_.-]`, starting with a letter or digit |
| `label` | yes | the name shown |
| `kind` | yes | `book`, `newspaper` or `text`; fixed once work exists |
| `worksets` | yes | working set ids of the same kind. A working set belongs to at most one project. |
| `tags` | yes | the schema, at least one tag (below); order is menu order |
| `keymap` | no | command id → list of chords, overriding the defaults (below) |
| `description` | no | shown on the projects page |
| `direction` | text only | `rtl`, `ltr` or `auto` (default: decided from the letters). Each paragraph also follows its own script, so mixed corpora read correctly. |

A working set that no project lists still appears, in a *derived* project of its kind
with the built-in tags. Saving that project in the app writes it to `projects.json`.

### Tags

Only `id`, `label` and `base` are required; the rest have defaults.

| field | meaning |
|---|---|
| `id` | `[a-z0-9_]`, unique in the project, starting with a letter or digit. Written into the results. |
| `label` | what the annotator sees |
| `base` | what the result is written as (see below) |
| `key` | a chord (`M`, `Shift+1`, `Ctrl+Alt+T`) or `""`. Default none. |
| `icon` | one of the icon names (`npm run sectioner -- schema` lists them). Default `tag`. |
| `hue`, `chroma` | the colour, oklch: hue 0–360, chroma 0–0.4. Default: spread around the wheel. |
| `description` | a note shown with the tag |
| `labelAlt` | text: a second name shown beside the label |
| `color` | text: `#rrggbb`, overriding hue and chroma |
| `attrs` | text: fields the annotator fills on a span: `[{"id", "kind": "text"\|"number"\|"enum", "label", "tei": "@attr", "values"?: [...]}]` (`values` is required for `enum`) |
| `scope` | text: `"document"` means the tag classifies a whole document and carries no span |
| `popular` | text: offer it in the menu that opens at a selection (default: every tag with a key; at most six are shown) |

**`base` per kind.**

- **book**: one of the page roles `main_text`, `title`, `subtitle`, `commentary`,
  `footnote`, `running_header`, `page_number`, `separator`, `unknown`, `auxiliary_text`,
  `signature`, `page_footer`, `summary`, `date`, `table`, `noise`, `figure`. A box tagged
  with your tag is written as `"role": "<base>", "tag": "<id>"`. Roles carry behaviour:
  `separator`, `table`, `noise` and `figure` need no reading order, while every other
  role must be placed in a reading stream before the page can be marked done; `unknown`
  needs a written reason. For a plain "label the boxes" job, `figure` (no order) or
  `main_text` (ordered) are the usual bases. A tag whose id equals its base is built in
  and adds no `tag` field.
- **newspaper**: one of `ARTICLE`, `ADVERTISEMENT`, `MASTHEAD`, `RUNNING_HEAD`, `SECTION`,
  `TABLE_OF_CONTENTS`, `IMPRINT`, `ILLUSTRATION`, `NOISE`, `PUBLICATION_INFO`
  (`docs/newspaper/section_types.md`). Built-in ids are the lower-cased type.
- **text**: the TEI element the span is exported as: any element name, optionally with
  one attribute predicate (`persName`, `placeName`, `date`, `seg[@type='ruling']`).

Removing a tag from a schema only removes it from the menus: saved annotations keep it.
Changing a book or newspaper tag's base drops that tag from units of the old base; it is
never carried over.

**Text keys.** The text workbench reads a tag key only when it is a single letter or
digit (`P`, `7`). A tag with any other chord, or none, is reached from the palette
(`Space`) or the selection menu.

With text selected, a tag key always tags. With nothing selected, these letters are
commands:

- `c` compact view;
- `d` mark the document done;
- `p` previous document;
- `u` flag the active annotation uncertain;
- `y` accept the active proposal;
- `n` reject the active proposal when one is active, otherwise go to the next document.

A tag on one of these letters therefore works only with a selection, which is how spans
are tagged anyway.

`add-texts --tags` gives each tag the first free letter of its label. `add-images --tags`
gives `1`…`9` in order.

### Chords and the key map

`M`, `Shift+M`, `Ctrl+Shift+G`, `Alt+E`, `1`, `Shift+1`, `,`, `[`, `Space`, `Enter`,
`Escape`, `Delete`, `ArrowDown`, `F2`.

- Modifiers come in the order `Ctrl+Alt+Shift+`; ⌘ counts as Ctrl.
- Letters and digits are read by their physical key, so any keyboard layout and Caps Lock
  type the same shortcut.
- Punctuation is named unshifted: `?` is `Shift+/`. Writing `?` is accepted and normalised.
- `keymap` maps a command id to its chords. An absent id keeps its default, and `[]`
  unbinds the command. A tag's key lives on the tag; its command id is `tag:<id>`, which
  the key map may also override.
- The first command to claim a chord wins. **Help ▸ Keyboard shortcuts** on a page lists
  every command, shows conflicts and edits the key map in place.

### Command ids (image kinds)

Shared: `projects`, `project-schema`, `page-prev` `[`, `page-next-plain` `]`, `done`,
`export` `Alt+E`, `undo` `Ctrl+Z` `U`, `redo` `Ctrl+Shift+Z`, `zoom-in` `=`, `zoom-out`
`-`, `zoom-fit` `0`, `zoom-width`, `zoom-cycle` `Z`, `panel-left`, `panel-right`, `palette`
`Ctrl+K`, `keymap`. Where an engine already uses a key, the engine keeps it (in book mode
`0`, `Z` and `U` are the Date, Summary and Unclear tags of the default schema).

Book: `accept` `A`, `accept-all` `Shift+A`, `next-page` `Enter`, `next-open` `G`, `down`
`↓` `J`, `up` `↑` `K`, `deselect`, `delete` `X` `Del`, `merge` `Shift+M`, `split` `S`,
`earlier` `,`, `later` `.`, `auto-order` `Shift+O`, `text-hint` `T`, `unknown-reason`,
`group` `Ctrl+G`, `ungroup` `Ctrl+Shift+G`, `leave-group`, `stream-<name>`, `rot-cycle`
`L`, `rot-90`/`rot-270`/`rot-180`/`rot-0`, `tool-select` `V`, `tool-draw` `B`, `tool-zone`
`Y`, `tool-column` `O`, `tool-cut` `W`, `tool-cut-v` `Shift+W`, `style-bold` `Shift+1`,
`style-centered` `Shift+2`, `style-spaced` `Shift+3`, `turn` `Shift+L`, `proposal` `P`.

Newspaper: `approve-next` `A`, `approve-all` `Shift+A`, `accept`, `next-page` `Enter`,
`next-open` `G`, `title` `T`, `subhead` `H`, `section-title` `Shift+H`, `byline` `Y`,
`footnote` `Shift+F`, `toc` `6`, `center` `C`, `rot-cycle` `O`, `flag-block` `Shift+1`,
`role-cycle` `R`, `down`, `up`, `deselect`, `assign` `Space`, `group` `Ctrl+G`,
`group-new` `Ctrl+Shift+G`, `new-section`, `merge-sections` `M`, `split-section`
`Shift+S`, `dissolve` `D`, `earlier` `,`, `later` `.`, `continues-from` `Shift+,`,
`continues-to` `Shift+.`, `skip` `X`, `delete` `Del`, `merge-blocks` `Shift+M`,
`split-block` `S`, `tool-select` `V`, `tool-lasso` `L`, `tool-draw` `N` `B`, `tool-cut`
`W`, `tool-cut-v` `Shift+W`, `flag-page` `F`, `proposal` `P`, `advanced`.

The authoritative list is the running page (Help ▸ Keyboard shortcuts). The text
workbench's keys are fixed (`?` in the workbench lists them); only its tag keys are
configured.

## Environment

| variable | default | meaning |
|---|---|---|
| `SECTIONER_DATA` | `./data` | the data folder (absolute, or relative to where the app or CLI is started) |
| `SECTIONER_ROOT` | the data folder | base for relative working-set roots and output templates |
| `SECTIONER_READONLY` | — | `1`: nothing can be saved; every page says so |
| `PORT` | `3040` | only for the addresses the CLI prints |
