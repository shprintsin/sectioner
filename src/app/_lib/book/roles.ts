// The block types a page offers: every book role by default, or the working set's own
// ordered list (`roles` in worksets.json) with its titles and keys. Only the menu changes —
// validation and export read the role itself, so a region of a role left out of the list
// still loads, exports and can be changed to one on it.

import type { BookRole, RoleSpec } from "../types";
import { BOOK_ROLES } from "../types";

export const ROLE_KEY: Record<BookRole, string> = { main_text: "M", title: "H", subtitle: "6", commentary: "C", footnote: "F", running_header: "R", page_number: "N", separator: "D", unknown: "U", auxiliary_text: "E", signature: "I", page_footer: "Q", summary: "Z", date: "0", table: "9", noise: "8", figure: "7" };
export const ROLE_TITLE: Record<BookRole, string> = { main_text: "Main text", title: "Title / heading", subtitle: "Subtitle / subheading", commentary: "Commentary", footnote: "Footnote", running_header: "Page header", page_number: "Page number", separator: "Rule / separator", unknown: "Unclear", auxiliary_text: "Auxiliary text", signature: "Signature / author", page_footer: "Page footer", summary: "Summary", date: "Date / dateline", table: "Table area", noise: "Noise (speck, stain, bleed-through)", figure: "Figure (illustration, picture, logo, emblem)" };

export interface RoleEntry {
  role: BookRole;
  title: string;
  /** One letter or digit, read by the physical key (`KeyM`, `Digit9`). */
  key: string;
}

/** The menu: the workset's list with each title and key falling back to the default,
 *  or every role. An unknown role or a repeated role is dropped, and a key two entries
 *  claim goes to the first. */
export function roleMenu(spec?: RoleSpec[] | null): RoleEntry[] {
  const known = new Set<string>(BOOK_ROLES);
  const list: RoleSpec[] = spec?.length ? spec : BOOK_ROLES.map((role) => ({ role }));
  const out: RoleEntry[] = [];
  const keys = new Set<string>();
  for (const s of list) {
    if (!known.has(s.role) || out.some((e) => e.role === s.role)) continue;
    const want = (s.key ?? ROLE_KEY[s.role]).trim().toUpperCase();
    const key = /^[A-Z0-9]$/.test(want) && !keys.has(want) ? want : "";
    if (key) keys.add(key);
    out.push({ role: s.role, title: s.title?.trim() ? s.title.trim() : ROLE_TITLE[s.role], key });
  }
  return out;
}

/** KeyboardEvent.code → role, for the menu's keys only. */
export function roleByCode(menu: RoleEntry[]): Map<string, BookRole> {
  return new Map(menu.filter((e) => e.key).map((e) => [/^[0-9]$/.test(e.key) ? `Digit${e.key}` : `Key${e.key}`, e.role]));
}
