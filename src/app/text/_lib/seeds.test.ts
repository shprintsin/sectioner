import { describe, expect, it } from "vitest";

import { PROJECTS } from "./corpus";
import { AGENT_LAYER, find, materialise } from "./seeds";
import type { Section, Seed } from "./types";

function section(segs: string[], seeds: Seed[] = []): Section {
  return {
    doc_id: "d1",
    part: "part",
    title: "t",
    segs,
    text: segs.join("\n\n"),
    seeds,
  };
}

describe("find", () => {
  it("locates the first occurrence", () => {
    expect(find("abcabc", "abc", 1)).toEqual({ start: 0, end: 3 });
  });

  it("locates the nth occurrence", () => {
    expect(find("abcabc", "abc", 2)).toEqual({ start: 3, end: 6 });
  });

  it("counts overlapping occurrences", () => {
    // The scan advances by one character, not by the needle's length, so "aa" occurs
    // three times in "aaaa" and the second starts at index 1.
    expect(find("aaaa", "aa", 2)).toEqual({ start: 1, end: 3 });
  });

  it("returns null when the needle is absent", () => {
    expect(find("abc", "zz", 1)).toBeNull();
  });

  it("returns null when there are fewer occurrences than asked for", () => {
    expect(find("abcabc", "abc", 3)).toBeNull();
  });

  // The trap this project has already paid for once: a gershayim written as two ASCII
  // apostrophes is two characters. Any arithmetic that assumes one shifts every offset
  // after it.
  it("measures a gershayim as two characters", () => {
    const text = "בדין יי''ש לפסח";
    const hit = find(text, "יי''ש", 1);
    expect(hit).not.toBeNull();
    expect(hit!.end - hit!.start).toBe(5);
    expect(text.slice(hit!.start, hit!.end)).toBe("יי''ש");
  });
});

describe("materialise", () => {
  it("resolves a quote seed to offsets and copies the quote from the text", () => {
    const sec = section(["שלום עולם"], [{ tag: "place", q: "עולם" }]);
    const [a] = materialise([{ ...projectOf(sec) }]);
    expect(a.start).toBe(5);
    expect(a.end).toBe(9);
    expect(a.quote).toBe("עולם");
    expect(a.doc).toBe("d1");
  });

  it("gives a document-scope seed a null range and no quote", () => {
    const sec = section(["שלום"], [{ tag: "doctype", doc: true, attrs: { value: "news" } }]);
    const [a] = materialise([projectOf(sec)]);
    expect(a.start).toBeNull();
    expect(a.end).toBeNull();
    expect(a.quote).toBeNull();
    expect(a.attrs).toEqual({ value: "news" });
  });

  it("spans a from/to seed from the start of one phrase to the end of the other", () => {
    const sec = section(
      ["alpha", "beta", "gamma"],
      [{ tag: "advertisement", from: "beta", to: "gamma" }],
    );
    const [a] = materialise([projectOf(sec)]);
    expect(a.start).toBe(7);
    expect(a.end).toBe(18);
    expect(a.quote).toBe("beta\n\ngamma");
  });

  it("drops a seed whose quote cannot be found, without leaving a gap in the ids", () => {
    const sec = section(
      ["שלום עולם"],
      [
        { tag: "place", q: "עולם" },
        { tag: "place", q: "אין כזה" },
        { tag: "place", q: "שלום" },
      ],
    );
    const out = materialise([projectOf(sec)]);
    expect(out).toHaveLength(2);
    expect(out.map((a) => a.id)).toEqual(["a1", "a2"]);
  });

  it("routes an agent seed to the agent layer and everything else to gold", () => {
    const sec = section(
      ["שלום עולם"],
      [
        { tag: "place", q: "שלום", prov: "agent", status: "proposed", conf: 0.5 },
        { tag: "place", q: "עולם", prov: "rule" },
      ],
    );
    const [agent, rule] = materialise([projectOf(sec)]);
    expect(agent.layer).toBe(AGENT_LAYER);
    expect(agent.prov).toBe("agent");
    expect(agent.status).toBe("proposed");
    expect(rule.layer).toBe("gold");
    expect(rule.prov).toBe("rule");
    expect(rule.status).toBe("accepted");
  });

  // The design writes `sd.conf || null`, which turns a real confidence of 0 into null.
  // The badge then renders "?" instead of "0.00" and the proposal looks unscored rather
  // than scored zero.
  it("keeps a confidence of exactly zero", () => {
    const sec = section(
      ["שלום"],
      [{ tag: "place", q: "שלום", prov: "agent", status: "proposed", conf: 0 }],
    );
    const [a] = materialise([projectOf(sec)]);
    expect(a.conf).toBe(0);
  });

  it("gives an annotation with no confidence null rather than undefined", () => {
    const sec = section(["שלום"], [{ tag: "place", q: "שלום" }]);
    expect(materialise([projectOf(sec)])[0].conf).toBeNull();
  });

  it("copies the seed's attributes rather than sharing them", () => {
    const attrs = { type: "city" };
    const sec = section(["שלום"], [{ tag: "place", q: "שלום", attrs }]);
    const [a] = materialise([projectOf(sec)]);
    a.attrs.type = "region";
    expect(attrs.type).toBe("city");
  });

  it("computes parents across the whole set", () => {
    const sec = section(
      ["אבגד הוזח"],
      [
        { tag: "structure", q: "אבגד הוזח" },
        { tag: "place", q: "הוזח" },
      ],
    );
    const [outer, inner] = materialise([projectOf(sec)]);
    expect(outer.parent).toBeNull();
    expect(inner.parent).toBe(outer.id);
  });

  it("is deterministic", () => {
    expect(materialise(PROJECTS)).toEqual(materialise(PROJECTS));
  });
});

