import { describe, expect, it } from "vitest";

import { findParent, spanLen } from "./annotations";
import type { Ann } from "./types";

/** A minimal annotation; only the fields findParent reads are meaningful. */
function ann(id: string, start: number | null, end: number | null, doc = "d1"): Ann {
  return {
    id,
    doc,
    tag: "place",
    start,
    end,
    quote: start === null ? null : "x",
    attrs: {},
    layer: "gold",
    origin: "gold",
    prov: "human",
    status: "accepted",
    conf: null,
    uncertain: false,
    parent: null,
  };
}

describe("findParent", () => {
  it("returns null when there is no candidate", () => {
    const a = ann("a", 10, 20);
    expect(findParent(a, [a])).toBeNull();
  });

  it("finds a strictly containing annotation", () => {
    const a = ann("a", 10, 20);
    const outer = ann("outer", 0, 40);
    expect(findParent(a, [a, outer])).toBe("outer");
  });

  it("prefers the smallest of several containers", () => {
    const a = ann("a", 10, 20);
    const big = ann("big", 0, 100);
    const small = ann("small", 5, 30);
    expect(findParent(a, [a, big, small])).toBe("small");
  });

  it("does not treat an identical span as a parent", () => {
    const a = ann("a", 10, 20);
    const twin = ann("twin", 10, 20);
    expect(findParent(a, [a, twin])).toBeNull();
  });

  it("breaks a tie between equal containers by corpus order", () => {
    // The comparison is `<`, not `<=`, so the first equally-sized container wins.
    const a = ann("a", 10, 20);
    const first = ann("first", 0, 40);
    const second = ann("second", 0, 40);
    expect(findParent(a, [a, first, second])).toBe("first");
  });

  it("ignores a container in another document", () => {
    const a = ann("a", 10, 20, "d1");
    const elsewhere = ann("elsewhere", 0, 40, "d2");
    expect(findParent(a, [a, elsewhere])).toBeNull();
  });

  it("ignores document-scope annotations as containers", () => {
    const a = ann("a", 10, 20);
    const docScope = ann("doc", null, null);
    expect(findParent(a, [a, docScope])).toBeNull();
  });

  it("gives a document-scope annotation no parent", () => {
    const a = ann("a", null, null);
    const outer = ann("outer", 0, 40);
    expect(findParent(a, [a, outer])).toBeNull();
  });

  it("does not treat an abutting annotation as a container", () => {
    const a = ann("a", 10, 20);
    const before = ann("before", 0, 10);
    const after = ann("after", 20, 40);
    expect(findParent(a, [a, before, after])).toBeNull();
  });

  it("accepts a container that shares one edge but is longer", () => {
    const a = ann("a", 10, 20);
    const flush = ann("flush", 10, 40);
    expect(findParent(a, [a, flush])).toBe("flush");
  });

  // The design compares `b === a` — reference identity. That holds only while the array
  // is mutated in place. Every reducer case rebuilds `anns` with .map(), after which the
  // "same" annotation is a different object: b === a is false, the annotation contains
  // itself, and it becomes its own parent. Comparing ids is what makes the port survive
  // its first immutable update.
  it("does not make a structural copy of the annotation its own parent", () => {
    const a = ann("a", 10, 20);
    const copy: Ann = { ...a };
    expect(findParent(a, [copy])).toBeNull();
  });
});

describe("spanLen", () => {
  it("measures a range", () => {
    expect(spanLen(ann("a", 10, 20))).toBe(10);
  });

  it("gives a document-scope annotation no length", () => {
    expect(spanLen(ann("a", null, null))).toBe(0);
  });
});
