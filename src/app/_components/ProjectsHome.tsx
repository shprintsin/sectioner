"use client";

// The app's front page: projects, each with its working sets and its annotation schema.
// A project is created here with its schema (the tags, from the built-in library or the
// reviewer's own), and edited here later. What a project changes is how pages are offered
// and drawn; the sessions and outputs of its working sets are never touched.

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";

import { TAG_ICONS, bases, formatChord, isBuiltin, normalizeChord, slugProject, slugTag, tagColor, validateProject, type ProjectDef, type TagDef, type TagIcon } from "../_lib/project";
import { chordOf } from "../_lib/project";
import { C, MONO, btn } from "../_lib/tokens";
import type { Kind, WorksetSummary } from "../_lib/types";
import { createWorkset, fetchProjects, previewWorkset, putProject, removeProject, type NewWorkset, type ProjectsResponse, type WorksetPreview } from "./projectClient";
import { TagGlyph, TagSwatch } from "./tagIcons";

const KIND_LABEL: Record<Kind, string> = { book: "Regions on page images", newspaper: "Newspaper articles (eynollah layout)", text: "Spans in text (TEI)" };
const unitWord = (k: Kind, n: number) => (k === "text" ? (n === 1 ? "document" : "documents") : n === 1 ? "page" : "pages");

export interface ProjectsHomeProps {
  worksets: WorksetSummary[];
  manifest: string;
  writable: boolean;
  missing?: boolean;
  /** `?project=<id>` opens that project's editor. */
  editId: string | null;
  onPick: (w: WorksetSummary) => void;
  onEdit: (id: string | null) => void;
  /** A project was saved or deleted: the working sets carry their project, so reload them. */
  onChanged: () => void;
}

