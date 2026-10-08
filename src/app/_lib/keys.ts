// Shortcuts are named by their Latin letter, but the reviewers type with a Hebrew
// layout active: `M` then arrives as `e.key === "צ"` and every `case "m"` misses. The
// physical key (`e.code`) is the same on both layouts, so a key the layout turned into a
// non-Latin character is read back from its position. A Latin layout passes through
// untouched. The brackets are read by position always: a right-to-left layout mirrors
// them, and `[` must stay "previous page" whichever way the layout draws it.

/** The fields a mode reads off a key press. */
export interface KeyInput {
  key: string;
  code: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}

const PUNCT: Record<string, [string, string]> = {
  Comma: [",", "<"],
  Period: [".", ">"],
  Slash: ["/", "?"],
  Semicolon: [";", ":"],
  Quote: ["'", '"'],
  Minus: ["-", "_"],
  Equal: ["=", "+"],
  Backquote: ["`", "~"],
};

const MIRRORED: Record<string, [string, string]> = {
  BracketLeft: ["[", "{"],
  BracketRight: ["]", "}"],
};

/** The key as a US layout would have produced it, when the active layout did not. */
export function layoutKey(e: Pick<KeyInput, "key" | "code" | "shiftKey">): string {
  const mirrored = MIRRORED[e.code];
  if (mirrored) return mirrored[e.shiftKey ? 1 : 0];
  // Named keys (Enter, ArrowDown, …) and anything already ASCII are what they say.
  if (e.key.length !== 1 || e.key.charCodeAt(0) < 128) return e.key;
  const letter = /^Key([A-Z])$/.exec(e.code);
  if (letter) return e.shiftKey ? letter[1] : letter[1].toLowerCase();
  const digit = /^Digit([0-9])$/.exec(e.code);
  if (digit && !e.shiftKey) return digit[1];
  const punct = PUNCT[e.code];
  if (punct) return punct[e.shiftKey ? 1 : 0];
  return e.key;
}

export function normalizeKey(e: KeyInput): KeyInput {
  return { key: layoutKey(e), code: e.code, shiftKey: e.shiftKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey };
}
