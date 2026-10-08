// Slice 0: proves the runner, the `~/` alias and the TypeScript pipeline, in the node
// environment that everything under _lib/ runs in. Replaced by real tests as the modules
// land; kept until then so `npm test` is never green-because-empty.
import { describe, expect, it } from "vitest";

describe("test harness", () => {
  it("runs TypeScript in the node environment", () => {
    const gershayim = "תרנ''ה";
    // The whole offset model rests on this: a gershayim written as two ASCII
    // apostrophes is two characters. Six, not five.
    expect(gershayim.length).toBe(6);
  });

  it("has no DOM here", () => {
    expect(typeof document).toBe("undefined");
  });
});
