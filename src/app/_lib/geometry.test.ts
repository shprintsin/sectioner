import { describe, expect, it } from "vitest";

import { bookReadingOrder, columnOf, coveredShare, cutBox, fromGrid, handleCursor, intersection, moveSplit, normBox, pageAxis, pageToView, readingOrder, resizeBox, screenDeltaToPage, shiftBox, toGrid, union, viewSize, viewToPage, viewTransform, type ViewRotation } from "./geometry";
import type { BBox } from "./types";

describe("union / coverage", () => {
  it("union is the envelope", () => {
    expect(union([[10, 10, 20, 20], [5, 15, 12, 30]])).toEqual([5, 10, 20, 30]);
    expect(union([])).toEqual([0, 0, 0, 0]);
  });
  it("coveredShare is the share of the block inside the lasso", () => {
    expect(coveredShare([0, 0, 10, 10], [0, 0, 5, 10])).toBeCloseTo(0.5);
    expect(coveredShare([0, 0, 10, 10], [20, 20, 30, 30])).toBe(0);
    expect(coveredShare([0, 0, 0, 0], [0, 0, 5, 5])).toBe(0);
  });
});

describe("newspaper reading order", () => {
  const bounds = [0, 500, 1000];
  it("a spanning block leads, then the right column top to bottom, then the left", () => {
    const items = [
      { id: "L1", bbox: [20, 100, 430, 200] as BBox },
      { id: "R2", bbox: [570, 300, 980, 400] as BBox },
      { id: "R1", bbox: [570, 100, 980, 200] as BBox },
      { id: "span", bbox: [10, 0, 990, 50] as BBox },
      { id: "L2", bbox: [20, 300, 430, 400] as BBox },
    ];
    expect(readingOrder(items, bounds, 1000)).toEqual(["span", "R1", "R2", "L1", "L2"]);
  });
  it("columnOf: wide → 999, otherwise by centre", () => {
    expect(columnOf([10, 0, 990, 50], bounds, 1000)).toBe(999);
    expect(columnOf([570, 100, 980, 200], bounds, 1000)).toBe(1);
    expect(columnOf([20, 100, 430, 200], bounds, 1000)).toBe(0);
    expect(columnOf([-20, 0, -5, 10], bounds, 1000)).toBe(0);
  });
});

describe("book reading order", () => {
  it("finds the gutter itself and reads right column first", () => {
    const items = [
      { id: "l1", bbox: [100, 100, 480, 300] as BBox },
      { id: "r2", bbox: [520, 320, 900, 500] as BBox },
      { id: "r1", bbox: [520, 100, 900, 300] as BBox },
      { id: "l2", bbox: [100, 320, 480, 500] as BBox },
    ];
    expect(bookReadingOrder(items)).toEqual(["r1", "r2", "l1", "l2"]);
  });
  it("a spanning heading reads with the right column at its own height", () => {
    const items = [
      { id: "r1", bbox: [520, 100, 900, 300] as BBox },
      { id: "l1", bbox: [100, 100, 480, 300] as BBox },
      { id: "t", bbox: [100, 310, 900, 340] as BBox },
      { id: "r2", bbox: [520, 350, 900, 500] as BBox },
      { id: "l2", bbox: [100, 350, 480, 500] as BBox },
    ];
    expect(bookReadingOrder(items)).toEqual(["r1", "t", "r2", "l1", "l2"]);
  });
  it("one column stays top to bottom", () => {
    const items = [
      { id: "b", bbox: [100, 400, 900, 600] as BBox },
      { id: "a", bbox: [100, 100, 900, 300] as BBox },
    ];
    expect(bookReadingOrder(items)).toEqual(["a", "b"]);
  });
});

describe("grid", () => {
  it("round-trips pixel → 0–1000 → pixel within rounding", () => {
    const px: BBox = [137, 16, 223, 43];
    const g = toGrid(px, 1241, 1754);
    expect(g[0]).toBeCloseTo((137 / 1241) * 1000, 4);
    const back = fromGrid(g, 1241, 1754).map(Math.round);
    expect(back).toEqual(px);
  });
});

describe("cutBox", () => {
  const b: BBox = [10, 20, 110, 220];
  it("a horizontal cut gives the top and bottom halves, tiling the box", () => {
    const [top, bot] = cutBox(b, 100, "h")!;
    expect(top).toEqual([10, 20, 110, 100]);
    expect(bot).toEqual([10, 100, 110, 220]);
    expect(union([top, bot])).toEqual(b);
  });
  it("a vertical cut gives the left and right halves, tiling the box", () => {
    const [left, right] = cutBox(b, 60.4, "v")!;
    expect(left).toEqual([10, 20, 60, 220]);
    expect(right).toEqual([60, 20, 110, 220]);
    expect(union([left, right])).toEqual(b);
  });
  it("refuses a cut outside the box or one that leaves a sliver", () => {
    expect(cutBox(b, 20, "h")).toBeNull();
    expect(cutBox(b, 300, "h")).toBeNull();
    expect(cutBox(b, 11, "v")).toBeNull();
    expect(cutBox(b, Number.NaN, "v")).toBeNull();
  });
});

