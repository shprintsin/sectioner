"use client";

import type { Dispatch, RefObject } from "react";

import { C, DIR, F } from "../_lib/designTokens";
import type { Action } from "../_lib/state";
import type { SectionVM, ViewModel } from "../_lib/viewModel";
import type { Ann } from "../_lib/types";

interface Props {
  vm: ViewModel;
  dispatch: Dispatch<Action>;
  scrollRef: RefObject<HTMLDivElement | null>;
  sectionRefs: RefObject<Record<string, HTMLElement | null>>;
  onMouseUp: () => void;
  annotations?: Ann[];
}

export function Reader({ vm, dispatch, scrollRef, sectionRefs, onMouseUp, annotations = [] }: Props) {
  return (
    <div ref={scrollRef} onMouseUp={onMouseUp} style={vm.readerPadStyle}>
      <div style={vm.readerStyle}>
        <div style={vm.volHeadStyle}>
          <div style={vm.volTitleStyle}>{vm.volTitle}</div>
          <div style={vm.volSubStyle}>{vm.volSub}</div>
        </div>
        {vm.sections.map((sec) => (
          <SectionView
            key={sec.docId}
            sec={sec}
            dispatch={dispatch}
            annotations={annotations}
            setRef={(el) => {
              sectionRefs.current[sec.docId] = el;
            }}
          />
        ))}
      </div>
    </div>
  );
}

function SectionView({
  sec,
  dispatch,
  setRef,
  annotations,
}: {
  sec: SectionVM;
  dispatch: Dispatch<Action>;
  setRef: (el: HTMLDivElement | null) => void;
  annotations: Ann[];
}) {
  return (
    <div ref={setRef} style={sec.padStyle}>
      {sec.showPart && (
        <div style={sec.partStyle}>
          <div style={{ flex: 1, height: "1px", background: "#d6cdbb" }} />
          <div style={sec.partTextStyle}>{sec.part}</div>
          <div style={{ flex: 1, height: "1px", background: "#d6cdbb" }} />
        </div>
      )}

      <div style={sec.headStyle}>
        <span style={sec.dot} />
        <span style={sec.titleStyle}>{sec.title}</span>
        <span
          style={{
            fontFamily: F.mono, fontSize: "9px", color: C.faint, direction: "ltr",
            overflow: "hidden", textOverflow: "ellipsis", minWidth: 0,
          }}
        >
          {sec.docId}
        </span>
        <div style={{ flex: 1 }} />
        <span style={{ fontFamily: F.mono, fontSize: "9px", color: C.faint, direction: "ltr", flex: "0 0 auto" }}>
          {sec.count}
        </span>
        <button onClick={() => dispatch(sec.onDone)} style={sec.doneStyle}>
          {sec.doneLabel}
        </button>
      </div>

      {sec.paragraphs.map((para, pi) => (
        <div key={pi} style={para.wrapStyle}>
          <div style={para.gutterStyle}>
            <div style={{ fontFamily: F.mono, fontSize: "10px", color: C.dim2 }}>{para.num}</div>
            <div style={para.structStyle}>{para.structLabel}</div>
          </div>
          <div style={{ flex: 1, minWidth: 0, direction: DIR, unicodeBidi: "plaintext", textAlign: "justify" }}>
            {para.pieces.map((pc) => (
              // One child, and it must stay one child: `anchorOffset` is an offset into a
              // text node, so a second text node here (a `{" "}`, a fragment, two
              // expressions) silently shifts every offset the selection reader computes.
              <span
                key={pc.s}
                data-off={pc.s}
                data-doc={pc.doc}
                onClick={() => dispatch(pc.on)}
                style={pc.style}
              >
                {pc.text}
              </span>
            ))}
          </div>
        </div>
      ))}

      <div style={sec.sepStyle}>
        <div style={{ flex: 1, height: "1px", background: "#e2dacb" }} />
        <span style={{ fontFamily: F.mono, fontSize: "9px", color: C.dim3 }}>§</span>
        <div style={{ flex: 1, height: "1px", background: "#e2dacb" }} />
      </div>
    </div>
  );
}
