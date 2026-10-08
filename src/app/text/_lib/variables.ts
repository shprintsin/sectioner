// Derived variables — the point of the whole exercise.
//
// Tagging is the means; a table with one row per document and one column per variable is
// the product (SPEC §1). This is that table's row, computed from the annotations alone.
//
// Two rules run through every definition here:
//   · **Only `accepted` counts.** A proposal is a claim, not a measurement, and a
//     rejection is evidence about the model. Neither may move a number.
//   · **Absence is `∅`, not 0.** "No date was tagged" and "the year is zero" are
//     different facts, and a CSV that writes both as 0 cannot be un-confused later.

import type { Ann } from "./types";

export interface VarRow {
  /** Column name in `variables.csv`. */
  id: string;
  /** Short label for the compact grid in the Analysis panel. */
  short: string;
  value: string | number;
}

/** The variables for one document, in the order they are displayed and exported. */
export function variables(docId: string, anns: Ann[]): VarRow[] {
  const list = anns.filter((a) => a.doc === docId && a.status === "accepted");
  const rulings = list.filter((a) => a.tag === "ruling");
  const places = list.filter((a) => a.tag === "place");
  const date = list.find((a) => a.tag === "date");

  return [
    {
      id: "ruling_forbid_count",
      short: "forbid",
      value: rulings.filter((a) => a.attrs.rule === "forbid").length,
    },
    {
      id: "ruling_conditional_count",
      short: "cond",
      value: rulings.filter((a) => a.attrs.rule === "conditional").length,
    },
    {
      id: "letter_year_ce",
      short: "year",
      // `!= null` on purpose: a year_ce of 0 is not a real year in this corpus, but the
      // rule that absence is ∅ and presence is the value must not depend on the value.
      value: date?.attrs.year_ce != null && date.attrs.year_ce !== "" ? date.attrs.year_ce : "∅",
    },
    {
      id: "place_distinct",
      short: "places",
      // Deduped on the gazetteer ref where there is one, on the surface form where there
      // is not. Two spellings of one town are one place; the ref is what knows that.
      value: new Set(places.map((a) => a.attrs.ref ?? a.quote)).size,
    },
    {
      id: "person_count",
      short: "persons",
      value: list.filter((a) => a.tag === "person").length,
    },
    {
      id: "has_measure",
      short: "measure",
      value: list.some((a) => a.tag === "measure" || a.tag === "price") ? "true" : "false",
    },
  ];
}

/** A value that reads as "nothing here", and is greyed out wherever it is shown. */
export function isEmptyValue(v: string | number): boolean {
  return v === "∅" || v === 0 || v === "false";
}
