# 02 — What the app is given

Three inputs per page, all local files, all already produced by existing pipelines.

```
scan.png                 the page image
layout.eynollah.json     pre-computed blocks and lines
model_proposal.json      optional: a machine's attempt at the answer
```

## 1. The scan

A PNG, one per page. Real dimensions in this corpus:

| | width × height | file size |
|---|---|---|
| smallest here | 1241 × 1654 | 151 kB |
| largest here | 2198 × 3507 | 2.6 MB |

**All coordinates everywhere are in these pixels**, origin top-left, `x` rightwards,
`y` downwards — even though the newspapers read right-to-left. The reading direction
never affects the coordinate system.

Print quality varies from clean to badly foxed. Small advertisement type is genuinely
hard to read at 100%, which is why close zoom is a requirement and not a nicety.

## 2. The layout: blocks and lines

`layout.eynollah.json` is the output of a layout-analysis model, chosen after comparing
eight of them. It is the reason this tool can be fast: **the boxes already exist and are
pixel-accurate.**

```json
{
  "model": "eynollah",
  "page": "MAD_19050210_01-001",
  "width": 2173,
  "height": 3507,
  "n_regions": 112,
  "regions": [
    {"label": "text", "level": "block", "block": 1, "reading_order": 11,
     "bbox": [1106.0, 2868.0, 1933.0, 3294.0], "score": null},
    {"label": "", "level": "line", "block": 1,
     "bbox": [1106.0, 2866.0, 1848.0, 2933.0], "score": null}
  ]
}
```

- `regions` is a flat list holding **two levels**. Filter on `level`.
- `level: "block"` — a region of the page. `block` is its **id**, unique on the page.
  `bbox` is `[x0, y0, x1, y1]` as floats; round them.
- `level: "line"` — one printed line of text. Its `block` field says which block it
  belongs to. **Every line is attributed to a block** — checked across all ten pages,
  3,102 lines, zero orphans. This is what makes exact splitting possible.
- `label` on a block is one of `text`, `text:heading`, `text:drop-capital`, `image`,
  `separator`. It is a *starting guess* from the model, not something to trust.
- `reading_order` exists but is **wrong for these papers** — it is a top-to-bottom sweep
  that ignores columns. Do not use it. A correct right-to-left, column-major order is
  computed by our own code and can be supplied to the app if wanted.

### Two consequences for design

**Lines are what make repair exact.** When a block wrongly contains two things, the
annotator splits it *between two known lines* — never by dragging a freehand divider. The
resulting two boxes are still pixel-accurate. Same for merge: the union of known boxes.
This is why the tool should expose lines when splitting, and hide them the rest of the
time.

**About a third of blocks are printed rules, not content.** Measured over ten pages: 816
blocks, of which **278 (34%) are `separator`** — the ruled lines between columns and
around advertisements. They carry no text and are never annotated. They are, however,
strong visual evidence of where an advertisement begins and ends, so they are worth
*showing* while never being *annotatable*.

### Real numbers, measured over the ten pages we have annotated

| | median | range |
|---|---:|---:|
| blocks per page (all) | 88 | 11 – 166 |
| content blocks per page (excl. rules) | 65 | 7 – 100 |
| lines per page | 235 | 87 – 716 |
| sections per page | 6 | 2 – 27 |
| blocks per section | 4 | 1 – 51 |

14% of sections are a single block. The largest is 51 blocks — one article flowing
through many columns. **Both extremes are common enough that neither can be the awkward
case.**

## 3. The model proposal (optional starting point)

`model_proposal.json` is already in the output schema — same shape the app must write.
It is what our best automatic route produces. Measured against hand-annotated truth:

- section grouping F1 **0.74**
- section type accuracy **0.85**
- finds **70%** of advertisements
- title attribution correct **50%** of the time

So on a typical page it gets most groupings roughly right, most types right, misses
about a third of the ads, and gets half the headlines wrong.

**This makes correcting a proposal a plausibly faster path than starting empty — but
only if the tool makes disagreeing cheap.** If rejecting a wrong grouping costs more
than building the right one from scratch, the proposal is a liability. Treat "start
empty" and "start from a proposal" as two modes worth comparing, and design so the user
can tell at a glance which parts of a proposal to distrust (its titles, its ads).

## Where the files live and how they are named

Page ids look like `HNT_19111025_01-000`: paper code, date, edition, page index. Files
are named `<page_id>.<ext>` in parallel directories — scans in one, layouts in another,
outputs in a third. The app should be pointed at a folder (or a small manifest) and work
through it; it should not assume any particular absolute path.

A working set is likely 50–500 pages at a time.
