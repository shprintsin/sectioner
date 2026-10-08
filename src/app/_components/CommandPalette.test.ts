import { describe, expect, it } from "vitest";

import { filterCommands, type Command } from "./CommandPalette";

const noop = () => undefined;
const cmds: Command[] = [
  { id: "a", group: "Review", label: "Accept region", keys: "A", run: noop },
  { id: "d", group: "Tools", label: "Draw region", keys: "B", keywords: "new box rectangle", run: noop },
  { id: "r", group: "Regions", label: "Merge the selection", keys: "⇧M", run: noop },
];

describe("filterCommands", () => {
  it("returns everything for an empty query", () => {
    expect(filterCommands(cmds, "  ").map((c) => c.id)).toEqual(["a", "d", "r"]);
  });
  it("needs every word, from the label, group, keywords or key", () => {
    expect(filterCommands(cmds, "region tools").map((c) => c.id)).toEqual(["d"]);
    expect(filterCommands(cmds, "rectangle").map((c) => c.id)).toEqual(["d"]);
    expect(filterCommands(cmds, "⇧m").map((c) => c.id)).toEqual(["r"]);
  });
  it("puts a label that starts with the query first", () => {
    expect(filterCommands(cmds, "draw").map((c) => c.id)).toEqual(["d"]);
    expect(filterCommands(cmds, "re").map((c) => c.id)[0]).toBe("a");
  });
});