export default function ProjectsHome(p: ProjectsHomeProps) {
  const [data, setData] = useState<ProjectsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const reload = () => fetchProjects().then(setData, (e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  useEffect(() => { void reload(); }, []);
  const byId = useMemo(() => new Map(p.worksets.map((w) => [w.id, w])), [p.worksets]);

  if (error) return <Page><p style={{ color: C.cutInk }}>Could not read the projects: {error}</p></Page>;
  if (!data) return <Page><p style={{ color: C.muted }}>loading the projects…</p></Page>;

  const editing = creating ? null : data.projects.find((x) => x.id === p.editId) ?? null;
  const closeEditor = () => { setCreating(false); p.onEdit(null); };
  const saved = async () => { closeEditor(); await reload(); p.onChanged(); };

  return (
    <Page>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 4 }}>
        <span style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.01em" }}>Sectioner</span>
        <span style={{ fontSize: 10, color: C.muted2, letterSpacing: "0.06em", textTransform: "uppercase" }}>projects · image and text annotation</span>
        <span style={{ flex: 1 }} />
        <button disabled={!data.writable} onClick={() => setCreating(true)} style={btn(true, { height: 28, padding: "0 12px", fontSize: 12, opacity: data.writable ? 1 : 0.5 })}>+ New project</button>
      </div>
      <p style={{ color: C.muted, margin: "0 0 22px", lineHeight: 1.55, maxWidth: 760 }}>
        A project is one annotation job: what is annotated (regions on page images, or spans in text), its schema — the tags an annotator gives, each with a colour and a key — and the working sets of pages or documents it owns.
        Projects live in <code style={code}>{data.path}</code>; the working sets in <code style={code}>{p.manifest}</code>.
        {!data.writable ? " This instance is read-only: projects can be browsed but not saved." : ""}
      </p>
      {!data.projects.length ? (
        <div style={{ padding: "14px 16px", marginBottom: 18, border: `1px dashed ${C.border}`, borderRadius: 8, lineHeight: 1.6, color: C.text2 }}>
          <b>Nothing here yet.</b> Load the examples to try it — <code style={code}>npm run sectioner -- example</code> — or start your own:
          {" "}<code style={code}>npm run sectioner -- add-images &lt;folder&gt;</code> for scans,
          {" "}<code style={code}>npm run sectioner -- add-texts &lt;folder&gt;</code> for <code style={code}>.txt</code> files.
          {" "}The guide is <code style={code}>README.md</code>; an AI agent can do all of this from <code style={code}>AGENTS.md</code>.
        </div>
      ) : null}

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {data.projects.map((proj) => {
          const sets = proj.worksets.map((id) => byId.get(id)).filter((w): w is WorksetSummary => !!w);
          return (
            <section key={proj.id} style={{ background: C.bar, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 14px 10px" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 14.5, fontWeight: 600 }}>{proj.label}</span>
                    <span style={chip}>{KIND_LABEL[proj.kind]}</span>
                    {proj.synthesized ? <span style={{ ...chip, background: C.warnBg, color: C.warnInk }} title="Not in projects.json yet: the schema the app has always used for these working sets. Saving it makes it a project of its own.">default · not saved</span> : null}
                    <span style={{ fontFamily: MONO, fontSize: 10.5, color: C.faint }}>{proj.id}</span>
                  </div>
                  {proj.description ? <div style={{ color: C.muted, marginTop: 3 }}>{proj.description}</div> : null}
                </div>
                <button onClick={() => p.onEdit(proj.id)} style={btn(false, { height: 26, padding: "0 10px", fontSize: 11 })}>{data.writable ? "Edit schema" : "View schema"}</button>
              </div>
              {proj.tags.length ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px", padding: "0 14px 10px" }}>
                  {proj.tags.map((t) => (
                    <span key={t.id} title={`${t.label}${isBuiltin(t, proj.kind) ? "" : ` → ${t.base}`}${t.key ? ` · ${t.key}` : ""}`} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11 }}>
                      <TagSwatch tag={t} size={13} />
                      {t.key ? <span style={{ fontFamily: MONO, fontSize: 9.5, color: C.faint }}>{formatChord(normalizeChord(t.key) ?? t.key)}</span> : null}
                    </span>
                  ))}
                </div>
              ) : null}
              <div style={{ borderTop: `1px solid ${C.borderSoft}` }}>
                {sets.length ? sets.map((w) => <WorksetRow key={w.id} w={w} onPick={() => p.onPick(w)} />) : <div style={{ padding: "10px 14px", color: C.faint, fontStyle: "italic" }}>No working sets yet — edit the project to give it some.</div>}
              </div>
            </section>
          );
        })}
      </div>

      {creating || editing ? (
        <ProjectEditor
          data={data}
          project={editing}
          onClose={closeEditor}
          onSaved={() => void saved()}
          onWorksetAdded={async () => { await reload(); p.onChanged(); }}
        />
      ) : null}
    </Page>
  );
}

function WorksetRow({ w, onPick }: { w: WorksetSummary; onPick: () => void }) {
  const done = w.pages.filter((x) => x.status === "done").length;
  const wip = w.pages.filter((x) => x.status === "wip").length;
  const flagged = w.pages.filter((x) => x.status === "flagged").length;
  const pct = w.pages.length ? (done / w.pages.length) * 100 : 0;
  return (
    <button onClick={onPick} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 120px auto", alignItems: "center", gap: 12, width: "100%", textAlign: "left", padding: "8px 14px", background: "transparent", border: "none", borderBottom: `1px solid ${C.borderPale}`, cursor: "pointer", fontFamily: "inherit", color: C.ink }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{w.label}</div>
        <div style={{ fontSize: 10.5, color: C.muted2 }}><span style={{ fontFamily: MONO }}>{w.id}</span> · {w.pages.length} {unitWord(w.kind, w.pages.length)}</div>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: C.track, overflow: "hidden" }}><div style={{ width: `${pct}%`, height: "100%", background: C.ok }} /></div>
      <div style={{ fontSize: 10.5, color: C.muted, textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
        {done} done · {wip} in progress{flagged ? ` · ${flagged} flagged` : ""} <span style={{ color: C.link, marginLeft: 6 }}>Open →</span>
      </div>
    </button>
  );
}

/* ── the editor ────────────────────────────────────────────────────────────────────── */

