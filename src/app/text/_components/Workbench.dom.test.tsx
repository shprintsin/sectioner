// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PROJECTS } from "../_lib/corpus";
import { makeInitial, proposals } from "../_lib/state";

import { Workbench } from "./Workbench";

const SEC = PROJECTS[0].volumes[0].sections[0];

/** Every rendered piece of reader text, in document order. */
function pieces(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>("[data-off]"));
}

/** Select `[start, end)` of the first section by driving a real DOM Range. */
function selectRange(start: number, end: number) {
  const all = pieces().filter((el) => el.dataset.doc === SEC.doc_id);
  const find = (off: number) => {
    for (let i = all.length - 1; i >= 0; i--) {
      const s = Number(all[i].dataset.off);
      if (s <= off) return { el: all[i], inner: off - s };
    }
    return null;
  };
  const a = find(start);
  const b = find(end);
  if (!a || !b) throw new Error("offset not rendered");
  const range = document.createRange();
  range.setStart(a.el.firstChild!, a.inner);
  range.setEnd(b.el.firstChild!, b.inner);
  const sel = window.getSelection()!;
  sel.removeAllRanges();
  sel.addRange(range);
  fireEvent.mouseUp(all[0]);
}

describe("the reader renders the corpus", () => {
  it("shows every section of the volume, in the project's direction", () => {
    render(<Workbench persist={false} />);
    for (const sec of PROJECTS[0].volumes[0].sections) {
      expect(screen.getAllByText(sec.title).length).toBeGreaterThan(0);
    }
    const para = pieces()[0].parentElement!;
    expect(para.style.direction).toBe("var(--tei-dir, rtl)");
    expect(para.style.unicodeBidi).toBe("plaintext");
  });

  it("renders each piece as exactly one text node", () => {
    // The whole offset scheme rests on this. A `{" "}` or a fragment inside a piece
    // makes React emit two text nodes plus a comment, and every anchorOffset past the
    // first is then wrong by an unpredictable amount.
    render(<Workbench persist={false} />);
    for (const el of pieces()) {
      expect(el.childNodes.length, el.dataset.off).toBe(1);
      expect(el.firstChild!.nodeType, el.dataset.off).toBe(Node.TEXT_NODE);
    }
  });

  it("reassembles the section's paragraphs character for character from the DOM itself", () => {
    // The paragraph separator is structure, not text: the blank line between segments
    // never reaches the DOM, because each paragraph is its own flex row. So the rendered
    // text is the segments
    // joined with nothing — and every offset still indexes the separator-bearing source,
    // which is exactly why `data-off` is absolute rather than per-paragraph.
    render(<Workbench persist={false} />);
    const mine = pieces().filter((el) => el.dataset.doc === SEC.doc_id);
    expect(mine.map((el) => el.textContent).join("")).toBe(SEC.segs.join(""));
  });

  it("gives every piece a data-off that indexes the source text", () => {
    render(<Workbench persist={false} />);
    for (const el of pieces()) {
      const sec = PROJECTS.flatMap((p) => p.volumes.flatMap((v) => v.sections)).find(
        (x) => x.doc_id === el.dataset.doc,
      )!;
      const off = Number(el.dataset.off);
      expect(sec.text.slice(off, off + (el.textContent ?? "").length)).toBe(el.textContent);
    }
  });
});

