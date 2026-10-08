import { describe, expect, it } from "vitest";

import { SHARED_KEYS, resolveKey } from "./keymap";
import type { KeyEvent } from "./keymap";
import { makeInitial, proposals, reducer } from "./state";
import type { State } from "./state";
import { inProject } from "./tagset";

const DOC = "responsa/eynyitzchak/12866655";

const key = (k: string, over: Partial<KeyEvent> = {}): KeyEvent => ({ key: k, ...over });

/** A state with a live selection — the user is mid-tag. */
function selecting(): State {
  return reducer(makeInitial(), { type: "select", sel: { doc: DOC, start: 10, end: 20 }, rect: null });
}

const type_ = (s: State, k: string, over: Partial<KeyEvent> = {}) =>
  resolveKey(s, key(k, over)).action?.type ?? null;

describe("the precedence rule", () => {
  it("makes every colliding key a tag key while a passage is selected", () => {
    // The single subtlest thing in the design. Both directions, for every shared key.
    const sel = selecting();
    for (const k of SHARED_KEYS) {
      const tag = makeInitial().tags.find((t) => t.key === k && inProject(t, "p-responsa"));
      if (!tag) continue;
      const r = resolveKey(sel, key(k));
      expect(r.action, `selected: ${k}`).toEqual({ type: "applyTag", tagId: tag.id });
      expect(r.preventDefault, `selected: ${k}`).toBe(true);
    }
  });

  it("makes the same keys run their command when nothing is selected", () => {
    const idle = makeInitial();
    expect(type_(idle, "n")).toBe("stepSection");
    expect(type_(idle, "p")).toBe("stepSection");
    expect(type_(idle, "d")).toBe("toggleDone");
    expect(type_(idle, "c")).toBe("toggleCompact");
  });

  it("still tags with a key that is not shared with any command", () => {
    const sel = selecting();
    expect(resolveKey(sel, key("m")).action).toEqual({ type: "applyTag", tagId: "place" });
  });

  it("does not offer another project's tag key", () => {
    // `a` is advertisement, a press tag. In the responsa project it must fall through.
    const sel = selecting();
    expect(type_(sel, "a")).toBeNull();
  });
});

describe("undo is never swallowed", () => {
  it("takes ctrl+z even with a selection live", () => {
    // The design checks tag hotkeys before modifiers, so binding any tag to `z` would
    // silently break undo mid-selection. The modifier check is hoisted above it here.
    expect(resolveKey(selecting(), key("z", { ctrlKey: true })).action).toEqual({ type: "undo" });
  });

  it("takes cmd+z on a Mac and cmd+shift+z for redo", () => {
    const s = makeInitial();
    expect(type_(s, "z", { metaKey: true })).toBe("undo");
    expect(type_(s, "z", { metaKey: true, shiftKey: true })).toBe("redo");
  });

  it("takes ctrl+Z with the shift key producing a capital", () => {
    expect(type_(makeInitial(), "Z", { ctrlKey: true, shiftKey: true })).toBe("redo");
  });

  it("claims cmd+s for saving, as every editor does", () => {
    expect(type_(makeInitial(), "s", { metaKey: true })).toBe("save");
    expect(resolveKey(makeInitial(), key("s", { metaKey: true })).preventDefault).toBe(true);
  });

  it("leaves every other modified key to the browser", () => {
    // Cmd+R, Cmd+L, Cmd+T, Cmd+W still do what the browser does. An app that swallows
    // those is an app you cannot leave.
    const s = makeInitial();
    for (const k of ["r", "l", "t", "w", "d", "n"]) {
      expect(type_(s, k, { metaKey: true }), "cmd+" + k).toBeNull();
    }
  });
});

describe("text fields keep their keyboard", () => {
  const inField = { targetTag: "INPUT" as const };

  it("ignores tag hotkeys typed into an input", () => {
    const s = selecting();
    expect(type_(s, "m", inField)).toBeNull();
    expect(type_(s, "d", inField)).toBeNull();
    expect(type_(s, " ", inField)).toBeNull();
  });

  it("still closes the palette on Escape, and blurs the field", () => {
    const s = reducer(makeInitial(), { type: "openPalette" });
    const r = resolveKey(s, key("Escape", inField));
    expect(r.action).toEqual({ type: "closePalette" });
    expect(r.blur).toBe(true);
  });

  it("takes the first palette result on Enter", () => {
    const s = reducer(makeInitial(), { type: "openPalette" });
    expect(resolveKey(s, key("Enter", inField)).action).toEqual({ type: "acceptPaletteTop" });
  });

  it("leaves Enter alone in a field that is not the palette's", () => {
    expect(type_(makeInitial(), "Enter", inField)).toBeNull();
  });

  it("treats a textarea the same as an input", () => {
    expect(type_(selecting(), "m", { targetTag: "TEXTAREA" })).toBeNull();
  });
});

describe("the global keys", () => {
  it("opens the help map on ?, from anywhere", () => {
    expect(type_(makeInitial(), "?")).toBe("toggleHelp");
    expect(type_(selecting(), "?")).toBe("toggleHelp");
  });

  it("opens the palette on space, even mid-selection", () => {
    // Space is not a tag key and never can be — the tag-set editor takes one character
    // and the design's own hint text calls space the palette.
    expect(type_(selecting(), " ")).toBe("openPalette");
  });

  it("escapes from anywhere without preventing the browser's default", () => {
    const r = resolveKey(selecting(), key("Escape"));
    expect(r.action).toEqual({ type: "escape" });
    expect(r.preventDefault).toBe(false);
  });

  it("toggles clean read on backtick", () => {
    expect(type_(makeInitial(), "`")).toBe("toggleClean");
  });
});

