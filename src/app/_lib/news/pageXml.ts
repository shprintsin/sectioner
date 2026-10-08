// PAGE-XML (what eynollah and most layout tools write) → the layout JSON the newspaper
// engine reads. Pure: a string in, an object out; no XML library.
//
// The engine needs blocks and the printed lines inside them, in image pixels:
//
//   { "model", "page", "width", "height",
//     "regions": [ { "level": "block", "block": 1, "label": "text", "bbox": [x0,y0,x1,y1],
//                    "reading_order": 3 },
//                  { "level": "line",  "block": 1, "label": "", "bbox": [...] } ] }
//
// Every region of the page becomes a block, numbered 1… in document order; each
// TextLine becomes a line of the region that contains it. A polygon becomes its bounding
// box. The label is the engine's vocabulary: `text`, `text:heading`, `text:drop-capital`,
// `separator`, `image` (only these four are treated specially; anything else is text).
// The reading order, when the file has one, is carried as `reading_order` — the engine
// does not use it for newspapers, but nothing is thrown away.

export interface LayoutRegion {
  level: "block" | "line";
  block: number;
  label: string;
  bbox: [number, number, number, number];
  reading_order?: number | null;
  /** The region's or line's id in the PAGE file. */
  xml_id?: string;
  score?: number | null;
}

export interface LayoutJson {
  model: string;
  page: string;
  width: number;
  height: number;
  n_regions: number;
  regions: LayoutRegion[];
}

interface El {
  name: string;
  attrs: Record<string, string>;
  children: El[];
  parent: El | null;
}

const decode = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n))).replace(/&amp;/g, "&");

/** A tree of the elements and their attributes. Text content, comments, processing
 *  instructions and CDATA are skipped: PAGE keeps geometry in attributes. */
export function parseXml(xml: string): El {
  const root: El = { name: "#root", attrs: {}, children: [], parent: null };
  let cur = root;
  const tag = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g;
  for (let m = tag.exec(xml); m; m = tag.exec(xml)) {
    if (!m[2]) continue;
    const name = m[2].replace(/^.*:/, ""); // drop a namespace prefix: pc:TextRegion
    if (m[1]) {
      // a closing tag: walk up to the matching element (tolerates sloppy nesting)
      let e: El | null = cur;
      while (e && e.name !== name) e = e.parent;
      if (e?.parent) cur = e.parent;
      continue;
    }
    const attrs: Record<string, string> = {};
    for (const a of m[3].matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[a[1]] = decode(a[2] ?? a[3] ?? "");
    const el: El = { name, attrs, children: [], parent: cur };
    cur.children.push(el);
    if (!m[4]) cur = el;
  }
  return root;
}

function* walk(e: El): Generator<El> {
  for (const c of e.children) {
    yield c;
    yield* walk(c);
  }
}

/** The bounding box of a `Coords` child: `points="x,y x,y …"`, or legacy `Point` children. */
function boxOf(e: El): [number, number, number, number] | null {
  const coords = e.children.find((c) => c.name === "Coords");
  if (!coords) return null;
  const pts: number[][] = [];
  if (coords.attrs.points) {
    for (const p of coords.attrs.points.trim().split(/\s+/)) {
      const [x, y] = p.split(",").map(Number);
      if (Number.isFinite(x) && Number.isFinite(y)) pts.push([x, y]);
    }
  } else {
    for (const p of coords.children.filter((c) => c.name === "Point")) pts.push([Number(p.attrs.x), Number(p.attrs.y)]);
  }
  if (!pts.length) return null;
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

/** A PAGE region element's label in the engine's vocabulary, or null for a non-region. */
export function labelOf(e: El): string | null {
  switch (e.name) {
    case "TextRegion": {
      const t = (e.attrs.type ?? "").toLowerCase();
      if (t === "heading" || t === "header" || t === "caption") return "text:heading";
      if (t === "drop-capital" || t === "drop_capital") return "text:drop-capital";
      return "text";
    }
    case "SeparatorRegion":
      return "separator";
    case "ImageRegion":
    case "GraphicRegion":
    case "ChartRegion":
    case "MapRegion":
    case "LineDrawingRegion":
      return "image";
    case "TableRegion":
    case "MathsRegion":
    case "ChemRegion":
    case "MusicRegion":
    case "AdvertRegion":
    case "NoiseRegion":
    case "UnknownRegion":
    case "CustomRegion":
      return "text";
    default:
      return null;
  }
}

/** Convert one PAGE-XML document. Throws when there is no `Page` with a size. */
export function pageXmlToLayout(xml: string, pageName?: string): LayoutJson {
  const root = parseXml(xml);
  const page = [...walk(root)].find((e) => e.name === "Page");
  if (!page) throw new Error("not a PAGE-XML file: no <Page> element");
  const width = Number(page.attrs.imageWidth);
  const height = Number(page.attrs.imageHeight);
  if (!(width > 0 && height > 0)) throw new Error("the <Page> element has no imageWidth / imageHeight");

  // reading order: regionRef → position
  const order = new Map<string, number>();
  const ro = [...walk(page)].find((e) => e.name === "ReadingOrder");
  if (ro) {
    let n = 0;
    for (const e of walk(ro)) {
      if (e.name !== "RegionRefIndexed" && e.name !== "RegionRef") continue;
      if (e.attrs.regionRef && !order.has(e.attrs.regionRef)) order.set(e.attrs.regionRef, ++n);
    }
  }

  const regions: LayoutRegion[] = [];
  let next = 1;
  const visit = (e: El) => {
    const label = labelOf(e);
    if (label) {
      const bbox = boxOf(e);
      if (bbox) {
        const id = next++;
        regions.push({ level: "block", block: id, label, bbox, reading_order: e.attrs.id ? order.get(e.attrs.id) ?? null : null, ...(e.attrs.id ? { xml_id: e.attrs.id } : {}), score: null });
        for (const line of e.children.filter((c) => c.name === "TextLine")) {
          const lb = boxOf(line);
          if (lb) regions.push({ level: "line", block: id, label: "", bbox: lb, ...(line.attrs.id ? { xml_id: line.attrs.id } : {}), score: null });
        }
      }
    }
    // nested regions (a table's cells, a region inside a region) are blocks of their own
    for (const c of e.children) if (c.name !== "TextLine") visit(c);
  };
  for (const c of page.children) visit(c);

  const name = pageName ?? page.attrs.imageFilename?.replace(/^.*[\\/]/, "").replace(/\.[^.]+$/, "") ?? "page";
  return { model: "PAGE-XML", page: name, width, height, n_regions: regions.length, regions };
}