function ProjectEditor({ data, project, onClose, onSaved, onWorksetAdded }: { data: ProjectsResponse; project: (ProjectDef & { synthesized: boolean }) | null; onClose: () => void; onSaved: () => void; onWorksetAdded: () => Promise<void> }) {
  const [addingSet, setAddingSet] = useState(false);
  const isNew = !project;
  const [draft, setDraft] = useState<ProjectDef>(() => project ? stripSynth(project) : { id: "", label: "", kind: "book", description: "", worksets: [], tags: data.defaults.book.map((t) => ({ ...t })), keymap: {} });
  const [idTouched, setIdTouched] = useState(!isNew);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [iconFor, setIconFor] = useState<string | null>(null);
  const [recording, setRecording] = useState<string | null>(null);
  const taken = data.projects.filter((x) => !x.synthesized && x.id !== project?.id).map((x) => x.id);
  const id = idTouched ? draft.id : slugProject(draft.label || "project", taken);
  const full: ProjectDef = { ...draft, id };
  const errs = [...validateProject(full), ...(taken.includes(id) ? [`a project ${id} already exists`] : [])];
  const set = (patch: Partial<ProjectDef>) => setDraft((d) => ({ ...d, ...patch }));
  const setTag = (i: number, patch: Partial<TagDef>) => set({ tags: draft.tags.map((t, j) => (j === i ? { ...t, ...patch } : t)) });
  const library = data.library[draft.kind].filter((t) => !draft.tags.some((x) => x.id === t.id));
  const owner = (ws: string) => data.projects.find((x) => x.id !== project?.id && x.worksets.includes(ws));

  useEffect(() => {
    if (!recording) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const i = draft.tags.findIndex((t) => t.id === recording);
      if (e.key === "Escape") { setRecording(null); return; }
      if (e.key === "Backspace" || e.key === "Delete") { if (i >= 0) setTag(i, { key: "" }); setRecording(null); return; }
      const c = chordOf(e);
      if (!c) return;
      if (i >= 0) setTag(i, { key: c });
      setRecording(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  const changeKind = (kind: Kind) => set({ kind, tags: data.defaults[kind].map((t) => ({ ...t })), worksets: [] });
  const addCustom = () => {
    const tid = slugTag("custom tag", draft.tags.map((t) => t.id));
    const hue = Math.round((draft.tags.length * 137.5) % 360);
    set({ tags: [...draft.tags, { id: tid, label: "Custom tag", base: draft.kind === "text" ? "seg" : bases(draft.kind)[0] ?? "", icon: "tag", hue, chroma: 0.12, key: "" }] });
  };
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= draft.tags.length) return;
    const tags = draft.tags.slice();
    [tags[i], tags[j]] = [tags[j], tags[i]];
    set({ tags });
  };
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await putProject(full, isNew || project.synthesized ? undefined : project.id);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };
  const del = async () => {
    if (!project || project.synthesized) return;
    if (!window.confirm(`Delete the project “${project.label}”? Its working sets go back to the default schema; no session or output is touched.`)) return;
    setBusy(true);
    try { await removeProject(project.id); onSaved(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); setBusy(false); }
  };
  const ro = !data.writable;
  const nOver = Object.keys(draft.keymap).length;

  return (
    <div onMouseDown={onClose} style={{ position: "fixed", inset: 0, background: "rgba(30,27,22,0.3)", zIndex: 50, display: "grid", placeItems: "center" }}>
      <div role="dialog" aria-label={isNew ? "New project" : `Project ${project.label}`} onMouseDown={(e) => { e.stopPropagation(); setIconFor(null); }} style={{ width: "min(980px, calc(100vw - 24px))", height: "min(860px, calc(100vh - 24px))", display: "grid", gridTemplateRows: "auto 1fr auto", background: C.bar, border: `1px solid ${C.bar2}`, borderRadius: 10, boxShadow: "0 24px 60px rgba(30,27,22,0.28)", fontSize: 12, overflow: "hidden" }}>
        <div style={{ padding: "14px 18px 10px", borderBottom: `1px solid ${C.borderSoft}` }}>
          <div style={{ fontSize: 16, fontWeight: 600 }}>{isNew ? "New project" : project.synthesized ? `Save “${project.label}” as a project` : `Project · ${project.label}`}</div>
          <div style={{ color: C.muted, marginTop: 2 }}>{draft.kind === "text"
            ? "The schema is the list of tags an annotator can give. Each tag is exported as a TEI element (its base) and recorded under its own id. Fields a tag carries (attributes, such as a date's ISO value) are kept when you save here and are edited in projects.json — see docs/configuration.md."
            : `The schema is the list of tags an annotator can give. Each tag is written to the record as its base ${draft.kind === "book" ? "role" : "type"} — a custom tag adds its own id beside it, so every existing reader still understands the output.`}</div>
        </div>

        <div className="om-scroll" style={{ overflowY: "auto", padding: "14px 18px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Name"><input disabled={ro} value={draft.label} onChange={(e) => set({ label: e.target.value })} placeholder="e.g. Front-page typography" style={inp} autoFocus={isNew} /></Field>
            <Field label="Id" note="lower-case; the key in projects.json">
              <input disabled={ro} value={id} onChange={(e) => { setIdTouched(true); set({ id: e.target.value }); }} style={{ ...inp, fontFamily: MONO }} />
            </Field>
            <Field label="Engine" note={isNew ? "what a page of this project is" : "fixed once created"}>
              <select disabled={ro || !isNew} value={draft.kind} onChange={(e) => changeKind(e.target.value as Kind)} style={inp}>
                {(["book", "text", "newspaper"] as Kind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
              </select>
            </Field>
            <Field label="Description"><input disabled={ro} value={draft.description ?? ""} onChange={(e) => set({ description: e.target.value })} placeholder="what is annotated, and why" style={inp} /></Field>
            {draft.kind === "text" ? (
              <Field label="Text direction" note="auto decides from the letters">
                <select disabled={ro} value={draft.direction ?? "auto"} onChange={(e) => set({ direction: e.target.value === "auto" ? undefined : (e.target.value as "rtl" | "ltr") })} style={inp}>
                  <option value="auto">auto</option>
                  <option value="rtl">right to left (Hebrew, Arabic…)</option>
                  <option value="ltr">left to right</option>
                </select>
              </Field>
            ) : null}
          </div>

          <H right={!ro ? <button onClick={() => setAddingSet(!addingSet)} style={btn(addingSet, { height: 26, padding: "0 10px" })}>{addingSet ? "Close the form" : "+ New working set"}</button> : null}>Working sets</H>
          {addingSet ? (
            <NewWorksetForm
              kind={draft.kind}
              taken={data.worksets.map((w) => w.id)}
              onAdded={async (id) => { await onWorksetAdded(); set({ worksets: [...draft.worksets, id] }); setAddingSet(false); }}
            />
          ) : null}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 4 }}>
            {data.worksets.filter((w) => w.kind === draft.kind).map((w) => {
              const on = draft.worksets.includes(w.id);
              const o = owner(w.id);
              return (
                <label key={w.id} title={o && !on ? `now in “${o.label}” — moves here on save` : w.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 6px", borderRadius: 4, background: on ? "#fff" : "transparent", border: `1px solid ${on ? C.borderRow : C.borderPale}`, cursor: ro ? "default" : "pointer", minWidth: 0 }}>
                  <input type="checkbox" disabled={ro} checked={on} onChange={() => set({ worksets: on ? draft.worksets.filter((x) => x !== w.id) : [...draft.worksets, w.id] })} />
                  <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{w.label}</span>
                  {o && !on ? <span style={{ fontSize: 9.5, color: C.faint, whiteSpace: "nowrap" }}>in {o.label}</span> : null}
                </label>
              );
            })}
            {!data.worksets.some((w) => w.kind === draft.kind) ? <div style={{ color: C.faint }}>No {draft.kind} working sets in the manifest yet.</div> : null}
          </div>

          {(
            <>
              <H right={<>
                {library.length && !ro ? (
                  <select value="" onChange={(e) => { const t = library.find((x) => x.id === e.target.value); if (t) set({ tags: [...draft.tags, { ...t }] }); }} style={{ ...inp, width: 210, height: 26 }}>
                    <option value="">+ Add a built-in tag…</option>
                    {library.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                  </select>
                ) : null}
                {!ro ? <button onClick={addCustom} style={btn(true, { height: 26, padding: "0 10px" })}>+ Custom tag</button> : null}
                {!ro ? <button onClick={() => set({ tags: data.defaults[draft.kind].map((t) => ({ ...t })) })} style={btn(false, { height: 26 })}>Reset to defaults</button> : null}
              </>}>Schema · {draft.tags.length} tags</H>
              <div style={{ display: "grid", gridTemplateColumns: "48px 34px minmax(140px, 1.3fr) minmax(130px, 1fr) 150px 92px minmax(120px, 1fr) 28px", gap: "4px 6px", alignItems: "center" }}>
                <datalist id="tei-elements">{bases("text").map((b) => <option key={b} value={b} />)}</datalist>
                <Hd /><Hd>Icon</Hd><Hd>Label</Hd><Hd>{draft.kind === "text" ? "TEI element · id" : "Written as"}</Hd><Hd>Colour</Hd><Hd>Key</Hd><Hd>Note</Hd><Hd />
                {draft.tags.map((t, i) => {
                  const builtin = isBuiltin(t, draft.kind);
                  return (
                    <Row key={i}>
                      <span style={{ display: "flex", gap: 2 }}>
                        <button disabled={ro || i === 0} onClick={() => move(i, -1)} title="earlier in the menu" style={tiny}>↑</button>
                        <button disabled={ro || i === draft.tags.length - 1} onClick={() => move(i, 1)} title="later in the menu" style={tiny}>↓</button>
                      </span>
                      <span style={{ position: "relative" }}>
                        <button disabled={ro} onMouseDown={(e) => e.stopPropagation()} onClick={() => setIconFor(iconFor === t.id ? null : t.id)} title="choose an icon" style={{ width: 30, height: 28, display: "grid", placeItems: "center", border: `1px solid ${C.border}`, borderRadius: 4, background: "#fff", color: tagColor(t), cursor: ro ? "default" : "pointer" }}><TagGlyph icon={t.icon} size={16} /></button>
                        {iconFor === t.id ? <IconPicker value={t.icon} color={tagColor(t)} onPick={(icon) => { setTag(i, { icon }); setIconFor(null); }} /> : null}
                      </span>
                      <input disabled={ro} value={t.label} onChange={(e) => setTag(i, { label: e.target.value })} style={inp} />
                      {builtin ? (
                        <span title="a built-in tag is its base" style={{ fontFamily: MONO, fontSize: 10.5, color: C.muted }}>{t.base}</span>
                      ) : (
                        <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                          {draft.kind === "text" ? (
                            <input disabled={ro} list="tei-elements" value={t.base} onChange={(e) => setTag(i, { base: e.target.value })} title="the TEI element the span is exported as" style={{ ...inp, height: 24, fontFamily: MONO, fontSize: 11 }} />
                          ) : (
                            <select disabled={ro} value={t.base} onChange={(e) => setTag(i, { base: e.target.value })} style={{ ...inp, height: 24 }}>
                              {bases(draft.kind).map((b) => <option key={b} value={b}>{b}</option>)}
                            </select>
                          )}
                          <input disabled={ro} value={t.id} onChange={(e) => setTag(i, { id: e.target.value })} title="the tag's id in the record" style={{ ...inp, height: 20, fontFamily: MONO, fontSize: 10 }} />
                        </span>
                      )}
                      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ width: 18, height: 18, borderRadius: 4, background: tagColor(t), flex: "0 0 auto" }} />
                        <input disabled={ro} type="range" min={0} max={359} value={t.hue} onChange={(e) => setTag(i, { hue: Number(e.target.value) })} style={{ width: "100%", accentColor: tagColor(t) }} title={`hue ${t.hue}`} />
                      </span>
                      <button disabled={ro} onClick={() => setRecording(recording === t.id ? null : t.id)} title="click, then press the key (Backspace clears)" style={{ ...inp, height: 26, cursor: ro ? "default" : "pointer", fontFamily: MONO, textAlign: "center", background: recording === t.id ? C.unBg : "#fff" }}>
                        {recording === t.id ? "press…" : t.key ? formatChord(normalizeChord(t.key) ?? t.key) : "—"}
                      </button>
                      <input disabled={ro} value={t.description ?? ""} onChange={(e) => setTag(i, { description: e.target.value || undefined })} placeholder={builtin ? "" : "when to use it"} style={inp} />
                      <button disabled={ro} onClick={() => set({ tags: draft.tags.filter((_, j) => j !== i) })} title="remove from the schema (saved units keep their value)" style={{ ...tiny, color: C.cutInk }}>×</button>
                    </Row>
                  );
                })}
              </div>
              <p style={{ color: C.muted, fontSize: 11, lineHeight: 1.5, marginTop: 10 }}>
                Removing a tag only takes it out of the menu: a unit that already has it keeps it, is drawn with the library&apos;s colour and exports unchanged.
                A custom tag that is changed to another base is dropped from units of the old base, never moved.
              </p>
            </>
          )}

          <H right={nOver && !ro ? <button onClick={() => set({ keymap: {} })} style={btn(false, { height: 24 })}>Reset every shortcut</button> : null}>Keyboard shortcuts</H>
          <p style={{ color: C.muted, margin: 0, lineHeight: 1.5 }}>
            {nOver ? `${nOver} command${nOver > 1 ? "s" : ""} rebound from the default.` : "Every command uses its default keys."} The full list is edited inside a page, under <b>Help ▸ Keyboard shortcuts…</b>, where every command of the engine is shown; tag keys are set in the schema above.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 18px", borderTop: `1px solid ${C.borderSoft}` }}>
          <span style={{ flex: 1, minWidth: 0, color: error || errs.length ? C.cutInk : C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={[error, ...errs].filter(Boolean).join("\n")}>
            {error ?? (errs.length ? `${errs[0]}${errs.length > 1 ? ` (+${errs.length - 1} more)` : ""}` : ro ? "read-only instance" : "ready to save")}
          </span>
          {!isNew && !project.synthesized && !ro ? <button onClick={() => void del()} style={btn(false, { height: 28, color: C.cutInk })}>Delete project</button> : null}
          <button onClick={onClose} style={btn(false, { height: 28, padding: "0 12px" })}>Cancel</button>
          <button disabled={ro || busy || errs.length > 0} onClick={() => void save()} style={btn(true, { height: 28, padding: "0 14px", opacity: ro || errs.length ? 0.5 : 1 })}>{busy ? "Saving…" : isNew ? "Create project" : "Save"}</button>
        </div>
      </div>
    </div>
  );
}

/** A new working set: a folder, a file pattern, what it finds — then one entry appended to
 *  worksets.json. "Find pages" must have run on exactly what is added. */
function NewWorksetForm({ kind, taken, onAdded }: { kind: Kind; taken: string[]; onAdded: (id: string) => Promise<void> }) {
  const [label, setLabel] = useState("");
  const [idText, setIdText] = useState<string | null>(null);
  const [rootText, setRootText] = useState(".");
  const [files, setFiles] = useState<NewWorkset["files"]>({});
  const [hideLabels, setHideLabels] = useState(false);
  const [preview, setPreview] = useState<{ key: string; result: WorksetPreview } | null>(null);
  const [state, setState] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });
  const id = idText ?? slugProject(label || "working-set", taken);
  const def: NewWorkset = { id, label, kind, root: rootText, files, ...(kind === "book" && hideLabels ? { labels: false } : {}) };
  const key = JSON.stringify(def);
  const fresh = preview?.key === key ? preview.result : null;
  const setFile = (k: keyof NewWorkset["files"], v: string) => setFiles((f) => ({ ...f, [k]: v }));
  const run = async (fn: () => Promise<void>) => {
    setState({ busy: true, error: null });
    try { await fn(); setState({ busy: false, error: null }); } catch (e) { setState({ busy: false, error: e instanceof Error ? e.message : String(e) }); }
  };
  const fileRows: [keyof NewWorkset["files"], string, string, boolean][] = kind === "text"
    ? [["text", "Text files", "texts/{id}.txt  (or leave empty and give a corpus)", false], ["corpus", "…or one corpus JSONL", "corpus.jsonl  ({\"id\", \"text\"} per line)", false], ["proposal", "Machine proposals (JSONL)", "optional, e.g. proposals.jsonl", false]]
    : kind === "newspaper"
    ? [["image", "Scan", "pages/{id}.jpg", true], ["layout", "Layout (eynollah JSON)", "pages/{id}.layout.json", true], ["proposal", "Machine proposal", "optional", false], ["ocr", "OCR (Page-schema JSON)", "optional", false]]
    : [["image", "Scan", "pages/{id}.png", true], ["proposal", "Detector proposal", "optional", false], ["existing", "Existing annotation to re-review", "optional", false]];
  return (
    <div style={{ margin: "0 0 10px", padding: 12, border: `1px solid ${C.borderRow}`, borderRadius: 6, background: "#fff" }}>
      <div style={{ color: C.muted, marginBottom: 10, lineHeight: 1.5 }}>
        {kind === "text"
          ? <>Point at a folder of plain-text files (<code style={code}>{"{id}"}</code> stands for a document id: every matching file is one document), or at one JSONL file holding many. Paragraphs are separated by blank lines.</>
          : <>Point at a folder of scans. <code style={code}>{"{id}"}</code> stands for a page id: every file in that folder that matches the scan pattern is one page, and the other files are found by the same id.</>}
        {" "}Paths are relative to the root, and a relative root to the data folder (<code style={code}>.</code>).
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        <Field label="Name"><input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={kind === "text" ? "e.g. Letters, batch 1" : "e.g. Front pages, 1880"} style={inp} autoFocus /></Field>
        <Field label="Id" note="the folder name for sessions and outputs"><input value={id} onChange={(e) => setIdText(e.target.value)} style={{ ...inp, fontFamily: MONO }} /></Field>
        <Field label="Root"><input value={rootText} onChange={(e) => setRootText(e.target.value)} placeholder="." style={{ ...inp, fontFamily: MONO }} /></Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: "6px 10px", alignItems: "center", marginTop: 10 }}>
        {fileRows.map(([k, name, ph, req]) => (
          <div key={k} style={{ display: "contents" }}>
            <span style={{ color: C.text2 }}>{name}{req ? <span style={{ color: C.cutInk }}> *</span> : null}</span>
            <input value={files[k] ?? ""} onChange={(e) => setFile(k, e.target.value)} placeholder={ph} style={{ ...inp, fontFamily: MONO, fontSize: 11 }} />
          </div>
        ))}
      </div>
      {kind === "book" ? <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, color: C.text2 }}><input type="checkbox" checked={hideLabels} onChange={(e) => setHideLabels(e.target.checked)} /> Open pages with the region labels hidden (for line-level work)</label> : null}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
        <button disabled={state.busy} onClick={() => void run(async () => setPreview({ key, result: await previewWorkset(def) }))} style={btn(false, { height: 28, padding: "0 12px" })}>{kind === "text" ? "Find documents" : "Find pages"}</button>
        <button disabled={state.busy || !fresh?.ok} title={fresh?.ok ? "append this working set to worksets.json" : "run Find pages on exactly these settings first"} onClick={() => void run(async () => { await createWorkset(def); await onAdded(id); })} style={btn(true, { height: 28, padding: "0 12px", opacity: fresh?.ok ? 1 : 0.5 })}>{state.busy ? "Working…" : "Add working set"}</button>
        {preview && !fresh ? <span style={{ color: C.muted }}>settings changed — find the pages again</span> : null}
        {state.error ? <span style={{ color: C.cutInk }}>{state.error}</span> : null}
      </div>
      {fresh ? (
        <div style={{ marginTop: 10, padding: "8px 10px", borderRadius: 5, background: fresh.ok ? C.okBg : C.warnBg, color: fresh.ok ? C.okInk : C.warnInk, lineHeight: 1.55 }}>
          {fresh.nPages ? <div><b>{fresh.nPages} {unitWord(kind, fresh.nPages)}</b> in <code style={code}>{fresh.root}</code>: <span style={{ fontFamily: MONO, fontSize: 11 }}>{fresh.sample.join(", ")}{fresh.nPages > fresh.sample.length ? ", …" : ""}</span></div> : null}
          {fresh.firstPage ? <div>First {kind === "text" ? "document" : "page"} {fresh.firstPage.id}: {Object.entries(fresh.firstPage.files).map(([k, ok]) => `${k} ${ok ? "✓" : "missing"}`).join(" · ")}{fresh.firstPage.width ? ` · ${fresh.firstPage.width}×${fresh.firstPage.height} px` : ""}</div> : null}
          {fresh.errors.map((e) => <div key={e}>{e}</div>)}
          {fresh.ok ? <div style={{ marginTop: 3 }}>Adding appends one entry to worksets.json (the current file is copied to _archive first) and ticks it for this project — save the project to keep the link.</div> : null}
        </div>
      ) : null}
    </div>
  );
}

