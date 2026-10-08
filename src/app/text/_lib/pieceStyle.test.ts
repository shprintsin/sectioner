import { describe, expect, it } from "vitest";

import { pieceStyle } from "./pieceStyle";
import { TAG_DEFS } from "./tagset";
import type { Ann, MarkOpts } from "./types";

const T = TAG_DEFS;

function ann(tag: string, over: Partial<Ann> = {}): Ann {
  return {
    id: "x",
    doc: "d1",
    tag,
    start: 0,
    end: 5,
    quote: "x",
    attrs: {},
    layer: "gold",
    origin: "gold",
    prov: "human",
    status: "accepted",
    conf: null,
    uncertain: false,
    parent: null,
    ...over,
  };
}

const OPTS: MarkOpts = { mode: "underline", cleanRead: false, activeId: null };
const opts = (o: Partial<MarkOpts>): MarkOpts => ({ ...OPTS, ...o });

/** Colour of a tag, as the tag set gives it — never retyped in a test. */
const col = (id: string) => T.find((t) => t.id === id)!.color;

describe("pieceStyle — the base", () => {
  it("gives bare text a clickable style and nothing else", () => {
    const st = pieceStyle([], false, T, OPTS);
    expect(st).toEqual({ cursor: "pointer", borderRadius: "2px", paddingBottom: "1px" });
  });

  it("shades the live selection", () => {
    const st = pieceStyle([], true, T, OPTS);
    expect(st.background).toBe("rgba(35,32,27,.16)");
    expect(st.boxShadow).toBe("0 0 0 1px rgba(35,32,27,.25)");
  });

  it("still shades the selection over an annotated piece", () => {
    const st = pieceStyle([ann("place")], true, T, OPTS);
    expect(st.backgroundImage).toContain(col("place"));
    expect(st.boxShadow).toBe("0 0 0 1px rgba(35,32,27,.25)");
  });
});

describe("pieceStyle — clean read and structural tags", () => {
  it("draws no mark at all in clean read", () => {
    const st = pieceStyle([ann("place")], false, T, opts({ cleanRead: true }));
    expect(st.backgroundImage).toBeUndefined();
    expect(st.background).toBeUndefined();
  });

  it("keeps the selection visible even in clean read", () => {
    // Clean read hides the annotation layer, not the thing the user is doing right now.
    const st = pieceStyle([ann("place")], true, T, opts({ cleanRead: true }));
    expect(st.background).toBe("rgba(35,32,27,.16)");
  });

  it("does not paint a structural span", () => {
    // `structure` frames the text — an opener, a closer. Painting it would put a mark
    // under most of the document and drown the marks that carry information.
    const st = pieceStyle([ann("structure")], false, T, OPTS);
    expect(st.backgroundImage).toBeUndefined();
  });

  it("paints the inline tag inside a structural span, and only it", () => {
    const st = pieceStyle([ann("place", { id: "a" }), ann("structure", { id: "b" })], false, T, OPTS);
    expect(st.backgroundImage).toBe(
      "linear-gradient(" + col("place") + "," + col("place") + ")",
    );
    expect(st.paddingBottom).toBe("4px");
  });
});

describe("pieceStyle — underline mode", () => {
  it("draws a solid rule for an accepted mark", () => {
    const st = pieceStyle([ann("date")], false, T, OPTS);
    expect(st.backgroundImage).toBe("linear-gradient(" + col("date") + "," + col("date") + ")");
    expect(st.backgroundSize).toBe("100% 2px");
    expect(st.backgroundPosition).toBe("0 calc(100% - 0px)");
    expect(st.backgroundRepeat).toBe("no-repeat");
  });

  it("draws a dashed rule for a proposal", () => {
    const st = pieceStyle([ann("date", { status: "proposed" })], false, T, OPTS);
    expect(st.backgroundImage).toBe(
      "linear-gradient(to right," + col("date") + " 0 4px, transparent 4px 8px)",
    );
    expect(st.backgroundSize).toBe("8px 2px");
    expect(st.backgroundRepeat).toBe("repeat-x");
  });

  it("stacks two marks 4px apart and makes room for them", () => {
    const st = pieceStyle([ann("place", { id: "a" }), ann("person", { id: "b" })], false, T, OPTS);
    expect(st.backgroundPosition).toBe("0 calc(100% - 0px),0 calc(100% - 4px)");
    expect(st.paddingBottom).toBe("8px");
  });

  it("draws at most three rules but reserves room for every mark", () => {
    // The asymmetry is deliberate and is in the design: `inline.slice(0, 3)` caps the
    // gradients for legibility, while paddingBottom counts them all so a fourth mark
    // does not crowd the line below. Locked so the cap stays a decision, not a bug.
    const four = ["place", "person", "org", "date"].map((t, i) => ann(t, { id: "a" + i }));
    const st = pieceStyle(four, false, T, OPTS);
    expect(String(st.backgroundImage).split("linear-gradient").length - 1).toBe(3);
    expect(st.paddingBottom).toBe("12px");
  });
});