describe("the fixture corpus materialises", () => {
  const anns = materialise(PROJECTS);

  it("produces one annotation per seed — none silently dropped", () => {
    expect(anns).toHaveLength(84);
  });

  it("gives every ranged annotation a quote equal to its own slice", () => {
    const byDoc = new Map(
      PROJECTS.flatMap((p) => p.volumes.flatMap((v) => v.sections)).map((s) => [
        s.doc_id,
        s.text,
      ]),
    );
    for (const a of anns) {
      if (a.start === null || a.end === null) continue;
      const text = byDoc.get(a.doc)!;
      expect(text.slice(a.start, a.end), `${a.id} ${a.tag}`).toBe(a.quote);
      expect(a.start, a.id).toBeLessThan(a.end);
      expect(a.end, a.id).toBeLessThanOrEqual(text.length);
    }
  });

  it("gives every annotation a unique id", () => {
    expect(new Set(anns.map((a) => a.id)).size).toBe(anns.length);
  });

  it("only ever points parent at an annotation in the same document", () => {
    const byId = new Map(anns.map((a) => [a.id, a]));
    for (const a of anns) {
      if (a.parent === null) continue;
      const p = byId.get(a.parent);
      expect(p, `${a.id} -> ${a.parent}`).toBeDefined();
      expect(p!.doc).toBe(a.doc);
    }
  });

  it("has no annotation as its own parent", () => {
    for (const a of anns) expect(a.parent, a.id).not.toBe(a.id);
  });

  it("has the nesting the design's sample text was built to show", () => {
    // עין יצחק סימן א, the salute: a structural span holds the recipient's name, the
    // name ends in his title `אב''ד דק''ק פוזנן`, the title contains the community, and
    // the community name contains the town. Four levels — and the reason the inline TEI
    // exporter cannot assume a flat span list.
    const doc = "responsa/eynyitzchak/12866655";
    const chain: string[] = [];
    let cur = anns.find(
      (a) => a.doc === doc && a.tag === "place" && a.quote === "פוזנן",
    );
    expect(cur, "the town inside the recipient's title").toBeDefined();
    while (cur) {
      chain.push(cur.tag);
      cur = cur.parent ? anns.find((a) => a.id === cur!.parent) : undefined;
    }
    expect(chain).toEqual(["place", "org", "person", "structure"]);
  });
});

/** Wrap a bare section in the project/volume shape materialise expects. */
function projectOf(sec: Section) {
  return {
    id: "p-test",
    name: "test",
    path: "",
    corpusLabel: "",
    tagsetPath: "",
    volumes: [
      {
        id: "v",
        title: "",
        sub: "",
        slug: "",
        units: 1,
        pct: 0,
        review: 0,
        sections: [sec],
      },
    ],
  };
}