describe("view rotation", () => {
  const W = 1380, H = 947;
  const ROTS: ViewRotation[] = [0, 90, 180, 270];

  it("viewToPage undoes pageToView at every angle", () => {
    for (const r of ROTS) for (const [x, y] of [[0, 0], [W, H], [123, 456], [W, 0], [0, H]]) {
      const [vx, vy] = pageToView(x, y, r, W, H);
      expect(viewToPage(vx, vy, r, W, H)).toEqual([x, y]);
    }
  });

  it("the page's corners land on the turned view's corners", () => {
    for (const r of ROTS) {
      const [vw, vh] = viewSize(W, H, r);
      const got = [[0, 0], [W, 0], [0, H], [W, H]].map(([x, y]) => pageToView(x, y, r, W, H).join(",")).sort();
      expect(got).toEqual([[0, 0], [vw, 0], [0, vh], [vw, vh]].map((q) => q.join(",")).sort());
    }
  });

  it("90 turns clockwise: the page's top-left corner goes to the view's top-right", () => {
    expect(pageToView(0, 0, 90, W, H)).toEqual([H, 0]);
    expect(pageToView(0, 0, 270, W, H)).toEqual([0, W]);
  });

  it("the CSS transform moves a point where pageToView says", () => {
    // translate(tx, ty) rotate(a), origin top-left: p -> R(a)p + t
    const apply = (css: string | undefined, x: number, y: number): [number, number] => {
      if (!css) return [Math.round(x), Math.round(y)];
      const m = /translate\((-?[\d.]+)(?:px)?, (-?[\d.]+)(?:px)?\) rotate\((\d+)deg\)/.exec(css)!;
      const [tx, ty, a] = [Number(m[1]), Number(m[2]), (Number(m[3]) * Math.PI) / 180];
      return [Math.round(Math.cos(a) * x - Math.sin(a) * y + tx) + 0, Math.round(Math.sin(a) * x + Math.cos(a) * y + ty) + 0]; // + 0: no -0
    };
    const s = 2; // whole pixels: a .5 would round differently after the trig
    for (const r of ROTS) for (const [x, y] of [[10, 20], [W, H], [700, 3]]) {
      const [vx, vy] = pageToView(x, y, r, W, H);
      expect(apply(viewTransform(r, W * s, H * s), x * s, y * s)).toEqual([Math.round(vx * s), Math.round(vy * s)]);
    }
  });
});

/* Every geometry act done on a turned view must land on the page where the reviewer sees
 * it land. Each case does the act the way the canvas does it on the turned view (pointer
 * points through `viewToPage`, keyboard steps through `screenDeltaToPage`, cut axes
 * through `pageAxis`) and checks the page-frame result against the same act seen on
 * screen: the result, turned onto the view, must be what the reviewer did there. */
