import { describe, expect, it } from "vitest";

import { PROJECTS } from "./corpus";
import { materialise } from "./seeds";
import {
  inDocs,
  nextStatusFilter,
  paletteList,
  projectDocIds,
  proposals,
  visibleAnns,
  volAnns,
  volDocIds,
} from "./selectors";
import { TAG_DEFS } from "./tagset";
import type { Ann, AnnStatus } from "./types";

function ann(id: string, doc: string, over: Partial<Ann> = {}): Ann {
  return {
    id,
    doc,
    tag: "place",
    start: 0,
    end: 1,
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

const st = (s: AnnStatus): Partial<Ann> => ({ status: s });

describe("document scoping", () => {
  it("lists every doc_id in a project, across volumes", () => {
    const ids = projectDocIds(PROJECTS[0]);
    expect(ids.length).toBe(PROJECTS[0].volumes.reduce((n, v) => n + v.sections.length, 0));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("lists a volume's doc_ids as a subset of its project's", () => {
    const all = new Set(projectDocIds(PROJECTS[0]));
    for (const id of volDocIds(PROJECTS[0].volumes[0])) expect(all.has(id)).toBe(true);
  });

  it("keeps only annotations in the given documents", () => {
    const out = inDocs([ann("a", "d1"), ann("b", "d2")], ["d1"]);
    expect(out.map((a) => a.id)).toEqual(["a"]);
  });
});

describe("volAnns", () => {
  it("drops rejections but keeps proposals", () => {
    const out = volAnns(
      [ann("a", "d1"), ann("b", "d1", st("rejected")), ann("c", "d1", st("proposed"))],
      ["d1"],
    );
    expect(out.map((a) => a.id)).toEqual(["a", "c"]);
  });

  it("preserves corpus order", () => {
    const out = volAnns([ann("z", "d1"), ann("a", "d1")], ["d1"]);
    expect(out.map((a) => a.id)).toEqual(["z", "a"]);
  });
});

describe("visibleAnns", () => {
  const live = [
    ann("acc", "d1"),
    ann("prop", "d1", st("proposed")),
    ann("unc", "d1", { uncertain: true }),
  ];

  it("hides proposals when review mode is off", () => {
    expect(visibleAnns(live, false, "all").map((a) => a.id)).toEqual(["acc", "unc"]);
  });

  it("shows proposals when review mode is on", () => {
    expect(visibleAnns(live, true, "all").map((a) => a.id)).toEqual(["acc", "prop", "unc"]);
  });

  it("shows nothing under the proposals filter while review mode is off", () => {
    // The two gates compose rather than override: a filter cannot un-hide a layer.
    expect(visibleAnns(live, false, "proposals")).toEqual([]);
  });

  it("shows only proposals under the proposals filter in review mode", () => {
    expect(visibleAnns(live, true, "proposals").map((a) => a.id)).toEqual(["prop"]);
  });

  it("shows only flagged rows under the uncertain filter", () => {
    expect(visibleAnns(live, false, "uncertain").map((a) => a.id)).toEqual(["unc"]);
  });

  it("shows an uncertain proposal under the uncertain filter only in review mode", () => {
    const both = [ann("x", "d1", { status: "proposed", uncertain: true })];
    expect(visibleAnns(both, false, "uncertain")).toEqual([]);
    expect(visibleAnns(both, true, "uncertain").map((a) => a.id)).toEqual(["x"]);
  });
});

describe("proposals", () => {
  it("picks the undecided machine claims", () => {
    const out = proposals([ann("a", "d1"), ann("b", "d1", st("proposed"))]);
    expect(out.map((a) => a.id)).toEqual(["b"]);
  });

  it("finds the proposals the fixture ships, all in one volume", () => {
    const anns = materialise(PROJECTS);
    const ids = volDocIds(PROJECTS[0].volumes[0]);
    const props = proposals(volAnns(anns, ids));
    expect(props.length).toBeGreaterThan(0);
    for (const p of props) {
      expect(p.prov).toBe("agent");
      expect(p.layer).toBe("agent:run-14");
    }
  });
});

describe("nextStatusFilter", () => {
  it("cycles all → proposals → uncertain → all", () => {
    expect(nextStatusFilter("all")).toBe("proposals");
    expect(nextStatusFilter("proposals")).toBe("uncertain");
    expect(nextStatusFilter("uncertain")).toBe("all");
  });
});

describe("paletteList", () => {
  it("offers every in-project tag when the query is empty", () => {
    const out = paletteList(TAG_DEFS, "p-responsa", "");
    expect(out.length).toBeGreaterThan(0);
    expect(out.every((t) => t.proj === "both" || t.proj === "p-responsa")).toBe(true);
  });

  it("never offers another project's tags", () => {
    expect(paletteList(TAG_DEFS, "p-responsa", "adver")).toEqual([]);
    expect(paletteList(TAG_DEFS, "p-press", "adver").map((t) => t.id)).toEqual([
      "advertisement",
    ]);
  });

  it("matches the English label case-insensitively", () => {
    expect(paletteList(TAG_DEFS, "p-responsa", "PLA").map((t) => t.id)).toContain("place");
  });

  it("matches the Hebrew label", () => {
    const place = TAG_DEFS.find((t) => t.id === "place")!;
    expect(paletteList(TAG_DEFS, "p-responsa", place.he).map((t) => t.id)).toContain("place");
  });

  it("matches the id, which is how a two-word tag is reachable in one token", () => {
    expect(paletteList(TAG_DEFS, "p-responsa", "agent_group").map((t) => t.id)).toEqual([
      "agent_group",
    ]);
  });

  it("returns nothing for a query that matches nothing", () => {
    expect(paletteList(TAG_DEFS, "p-responsa", "zzzz")).toEqual([]);
  });
});
