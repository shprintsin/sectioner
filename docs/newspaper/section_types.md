# The label vocabulary

Nine values for `section.type`. This is the decision the annotator makes for every section,
so it is the vocabulary the interface has to make fast.

The first four come from the National Library of Israel's own section metadata, so our
output stays directly comparable with theirs. The rest cover page furniture NLI does not
model.

Counts and examples below are from the ten hand-annotated pages (91 sections). Every example
is a real title from a real page.

| type | share | what it is |
|---|---:|---|
| `ARTICLE` | 39 (43%) | editorial matter: news, opinion, a feuilleton instalment. A headline followed by continuous prose, running down a column and continuing at the top of the next column to the **left** |
| `ADVERTISEMENT` | 30 (33%) | one paid notice — **the category that matters most and is hardest to get right** |
| `MASTHEAD` | 6 (7%) | the paper's nameplate at the head of page one, with its ornament, price and subscription lines |
| `RUNNING_HEAD` | 11 (12%) | the strip carrying page number, date, issue number |
| `SECTION` | 3 (3%) | a standing titled department — a column of short dispatches under one standing head |
| `TABLE_OF_CONTENTS` | 1 | a contents list |
| `IMPRINT` | 0 here | the printer's or publisher's colophon |
| `ILLUSTRATION` | 0 here | a picture or engraving that stands alone |
| `NOISE` | 1 | scan artefact, bleed-through from the reverse, a torn edge |

## ARTICLE — 43%

```
פאר דער ערעפנונג פון דער דומע-סעסיע.          7 blocks
די קרבנות פון דער מלחמה אין טריפאליס...      51 blocks   ← the largest section we have
פֿון טאָג צו טאָג.                              8 blocks
```

Articles are the long ones. One occupies its headline plus every column of body it flows
through — median 4 blocks, up to 51. **An article split into fragments is the single most
common machine error, and the thing hand annotation most needs to get right.**

## ADVERTISEMENT — 33%

```
א וועלט אן גרענעצן                            7 blocks
אבאנעמענטס-פרייז:                             8 blocks
וויכטיג פאר פארטאקען!                          3 blocks
א כ ט ו נ ג!                                   1 block
```

The category the whole project cares about most, and the one automatic methods handle
worst — the best route finds 70% of them, cheaper ones as few as 19%.

What they look like in this material: shops, banks, doctors, lawyers, steamship and
emigration agents, patent medicines, booksellers, and a family's paid notice of mourning,
engagement or congratulation. Signals: a **printed frame**, a very short block among other
short blocks, a name with a street address or telephone number or price, type set centred
or mixing several sizes rather than justified.

Two rules that decide many real cases:

- **A classified column holds many separate advertisements.** Each gets its own section.
  Two adjacent framed blocks are usually two different advertisers, not one ad.
- **A frame containing only text is an advertisement, never an illustration.**

One example page (`examples/ads_YIDHSH/`) is 16 advertisements out of 27 sections. That is
the realistic worst case and the one to design against.

## MASTHEAD / RUNNING_HEAD

```
הײַנט                    2 blocks     lit. "Today" — the paper's name
לידער מאָמענט            14 blocks
מחזיקי הדת               14 blocks
היינט 235 №              1 block      running head
```

Mastheads are visually obvious but often fragment into many blocks (up to 14 here)
because of the ornament, so they are cheap to recognise and tedious to assemble.
**Worth a fast path.**

## SECTION

```
הײַנטיגע גײעם.              4 blocks
פֿאן ארבע פֿכות עולה.       10 blocks
```

A standing titled department: many short unrelated dispatches under one recurring head.
The judgement call is whether it is one `SECTION` or several `ARTICLE`s — genuinely
ambiguous, and a place where the annotator's consistency matters more than the rule.

## The rest

`TABLE_OF_CONTENTS` (`תוכן הענינים`), `IMPRINT`, `ILLUSTRATION`, `NOISE` are rare —
five occurrences in 91 sections between them. They must be available; they need not be
prominent.

## Note on block roles

Separately from the section's `type`, each block carries a `role` — 20 values, listed in
`schema.py`: `headline`, `subhead`, `kicker`, `byline`, `body`, `caption`, `ad_headline`,
`ad_body`, `masthead`, `running_head`, `dateline_bar`, `imprint`, `illustration`,
`ad_frame`, `table`, `toc_list`, `drop_capital`, `run_in_dateline`, `separator`, `noise`.

Roles are useful but **secondary**. If the section grouping and section types are right
and the roles are approximate, the page is still valuable. Do not let role assignment
compete with sectioning for the annotator's attention — with one exception: marking **which
block is the headline** matters, because it becomes the section's title, and titles are
the weakest part of every automatic method we have measured.
