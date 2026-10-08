// The tag icon library: one glyph per name in `TAG_ICONS`, drawn like `icons.tsx` (24-unit
// grid, stroked in currentColor, nothing fetched — the tool runs offline).

import type { ReactNode } from "react";

import type { TagDef, TagIcon } from "../_lib/project";
import { tagColor } from "../_lib/project";
import { Icon } from "./icons";

const G: Record<TagIcon, ReactNode> = {
  paragraph: <path d="M4 6h16M4 10h16M4 14h16M4 18h11" />,
  heading: <path d="M6 5v14M18 5v14M6 12h12" strokeWidth={2.2} />,
  subheading: <><path d="M5 7v10M13 7v10M5 12h8" /><path d="M16.5 12.5c0-1 .8-1.6 1.8-1.6s1.7.6 1.7 1.5c0 1.7-3.5 2.4-3.5 4.6H20" /></>,
  comment: <path d="M4 5h16v11H10l-4 3.5V16H4Z" />,
  footnote: <><path d="M4 7h16M4 11h16" /><path d="M4 16.5h8M4 19.5h6" strokeWidth={1.3} /><path d="M15 15.5h1.5v4" /></>,
  header: <><rect x="3.5" y="3.5" width="17" height="17" rx="1.5" /><path d="M3.5 8.5h17" strokeWidth={2.4} /></>,
  footer: <><rect x="3.5" y="3.5" width="17" height="17" rx="1.5" /><path d="M3.5 15.5h17" strokeWidth={2.4} /></>,
  hash: <path d="M9 4 7.5 20M16.5 4 15 20M4.5 9h16M3.5 15h16" />,
  rule: <><path d="M3 12h18" strokeWidth={2.4} /><path d="M3 8h18M3 16h18" strokeOpacity={0.35} /></>,
  question: <><path d="M9 9a3 3 0 1 1 4.3 2.7c-.8.4-1.3 1-1.3 1.9V15" /><circle cx="12" cy="18.5" r="0.6" fill="currentColor" /></>,
  aside: <><rect x="3.5" y="4" width="11" height="16" rx="1" /><path d="M17.5 6v12M20.5 8v8" /></>,
  signature: <><path d="M3.5 16c2-6 4-9 5-6.5S7 18 9.5 15s3-5 4.5-3 1 4 3 3 2.5-2 3.5-2" /><path d="M3.5 20h17" /></>,
  summary: <><rect x="4" y="3.5" width="16" height="17" rx="1.5" /><path d="M7.5 8h9M7.5 12h9M7.5 16h5" /></>,
  calendar: <><rect x="3.5" y="5" width="17" height="15" rx="1.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>,
  table: <><rect x="3.5" y="4.5" width="17" height="15" rx="1" /><path d="M3.5 9.5h17M3.5 14.5h17M9.5 4.5v15M15 4.5v15" /></>,
  noise: <><circle cx="6" cy="7" r="1" fill="currentColor" /><circle cx="15" cy="5" r="0.8" fill="currentColor" /><circle cx="11" cy="12" r="1.3" fill="currentColor" /><circle cx="18" cy="13" r="0.9" fill="currentColor" /><circle cx="7" cy="17" r="0.8" fill="currentColor" /><circle cx="15" cy="19" r="1.1" fill="currentColor" /></>,
  image: <><rect x="3.5" y="4.5" width="17" height="15" rx="1.5" /><circle cx="9" cy="9.5" r="1.6" /><path d="m4 17 5-4.5 3.5 3 3-2.5 4.5 4" /></>,
  article: <><rect x="4" y="3.5" width="16" height="17" rx="1" /><path d="M7 7.5h10" strokeWidth={2.2} /><path d="M7 11.5h4.5M7 14.5h4.5M7 17.5h4.5M13 11.5h4M13 14.5h4M13 17.5h4" /></>,
  megaphone: <><path d="M4 10v4h3l8 4.5v-13L7 10Z" /><path d="M18 9.5a3.5 3.5 0 0 1 0 5M7 14l1.5 5h2.5L10 15" /></>,
  masthead: <><path d="M3.5 5h17M3.5 19h17" /><path d="M6 15V9l3 3.5L12 9v6M15 9h4M17 9v6" strokeWidth={2} /></>,
  info: <><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5.5" /><circle cx="12" cy="8" r="0.6" fill="currentColor" /></>,
  folder: <path d="M3.5 6.5a1 1 0 0 1 1-1h5l2 2.5h8a1 1 0 0 1 1 1v9.5a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1Z" />,
  list: <><path d="M9 6.5h11M9 12h11M9 17.5h11" /><circle cx="5" cy="6.5" r="0.9" fill="currentColor" /><circle cx="5" cy="12" r="0.9" fill="currentColor" /><circle cx="5" cy="17.5" r="0.9" fill="currentColor" /></>,
  stamp: <><path d="M9 4h6l-1 7h-4Z" /><path d="M5 14h14v3H5ZM6 20h12" /></>,
  star: <path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.3-4.1 5.9-.8Z" />,
  flag: <path d="M5.5 21V4M5.5 4.5h11l-2.5 4 2.5 4h-11" />,
  bookmark: <path d="M6.5 3.5h11v17L12 16l-5.5 4.5Z" />,
  quote: <><path d="M5 17c0-4 1-7 4.5-9M5 17h4v-4H5ZM13.5 17c0-4 1-7 4.5-9M13.5 17h4v-4h-4Z" /></>,
  link: <><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>,
  user: <><circle cx="12" cy="8" r="3.8" /><path d="M4.5 20.5c1-4 4-6 7.5-6s6.5 2 7.5 6" /></>,
  pin: <><path d="M12 21s6.5-6 6.5-11a6.5 6.5 0 0 0-13 0c0 5 6.5 11 6.5 11Z" /><circle cx="12" cy="10" r="2.3" /></>,
  tag: <><path d="M3 4.5v6.3l9.3 9.2 7.2-7.2L10.3 3.5H4a1 1 0 0 0-1 1Z" /><circle cx="7.5" cy="8" r="1.3" /></>,
  circle: <circle cx="12" cy="12" r="8" />,
  square: <rect x="4.5" y="4.5" width="15" height="15" rx="1.5" />,
  triangle: <path d="M12 4 20.5 19.5h-17Z" />,
  diamond: <path d="m12 3 9 9-9 9-9-9Z" />,
  check: <path d="M4.5 12.5 9.5 17.5 19.5 6.5" />,
  cross: <path d="M6 6l12 12M18 6 6 18" />,
  scroll: <><path d="M7 4h11a2 2 0 0 1 0 4h-1v10a2 2 0 0 1-2 2H6a2 2 0 0 1 0-4h1Z" /><path d="M10 9h4M10 12.5h4" /></>,
  book: <><path d="M12 6.5c-2-1.5-5-2-8-1.5v13c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5V5c-3-.5-6 0-8 1.5Z" /><path d="M12 6.5V19.5" /></>,
  mail: <><rect x="3.5" y="5.5" width="17" height="13" rx="1.5" /><path d="m4 6.5 8 6.5 8-6.5" /></>,
  money: <><rect x="2.5" y="6" width="19" height="12" rx="1.5" /><circle cx="12" cy="12" r="2.6" /><path d="M5.5 9v6M18.5 9v6" /></>,
  eye: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="2.8" /></>,
  bolt: <path d="M13.5 3 5 13.5h6L10 21l9-11h-6Z" />,
};

export function TagGlyph({ icon, size = 14 }: { icon: TagIcon; size?: number }) {
  return <Icon size={size}>{G[icon] ?? G.tag}</Icon>;
}

/** A tag's chip: its icon in its colour, the label beside it. */
export function TagSwatch({ tag, size = 14, label = true }: { tag: Pick<TagDef, "icon" | "hue" | "chroma" | "label">; size?: number; label?: boolean }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: tagColor(tag), minWidth: 0 }}>
      <TagGlyph icon={tag.icon} size={size} />
      {label ? <span style={{ color: "inherit", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tag.label}</span> : null}
    </span>
  );
}
