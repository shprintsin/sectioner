# 03 — What the app must write

One JSON file per page, named `<page_id>.json`. **This is a contract**: existing scoring
code, viewers and training scripts read this shape already, so the app must match it
rather than invent a variant.

- **Authority:** `schema/schema.py` — Pydantic. The `Field(description=...)` strings are
  the actual rules; read them, they are not decoration.
- **Machine-readable:** `schema/page.schema.json`, generated from it.
- **Worked example:** `examples/*/annotated.expected.json` — three complete, correct files.

Encoding is **UTF-8 always**, everywhere, without exception. The content is Hebrew and
Yiddish.

## Top level

```json
{
  "page_id": "MAD_19050210_01-001",
  "source_image": "MAD_19050210_01-001.png",
  "width": 2173, "height": 3507,
  "reading_direction": "rtl",
  "n_columns": 2,
  "column_bounds": [205, 1080, 1937],
  "languages": ["heb"],
  "sections": [ ... ],        ← the product
  "blocks":   [ ... ],        ← the substrate
  "provenance": { ... },      ← who produced this and how
  "notes": null
}
```

## `sections[]` — the product

Everything else exists to support this list. One entry per whole article or whole
advertisement. A real one, abbreviated:

```json
{
  "section_id": "s1",
  "type": "ARTICLE",
  "title": "החופ\"ק מיעליצעא בעהמ",
  "subtitle": null,
  "body_text": "בו עצם מזומתיו, וגם הוא חכם ויביא לבב חכמה ...",
  "block_ids": [97, 53, 21, 9, 1, 85, 106, 104],
  "bbox": {"x0": 205, "y0": 270, "x1": 1937, "y1": 3294},
  "block_bboxes": [{"x0": 1101, "y0": 270, "x1": 1930, "y1": 523}, ...],
  "column_span": 1,
  "continues_from_previous_page": true,
  "continues_to_next_page": false,
  "lang": "heb",
  "confidence": null
}
```

Field by field:

| field | rule |
|---|---|
| `section_id` | unique on the page. `s1`, `s2`, … is fine |
| `type` | one of nine values — see `schema/section_types.md` |
| `title` | the headline **as printed**. Normally copied from the OCR of the block that holds it, not typed |
| `body_text` | member blocks' text joined in reading order. Derived, not typed |
| `block_ids` | **in reading order** — headline first, then the body in the order a reader follows it. For a right-to-left paper that means down the rightmost column first, then the column to its left |
| `bbox` | union of the members. A multi-column article is not a rectangle, so this is only an envelope |
| `block_bboxes` | the true footprint — one rectangle per member block. **This is what gets drawn** |
| `column_span` | how many columns the section crosses |
| `continues_*` | the text breaks off mid-sentence at the top/foot of the section |
| `lang` | `yid`, `heb`, `rus`, `pol`, `deu`, `eng`, `lat`, `mixed`, `unknown` |

**The hard invariant: every content block appears in exactly one section.** Not zero, not
two. Printed rules (`separator`), pure illustrations and blocks marked noise are exempt.
The app should make violating this impossible, or at minimum impossible to do silently.

## `blocks[]` — the substrate

The blocks as used, carrying a back-reference to the section they ended up in.

```json
{
  "block_id": 53,
  "role": "body",
  "bbox": {"x0": 1101, "y0": 518, "x1": 1937, "y1": 2378},
  "line_bboxes": [ ... ],
  "text": "...",
  "lang": "heb",
  "section_id": "s1",
  "source": "layout",
  "ocr_conf": 0.71
}
```

- `role` — 20 values (`headline`, `body`, `ad_headline`, `caption`, `masthead`, …), the
  full list in `schema.py`. It describes what a block *does inside its section*.
  Distinct from the section's `type`, and less important than it: **if the section type
  and grouping are right and the roles are approximate, the page is still valuable.**
- `source` — `layout` if it came straight from eynollah, `op` if it was produced by a
  repair (a split or a merge), `added` if the annotator drew it. This is how we later
  measure how often the layout model needed fixing, so it must be recorded honestly.
- `ocr_conf` — OCR confidence where known. Useful for showing the annotator which text to
  distrust.

## `provenance{}`

Stamped on every file, by every producer including this app. Fields in `schema.py`; the
ones that matter here:

```json
{"route": "manual", "layout_model": "eynollah", "ocr_engine": "tesseract-5.5",
 "ops_applied": 3, "seconds": 214.6, "created_utc": "...", "reviewed_by_human": true}
```

`reviewed_by_human: true` and `route: "manual"` are what distinguish a hand-annotated page
from a machine one downstream. **`seconds` should be real annotation time** — we want to
measure whether the tool is actually getting faster, and this is the measurement.

## Two schemas, and which one this is

`schema.py` also defines `PageAnnotation`, a narrower shape carrying **no coordinates** —
that is what a language model returns, referencing block ids only. The app does not
produce it. It is included as `schema/page_annotation.schema.json` for context, because
it explains why the repair operations are shaped the way they are (`04-OPERATIONS.md`).

**The app reads and writes `Page`.**
