import { describe, expect, it } from "vitest";

import { PROJECTS, allSections } from "./corpus";
import { materialise } from "./seeds";
import type { Ann, AttrValues } from "./types";
import { isEmptyValue, variables } from "./variables";

let n = 0;
function ann(tag: string, attrs: AttrValues = {}, over: Partial<Ann> = {}): Ann {
  return {
    id: "a" + n++,
    doc: "d1",
    tag,
    start: 0,
    end: 1,
    quote: "x",
    attrs,
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

const get = (anns: Ann[], id: string) => variables("d1", anns).find((v) => v.id === id)!.value;

describe("variables — what counts", () => {
  it("counts only accepted annotations", () => {
    const anns = [
      ann("person"),
      ann("person", {}, { status: "proposed" }),
      ann("person", {}, { status: "rejected" }),
      ann("person", {}, { status: "stale" }),
    ];
    expect(get(anns, "person_count")).toBe(1);
  });

  it("ignores annotations in another document", () => {
    expect(get([ann("person", {}, { doc: "d2" })], "person_count")).toBe(0);
  });

  it("returns the six columns, in a stable order", () => {
    expect(variables("d1", []).map((v) => v.id)).toEqual([
      "ruling_forbid_count",
      "ruling_conditional_count",
      "letter_year_ce",
      "place_distinct",
      "person_count",
      "has_measure",
    ]);
  });
});

describe("variables — rulings", () => {
  it("counts forbidding and conditional rulings separately", () => {
    const anns = [
      ann("ruling", { rule: "forbid" }),
      ann("ruling", { rule: "forbid" }),
      ann("ruling", { rule: "conditional" }),
      ann("ruling", { rule: "permit" }),
    ];
    expect(get(anns, "ruling_forbid_count")).toBe(2);
    expect(get(anns, "ruling_conditional_count")).toBe(1);
  });

  it("does not count a ruling with no rule attribute", () => {
    expect(get([ann("ruling")], "ruling_forbid_count")).toBe(0);
  });
});

describe("variables — the year", () => {
  it("is ∅ when no date is tagged", () => {
    expect(get([], "letter_year_ce")).toBe("∅");
  });

  it("is ∅ when a date is tagged but carries no year", () => {
    // The distinction that matters: a date was found, but it did not resolve. That is
    // not the same as "no date", and it is certainly not the year 0.
    expect(get([ann("date", { day: "כ" })], "letter_year_ce")).toBe("∅");
  });

  it("is the year when the date resolves", () => {
    expect(get([ann("date", { year_ce: 1895 })], "letter_year_ce")).toBe(1895);
  });

  it("takes the first date when a document has several", () => {
    const anns = [ann("date", { year_ce: 1895 }), ann("date", { year_ce: 1901 })];
    expect(get(anns, "letter_year_ce")).toBe(1895);
  });

  it("ignores a proposed date, even when it is the only one", () => {
    expect(get([ann("date", { year_ce: 1895 }, { status: "proposed" })], "letter_year_ce")).toBe(
      "∅",
    );
  });
});

describe("variables — distinct places", () => {
  it("counts two spellings of one gazetteer entry once", () => {
    const anns = [
      ann("place", { ref: "geo:poznan" }, { quote: "פוזנן" }),
      ann("place", { ref: "geo:poznan" }, { quote: "פוזנא" }),
    ];
    expect(get(anns, "place_distinct")).toBe(1);
  });

  it("falls back to the surface form when there is no ref", () => {
    const anns = [ann("place", {}, { quote: "פוזנן" }), ann("place", {}, { quote: "וילנא" })];
    expect(get(anns, "place_distinct")).toBe(2);
  });

  it("counts two mentions of the same unresolved town once", () => {
    const anns = [ann("place", {}, { quote: "פוזנן" }), ann("place", {}, { quote: "פוזנן" })];
    expect(get(anns, "place_distinct")).toBe(1);
  });

  it("does not fuse an unresolved place with a resolved one it may well be", () => {
    // Deliberate: the dedupe key is what the data says, not what a human can see. A
    // silent merge here would invent a resolution the gazetteer never made.
    const anns = [
      ann("place", { ref: "geo:poznan" }, { quote: "פוזנן" }),
      ann("place", {}, { quote: "פוזנן" }),
    ];
    expect(get(anns, "place_distinct")).toBe(2);
  });
});

describe("variables — has_measure", () => {
  it("is true for a measure", () => {
    expect(get([ann("measure")], "has_measure")).toBe("true");
  });

  it("is true for a press price, which is the same fact in the other corpus", () => {
    expect(get([ann("price")], "has_measure")).toBe("true");
  });

  it("is the string 'false', not the boolean — it goes straight into a CSV cell", () => {
    expect(get([], "has_measure")).toBe("false");
  });
});

describe("isEmptyValue", () => {
  it("greys out ∅, zero and false", () => {
    expect([isEmptyValue("∅"), isEmptyValue(0), isEmptyValue("false")]).toEqual([
      true,
      true,
      true,
    ]);
  });

  it("does not grey out a real value", () => {
    expect([isEmptyValue(1895), isEmptyValue("true"), isEmptyValue(3)]).toEqual([
      false,
      false,
      false,
    ]);
  });
});

describe("variables — over the fixture corpus", () => {
  const anns = materialise(PROJECTS);

  it("computes a full row for every section without throwing", () => {
    for (const p of PROJECTS) {
      for (const sec of allSections(p)) {
        const row = variables(sec.doc_id, anns);
        expect(row, sec.doc_id).toHaveLength(6);
        for (const v of row) expect(v.value, `${sec.doc_id}/${v.id}`).toBeDefined();
      }
    }
  });

  const yearOf = (docId: string) =>
    variables(docId, anns).find((v) => v.id === "letter_year_ce")!.value;

  it("resolves a year for every responsa section — each one is a dated letter", () => {
    // Measured, not assumed: all six carry an accepted `date` with a `year_ce`. A
    // responsum without a dateline would be the interesting case, and this fixture has
    // none, so the ∅ branch is exercised by the press project below instead.
    for (const s of allSections(PROJECTS[0])) expect(yearOf(s.doc_id), s.doc_id).not.toBe("∅");
  });

  it("leaves the year ∅ for a press block that carries no date of its own", () => {
    // Measured: three of the five press sections are ∅. A newspaper block need not name
    // its date — the issue does — so this is a real state of the data and not just an
    // untested branch. Two of the five do carry one, which is why the press adapter
    // cannot simply stamp the issue date over the column.
    const years = allSections(PROJECTS[1]).map((s) => yearOf(s.doc_id));
    expect(years.filter((y) => y === "∅")).toHaveLength(3);
    expect(years.filter((y) => y !== "∅")).toHaveLength(2);
  });
});
