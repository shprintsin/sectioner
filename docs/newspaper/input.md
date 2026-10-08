# Newspaper pages: what the app reads

A `newspaper` working set gives each page two required files and two optional ones, all
named by the page id:

```
<id>.png / .jpg          the page image
<id>.layout.json         the layout: blocks and their printed lines        (required)
<id>.proposal.json       a machine's grouping into sections, to correct    (optional)
<id>.ocr.json            the text of each block                            (optional)
```

The names are templates in `worksets.json` (`files.image`, `files.layout`,
`files.proposal`, `files.ocr`), so any naming works. `npm run sectioner --
add-newspapers <folder>` sets up the first two.

## Getting a layout from eynollah

[eynollah](https://github.com/qurator-spk/eynollah) does not write this JSON. Like most
layout tools, it writes **PAGE-XML**, one `<image name>.xml` per image. Convert it when
adding the pages:

```bash
# eynollah's own flags vary by version; see its README
eynollah layout -di scans/ -o layouts/ -m <models folder>
npm run sectioner -- add-newspapers scans/ --xml layouts/ --name "Issue 12"
```

`add-newspapers` reads `layouts/<id>.xml` for every image `scans/<id>.png` and writes
`scans/<id>.layout.json` beside the image. A page that already has a `.layout.json` is
left as it is. Any other tool that writes PAGE-XML (Kraken, Transkribus exports, OCR-D)
works the same way.

The conversion (`src/app/_lib/news/pageXml.ts`):

| PAGE element | becomes a block labelled |
|---|---|
| `TextRegion` with `type="heading"`, `"header"` or `"caption"` | `text:heading` |
| `TextRegion` with `type="drop-capital"` | `text:drop-capital` |
| any other `TextRegion`, `TableRegion`, … | `text` |
| `SeparatorRegion` | `separator` |
| `ImageRegion`, `GraphicRegion`, `ChartRegion`, `MapRegion`, `LineDrawingRegion` | `image` |

Each region's `TextLine`s become its lines. A polygon becomes its bounding box. Blocks are
numbered 1, 2, … in document order, and the PAGE ids are kept as `xml_id`. The file's
`ReadingOrder`, if any, is kept as `reading_order`.

## The layout JSON

```json
{
  "model": "PAGE-XML",
  "page": "issue12-p1",
  "width": 2173,
  "height": 3507,
  "regions": [
    { "level": "block", "block": 1, "label": "text", "bbox": [1106, 2868, 1933, 3294] },
    { "level": "line",  "block": 1, "label": "",     "bbox": [1106, 2866, 1848, 2933] }
  ]
}
```

| field | |
|---|---|
| `width`, `height` | required: the image's size in pixels |
| `regions` | required: a flat list holding both blocks and lines |
| `regions[].level` | `"block"` or `"line"` |
| `regions[].block` | for a block, its id: an integer, unique on the page. For a line, the id of the block it belongs to. A line whose block does not exist is ignored. |
| `regions[].bbox` | `[x0, y0, x1, y1]` in image pixels, origin top-left (rounded on load) |
| `regions[].label` | for a block: `text` (the default when empty), `text:heading`, `text:drop-capital`, `separator` or `image`. Any other value is treated as text. |
| `model` | shown as the layout's source |
| `page`, `n_regions`, `score`, `reading_order`, `xml_id` | carried, not used |

How the labels are used:

- **`separator`**: a printed rule. It is drawn as page structure, never assigned to a
  section, and does not count towards the progress.
- **`image`**: exported with the role `illustration`.
- **`text:heading`**: exported as a subhead, or as an advertisement's headline inside an
  advertisement.
- **`text:drop-capital`**: exported as a drop capital.

Every label is a starting guess. The annotator can retype a block, split it between two
of its lines (which is why lines matter: the halves stay exact) or merge blocks.

The reading order a layout tool proposes is usually a top-to-bottom sweep that ignores
columns, so the app does not use it. It orders blocks itself, **right to left, column by
column**, using the OCR file's `column_bounds` (one column if absent): the newspaper kind
was built for Hebrew and Yiddish papers. On a left-to-right paper, fix the order within
each section by hand (`,` and `.` move a block), or supply a proposal with
`"preserveOrder": true` on its sections.

## The OCR file (optional)

Text shown in the inspector for each block:

```json
{ "languages": ["heb", "yid"],
  "column_bounds": [0, 1103, 2173],
  "blocks": [ { "block_id": 1, "text": "…", "ocr_conf": 0.93 } ] }
```

`block_id` is the layout's `block`.

- `languages` uses `yid`, `heb`, `rus`, `pol`, `deu`, `eng`, `lat`, `mixed` or `unknown`.
  It is `unknown` when no file gives it.
- `column_bounds` gives the x positions of the column edges, left to right; it defaults
  to one column.

## The proposal file (optional)

A machine's grouping of the blocks into sections, which the page starts from:

```json
{ "sections": [
    { "id": "s1", "type": "ARTICLE", "block_ids": [3, 4, 9], "title": null,
      "titleBlockId": 3, "articleKey": "A12", "orderUncertain": false, "continuesTo": true }
  ],
  "startWithProposal": true,
  "blocks": [ { "block_id": 3, "text": "…" } ] }
```

- `type` is one of the section types (`section_types.md`). A section of any other type
  is skipped.
- `block_ids` are the blocks in the section. The app puts them in its own column order
  (right to left, column by column) unless `"preserveOrder": true` keeps yours.
  Separators and unknown ids are dropped.
- `titleBlockId` names the block that is the section's headline. Without it, a non-empty
  `title` marks the first block.
- `articleKey` is the same id on two pages for an article that continues across them.
- `continuesFrom` / `continuesTo` mark a section that runs on from the previous page or
  onto the next.
- `orderUncertain: true` asks the annotator to confirm the order.
- The `blocks` texts, when present, are used like the OCR file.

A page opens from the proposal when the file says `"startWithProposal": true`; otherwise
it opens empty, and `P` loads the proposal.

A file in the output format (`output.md`) can serve as a proposal, for example to
re-review finished pages. Its `type`, `block_ids` and `title` are read; its
`continues_from_previous_page` / `continues_to_next_page` are not, and its `section_id`
is replaced by `s1`, `s2`, …

`fixtures/newspaper-brief/` has three real pages with a layout, a proposal and the
expected output.
