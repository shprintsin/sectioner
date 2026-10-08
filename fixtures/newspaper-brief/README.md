# The examples

Three real pages, chosen to span the difficulty range. Measured details in `FACTS.md`
(generated from the files themselves, not typed).

| folder | character |
|---|---|
| `easy_MAD/` | 16 blocks, 2 articles. High-resolution, clean Hebrew, two columns. The trivial case — a page like this should take seconds |
| `dense_HNT/` | 166 blocks, 10 sections. A dense Yiddish broadsheet front page, seven columns, 581 line boxes. One article spans **51 blocks** |
| `ads_YIDHSH/` | 163 blocks, 27 sections, **16 of them advertisements**. The hard case: many small separate notices that must not be merged into one |

Each folder holds the same four files.

### `scan.png`
The page image exactly as the app receives it.

### `layout.eynollah.json`
The pre-computed layout: blocks and their lines. **This is the app's input.** Format
documented in `../02-DATA.md`. Remember that `regions` mixes two levels — filter on
`level`, and ignore the `reading_order` field, which is wrong for right-to-left papers.

### `annotated.expected.json`
**A correct, complete annotation of that page, in the exact output format.** This is what a
finished session must produce, and the most useful file in this pack: it defines "done"
without any prose.

Note `blocks[].text` — that is OCR output, imperfect, and it is what the app will have
available to show. Do not assume clean text.

### `model_proposal.json`
What our best automatic method produced for the same page: same schema, ~74% correct
grouping, ~85% correct types, misses 30% of advertisements, half the titles wrong. Useful
if you want to explore correcting a proposal rather than starting empty — and useful in
any case as a concrete picture of what the machine gets wrong, which is what the human is
here to fix.

Compare it against `annotated.expected.json` on `dense_HNT/` in particular: the machine
produced 19 sections where the truth is 10, i.e. it cut articles into fragments. On
`ads_YIDHSH/` it happens to produce 27 against 27 — the same count, not the same
sections.

## Seeing them rendered

`../reference/existing_viewer_sections.html` shows the `dense_HNT` page annotated four
different ways side by side, offline, in any browser. Prior art for understanding the
data — **not** a design to inherit.
