# -*- coding: utf-8 -*-
"""The data model for newspaper page parsing.

Two schemas, deliberately separate:

`PageAnnotation`  what a vision model is asked to return. It carries **no coordinates**
                  -- only references to layout block ids, plus repair operations over
                  them. This is the whole cost/accuracy trick: coordinates come from the
                  layout model (pixel-exact and free), judgement comes from the LLM, and
                  the LLM's output shrinks to ids and text.

`Page`            the resolved artefact -- ground truth, and the output of every route.
                  Coordinates are filled in by resolving block ids against the layout
                  JSON, so they are exact by construction.

The product is `Page.sections`: articles and advertisements as whole objects. Blocks are
the substrate that gives sections their coordinates; a consumer reads sections.

`SectionType` reuses the vocabulary the National Library of Israel uses in its newspaper
section metadata, so the output is directly comparable with theirs, extended with the
page furniture NLI does not model.

Every `Field(description=...)` below is sent to the model as part of the JSON schema.
It is instruction, not documentation -- the disambiguating rule belongs there.
"""

from __future__ import annotations

from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field


# --------------------------------------------------------------------------- vocabulary

class SectionType(str, Enum):
    """What a section *is*. Separating ADVERTISEMENT from ARTICLE is a primary goal."""
    ARTICLE = "ARTICLE"
    ADVERTISEMENT = "ADVERTISEMENT"
    ILLUSTRATION = "ILLUSTRATION"
    SECTION = "SECTION"                    # a titled standing department or column
    MASTHEAD = "MASTHEAD"                  # the nameplate zone at the head of page 1
    RUNNING_HEAD = "RUNNING_HEAD"          # page number / date / issue strip
    TABLE_OF_CONTENTS = "TABLE_OF_CONTENTS"
    IMPRINT = "IMPRINT"                    # printer/publisher colophon
    PUBLICATION_INFO = "PUBLICATION_INFO"  # issue/date, subscription/ad rates, office information
    NOISE = "NOISE"                        # scan artefact, bleed-through, torn edge


class BlockRole(str, Enum):
    """What a single layout block does inside its section."""
    MASTHEAD = "masthead"
    RUNNING_HEAD = "running_head"
    DATELINE_BAR = "dateline_bar"          # the full-width issue/date line under a rule
    HEADLINE = "headline"
    SUBHEAD = "subhead"
    KICKER = "kicker"                      # small line above a headline
    BYLINE = "byline"
    RUN_IN_DATELINE = "run_in_dateline"     # bold place name opening a dispatch
    BODY = "body"
    CAPTION = "caption"
    ILLUSTRATION = "illustration"          # an actual picture, engraving or logotype
    AD_FRAME = "ad_frame"                  # the border of a display ad, not its text
    AD_HEADLINE = "ad_headline"
    AD_BODY = "ad_body"
    TABLE = "table"
    TOC_LIST = "toc_list"
    DROP_CAPITAL = "drop_capital"
    SEPARATOR = "separator"                # a printed rule
    IMPRINT = "imprint"
    PUBLICATION_INFO = "publication_info"
    NOISE = "noise"


class Lang(str, Enum):
    YID = "yid"
    HEB = "heb"
    RUS = "rus"
    POL = "pol"
    DEU = "deu"
    ENG = "eng"
    LAT = "lat"                            # Latin-script, language undetermined
    MIXED = "mixed"
    UNKNOWN = "unknown"


class OpKind(str, Enum):
    MERGE = "MERGE"      # several layout blocks are really one
    SPLIT = "SPLIT"      # one layout block holds two things
    RETYPE = "RETYPE"    # block is real, its role was wrong
    DROP = "DROP"        # block is spurious -- no text there
    ADD = "ADD"          # real content the layout model missed entirely


# ------------------------------------------------------------------- what the LLM returns

