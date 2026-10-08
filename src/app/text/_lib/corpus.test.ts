// Integrity of the transcribed fixture corpus. Nothing here tests behaviour; these check
// that eleven sections of Hebrew and 84 seeds came across intact, before any code depends
// on their offsets.
import { describe, expect, it } from "vitest";

import { PROJECTS, SEG_SEP, allSeeds, allSections } from "./corpus";
import { TAG_DEFS, inProject, tagById } from "./tagset";

describe("PROJECTS", () => {
  it("has the two projects, four volumes and eleven sections of the design", () => {
    expect(PROJECTS.map((p) => p.id)).toEqual(["p-responsa", "p-press"]);
    expect(PROJECTS.flatMap((p) => p.volumes)).toHaveLength(4);
    expect(PROJECTS.flatMap((p) => allSections(p))).toHaveLength(11);
  });

  it("gives every section a doc_id unique across the whole fixture", () => {
    const ids = PROJECTS.flatMap((p) => allSections(p)).map((s) => s.doc_id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("derives text as exactly segs.join(SEG_SEP)", () => {
    for (const p of PROJECTS) {
      for (const s of allSections(p)) {
        expect(s.text, s.doc_id).toBe(s.segs.join(SEG_SEP));
      }
    }
  });

  it("has no empty paragraph, which would collapse two separators into one", () => {
    for (const p of PROJECTS) {
      for (const s of allSections(p)) {
        for (const [i, seg] of s.segs.entries()) {
          expect(seg.length, `${s.doc_id} seg ${i}`).toBeGreaterThan(0);
        }
      }
    }
  });

  it("keeps every paragraph findable at a computable offset", () => {
    // The reader locates each paragraph by scanning forward from the previous one. If a
    // paragraph ever repeated verbatim this would still hold, but the arithmetic below is
    // the direct check: paragraph i starts at the sum of the ones before it plus separators.
    for (const p of PROJECTS) {
      for (const s of allSections(p)) {
        let expected = 0;
        for (const [i, seg] of s.segs.entries()) {
          expect(s.text.slice(expected, expected + seg.length), `${s.doc_id}/${i}`).toBe(
            seg,
          );
          expected += seg.length + SEG_SEP.length;
        }
      }
    }
  });
});

describe("seeds", () => {
  const seeds = allSeeds(PROJECTS);

  it("has the 84 seeds of the design", () => {
    expect(seeds).toHaveLength(84);
  });

  it("names a tag that exists", () => {
    const known = new Set(TAG_DEFS.map((t) => t.id));
    for (const { sec, seed } of seeds) {
      expect(known.has(seed.tag), `${sec.doc_id}: ${seed.tag}`).toBe(true);
    }
  });

  it("only uses tags available in the project it sits in", () => {
    for (const p of PROJECTS) {
      for (const sec of allSections(p)) {
        for (const seed of sec.seeds) {
          const t = tagById(TAG_DEFS, seed.tag);
          expect(inProject(t, p.id), `${sec.doc_id}: ${seed.tag} in ${p.id}`).toBe(true);
        }
      }
    }
  });

  it("sets exactly one of q, from/to, or doc", () => {
    for (const { sec, seed } of seeds) {
      const forms = [
        seed.q !== undefined,
        seed.from !== undefined,
        seed.doc === true,
      ].filter(Boolean);
      expect(forms.length, `${sec.doc_id}: ${seed.tag}`).toBe(1);
      if (seed.from !== undefined) expect(seed.to, sec.doc_id).toBeDefined();
    }
  });

  // The load-bearing one. A quote that cannot be found is an annotation that silently
  // disappears — the design's resolver just returns, leaving no trace.
  it("can locate every quote in its own section text", () => {
    for (const { sec, seed } of seeds) {
      if (seed.q === undefined) continue;
      const nth = seed.nth ?? 1;
      let i = -1;
      for (let k = 0; k < nth; k++) {
        i = sec.text.indexOf(seed.q, i + 1);
        expect(i, `${sec.doc_id}: occurrence ${k + 1} of "${seed.q.slice(0, 30)}"`)
          .toBeGreaterThanOrEqual(0);
      }
      expect(sec.text.slice(i, i + seed.q.length)).toBe(seed.q);
    }
  });

  it("can locate both ends of every from/to span, in order", () => {
    for (const { sec, seed } of seeds) {
      if (seed.from === undefined) continue;
      const a = sec.text.indexOf(seed.from);
      const b = sec.text.indexOf(seed.to!);
      expect(a, sec.doc_id).toBeGreaterThanOrEqual(0);
      expect(b, sec.doc_id).toBeGreaterThanOrEqual(0);
      expect(b + seed.to!.length, `${sec.doc_id}: from/to are inverted`).toBeGreaterThan(
        a,
      );
    }
  });

  it("only sets attributes the tag declares, with legal enum values", () => {
    for (const { sec, seed } of seeds) {
      const t = tagById(TAG_DEFS, seed.tag);
      for (const [k, v] of Object.entries(seed.attrs ?? {})) {
        const def = t.attrs.find((a) => a.id === k);
        expect(def, `${sec.doc_id}: ${seed.tag} has no attribute ${k}`).toBeDefined();
        if (def!.kind === "enum") {
          expect(def!.values, `${seed.tag}.${k} = ${String(v)}`).toContain(v);
        }
        if (def!.kind === "number") expect(typeof v, `${seed.tag}.${k}`).toBe("number");
      }
    }
  });

  it("gives a confidence to machine proposals and to nothing else", () => {
    for (const { sec, seed } of seeds) {
      if (seed.status === "proposed") {
        expect(seed.prov, sec.doc_id).toBe("agent");
        expect(typeof seed.conf, `${sec.doc_id}: ${seed.tag}`).toBe("number");
        expect(seed.conf).toBeGreaterThan(0);
        expect(seed.conf).toBeLessThanOrEqual(1);
      } else {
        expect(seed.conf, `${sec.doc_id}: ${seed.tag}`).toBeUndefined();
      }
    }
  });

  it("gives every document-scope seed no quote and a document-scope tag", () => {
    for (const { sec, seed } of seeds) {
      if (seed.doc !== true) continue;
      expect(seed.q, sec.doc_id).toBeUndefined();
      expect(tagById(TAG_DEFS, seed.tag).scope, sec.doc_id).toBe("document");
    }
  });

  it("gives every section exactly one document-class seed", () => {
    for (const p of PROJECTS) {
      for (const sec of allSections(p)) {
        const docScope = sec.seeds.filter((s) => s.doc === true);
        expect(docScope.map((s) => s.tag), sec.doc_id).toEqual(["doctype"]);
      }
    }
  });
});

describe("the Hebrew survived transcription", () => {
  it("writes a gershayim as two ASCII apostrophes throughout", () => {
    const text = PROJECTS.flatMap((p) => allSections(p))
      .map((s) => s.text)
      .join("");
    // 38 in the design. The count is the assertion: if the corpus were ever re-encoded
    // to U+05F4, every offset past the first gershayim would shift and this fails first.
    expect((text.match(/''/g) ?? []).length).toBe(38);
    expect(text).not.toContain("״");
  });

  it("contains no astral characters, so UTF-16 offsets equal code-point offsets", () => {
    for (const p of PROJECTS) {
      for (const s of allSections(p)) {
        expect([...s.text].length, s.doc_id).toBe(s.text.length);
      }
    }
  });

  it("carries no bidi control characters", () => {
    for (const p of PROJECTS) {
      for (const s of allSections(p)) {
        expect(s.text, s.doc_id).not.toMatch(/[‎‏‪-‮⁦-⁩]/);
      }
    }
  });
});
