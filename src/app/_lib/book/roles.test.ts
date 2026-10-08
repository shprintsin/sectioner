// A working set's own block-type list: the menu, its keys and the fallbacks.

import { describe, expect, it } from "vitest";

import { BOOK_ROLES } from "../types";
import { ROLE_KEY, ROLE_TITLE, roleByCode, roleMenu } from "./roles";

describe("roleMenu", () => {
  it("without a list offers every role with its default title and key", () => {
    const m = roleMenu(undefined);
    expect(m.map((e) => e.role)).toEqual([...BOOK_ROLES]);
    expect(m.find((e) => e.role === "table")).toEqual({ role: "table", title: ROLE_TITLE.table, key: "9" });
  });

  it("a workset list is the whole menu, in its order, with its titles and keys", () => {
    const m = roleMenu([
      { role: "main_text", title: "Text line", key: "M" },
      { role: "separator", title: "Not text (ornament/rule/speck/logo)", key: "D" },
      { role: "table", title: "Table area", key: "9" },
    ]);
    expect(m.map((e) => [e.role, e.title, e.key])).toEqual([
      ["main_text", "Text line", "M"],
      ["separator", "Not text (ornament/rule/speck/logo)", "D"],
      ["table", "Table area", "9"],
    ]);
    const codes = roleByCode(m);
    expect(codes.get("KeyM")).toBe("main_text");
    expect(codes.get("Digit9")).toBe("table");
    expect(codes.get("KeyE")).toBeUndefined(); // a role left out has no hotkey
    expect(codes.size).toBe(3);
  });

  it("falls back to the default title and key, drops unknown and repeated roles and a taken key", () => {
    const m = roleMenu([
      { role: "separator" },
      { role: "nonsense" as never },
      { role: "separator", title: "again" },
      { role: "table", key: "d" },
    ]);
    expect(m).toEqual([
      { role: "separator", title: ROLE_TITLE.separator, key: ROLE_KEY.separator },
      { role: "table", title: ROLE_TITLE.table, key: "" },
    ]);
  });
});
