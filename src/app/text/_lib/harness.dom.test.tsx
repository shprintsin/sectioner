// @vitest-environment jsdom
//
// Slice 0: proves the jsdom environment, the React 19 + Testing Library pairing, the
// jest-dom matchers from vitest.setup.ts, and the esbuild JSX override in
// vitest.config.ts (tsconfig says jsx:"preserve", which esbuild would otherwise honour
// and then fail to parse this file).
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("dom harness", () => {
  it("renders JSX and applies the jest-dom matchers", () => {
    render(<div dir="rtl">בדין יי&apos;&apos;ש לפסח</div>);
    expect(screen.getByText(/בדין/)).toBeInTheDocument();
  });

  it("gives a real Selection API but no layout — which is why the seam exists", () => {
    // jsdom implements Selection/Range faithfully enough that anchorNode and
    // anchorOffset are populated by a real range. That is why jsdom, not happy-dom:
    // the offset walk in domSelection.ts is testable here.
    const host = document.createElement("span");
    host.dataset.off = "137";
    host.dataset.doc = "d1";
    host.append(document.createTextNode("אבגדהו"));
    document.body.append(host);

    const range = document.createRange();
    range.setStart(host.firstChild!, 4);
    range.setEnd(host.firstChild!, 6);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);

    expect(sel.anchorNode).toBe(host.firstChild);
    expect(sel.anchorOffset).toBe(4);

    // But there is no layout engine, so the selection rectangle is unavailable here.
    // The design places its floating tag menu from that rectangle — so the rect must
    // cross the DOM seam as plain data and every calculation on it stays pure.
    expect(typeof range.getBoundingClientRect).toBe("undefined");
  });
});
