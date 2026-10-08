import type { NewsSection } from "../types";

/** Stable article identity, never the content type or current list position. An
 *  article key (A15) names the same article on every page of the issue, so it alone
 *  decides the colour: the same key is the same colour on both pages of a spread. The
 *  hue picked when blocks are grouped only colours a section with no key, which exists
 *  on one page only. */
export function articleHue(section: Pick<NewsSection, "id" | "articleKey" | "colorHue">): number {
  const articleKey = section.articleKey?.trim();
  if (!articleKey && section.colorHue != null) return section.colorHue;
  const key = articleKey || section.id;
  const number = /^A?([0-9]+)$/.exec(key)?.[1] ?? /^s([0-9]+)$/.exec(key)?.[1];
  const hash = number ? Number(number) : [...key].reduce((n, c) => ((n * 31 + c.codePointAt(0)!) >>> 0), 0);
  return (hash * 47 + Math.floor(hash / 10) * 71) % 360;
}

export function articleColor(section: Pick<NewsSection, "id" | "articleKey" | "colorHue">, alpha = 1): string {
  return `hsl(${articleHue(section).toFixed(2)} 62% 36% / ${alpha})`;
}

/** Pick the largest remaining gap in the current page's palette. */
export function nextGroupHue(sections: NewsSection[]): number {
  const used = sections.map(articleHue);
  let best = 0, distance = -1;
  for (let hue = 0; hue < 360; hue++) {
    const gap = Math.min(180, ...used.map(v => Math.min(Math.abs(hue - v), 360 - Math.abs(hue - v))));
    if (gap > distance) { best = hue; distance = gap; }
  }
  return best;
}

export function blockTag(section: NewsSection | undefined, blockId: number): string {
  if (!section) return `B${blockId}`;
  return `${section.articleKey || section.id}.${section.orderUncertain ? "?" : section.blockIds.indexOf(blockId) + 1} · B${blockId}`;
}

/** On-page labels show membership only; block IDs remain in advanced inspection. */
export function sectionTag(section: NewsSection | undefined): string {
  return section ? section.articleKey || section.id : "—";
}
