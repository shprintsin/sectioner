import { describe, expect, it } from "vitest";

import { articleColor, articleHue } from "./display";

describe("article colours", () => {
  it("an article key is the same colour on every page, whatever hue a page picked", () => {
    const left = { id: "s3", articleKey: "A15", colorHue: 200 };
    const right = { id: "s9", articleKey: "A15", colorHue: 17 };
    expect(articleColor(left)).toBe(articleColor(right));
    expect(articleHue(left)).toBe(articleHue({ id: "s1", articleKey: "A15" }));
  });

  it("a section with no key keeps the hue its page picked", () => {
    expect(articleHue({ id: "s3", colorHue: 200 })).toBe(200);
    expect(articleHue({ id: "s3", articleKey: " ", colorHue: 200 })).toBe(200);
  });
});