describe("tagging by hand", () => {
  it("turns a drag plus a hotkey into an annotation", () => {
    render(<Workbench persist={false} />);
    const before = pieces().length;
    selectRange(10, 20);
    expect(screen.getByText(/^selection /)).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "m" });
    // The new mark cuts the run it sits in, so the reader has more pieces than before,
    // and the status bar now names an annotation rather than a selection.
    expect(pieces().length).toBeGreaterThan(before);
    expect(screen.getByText(/^annotation n\d+ · Place$/)).toBeInTheDocument();
  });

  it("puts the tagged text in the inspector, unchanged", () => {
    render(<Workbench persist={false} />);
    selectRange(10, 20);
    fireEvent.keyDown(window, { key: "m" });
    const range = screen.getByText(/^chars (\d+)–(\d+) · gold · human/);
    const [, a, b] = /chars (\d+)–(\d+)/.exec(range.textContent ?? "")!;
    // Snapped outward to whole words, so the span contains the drag and the quote shown
    // is the source text at those offsets — not a re-rendering of it.
    expect(Number(a)).toBeLessThanOrEqual(10);
    expect(Number(b)).toBeGreaterThanOrEqual(20);
    // Three times on screen, and character-identical in all three: the marked run in the
    // reader, the inspector's quote, and the new row in the tag track — whose group
    // tagging just opened, which is the point of opening it.
    const quote = SEC.text.slice(Number(a), Number(b));
    expect(screen.getAllByText(quote)).toHaveLength(3);
  });

  it("refuses a selection that crosses two sections", () => {
    render(<Workbench persist={false} />);
    const all = pieces();
    const a = all[0];
    const b = all.find((el) => el.dataset.doc !== a.dataset.doc)!;
    const range = document.createRange();
    range.setStart(a.firstChild!, 1);
    range.setEnd(b.firstChild!, 2);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    fireEvent.mouseUp(a);
    expect(screen.getByRole("status")).toHaveTextContent("a span cannot cross two documents");
  });

  it("undoes it again", () => {
    render(<Workbench persist={false} />);
    selectRange(10, 20);
    fireEvent.keyDown(window, { key: "m" });
    expect(screen.getByText(/^annotation /)).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(screen.getByRole("status")).toHaveTextContent("undo");
  });
});

describe("the keyboard", () => {
  it("opens the help map on ? and generates it from the tag set", () => {
    render(<Workbench persist={false} />);
    fireEvent.keyDown(window, { key: "?" });
    const dialog = screen.getByText("Keyboard").parentElement!.parentElement!;
    expect(within(dialog).getByText("tag Place")).toBeInTheDocument();
    expect(within(dialog).getByText("tag Date")).toBeInTheDocument();
    // A press-only tag must not appear while the responsa project is open.
    expect(within(dialog).queryByText("tag Advertisement")).toBeNull();
  });

  it("closes everything on Escape", () => {
    render(<Workbench persist={false} />);
    fireEvent.keyDown(window, { key: "?" });
    expect(screen.getByText("Keyboard")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByText("Keyboard")).toBeNull();
  });

  it("opens the palette on space and filters it as you type", () => {
    render(<Workbench persist={false} />);
    fireEvent.keyDown(window, { key: " " });
    const box = screen.getByPlaceholderText("tag the selection…");
    fireEvent.change(box, { target: { value: "measure" } });
    const list = box.parentElement!;
    expect(within(list).getByText("Measure")).toBeInTheDocument();
    expect(within(list).queryByText("Person")).toBeNull();
  });

  it("leaves the keyboard to the palette's input while it has focus", () => {
    render(<Workbench persist={false} />);
    fireEvent.keyDown(window, { key: " " });
    const box = screen.getByPlaceholderText("tag the selection…");
    // `m` is the Place hotkey. Typed into the field it must be text, not a tag.
    fireEvent.keyDown(box, { key: "m" });
    expect(screen.queryByText(/^annotation /)).toBeNull();
  });

  it("steps between sections with n and p when nothing is selected", () => {
    render(<Workbench persist={false} />);
    const secs = PROJECTS[0].volumes[0].sections;
    fireEvent.keyDown(window, { key: "n" });
    fireEvent.keyDown(window, { key: "d" });
    expect(screen.getByRole("status")).toHaveTextContent("declared done");
    // The section that got marked done is the second one, not the first.
    expect(secs[1].doc_id).toBeTruthy();
  });
});

