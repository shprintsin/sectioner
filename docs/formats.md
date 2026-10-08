# Formats

What goes in (pages, documents, machine proposals) and what comes out. All files are UTF-8
without a BOM.

## Text

### Documents (input)

Either one `.txt` per document (`"files": {"text": "{id}.txt"}`), or one JSONL corpus
(`"files": {"corpus": "corpus.jsonl"}`), one document per line:

```json
{"id": "letter-001", "text": "Vilna, 3 March 1887\n\nDear Sir,\n...", "title": "To S. Levin", "part": "1887"}
```

`id` is required (`[A-Za-z0-9_.-]`, up to 80 characters, unique in the project), and so is
`text`. `title` is shown as the document's heading (default: the id). `part` groups
documents under a band in the reader.

A paragraph is a run of lines between blank lines. The document's **text**, the one every
offset counts in, is its trimmed paragraphs joined by `"\n\n"`. Offsets are JavaScript
string positions (UTF-16 code units), end-exclusive. `export` writes that exact text to
`documents.jsonl`, so the offsets can always be checked against it.

### Machine proposals (input)

One JSONL per working set, named as `"files": {"proposal": "proposals.jsonl"}` (relative
to the working set's root), one suggestion per line:

```json
{"doc": "letter-001", "tag": "place", "quote": "Vilna", "confidence": 0.97}
{"doc": "letter-001", "tag": "place", "quote": "Vilna", "nth": 2}
{"doc": "letter-001", "tag": "date", "quote": "3 March 1887", "attrs": {"when": "1887-03-03"}}
{"doc": "letter-002", "tag": "person", "start": 120, "end": 132, "quote": "Jacob Abramson"}
{"doc": "letter-002", "tag": "doctype", "attrs": {"value": "reply"}, "layer": "agent:classifier-v2"}
```

| field | |
|---|---|
| `doc`, `tag` | required: a document id and a tag id of the project |
| `quote` | the exact text of the span, located in the document. **The preferred way**: no offsets to count. |
| `nth` | which occurrence of `quote`, 1-based (default 1) |
| `start`, `end` | offsets instead of a quote. If `quote` is also given, it must equal the text at those offsets, or the line is refused. |
| `attrs` | the tag's fields, `{field id: value}` |
| `confidence` | 0–1, shown to the reviewer |
| `layer` | names the run; default `agent:<file name without .jsonl>` |

A document-scope tag (`"scope": "document"`) takes no quote or offsets.

Every line the app cannot place (unknown document or tag, quote not found, offsets out of
range) is listed in a banner when the project opens, and by `npm run sectioner --
validate`, with its line number. Nothing is guessed.

When the project opens, the proposals are merged into its annotations as `proposed`. The
reviewer accepts (`Y`) or rejects (`N`) them, and both decisions are saved. A proposal
whose tag and span already exist in the saved annotations, in any status, is not offered
again. So the proposals file can be regenerated and re-read at any time without bringing
back what was rejected.

### Annotations (output)

`output/<working set>/annotations.jsonl`, rewritten after every action, one annotation
per line, keys in this order:

```json
{"ann_id":"n16","doc_id":"letter-002","tag":"place","start":327,"end":332,"quote":"Vilna","attrs":{},"layer":"gold","origin":"gold","provenance":"human","status":"accepted","confidence":null,"uncertain":false,"parent":null}
```

| field | |
|---|---|
| `ann_id` | unique in the project (`n…` made in the app, `p…` from a proposals file) |
| `doc_id`, `tag` | the document and the tag id |
| `start`, `end`, `quote` | the span; `quote` always equals the document text between the offsets. All three are `null` for a document-scope tag. |
| `attrs` | the tag's fields |
| `status` | `accepted`, `proposed` (not yet reviewed), `rejected`, or `stale` (the text under it changed) |
| `layer` | `gold` once a person stands behind it; otherwise the run it came from |
| `origin` | where it was first asserted, never rewritten: `gold` if a person made it, else the proposing run. An accepted proposal has `layer: gold` and keeps its `origin`. |
| `provenance` | `human`, `rule` or `agent`: who made the current version |
| `confidence` | the proposal's, or `null` |
| `uncertain` | the annotator flagged it (`U`) |
| `parent` | the smallest annotation that strictly contains it, or `null` |

Rejected annotations stay in the file: they are evidence about the proposing model. Filter
on `status == "accepted"` for the gold set.

`sessions/<working set>/_index.json` holds per-document progress (`status`: `new`, `wip`,
`done`) for the projects page.

### Export

`npm run sectioner -- export <project>` writes `data/export/<project>/`:

| file | |
|---|---|
| `annotations.jsonl` | every annotation of the project, as above |
| `documents.jsonl` | `{"id", "workset", "title", "text"}`: the text the offsets count in |
| `tei-standoff.xml` | TEI P5 with the annotations (accepted and proposed) as standoff spans pointing into the text |
| `tei-inline.xml` | TEI P5 with the accepted annotations as inline elements. XML is a tree, so spans that overlap without nesting cannot all be inline; the command prints how many were left out, and the standoff file has them all. |

The same two TEI exports are in the workbench's File menu.

## Images: `book`

### Pages (input)

A PNG or JPEG per page (`"files": {"image": "{id}.png"}`). The image's own pixel size is
the coordinate system.

### Machine proposals (input)

Optional, one JSON per page (`"files": {"proposal": "boxes/{id}.json"}`). It is loaded the
first time a page is opened, as boxes the annotator has to accept (`A`) or fix:

```json
{
  "width": 1240,
  "height": 1754,
  "regions": [
    { "id": "d1", "role": "title", "bbox": [130, 85, 870, 140], "confidence": 0.91 },
    { "id": "d2", "role": "main_text", "bbox_pixels": [150, 330, 1090, 620] }
  ]
}
```

- `width` and `height` must be the image's size.
- `bbox` is `[x0, y0, x1, y1]` on a 0–1000 grid of the page, or `bbox_pixels` in image
  pixels (which wins when both are given).
- `role` is one of the page roles (`docs/configuration.md`). A missing or unknown role
  becomes `unknown`.
- Optional per region: `confidence`, `text_hint`, `stream_id`.
- A file may also hold several pages as `{"pages": [{"page_id": "...", ...}]}`.

`existing` takes a previous output record (below) to re-review it.

### Output

`output/<working set>/<page id>.json`, written when the page is marked done (or from the
Export dialog, `Alt+E`). The main fields:

```json
{
  "schema_version": "0.1",
  "page_id": "page-01",
  "image": "page-01.png",
  "width": 1240, "height": 1754,
  "annotation_status": "human_reviewed",
  "bbox_coordinate_system": "xyxy_0_1000",
  "regions": [
    { "id": "r1", "role": "title", "bbox": [131, 84, 871, 141], "bbox_pixels": [162, 147, 1080, 247],
      "stream_id": "main", "container_id": null, "source": "human", "text_hint": "", "basis": "",
      "confidence": null, "responsum_id": null, "responsum_boundary": "unknown" },
    { "id": "r7", "role": "figure", "tag": "stamp", "bbox": [150, 690, 300, 790], "bbox_pixels": [186, 1210, 372, 1386], "source": "human" }
  ],
  "reading_order": { "main": ["r1", "r2", "r3"] },
  "containers": [], "groups": [], "relations": [], "cuts": [],
  "provenance": { "route": "manual", "tool": "sectioner", "seconds": 41.2, "reviewed_by_human": true, "created_utc": "..." }
}
```

- `regions` come in reading order. `role` is the tag's base, and `tag` is the project's
  own tag id when it differs.
- `bbox` uses the 0–1000 grid; `bbox_pixels` is the same box in image pixels.
- `reading_order` lists region ids per stream.
- `groups` are boxes joined into one unit (`Ctrl+G`). `responsum_id` is the free-text
  unit id typed in the panel.
- `cuts` records every split of a box, so a half can be traced back to the box it came
  from.
- `annotation_status` is `human_reviewed` only when the page was marked done and passed
  every check; otherwise `draft`.
- `style_tags` (`bold`, `centered`, `spaced`) appear where a box was marked with them.
- Some fields keep the names of the project this kind was first built for
  (`otzar_id`, `work_ids`, `source_pdf_*`, `responsum_*`); they are null or empty unless
  the input supplied them.

`npm run sectioner -- export <project>` collects the finished pages of each working set
into `export/<project>/<working set>.jsonl`, one record per line.

## Images: `newspaper`

Input: the page image and the eynollah layout JSON (`docs/newspaper/input-eynollah.md`),
optionally an OCR file and a proposal. Output: a `Page` record per page, sections with
their blocks in reading order (`docs/newspaper/output.md`, `docs/newspaper/page.schema.json`,
types in `docs/newspaper/section_types.md`). `fixtures/newspaper-brief/` has three real
pages with their expected output.

## Sessions

`sessions/<working set>/<page id>.json` is the image engines' working state (undo-able
details, the clock), saved after every action. It is not the result: the output is
derived from it. Never edit a session by hand while the app is open.
