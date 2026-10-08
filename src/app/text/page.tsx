import type { Metadata } from "next";

import { Workbench } from "./_components/Workbench";
import { seedCounter } from "./_lib/ids";
import type { State } from "./_lib/state";
import { loadTextProject } from "./_server/textProject";

export const metadata: Metadata = {
  title: "Sectioner — text",
  description: "Mark spans of text, tag them, review machine proposals, and export TEI.",
};

export const dynamic = "force-dynamic";

// Local font stacks only: the app must run offline. Frank Ruhl Libre, IBM Plex Sans and
// IBM Plex Mono are used when installed; otherwise the next face in each list.
const SERIF = `"Frank Ruhl Libre", "David", "Noto Serif Hebrew", "Noto Serif", Georgia, "Times New Roman", serif`;
const SANS = `"IBM Plex Sans", "Segoe UI", system-ui, sans-serif`;
const MONO = `"IBM Plex Mono", Consolas, ui-monospace, monospace`;

export default async function Page({ searchParams }: { searchParams: Promise<{ project?: string; ws?: string }> }) {
  const { project: projectId, ws } = await searchParams;
  if (!projectId) return <Message>No project named. Open a text project from <a href="/">the projects page</a>.</Message>;
  let data;
  try {
    data = await loadTextProject(projectId);
  } catch (e) {
    return <Message>Could not load the project: {(e as Error).message}. <a href="/">Back to the projects</a>.</Message>;
  }
  if (!data) return <Message>There is no text project <code>{projectId}</code>. <a href="/">Back to the projects</a>.</Message>;
  const vols = data.project.volumes;
  if (!vols.length) {
    return (
      <Message>
        The project <b>{data.def.label}</b> has no documents yet. Give it a text working set on <a href={`/?project=${encodeURIComponent(projectId)}`}>its editor</a>.
        {data.errors.length ? <ul>{data.errors.map((e) => <li key={e}>{e}</li>)}</ul> : null}
      </Message>
    );
  }
  const vol = vols.find((v) => v.id === ws) ?? vols.find((v) => v.slug === ws) ?? vols[0];
  const firstOpen = vol.sections.find((s) => !data.done[s.doc_id]) ?? vol.sections[0];
  const initial: Partial<State> = {
    projects: [data.project],
    projectId: data.project.id,
    volId: vol.id,
    tags: data.tags,
    anns: data.anns,
    done: data.done,
    focusDoc: firstOpen.doc_id,
    scrollIntent: firstOpen === vol.sections[0] ? null : { doc: firstOpen.doc_id, seq: 1 },
    editTag: data.tags[0]?.id ?? "",
    version: "1",
    nextId: seedCounter(data.anns),
  };
  return (
    <>
      <style>{`
        .tei {
          --tei-serif: ${SERIF};
          --tei-sans: ${SANS};
          --tei-mono: ${MONO};
        }
        body { margin: 0; }
        .tei, .tei * { box-sizing: border-box; }
        .tei ::selection { background: #c9bda3; }
        .tei button, .tei input, .tei textarea, .tei select { font-family: inherit; }
        .tei button:focus-visible, .tei input:focus-visible { outline: 2px solid #8a6a1f; outline-offset: 1px; }
        .tei ::-webkit-scrollbar { width: 9px; height: 9px; }
        .tei ::-webkit-scrollbar-thumb { background: #cfc6b4; border-radius: 5px; }
        .tei ::-webkit-scrollbar-track { background: transparent; }
        /* The design names its families as literal strings in every style object; these
           rules bind those names to the stacks above. */
        .tei [style*="Frank Ruhl Libre"] { font-family: var(--tei-serif) !important; }
        .tei [style*="IBM Plex Mono"] { font-family: var(--tei-mono) !important; }
      `}</style>
      <div className="tei" style={{ ["--tei-dir" as string]: data.direction }}>
        <Workbench key={projectId} initial={initial} showVariables={false} loadErrors={data.errors} />
      </div>
    </>
  );
}

function Message({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#f6f2ea", color: "#23201b", fontFamily: SANS, fontSize: 13, padding: 24 }}>
      <div style={{ maxWidth: 640, lineHeight: 1.6 }}>{children}</div>
    </div>
  );
}