function IconPicker({ value, color, onPick }: { value: TagIcon; color: string; onPick: (i: TagIcon) => void }) {
  return (
    <div onMouseDown={(e) => e.stopPropagation()} style={{ position: "absolute", top: 32, left: 0, zIndex: 5, width: 264, display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 3, padding: 6, background: C.bar, border: `1px solid ${C.border}`, borderRadius: 6, boxShadow: "0 8px 24px rgba(40,32,20,0.18)" }}>
      {TAG_ICONS.map((i) => (
        <button key={i} title={i} onClick={() => onPick(i)} style={{ height: 28, display: "grid", placeItems: "center", border: `1px solid ${i === value ? color : "transparent"}`, borderRadius: 4, background: i === value ? "#fff" : "transparent", color, cursor: "pointer" }}><TagGlyph icon={i} size={16} /></button>
      ))}
    </div>
  );
}

function stripSynth(p: ProjectDef & { synthesized?: boolean }): ProjectDef {
  const out: ProjectDef & { synthesized?: boolean } = { ...p, tags: p.tags.map((t) => ({ ...t })), worksets: p.worksets.slice(), keymap: { ...p.keymap } };
  delete out.synthesized;
  return out;
}

function Page({ children }: { children: ReactNode }) {
  return <div style={{ minHeight: "100vh", background: C.bg, color: C.ink, fontFamily: "'IBM Plex Sans', 'Segoe UI', sans-serif", fontSize: 13, padding: "40px 24px" }}><div style={{ maxWidth: 940, margin: "0 auto" }}>{children}</div></div>;
}
function Field({ label, note, children }: { label: string; note?: string; children: ReactNode }) {
  return <label style={{ display: "flex", flexDirection: "column", gap: 3 }}><span style={{ fontSize: 10, letterSpacing: "0.07em", textTransform: "uppercase", color: C.muted2 }}>{label}{note ? <span style={{ textTransform: "none", letterSpacing: 0, color: C.faint }}> · {note}</span> : null}</span>{children}</label>;
}
function H({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return <div style={{ display: "flex", alignItems: "center", gap: 6, margin: "20px 0 8px", paddingBottom: 5, borderBottom: `1px solid ${C.borderSoft}` }}><span style={{ fontSize: 12.5, fontWeight: 600, flex: 1 }}>{children}</span>{right}</div>;
}
function Hd({ children }: { children?: ReactNode }) {
  return <span style={{ fontSize: 9.5, letterSpacing: "0.07em", textTransform: "uppercase", color: C.faint }}>{children}</span>;
}
function Row({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

const code: CSSProperties = { fontFamily: MONO, fontSize: 11.5 };
const chip: CSSProperties = { fontSize: 10, padding: "1px 6px", borderRadius: 3, background: C.chip, color: C.text2 };
const inp: CSSProperties = { width: "100%", height: 28, boxSizing: "border-box", padding: "0 7px", border: `1px solid ${C.border}`, borderRadius: 4, background: "#fff", fontFamily: "inherit", fontSize: 12, color: C.ink };
const tiny: CSSProperties = { width: 22, height: 22, padding: 0, border: `1px solid ${C.border}`, borderRadius: 3, background: "#fff", cursor: "pointer", color: C.text2, fontSize: 11 };