describe("acts on a turned view", () => {
  const W = 600, H = 400;
  const B: BBox = [100, 50, 300, 120];
  const vbox = (b: BBox, rot: ViewRotation): BBox => {
    const [ax, ay] = pageToView(b[0], b[1], rot, W, H);
    const [bx, by] = pageToView(b[2], b[3], rot, W, H);
    return normBox(ax, ay, bx, by);
  };
  const toPage = (vx: number, vy: number, rot: ViewRotation) => viewToPage(vx, vy, rot, W, H);
  const ROTS: ViewRotation[] = [0, 90, 180, 270];

  for (const rot of ROTS) {
    describe(`turned ${rot}°`, () => {
      it("draw (B): a rectangle dragged on screen is that ink's page box", () => {
        const v = vbox(B, rot);                          // what the reviewer sees round the ink
        const [x0, y0] = toPage(v[0], v[1], rot);          // drag from its top-left on screen
        const [x1, y1] = toPage(v[2], v[3], rot);          // to its bottom-right
        expect(normBox(x0, y0, x1, y1)).toEqual(B);
      });

      it("move by drag: the box moves on screen with the pointer", () => {
        const v = vbox(B, rot);
        const [ax, ay] = toPage(v[0] + 5, v[1] + 5, rot);
        const [bx, by] = toPage(v[0] + 5 + 30, v[1] + 5 - 12, rot);
        const out = shiftBox(B, bx - ax, by - ay);
        expect(vbox(out, rot)).toEqual([v[0] + 30, v[1] - 12, v[2] + 30, v[3] - 12]);
      });

      it("resize by a handle: only the dragged side moves, by the pointer's step", () => {
        // the handle is drawn on the page's east edge; find where that edge is on screen
        const v = vbox(B, rot);
        const east = vbox([B[2], B[1], B[2], B[3]], rot);   // a line on screen
        const step = 25;
        const [ex, ey] = [(east[0] + east[2]) / 2, (east[1] + east[3]) / 2];
        // drag outward, away from the box's middle, as the reviewer would to widen it
        const [cx, cy] = [(v[0] + v[2]) / 2, (v[1] + v[3]) / 2];
        const dir = east[0] === east[2] ? [Math.sign(ex - cx), 0] : [0, Math.sign(ey - cy)];
        const [ax, ay] = toPage(ex, ey, rot);
        const [bx, by] = toPage(ex + dir[0] * step, ey + dir[1] * step, rot);
        const out = resizeBox(B, "e", bx - ax, by - ay);
        expect(out).toEqual([B[0], B[1], B[2] + step, B[3]]);
        const vo = vbox(out, rot);
        const grown = vo.map((c, i) => c - v[i]);
        expect(grown.filter((d) => d !== 0)).toEqual([dir[0] + dir[1] > 0 ? step : -step]);
      });

      it("nudge (alt-arrow) moves the box the way the arrow points on screen", () => {
        for (const [sx, sy] of [[2, 0], [-2, 0], [0, 2], [0, -10]] as const) {
          const [dx, dy] = screenDeltaToPage(sx, sy, rot);
          const v = vbox(B, rot);
          expect(vbox(shiftBox(B, dx, dy), rot)).toEqual([v[0] + sx, v[1] + sy, v[2] + sx, v[3] + sy]);
        }
      });

      it("split (S) cuts across the screen, and ↓ moves the line down the screen", () => {
        const axis = pageAxis("h", rot);
        const v = vbox(B, rot);
        const mid = axis === "v" ? (B[0] + B[2]) / 2 : (B[1] + B[3]) / 2;
        const halves = cutBox(B, mid, axis, 2)!;
        const [a, b] = halves.map((h) => vbox(h, rot));
        for (const h of [a, b]) expect([h[0], h[2]]).toEqual([v[0], v[2]]);   // full width on screen
        expect(Math.min(a[3], b[3])).toBe(Math.max(a[1], b[1]));             // stacked top/bottom
        const lineY = (at: number) => (axis === "v" ? vbox([at, B[1], at, B[3]], rot) : vbox([B[0], at, B[2], at], rot))[1];
        expect(lineY(moveSplit(B, mid, axis, 7, rot))).toBeCloseTo(lineY(mid) + 7);
        expect(lineY(moveSplit(B, mid, axis, -7, rot))).toBeCloseTo(lineY(mid) - 7);
      });

      it("cut tools: W cuts across the screen, ⇧W down it, at the clicked point", () => {
        const v = vbox(B, rot);
        const [px, py] = toPage(v[0] + 40, v[1] + 20, rot);            // a click inside the box
        for (const shown of ["h", "v"] as const) {
          const axis = pageAxis(shown, rot);
          const halves = cutBox(B, axis === "v" ? px : py, axis, 2)!.map((h) => vbox(h, rot));
          if (shown === "h") {
            for (const h of halves) expect([h[0], h[2]]).toEqual([v[0], v[2]]);
            expect(Math.min(halves[0][3], halves[1][3])).toBeCloseTo(v[1] + 20);
          } else {
            for (const h of halves) expect([h[1], h[3]]).toEqual([v[1], v[3]]);
            expect(Math.min(halves[0][2], halves[1][2])).toBeCloseTo(v[0] + 40);
          }
        }
      });

      it("merge: the union is the same box whichever way the page is shown", () => {
        const C2: BBox = [250, 200, 420, 260];
        const u = union([B, C2]);
        const vu = union([vbox(B, rot), vbox(C2, rot)]);
        expect(vbox(u, rot)).toEqual(vu);
      });

      it("marquee select picks what the dragged rectangle covers on screen", () => {
        const boxes: BBox[] = [B, [400, 300, 450, 350], [120, 200, 200, 260]];
        const sv = vbox([90, 40, 210, 220], rot);                        // a rectangle on screen
        const [x0, y0] = toPage(sv[0], sv[1], rot);
        const [x1, y1] = toPage(sv[2], sv[3], rot);
        const onPage = boxes.map((b) => intersection(b, normBox(x0, y0, x1, y1)) > 0);
        const onScreen = boxes.map((b) => intersection(vbox(b, rot), sv) > 0);
        expect(onPage).toEqual(onScreen);
        expect(onPage).toEqual([true, false, true]);
      });
    });
  }

  it("resize handles show the cursor of the edge as it is seen", () => {
    expect(handleCursor("n", 0)).toBe("ns-resize");
    expect(handleCursor("n", 90)).toBe("ew-resize");
    expect(handleCursor("nw", 90)).toBe("nesw-resize");
    expect(handleCursor("nw", 180)).toBe("nwse-resize");
  });
});
