"use client";

import type { Dispatch } from "react";

import { C, F } from "../_lib/designTokens";
import type { Action } from "../_lib/state";
import type { ViewModel } from "../_lib/viewModel";

interface P {
  vm: ViewModel;
  dispatch: Dispatch<Action>;
  /** The Variables strip at the foot of the Tags panel; a prop, as in the design. */
  showVariables?: boolean;
}

const HEADING = {
  fontWeight: 600, fontSize: "11px", letterSpacing: ".04em",
  textTransform: "uppercase" as const, color: C.muted3,
};
const SUB = {
  fontFamily: F.mono, fontSize: "9px", color: C.faint2, marginTop: "2px",
  whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis",
};
const FIELD = {
  width: "100%", border: "1px solid #ddd5c6", background: "#fff", borderRadius: "3px",
  padding: "4px 6px", fontSize: "11px",
};
const GHOST = {
  border: "1px solid #cdc3b0", background: C.paper, borderRadius: "3px", padding: "5px",
  cursor: "pointer", color: C.head, fontSize: "11px",
};

export function SidePanel({ vm, dispatch, showVariables = true }: P) {
  return (
    <div
      style={{
        width: "330px", flex: "0 0 330px", background: C.chrome, borderRight: "1px solid #ddd5c6",
        display: "flex", flexDirection: "column", minHeight: 0,
      }}
    >
      <div style={{ display: "flex", flex: "0 0 auto", background: C.lineWarm, borderBottom: "1px solid #ddd5c6" }}>
        <Tab vm={vm} dispatch={dispatch} id="tags" label="Tags" title="annotations in this volume" />
        <Tab vm={vm} dispatch={dispatch} id="tagset" label="Tag set" title="tag set of this project" />
        <Tab vm={vm} dispatch={dispatch} id="library" label="Library" title="titles in this project" />
        <Tab vm={vm} dispatch={dispatch} id="analysis" label="Analysis" title="analysis of the annotations" />
      </div>

      {vm.tab === "tags" && <TagsPanel vm={vm} dispatch={dispatch} showVariables={showVariables} />}
      {vm.tab === "tagset" && <TagsetPanel vm={vm} dispatch={dispatch} />}
      {vm.tab === "library" && <LibraryPanel vm={vm} dispatch={dispatch} />}
      {vm.tab === "analysis" && <AnalysisPanel vm={vm} dispatch={dispatch} />}
    </div>
  );
}

function Tab({
  vm, dispatch, id, label, title,
}: P & { id: "tags" | "tagset" | "library" | "analysis"; label: string; title: string }) {
  return (
    <button onClick={() => dispatch({ type: "setTab", tab: id })} style={vm.tabStyles[id]} title={title}>
      <span>{label}</span>
    </button>
  );
}

/* ── Tags ──────────────────────────────────────────────────────────────────────────── */