class RepairOp(BaseModel):
    """A correction to the layout model's blocks. Coordinates stay exact: MERGE unions
    known boxes, SPLIT cuts at a known line boundary."""
    kind: OpKind
    block_ids: List[int] = Field(
        description="Block ids this operates on. MERGE takes two or more; "
                    "SPLIT/RETYPE/DROP take exactly one; ADD takes none.")
    after_line: Optional[int] = Field(
        default=None,
        description="SPLIT only. Zero-based index of the last line of the FIRST part, "
                    "counting lines within this block from the top. The block is cut "
                    "immediately below that line.")
    new_role: Optional[BlockRole] = Field(
        default=None, description="RETYPE only, or the role of an ADDed block.")
    grid_bbox: Optional[List[int]] = Field(
        default=None,
        description="ADD only, and only when no existing block covers the content. "
                    "[x0, y0, x1, y1] read off the printed grid overlay. Approximate is "
                    "acceptable here; it will be snapped to the ink.")
    reason: str = Field(
        description="One short clause saying what is wrong, e.g. 'headline and first "
                    "paragraph are one block' or 'box is empty margin'.")


class BlockAnnotation(BaseModel):
    """One layout block, as read by the model. No coordinates -- the id carries them."""
    block_id: int = Field(description="The id printed on this block in the overlay image.")
    role: BlockRole
    lang: Lang
    text: str = Field(
        description="Verbatim transcription of this block, exactly as printed. Preserve "
                    "the original spelling, including archaic and non-standard forms; do "
                    "not modernise or correct. Keep line breaks as newlines. Do not add "
                    "vowel points that are not printed. Write an illegible run as [?]. "
                    "Empty string if the block holds no text (a rule, a picture).")


class SectionAnnotation(BaseModel):
    """An article or advertisement, expressed purely as a grouping of blocks."""
    section_id: str = Field(description="Short local id unique within the page, e.g. 's1'.")
    type: SectionType
    title: Optional[str] = Field(
        default=None,
        description="The headline as printed, or null for an untitled section.")
    block_ids: List[int] = Field(
        description="Every block belonging to this section, in reading order -- headline "
                    "first, then body in the order a reader follows it. For a "
                    "right-to-left paper, that means down the rightmost column first. "
                    "One block belongs to exactly one section.")
    continues_from_previous_page: bool = False
    continues_to_next_page: bool = Field(
        default=False,
        description="True if the text breaks off mid-sentence at the foot of its last "
                    "column, indicating it carries over.")


class PageAnnotation(BaseModel):
    """The model's complete reading of one page."""
    page_id: str
    reading_direction: str = Field(
        description="'rtl' for Hebrew and Yiddish papers, 'ltr' otherwise.")
    n_columns: int = Field(description="Number of text columns in the main body grid.")
    languages: List[Lang] = Field(description="Every language appearing on the page.")
    blocks: List[BlockAnnotation] = Field(
        description="One entry per block id in the overlay, including blocks you judge "
                    "to be noise. Do not invent ids.")
    sections: List[SectionAnnotation] = Field(
        description="The page decomposed into whole articles and advertisements. This is "
                    "the primary output. Every text-bearing block must appear in exactly "
                    "one section.")
    ops: List[RepairOp] = Field(
        default_factory=list,
        description="Corrections where the printed blocks do not match the real layout. "
                    "Leave empty if the blocks are already right.")
    notes: Optional[str] = Field(
        default=None, description="Anything ambiguous a human reviewer should check.")


# ------------------------------------------------------------------- the resolved artefact

