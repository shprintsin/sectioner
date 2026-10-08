import { describe, expect, it } from "vitest";

import { layoutKey } from "./keys";

const k = (key: string, code: string, shiftKey = false) => layoutKey({ key, code, shiftKey });

describe("shortcuts under a Hebrew layout", () => {
  it("reads a Hebrew letter back as the Latin key in its position", () => {
    expect(k("צ", "KeyM")).toBe("m");
    expect(k("ד", "KeyS")).toBe("s");
    expect(k("ק", "KeyE")).toBe("e");
    expect(k("ת", "Comma")).toBe(",");
    expect(k("ץ", "Period")).toBe(".");
  });

  it("keeps the shifted form", () => {
    expect(k("M", "KeyM", true)).toBe("M");
    expect(k("צ", "KeyM", true)).toBe("M");
  });

  it("reads mirrored brackets by position", () => {
    expect(k("]", "BracketLeft")).toBe("[");
    expect(k("[", "BracketRight")).toBe("]");
  });

  it("passes a Latin layout and named keys through", () => {
    expect(k("m", "KeyM")).toBe("m");
    expect(k("Enter", "Enter")).toBe("Enter");
    expect(k("ArrowDown", "ArrowDown")).toBe("ArrowDown");
    expect(k(" ", "Space")).toBe(" ");
    expect(k("3", "Digit3")).toBe("3");
  });
});