function TagsPanel({ vm, dispatch, showVariables }: P) {
  return (
    <>
      <div
        style={{
          flex: "0 0 auto", minHeight: "116px", maxHeight: "36%", overflowY: "auto",
          overflowX: "hidden", padding: "8px 10px", borderBottom: "1px solid " + C.lineMid,
        }}
      >
        <div style={{ ...HEADING, marginBottom: "6px" }}>{vm.inspectorTitle}</div>

        {vm.hasInspector ? (
          <div style={{ background: C.rowActive, border: "1px solid " + C.lineMid, borderRadius: "4px", padding: "8px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
              <span style={vm.inspectorDot} />
              <span style={{ fontWeight: 600 }}>{vm.inspectorTag}</span>
              <span style={{ fontFamily: F.mono, fontSize: "10px", color: C.muted3 }}>{vm.inspectorTei}</span>
              <div style={{ flex: 1 }} />
              <span style={vm.inspectorStatusStyle}>{vm.inspectorStatus}</span>
            </div>
            <div
              style={{
                unicodeBidi: "plaintext", textAlign: "start", fontFamily: F.serif, fontSize: "15px",
                lineHeight: 1.7, color: C.head, borderRight: "2px solid #ddd5c6",
                paddingRight: "8px", marginBottom: "8px",
              }}
            >
              {vm.inspectorQuote}
            </div>
            <div style={{ fontFamily: F.mono, fontSize: "10px", color: C.muted3, marginBottom: "8px" }}>
              {vm.inspectorRange}
            </div>

            {vm.inspectorAttrs.map((at) => (
              <div key={at.attrId} style={{ marginBottom: "7px" }}>
                <div style={{ fontSize: "10px", color: C.muted3, marginBottom: "3px" }}>{at.label}</div>
                {at.isEnum ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "3px" }}>
                    {at.options.map((op) => (
                      <button key={op.label} onClick={() => dispatch(op.on)} style={op.style}>
                        <span style={{ fontFamily: F.mono, opacity: 0.55 }}>{op.key}</span> {op.label}
                      </button>
                    ))}
                  </div>
                ) : (
                  <input
                    value={at.value}
                    onChange={(e) =>
                      dispatch({ type: "setAttr", id: at.annId, key: at.attrId, value: e.target.value })
                    }
                    placeholder={at.hint}
                    style={{ ...FIELD, fontFamily: F.mono }}
                  />
                )}
              </div>
            ))}

            <div style={{ display: "flex", gap: "4px", marginTop: "8px", flexWrap: "wrap" }}>
              {vm.inspectorActions.map((ac) => (
                <button key={ac.label} onClick={() => dispatch(ac.on)} style={ac.style}>
                  {ac.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div
            style={{
              fontSize: "11px", color: C.muted3, lineHeight: 1.7, background: C.rowActive,
              border: "1px dashed #ddd5c6", borderRadius: "4px", padding: "9px",
            }}
          >
            Highlight any passage — a tag menu opens where the selection ends. Or press the tag&apos;s key.
          </div>
        )}
      </div>

      <div
        style={{
          display: "flex", alignItems: "center", gap: "5px", padding: "6px 10px",
          borderBottom: "1px solid " + C.lineMid, flex: "0 0 auto",
        }}
      >
        <div style={{ display: "flex", gap: "2px", background: "#e2dacb", padding: "2px", borderRadius: "3px" }}>
          <button onClick={() => dispatch({ type: "setTrackScope", scope: "section" })} style={vm.scopeSectionStyle}>
            section
          </button>
          <button onClick={() => dispatch({ type: "setTrackScope", scope: "volume" })} style={vm.scopeVolumeStyle}>
            volume
          </button>
        </div>
        <div style={{ flex: 1 }} />
        <button onClick={() => dispatch({ type: "cycleStatusFilter" })} style={vm.statusChip}>
          {vm.statusFilter}
        </button>
      </div>

      <div style={{ flex: "1 1 0", overflowY: "auto", overflowX: "hidden", minHeight: "110px" }}>
        {vm.tagTrack.map((t) => (
          <div key={t.tagId} style={{ borderBottom: "1px solid " + C.line }}>
            <div onClick={() => dispatch(t.toggle)} style={t.rowStyle}>
              <span style={t.caretStyle}>{t.caret}</span>
              <span style={t.dot} />
              <span style={{ flex: 1, fontSize: "11px", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {t.label}
              </span>
              <span style={t.warnStyle}>{t.warn}</span>
              <div style={{ width: "48px", height: "5px", background: C.keyBg, borderRadius: "3px", overflow: "hidden" }}>
                <div style={t.barStyle} />
              </div>
              <span style={{ fontFamily: F.mono, fontSize: "10px", color: "#5c5348", width: "22px", textAlign: "right" }}>
                {t.count}
              </span>
              <span style={{ fontFamily: F.mono, fontSize: "9px", color: C.faint, width: "28px", textAlign: "right" }}>
                {t.total}
              </span>
            </div>
            {t.open &&
              t.rows.map((r) => (
                <div key={r.id} onClick={() => dispatch(r.on)} style={r.style}>
                  <span style={r.badgeStyle}>{r.badge}</span>
                  <span
                    style={{
                      flex: 1, unicodeBidi: "plaintext", textAlign: "start", fontFamily: F.serif,
                      fontSize: "13px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    }}
                  >
                    {r.quote}
                  </span>
                  <span style={{ fontFamily: F.mono, fontSize: "9px", color: C.faint, whiteSpace: "nowrap" }}>
                    {r.meta}
                  </span>
                  {r.isProposal && (
                    <span style={{ display: "flex", gap: "3px" }}>
                      <button
                        onClick={(e) => { e.stopPropagation(); dispatch(r.accept); }}
                        style={{ border: "1px solid #b9c9ae", background: "#eef3e8", color: C.accept, borderRadius: "2px", padding: "0 5px", cursor: "pointer", fontSize: "10px" }}
                      >
                        ✓
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); dispatch(r.reject); }}
                        style={{ border: "1px solid #d9c0b6", background: "#f6ece8", color: C.reject, borderRadius: "2px", padding: "0 5px", cursor: "pointer", fontSize: "10px" }}
                      >
                        ✕
                      </button>
                    </span>
                  )}
                </div>
              ))}
          </div>
        ))}
      </div>

      {showVariables && (
        <div style={{ borderTop: "1px solid #ddd5c6", background: C.fillSoft, flex: "0 0 auto", maxHeight: "26%", overflowY: "auto", overflowX: "hidden" }}>
          <div style={{ padding: "6px 10px", display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={HEADING}>Variables</span>
            <span style={{ fontFamily: F.mono, fontSize: "9px", color: C.faint2 }}>{vm.varsScope}</span>
          </div>
          {vm.variables.map((v) => (
            <div key={v.id} style={{ display: "flex", alignItems: "baseline", gap: "8px", padding: "3px 10px", borderTop: "1px solid #e2dbcd" }}>
              <span style={{ fontFamily: F.mono, fontSize: "10px", color: C.muted, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {v.id}
              </span>
              <span style={v.valueStyle}>{v.value}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/* ── Tag set ───────────────────────────────────────────────────────────────────────── */

function TagsetPanel({ vm, dispatch }: P) {
  const edit = (field: "en" | "he" | "tei", value: string): Action => ({
    type: "editTagField", field, value,
  });
  return (
    <>
      <div style={{ padding: "7px 10px", borderBottom: "1px solid " + C.lineMid, flex: "0 0 auto" }}>
        <div style={HEADING}>Tag set of this project</div>
        <div style={SUB}>{vm.tagsetPath}</div>
      </div>

      <div style={{ flex: "0 0 auto", maxHeight: "34%", overflowY: "auto", overflowX: "hidden", borderBottom: "1px solid #ddd5c6" }}>
        {vm.tagRows.map((t) => (
          <div key={t.id} onClick={() => dispatch(t.on)} style={t.style}>
            <span style={t.dot} />
            <span style={{ flex: 1, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {t.label}
            </span>
            <span style={{ unicodeBidi: "plaintext", fontFamily: F.serif, fontSize: "13px", color: C.muted }}>{t.he}</span>
            <span style={t.keyStyle}>{t.key}</span>
            <span style={{ fontFamily: F.mono, fontSize: "9px", color: C.faint, width: "36px", textAlign: "right" }}>
              {t.uses}
            </span>
          </div>
        ))}
      </div>

      <div style={{ flex: "1 1 0", overflowY: "auto", overflowX: "hidden", padding: "10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "7px", marginBottom: "9px" }}>
          <span style={vm.editDot} />
          <span style={{ fontWeight: 600, fontSize: "13px" }}>{vm.editLabel}</span>
          <span style={{ fontFamily: F.mono, fontSize: "10px", color: C.muted3 }}>{vm.editId}</span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "9px" }}>
          <div>
            <div style={{ fontSize: "10px", color: C.muted3, marginBottom: "3px" }}>label</div>
            <input value={vm.editLabelEn} onChange={(e) => dispatch(edit("en", e.target.value))} style={FIELD} />
          </div>
          <div>
            <div style={{ fontSize: "10px", color: C.muted3, marginBottom: "3px" }}>second label (optional)</div>
            <input
              value={vm.editLabelHe}
              onChange={(e) => dispatch(edit("he", e.target.value))}
              dir="auto"
              style={{ ...FIELD, fontSize: "12px", fontFamily: F.serif }}
            />
          </div>
          <div>
            <div style={{ fontSize: "10px", color: C.muted3, marginBottom: "3px" }}>TEI element</div>
            <input
              value={vm.editTei}
              onChange={(e) => dispatch(edit("tei", e.target.value))}
              style={{ ...FIELD, fontFamily: F.mono }}
            />
          </div>
          <div>
            <div style={{ fontSize: "10px", color: C.muted3, marginBottom: "3px" }}>hotkey</div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <input
                value={vm.editKey}
                maxLength={1}
                onChange={(e) =>
                  dispatch({
                    type: "editTagField",
                    field: "key",
                    // One character, lowercased: the keymap compares against `event.key`,
                    // which is lowercase for an unshifted letter.
                    value: e.target.value.slice(0, 1).toLowerCase(),
                  })
                }
                style={{ ...FIELD, width: "46px", fontFamily: F.mono, textAlign: "center" }}
              />
              <span style={vm.editKeyWarnStyle}>{vm.editKeyWarn}</span>
            </div>
          </div>
        </div>

        <div style={{ fontSize: "10px", color: C.muted3, marginBottom: "4px" }}>colour</div>
        <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", marginBottom: "9px" }}>
          {vm.swatches.map((s) => (
            <button key={s.color} onClick={() => dispatch(s.on)} style={s.style} aria-label={s.color} />
          ))}
        </div>

        <button
          onClick={() => dispatch({ type: "editTagField", field: "popular", value: !vm.popularLabel.startsWith("✓") })}
          style={vm.popularStyle}
        >
          {vm.popularLabel}
        </button>

        <div style={{ ...HEADING, fontSize: "10px", margin: "12px 0 5px" }}>Attributes</div>
        {vm.editAttrs.map((a) => (
          <div key={a.id} style={{ border: "1px solid " + C.lineWarm, background: C.rowActive, borderRadius: "3px", padding: "5px 7px", marginBottom: "4px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ fontFamily: F.mono, fontSize: "11px", color: C.head }}>{a.id}</span>
              <span style={a.kindStyle}>{a.kind}</span>
              <div style={{ flex: 1 }} />
              <span style={{ fontFamily: F.mono, fontSize: "9px", color: C.faint }}>{a.tei}</span>
            </div>
            <div style={{ fontFamily: F.mono, fontSize: "9px", color: C.muted, marginTop: "3px" }}>{a.values}</div>
          </div>
        ))}
        <div style={{ ...HEADING, fontSize: "10px", margin: "12px 0 5px" }}>May be contained in</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginBottom: "10px" }}>
          {vm.containers.map((c) => (
            <span key={c.label} style={c.style}>{c.label}</span>
          ))}
        </div>

        <div style={{ border: "1px solid " + C.lineMid, borderRadius: "4px", background: "#f4efe5", padding: "8px 9px" }}>
          <div style={{ fontSize: "10px", color: C.muted3, marginBottom: "6px" }}>{vm.editImpact}</div>
          <button
            onClick={() => dispatch({ type: "save" })}
            style={{ width: "100%", marginTop: "7px", border: "1px solid #9aa88f", background: C.accept, color: C.paper, borderRadius: "3px", padding: "5px", cursor: "pointer", fontSize: "11px", fontWeight: 500 }}
          >
            {vm.bumpLabel}
          </button>
        </div>

        <div style={{ fontSize: "10px", color: C.muted, lineHeight: 1.5, marginTop: "8px" }}>
          New tags and removals are made in the project&apos;s{" "}
          <a href={"/?project=" + encodeURIComponent(vm.projectId)} style={{ color: C.head }}>schema editor</a>; attributes (fields) in{" "}
          <code style={{ fontFamily: F.mono }}>projects.json</code> (docs/configuration.md).
        </div>
      </div>
    </>
  );
}

/* ── Library ───────────────────────────────────────────────────────────────────────── */

function LibraryPanel({ vm, dispatch }: P) {
  return (
    <>
      <div style={{ padding: "8px 10px", borderBottom: "1px solid " + C.lineMid, flex: "0 0 auto" }}>
        <div style={{ fontWeight: 600, fontSize: "12px", unicodeBidi: "plaintext", textAlign: "start" }}>{vm.projectName}</div>
        <div style={SUB}>{vm.librarySub}</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1px", background: "#ddd5c6", flex: "0 0 auto" }}>
        {vm.libStats.map((s) => (
          <div key={s.label} style={{ background: C.chrome, padding: "6px 10px" }}>
            <div style={{ fontFamily: F.mono, fontSize: "15px", color: C.inkSoft }}>{s.value}</div>
            <div style={{ fontSize: "9px", color: C.muted3 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ flex: "1 1 0", overflowY: "auto", overflowX: "hidden" }}>
        {vm.libRows.map((b) => (
          <div key={b.slug} style={b.cardStyle}>
            <div style={{ display: "flex", alignItems: "baseline", gap: "7px" }}>
              <span style={{ flex: 1, unicodeBidi: "plaintext", textAlign: "start", fontFamily: F.serif, fontSize: "15px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {b.he}
              </span>
              <button onClick={() => dispatch(b.on)} style={b.btnStyle}>{b.btnLabel}</button>
            </div>
            <div style={{ fontFamily: F.mono, fontSize: "9px", color: C.faint2, margin: "2px 0 5px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {b.slug} · {b.units}
            </div>
            <div style={{ height: "5px", background: C.keyBg, borderRadius: "3px", overflow: "hidden" }}>
              <div style={b.barStyle} />
            </div>
            <div style={{ display: "flex", gap: "8px", marginTop: "4px", fontFamily: F.mono, fontSize: "9px", color: C.muted3 }}>
              <span>{b.pct} tagged</span>
              <span>{b.tagged} ann.</span>
              <div style={{ flex: 1 }} />
              <span style={b.reviewStyle}>{b.review}</span>
            </div>
          </div>
        ))}
      </div>

      <div style={{ borderTop: "1px solid #ddd5c6", padding: "7px 10px", display: "flex", gap: "5px", flex: "0 0 auto" }}>
        <button onClick={() => dispatch({ type: "setProjectsOpen", open: true })} style={{ ...GHOST, flex: 1 }}>
          Open project…
        </button>
        <a
          href={"/?project=" + encodeURIComponent(vm.projectId)}
          title="Add a working set of documents in the project's editor"
          style={{ ...GHOST, padding: "5px 9px", color: C.muted, textDecoration: "none", display: "inline-flex", alignItems: "center" }}
        >
          Add documents…
        </a>
      </div>
    </>
  );
}

/* ── Analysis ──────────────────────────────────────────────────────────────────────── */

function AnalysisPanel({ vm, dispatch }: P) {
  return (
    <>
      <div style={{ padding: "7px 10px", borderBottom: "1px solid " + C.lineMid, flex: "0 0 auto" }}>
        <div style={HEADING}>Analysis</div>
        <div style={SUB}>{vm.analysisSub}</div>
      </div>

      <div style={{ flex: "1 1 0", overflowY: "auto", overflowX: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1px", background: "#ddd5c6" }}>
          {vm.analysisStats.map((s) => (
            <div key={s.label} style={{ background: C.chrome, padding: "6px 10px" }}>
              <div style={{ fontFamily: F.mono, fontSize: "15px", color: C.inkSoft }}>{s.value}</div>
              <div style={{ fontSize: "9px", color: C.muted3 }}>{s.label}</div>
            </div>
          ))}
        </div>

        <div style={{ ...HEADING, fontSize: "10px", padding: "9px 10px 4px" }}>Tag distribution · project</div>
        <div style={{ padding: "0 10px 8px" }}>
          {vm.distribution.map((d) => (
            <div key={d.label} style={{ display: "flex", alignItems: "center", gap: "7px", padding: "2px 0" }}>
              <span style={d.dot} />
              <span style={{ width: "88px", fontSize: "10px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {d.label}
              </span>
              <div style={{ flex: 1, height: "7px", background: C.keyBg, borderRadius: "2px", overflow: "hidden" }}>
                <div style={d.barStyle} />
              </div>
              <span style={{ fontFamily: F.mono, fontSize: "10px", color: "#5c5348", width: "22px", textAlign: "right" }}>
                {d.count}
              </span>
            </div>
          ))}
        </div>

        <div style={{ ...HEADING, fontSize: "10px", padding: "6px 10px 4px", borderTop: "1px solid " + C.lineWarm }}>
          Proposal outcome
        </div>
        <div style={{ padding: "0 10px 8px" }}>
          {vm.outcomes.map((o) => (
            <div key={o.label} style={{ display: "flex", alignItems: "center", gap: "7px", padding: "3px 0", borderBottom: "1px solid " + C.fillSoft }}>
              <span style={o.dot} />
              <span style={{ flex: 1, fontSize: "10px" }}>{o.label}</span>
              <span style={{ fontFamily: F.mono, fontSize: "11px", color: C.head }}>{o.value}</span>
            </div>
          ))}
        </div>

        <div style={{ ...HEADING, fontSize: "10px", padding: "6px 10px 4px", borderTop: "1px solid " + C.lineWarm }}>
          variables.csv · row per section
        </div>
        {vm.varRows.map((r) => (
          <div key={r.docId} style={r.style}>
            <div style={{ display: "flex", alignItems: "baseline", gap: "6px", marginBottom: "3px" }}>
              <span style={{ unicodeBidi: "plaintext", fontFamily: F.serif, fontSize: "13px" }}>{r.title}</span>
              <span style={{ fontFamily: F.mono, fontSize: "9px", color: C.faint, flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {r.docId}
              </span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "3px" }}>
              {r.cells.map((c) => (
                <span key={c.label} style={c.style}>
                  {c.label} {c.value}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div style={{ borderTop: "1px solid #ddd5c6", padding: "7px 10px", display: "flex", gap: "5px", flex: "0 0 auto" }}>
        <button onClick={() => dispatch({ type: "export", what: "variables" })} style={{ ...GHOST, flex: 1 }}>
          variables.csv
        </button>
        <button onClick={() => dispatch({ type: "export", what: "standoff" })} style={{ ...GHOST, flex: 1 }}>
          TEI standoff
        </button>
      </div>
    </>
  );
}