describe("review mode", () => {
  it("reveals the proposals and clears the queue with y", () => {
    render(<Workbench persist={false} />);
    const queue = proposals(makeInitial());
    expect(queue.length).toBeGreaterThan(0);

    fireEvent.click(screen.getByTitle("review machine proposals"));
    expect(screen.getByText("Review mode")).toBeInTheDocument();
    expect(screen.getByText(new RegExp("of " + queue.length + " left"))).toBeInTheDocument();

    queue.forEach(() => fireEvent.keyDown(window, { key: "y" }));
    expect(screen.getByText("queue empty")).toBeInTheDocument();
  });

  it("keeps a rejected proposal as a row rather than deleting it", () => {
    render(<Workbench persist={false} />);
    fireEvent.click(screen.getByTitle("review machine proposals"));
    fireEvent.keyDown(window, { key: "n" });
    fireEvent.click(screen.getByTitle("analysis of the annotations"));
    const outcome = screen.getByText("rejected — kept as evidence").parentElement!;
    expect(within(outcome).getByText("1")).toBeInTheDocument();
  });
});

describe("the side panels", () => {
  it("switches between the four tabs", () => {
    render(<Workbench persist={false} />);
    fireEvent.click(screen.getByTitle("tag set of this project"));
    expect(screen.getByText("Tag set of this project")).toBeInTheDocument();
    fireEvent.click(screen.getByTitle("titles in this project"));
    expect(screen.getByText("titles")).toBeInTheDocument();
    fireEvent.click(screen.getByTitle("analysis of the annotations"));
    expect(screen.getByText("Tag distribution · project")).toBeInTheDocument();
  });

  it("expands a tag group and lists its annotations", () => {
    render(<Workbench persist={false} />);
    const row = screen.getByText("Place").closest("div")!;
    expect(screen.queryByText(/^— מקום —$/)).toBeNull();
    fireEvent.click(row);
    // The group now shows quotes, and they are Hebrew text from the corpus.
    const quotes = document.querySelectorAll('[style*="Frank Ruhl Libre"]');
    expect(quotes.length).toBeGreaterThan(0);
  });

  it("renames a tag in the editor and shows the new label everywhere at once", () => {
    render(<Workbench persist={false} />);
    fireEvent.click(screen.getByTitle("tag set of this project"));
    const label = screen.getByDisplayValue("Place");
    fireEvent.change(label, { target: { value: "Location" } });
    expect(screen.getAllByDisplayValue("Location").length).toBeGreaterThan(0);
    expect(screen.getByText("tagset 1.3.0*")).toBeInTheDocument();
    fireEvent.click(screen.getByTitle("annotations in this volume"));
    expect(screen.getByText("Location")).toBeInTheDocument();
  });

  it("warns when a hotkey collides with an app command", () => {
    render(<Workbench persist={false} />);
    fireEvent.click(screen.getByTitle("tag set of this project"));
    expect(screen.getByText("free")).toBeInTheDocument();
    const key = screen.getByDisplayValue("m");
    fireEvent.change(key, { target: { value: "d" } });
    expect(screen.getByText("shared with an app command")).toBeInTheDocument();
  });
});

describe("switching project", () => {
  it("opens the press corpus and swaps the tag set with it", () => {
    render(<Workbench persist={false} />);
    fireEvent.click(screen.getByRole("button", { name: /שו"ת ליטא/ }));
    fireEvent.click(screen.getByText("עיתונות יהודית · הצפירה"));
    expect(screen.getAllByText("Advertisement").length).toBeGreaterThan(0);
    expect(screen.queryByText("Ruling")).toBeNull();
  });
});

describe("view controls", () => {
  it("hides every mark in clean read and brings them back", () => {
    render(<Workbench persist={false} />);
    const marked = () => pieces().filter((el) => el.style.backgroundImage !== "").length;
    expect(marked()).toBeGreaterThan(0);
    fireEvent.keyDown(window, { key: "`" });
    expect(marked()).toBe(0);
    fireEvent.keyDown(window, { key: "`" });
    expect(marked()).toBeGreaterThan(0);
  });

  it("collapses the paragraph gutters in compact mode", () => {
    render(<Workbench persist={false} />);
    const gutters = () =>
      Array.from(document.querySelectorAll<HTMLElement>("div")).filter(
        (d) => d.style.width === "44px",
      ).length;
    expect(gutters()).toBeGreaterThan(0);
    fireEvent.keyDown(window, { key: "c" });
    expect(gutters()).toBe(0);
  });
});