class BBox(BaseModel):
    x0: int
    y0: int
    x1: int
    y1: int

    @property
    def width(self) -> int:
        return self.x1 - self.x0

    @property
    def height(self) -> int:
        return self.y1 - self.y0

    @property
    def area(self) -> int:
        return max(0, self.width) * max(0, self.height)

    def iou(self, other: "BBox") -> float:
        ix = max(0, min(self.x1, other.x1) - max(self.x0, other.x0))
        iy = max(0, min(self.y1, other.y1) - max(self.y0, other.y0))
        inter = ix * iy
        union = self.area + other.area - inter
        return inter / union if union else 0.0

    @classmethod
    def union(cls, boxes: List["BBox"]) -> Optional["BBox"]:
        if not boxes:
            return None
        return cls(x0=min(b.x0 for b in boxes), y0=min(b.y0 for b in boxes),
                   x1=max(b.x1 for b in boxes), y1=max(b.y1 for b in boxes))

    @classmethod
    def from_list(cls, v) -> "BBox":
        x0, y0, x1, y1 = [int(round(float(n))) for n in v]
        return cls(x0=x0, y0=y0, x1=x1, y1=y1)


class Block(BaseModel):
    block_id: int
    role: BlockRole
    bbox: BBox
    line_bboxes: List[BBox] = Field(default_factory=list)
    text: str = ""
    lang: Lang = Lang.UNKNOWN
    section_id: Optional[str] = None
    source: str = Field(
        default="layout",
        description="'layout' straight from the layout model, 'op' produced by a repair "
                    "operation, 'added' introduced to cover missed content.")
    ocr_conf: Optional[float] = None


class Section(BaseModel):
    """The product. An article or advertisement as one object."""
    section_id: str
    type: SectionType
    title: Optional[str] = None
    subtitle: Optional[str] = None
    body_text: str = Field(
        default="", description="Member block text joined in reading order.")
    block_ids: List[int] = Field(default_factory=list)
    bbox: Optional[BBox] = Field(
        default=None,
        description="Union of member blocks. A multi-column article is not rectangular, "
                    "so this is an envelope -- block_bboxes holds the true footprint.")
    block_bboxes: List[BBox] = Field(default_factory=list)
    column_span: int = 1
    continues_from_previous_page: bool = False
    continues_to_next_page: bool = False
    lang: Lang = Lang.UNKNOWN
    confidence: Optional[float] = None


class Provenance(BaseModel):
    route: str = Field(description="Which pipeline produced this, e.g. 'gt', 'r3'.")
    layout_model: Optional[str] = None
    ocr_engine: Optional[str] = None
    llm_provider: Optional[str] = None
    llm_model: Optional[str] = None
    thinking_level: Optional[str] = None
    input_tokens: int = 0
    output_tokens: int = 0
    thought_tokens: int = 0
    cost_usd: float = 0.0
    cache_hit: bool = False
    seconds: float = 0.0
    ops_applied: int = 0
    created_utc: Optional[str] = None
    reviewed_by_human: bool = False


class Page(BaseModel):
    page_id: str
    source_image: str
    width: int
    height: int
    reading_direction: str = "rtl"
    n_columns: int = 1
    column_bounds: List[int] = Field(
        default_factory=list,
        description="x positions of the column rules, derived from the layout model's "
                    "vertical separators. Left to right regardless of reading direction.")
    languages: List[Lang] = Field(default_factory=list)
    sections: List[Section] = Field(default_factory=list)
    blocks: List[Block] = Field(default_factory=list)
    provenance: Provenance = Field(default_factory=lambda: Provenance(route="unknown"))
    notes: Optional[str] = None

    def block_by_id(self, bid: int) -> Optional[Block]:
        return next((b for b in self.blocks if b.block_id == bid), None)

    def text_bearing(self) -> List[Block]:
        return [b for b in self.blocks
                if b.role not in (BlockRole.SEPARATOR, BlockRole.ILLUSTRATION,
                                  BlockRole.AD_FRAME, BlockRole.NOISE)]


__all__ = [
    "SectionType", "BlockRole", "Lang", "OpKind",
    "RepairOp", "BlockAnnotation", "SectionAnnotation", "PageAnnotation",
    "BBox", "Block", "Section", "Provenance", "Page",
]