describe("acting on the active annotation", () => {
  const active = () => reducer(makeInitial(), { type: "setActive", id: "a1" });

  it("deletes on Delete and on Backspace", () => {
    expect(resolveKey(active(), key("Delete")).action).toEqual({ type: "remove", id: "a1" });
    expect(resolveKey(active(), key("Backspace")).action).toEqual({ type: "remove", id: "a1" });
  });

  it("does nothing on Delete with nothing active", () => {
    expect(type_(makeInitial(), "Delete")).toBeNull();
  });

  it("picks an enum value with a number key", () => {
    expect(resolveKey(active(), key("3")).action).toEqual({ type: "pickEnum", index: 3 });
  });

  it("ignores number keys with nothing active", () => {
    expect(type_(makeInitial(), "3")).toBeNull();
  });

  it("moves the span boundary with the brackets", () => {
    expect(resolveKey(active(), key("]")).action).toEqual({ type: "stepBoundary", dir: 1 });
    expect(resolveKey(active(), key("[")).action).toEqual({ type: "stepBoundary", dir: -1 });
  });

  it("flags uncertain on u", () => {
    expect(type_(active(), "u")).toBe("toggleUncertain");
  });

  it("leaves u alone with nothing active, so it does not shadow a future command", () => {
    expect(type_(makeInitial(), "u")).toBeNull();
  });
});

describe("review mode", () => {
  const reviewing = () => reducer(makeInitial(), { type: "toggleReview" });

  it("accepts and rejects with y and n on a proposal", () => {
    const s = reviewing();
    const id = proposals(s)[0].id;
    expect(resolveKey(s, key("y")).action).toEqual({ type: "decide", id, ok: true });
    expect(resolveKey(s, key("n")).action).toEqual({ type: "decide", id, ok: false });
  });

  it("gives n back to section-stepping once the active row is not a proposal", () => {
    // `n` is decide-reject only while a proposal is active. Otherwise it is "next
    // section" — the same key, two jobs, disambiguated by what is selected.
    const s = reducer(reviewing(), { type: "setActive", id: "a1" });
    expect(type_(s, "n")).toBe("stepSection");
  });

  it("sends Tab through the proposal queue in review mode and the annotations outside it", () => {
    expect(type_(reviewing(), "Tab")).toBe("stepProposal");
    expect(type_(makeInitial(), "Tab")).toBe("stepAnnotation");
  });

  it("reverses Tab with shift, both ways", () => {
    expect(resolveKey(reviewing(), key("Tab", { shiftKey: true })).action).toEqual({
      type: "stepProposal",
      dir: -1,
    });
    expect(resolveKey(makeInitial(), key("Tab", { shiftKey: true })).action).toEqual({
      type: "stepAnnotation",
      dir: -1,
    });
  });

  it("always prevents the browser's own Tab handling, or focus leaves the reader", () => {
    expect(resolveKey(makeInitial(), key("Tab")).preventDefault).toBe(true);
  });
});

describe("Enter repeats the last tag", () => {
  it("resolves to repeatLastTag", () => {
    expect(type_(makeInitial(), "Enter")).toBe("repeatLastTag");
  });

  it("reports there was none, rather than doing nothing silently", () => {
    const out = reducer(makeInitial(), { type: "repeatLastTag" });
    expect(out.toast).toBe("no previous tag");
  });

  it("re-applies the tag and its attributes to a new selection", () => {
    let s = reducer(makeInitial(), { type: "select", sel: { doc: DOC, start: 10, end: 20 }, rect: null });
    s = reducer(s, { type: "applyTag", tagId: "ruling" });
    s = reducer(s, { type: "setAttr", id: s.activeId!, key: "rule", value: "forbid" });
    // lastTag holds the attributes as applied, not as later edited — repeating gives the
    // defaults again, which is what "repeat the tag" means.
    s = reducer(s, { type: "select", sel: { doc: DOC, start: 40, end: 50 }, rect: null });
    s = reducer(s, { type: "repeatLastTag" });
    const a = s.anns.find((x) => x.id === s.activeId)!;
    expect(a.tag).toBe("ruling");
    expect(a.attrs.rule).toBe("permit");
  });
});

describe("unclaimed keys", () => {
  it("are left to the browser", () => {
    const s = makeInitial();
    for (const k of ["F5", "ArrowLeft", "Home", "z", "j", "PageDown"]) {
      expect(type_(s, k), k).toBeNull();
    }
  });

  it("do not prevent the default", () => {
    expect(resolveKey(makeInitial(), key("F5")).preventDefault).toBe(false);
  });
});

describe("the keymap composes with the reducer", () => {
  it("tags a passage end to end, from the key to the annotation", () => {
    let s = selecting();
    const r = resolveKey(s, key("m"));
    s = reducer(s, r.action!);
    const a = s.anns.find((x) => x.id === s.activeId)!;
    expect(a.tag).toBe("place");
    expect(a.start).toBe(10);
    expect(s.sel).toBeNull();
  });

  it("clears the whole proposal queue with y, one key per proposal", () => {
    let s = reducer(makeInitial(), { type: "toggleReview" });
    const n = proposals(s).length;
    expect(n).toBeGreaterThan(0);
    for (let i = 0; i < n; i++) {
      const r = resolveKey(s, key("y"));
      expect(r.action, "step " + i).not.toBeNull();
      s = reducer(s, r.action!);
    }
    expect(proposals(s)).toEqual([]);
    // With the queue empty and nothing active, `y` claims nothing at all — it is only
    // ever "accept", never a fallback command.
    expect(resolveKey(s, key("y")).action).toBeNull();
  });
});