describe("pieceStyle — highlight mode", () => {
  const hi = opts({ mode: "highlight" });

  it("tints with the innermost tag's colour", () => {
    const st = pieceStyle([ann("place")], false, T, hi);
    expect(st.background).toBe(col("place") + "22");
    expect(st.boxShadow).toBe("inset 0 -2px 0 " + col("place") + "66");
  });

  it("tints a proposal faintly and outlines it dashed", () => {
    const st = pieceStyle([ann("place", { status: "proposed" })], false, T, hi);
    expect(st.background).toBe(col("place") + "14");
    expect(st.outline).toBe("1px dashed " + col("place") + "aa");
    expect(st.outlineOffset).toBe("1px");
  });

  it("deepens the tint and rings the piece with the OUTERMOST colour when marks overlap", () => {
    // Not the innermost. The tint already says what the innermost tag is; the ring says
    // "something larger also covers this", so it has to be a different colour to read.
    const st = pieceStyle([ann("place", { id: "a" }), ann("person", { id: "b" })], false, T, hi);
    expect(st.background).toBe(col("place") + "33");
    expect(st.boxShadow).toBe("inset 0 0 0 1px " + col("person") + "55");
  });

  it("draws no background image in highlight mode", () => {
    expect(pieceStyle([ann("place")], false, T, hi).backgroundImage).toBeUndefined();
  });
});

describe("pieceStyle — uncertain and active", () => {
  it("underlines an uncertain mark with a dotted rule in the reject colour", () => {
    const st = pieceStyle([ann("place", { uncertain: true })], false, T, OPTS);
    expect(st.textDecoration).toBe("underline dotted #a4452a");
  });

  it("flags uncertainty from any covering mark, not just the innermost", () => {
    const st = pieceStyle(
      [ann("place", { id: "a" }), ann("person", { id: "b", uncertain: true })],
      false,
      T,
      OPTS,
    );
    expect(st.textDecoration).toBe("underline dotted #a4452a");
  });

  it("rings the active annotation in its own colour", () => {
    const st = pieceStyle([ann("place", { id: "a7" })], false, T, opts({ activeId: "a7" }));
    expect(st.background).toBe(col("place") + "2e");
    expect(st.boxShadow).toBe("0 0 0 1px " + col("place") + "99");
  });

  it("takes the ring colour from the innermost mark when the active one is outer", () => {
    const st = pieceStyle(
      [ann("place", { id: "in" }), ann("person", { id: "out" })],
      false,
      T,
      opts({ activeId: "out" }),
    );
    expect(st.background).toBe(col("place") + "2e");
  });

  it("does not ring when the active annotation does not cover this piece", () => {
    const st = pieceStyle([ann("place", { id: "a" })], false, T, opts({ activeId: "zz" }));
    expect(st.boxShadow).toBeUndefined();
  });

  it("does not ring an active structural span — it is not painted at all", () => {
    const st = pieceStyle([ann("structure", { id: "s" })], false, T, opts({ activeId: "s" }));
    expect(st.background).toBeUndefined();
    expect(st.boxShadow).toBeUndefined();
  });

  it("suppresses the active ring in clean read", () => {
    const st = pieceStyle(
      [ann("place", { id: "a7" })],
      false,
      T,
      opts({ cleanRead: true, activeId: "a7" }),
    );
    expect(st.background).toBeUndefined();
  });
});

describe("pieceStyle — an unknown tag", () => {
  it("paints an orphan annotation grey rather than crashing", () => {
    // A tag can be deleted from the tag set while annotations still name it. Grey is
    // the placeholder `tagById` returns, and it must reach the reader unchanged.
    const st = pieceStyle([ann("no_such_tag")], false, T, OPTS);
    expect(st.backgroundImage).toBe("linear-gradient(#8b8275,#8b8275)");
  });
});
