// The command line: set up, check and export Sectioner data without opening the app.
//
//   npm run sectioner -- <command> [args]      (or: npx tsx scripts/cli.ts <command>)
//
// Every write goes through the same validators and writers as the app (`_server/`), so a
// project made here is exactly one the app could have made: worksets.json is only ever
// appended to, projects.json is archived before every save, and nothing in `sessions/`
// or `output/` is touched except by `export`, which writes only under its own folder.

import { cp, mkdir, readdir, stat } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HELP = `Sectioner — command line

usage: npm run sectioner -- <command> [options]

  init                          create the data folder (empty projects.json and worksets.json)
  example                       add the example projects: scanned pages and short texts
  add-images <folder>           a folder of page images (.png/.jpg) becomes a working set
        --project <id>            add it to this existing project (default: a new project)
        --name <label>            the working set's (and new project's) name
        --tags "Label=base,…"     the new project's tags; base is a page role (default figure)
  add-texts <folder|file.jsonl> a folder of .txt files, or one JSONL corpus, becomes a working set
        --project <id> --name <label>
        --tags "Label=element,…"  the new project's tags; element is TEI (default seg)
        --proposals <file.jsonl>  machine proposals to review (inside the same folder)
        --direction rtl|ltr|auto
  validate                      check projects.json, worksets.json and every working set's files
  status                        progress per project and working set
  export <project> [--out dir]  write a project's results to one folder (default data/export/<id>)
  schema [book|newspaper|text]  print the built-in tags and the allowed bases, as JSON

global: --data <dir>   the data folder (default: $SECTIONER_DATA, else ./data)

Docs: README.md (people), AGENTS.md (agents), docs/configuration.md, docs/formats.md.`;

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");

interface Args {
  cmd: string;
  pos: string[];
  opt: Record<string, string>;
}

function parse(argv: string[]): Args {
  const pos: string[] = [];
  const opt: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const [k, v] = a.slice(2).split("=", 2);
      if (v !== undefined) opt[k] = v;
      else if (i + 1 < argv.length && !argv[i + 1].startsWith("--")) opt[k] = argv[++i];
      else opt[k] = "true";
    } else pos.push(a);
  }
  return { cmd: pos.shift() ?? "help", pos, opt };
}

function die(msg: string): never {
  console.error(`error: ${msg}`);
  process.exit(1);
}

const slug = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "set";

async function main() {
  const a = parse(process.argv.slice(2));
  if (a.opt.data) process.env.SECTIONER_DATA = resolve(a.opt.data);
  const store = await import("../src/server/store");
  const W = await import("../src/app/_server/worksets");
  const NW = await import("../src/app/_server/newWorkset");
  const PS = await import("../src/app/_server/projects");
  const P = await import("../src/app/_lib/project");

  const data = store.dataRoot();
  const port = process.env.PORT ?? "3040";
  const url = (q: string) => `http://127.0.0.1:${port}/${q}`;

  /** A root as stored: relative to the working-set base when inside it, else absolute. */
  const rootFor = (abs: string) => {
    const rel = relative(store.worksetBase(), abs);
    return (rel === "" ? "." : rel.startsWith("..") || isAbsolute(rel) ? abs : rel).split("\\").join("/");
  };

  async function init(quiet = false) {
    await mkdir(data, { recursive: true });
    for (const [file, body] of [["worksets.json", { worksets: [] }], ["projects.json", { version: 1, projects: [] }]] as const) {
      const path = join(data, file);
      if ((await store.readIfPresent(path)) === null) {
        await store.writeUtf8(path, JSON.stringify(body, null, 2) + "\n");
        if (!quiet) console.log(`created ${store.shown(path)}`);
      }
    }
    if (!quiet) console.log(`data folder: ${data}`);
  }

  async function freeWorksetId(stem: string) {
    const taken = new Set(((await W.readManifest())?.worksets ?? []).map((w) => w.id));
    let id = slug(stem), n = 2;
    while (taken.has(id)) id = `${slug(stem)}-${n++}`;
    return id;
  }

  function parseTags(spec: string | undefined, kind: "book" | "text") {
    if (!spec) return P.defaultTags(kind);
    const taken: string[] = [];
    const keys = new Set<string>();
    // Images: 1…9 in order (letters are the page's own commands). Texts: the first free
    // letter of the label, since the workbench reads one character per tag.
    const keyFor = (label: string, i: number) => {
      if (kind === "book") return i < 9 ? String(i + 1) : "";
      const k = [...label.toUpperCase()].find((c) => /[A-Z]/.test(c) && !keys.has(c));
      if (k) keys.add(k);
      return k ?? "";
    };
    return spec.split(",").map((s) => s.trim()).filter(Boolean).map((part, i) => {
      const [label, base] = part.split("=").map((x) => x.trim());
      const id = P.slugTag(label, taken);
      taken.push(id);
      return P.normalizeTag({ id, label, base: base || (kind === "book" ? "figure" : "seg"), key: keyFor(label, i) }, i);
    });
  }

  /** Attach a working set to a project: an existing one, or a new one made here. */
  async function attach(wsId: string, kind: "book" | "text", label: string) {
    const projects = await PS.readProjects();
    if (a.opt.project) {
      const p = projects.find((x) => x.id === a.opt.project);
      if (!p) die(`no project ${a.opt.project} in projects.json (leave --project out to create one)`);
      if (p.kind !== kind) die(`project ${p.id} is a ${p.kind} project`);
      await PS.saveProject({ ...p, worksets: [...p.worksets, wsId] });
      return p.id;
    }
    const id = P.slugProject(label, projects.map((p) => p.id));
    const def = { id, label, kind, worksets: [wsId], tags: parseTags(a.opt.tags, kind), keymap: {}, ...(kind === "text" && a.opt.direction ? { direction: a.opt.direction as "rtl" | "ltr" | "auto" } : {}) };
    const errs = P.validateProject(def);
    if (errs.length) die(errs.join("\n       "));
    await PS.saveProject(def);
    return id;
  }

  switch (a.cmd) {
    case "help":
    case "--help":
    case "-h":
      console.log(HELP);
      return;

    case "init":
      await init();
      return;

    case "add-images": {
      const folder = a.pos[0] ? resolve(a.pos[0]) : die("add-images needs a folder");
      if (!(await stat(folder).catch(() => null))?.isDirectory()) die(`not a folder: ${folder}`);
      await init(true);
      const names = await readdir(folder);
      const byExt = new Map<string, string[]>();
      for (const n of names) {
        const e = extname(n).toLowerCase();
        if ([".png", ".jpg", ".jpeg"].includes(e)) byExt.set(extname(n), [...(byExt.get(extname(n)) ?? []), n]);
      }
      if (!byExt.size) die(`no .png or .jpg files in ${folder}`);
      const [ext, files] = [...byExt].sort((x, y) => y[1].length - x[1].length)[0];
      const bad = files.filter((n) => !W.SAFE_ID.test(n.slice(0, -ext.length)));
      for (const [e, f] of byExt) if (e !== ext) console.warn(`note: ${f.length} ${e} file(s) ignored — one extension per working set (${ext} has the most)`);
      if (bad.length) console.warn(`note: ${bad.length} file(s) skipped: a page id may use only letters, digits, - _ . (e.g. ${bad.slice(0, 3).join(", ")})`);
      const label = a.opt.name ?? basename(folder);
      const id = await freeWorksetId(label);
      await NW.addWorkset({ id, label, kind: "book", root: rootFor(folder), files: { image: `{id}${ext}` } });
      const project = await attach(id, "book", label);
      console.log(`working set ${id}: ${files.length - bad.length} pages · project ${project}\nopen ${url(`?ws=${id}`)}`);
      return;
    }

    case "add-texts": {
      const target = a.pos[0] ? resolve(a.pos[0]) : die("add-texts needs a folder or a .jsonl file");
      const st = await stat(target).catch(() => null);
      if (!st) die(`not found: ${target}`);
      await init(true);
      const folder = st.isDirectory() ? target : dirname(target);
      const files: Record<string, string> = {};
      if (st.isDirectory()) {
        const names = (await readdir(folder)).filter((n) => n.toLowerCase().endsWith(".txt"));
        if (!names.length) die(`no .txt files in ${folder}`);
        const bad = names.filter((n) => !W.SAFE_ID.test(n.slice(0, -4)));
        if (bad.length) console.warn(`note: ${bad.length} file(s) skipped: a document id may use only letters, digits, - _ . (e.g. ${bad.slice(0, 3).join(", ")})`);
        files.text = "{id}.txt";
      } else {
        if (!/\.jsonl$/i.test(target)) die("a single file must be a .jsonl corpus: one {\"id\", \"text\"} per line");
        files.corpus = basename(target);
      }
      if (a.opt.proposals) {
        const rel = relative(folder, resolve(a.opt.proposals)).split("\\").join("/");
        if (rel.startsWith("..") || isAbsolute(rel)) die("the proposals file must be inside the same folder as the texts");
        files.proposal = rel;
      }
      const label = a.opt.name ?? basename(target).replace(/\.jsonl$/i, "");
      const id = await freeWorksetId(label);
      await NW.addWorkset({ id, label, kind: "text", root: rootFor(folder), files });
      const project = await attach(id, "text", label);
      console.log(`working set ${id} · project ${project}\nopen ${url(`text?project=${project}`)}`);
      return;
    }

    case "example": {
      await init(true);
      const dest = join(data, "examples");
      await cp(join(REPO, "examples"), dest, { recursive: true, force: false, errorOnExist: false });
      const have = new Set(((await W.readManifest())?.worksets ?? []).map((w) => w.id));
      const projects = await PS.readProjects();
      const cfg = JSON.parse((await store.readIfPresent(join(REPO, "examples", "example-config.json"))) ?? "{}") as {
        worksets: Parameters<typeof NW.addWorkset>[0][];
        projects: Parameters<typeof PS.saveProject>[0][];
      };
      for (const w of cfg.worksets) {
        if (have.has(w.id)) { console.log(`working set ${w.id} already there`); continue; }
        await NW.addWorkset(w);
        console.log(`added working set ${w.id}`);
      }
      for (const p of cfg.projects) {
        if (projects.some((x) => x.id === p.id)) { console.log(`project ${p.id} already there`); continue; }
        await PS.saveProject(p);
        console.log(`added project ${p.id}`);
      }
      console.log(`\nstart the app (npm run dev) and open ${url("")}`);
      return;
    }

    case "validate": {
      let bad = 0;
      const fail = (m: string) => { bad++; console.log(`  ✗ ${m}`); };
      console.log(`data folder ${data}`);
      let manifest: Awaited<ReturnType<typeof W.readManifest>> = null;
      try {
        manifest = await W.readManifest();
        console.log(manifest ? `  ✓ worksets.json: ${manifest.worksets.length} working sets` : "  · no worksets.json yet (npm run sectioner -- init)");
      } catch (e) { fail(`worksets.json: ${(e as Error).message}`); }
      try {
        const ps = await PS.readProjects();
        console.log(`  ✓ projects.json: ${ps.length} projects`);
        const owner = new Map<string, string>();
        for (const p of ps) for (const w of p.worksets) {
          const def = manifest?.worksets.find((x) => x.id === w);
          if (!def) fail(`project ${p.id}: working set ${w} is not in worksets.json`);
          else if (def.kind !== p.kind) fail(`project ${p.id} (${p.kind}): working set ${w} is a ${def.kind} set`);
          if (owner.has(w)) fail(`working set ${w} is in two projects: ${owner.get(w)} and ${p.id}`);
          owner.set(w, p.id);
        }
      } catch (e) { fail(`projects.json: ${(e as Error).message}`); }
      for (const w of manifest?.worksets ?? []) {
        try {
          const pages = await W.listPages(w);
          if (!pages.length) { fail(`${w.id}: finds no ${w.kind === "text" ? "documents" : "pages"} under ${W.rootDir(w)}`); continue; }
          const first = pages[0];
          const need = w.kind === "text" ? (w.files.corpus ? [] : ["text" as const]) : w.kind === "newspaper" ? ["image" as const, "layout" as const] : ["image" as const];
          const missing = [];
          for (const k of need) if (!(await W.exists(W.pageFile(w, first, k)))) missing.push(k);
          if (missing.length) fail(`${w.id}: first ${w.kind === "text" ? "document" : "page"} ${first.id} has no ${missing.join(", ")} file`);
          else console.log(`  ✓ ${w.id} (${w.kind}): ${pages.length} ${w.kind === "text" ? "documents" : "pages"}`);
        } catch (e) { fail(`${w.id}: ${(e as Error).message}`); }
      }
      const T = await import("../src/app/text/_server/textProject");
      for (const p of (await PS.readProjects().catch(() => [])).filter((x) => x.kind === "text")) {
        const d = await T.loadTextProject(p.id);
        for (const e of d?.errors ?? []) fail(`${p.id}: ${e}`);
      }
      console.log(bad ? `\n${bad} problem(s)` : "\nall good");
      process.exit(bad ? 1 : 0);
    }

    case "status": {
      const writable = await store.dataWritable();
      const all = await PS.allProjects();
      if (!all.length) console.log("no projects yet — npm run sectioner -- example, or add-images / add-texts");
      for (const p of all) {
        console.log(`${p.id}  ${p.label}  [${p.kind}]${p.synthesized ? " (derived, not saved)" : ""}`);
        for (const id of p.worksets) {
          const w = await W.findWorkset(id);
          if (!w) { console.log(`  ${id}: missing from worksets.json`); continue; }
          const s = await W.summarise(w, writable);
          const n = s.pages.length;
          const c = (st: string) => s.pages.filter((x) => x.status === st).length;
          const done = c("done");
          const bar = "█".repeat(Math.round((n ? done / n : 0) * 20)).padEnd(20, "░");
          console.log(`  ${bar} ${String(done).padStart(4)}/${n} done · ${c("wip")} in progress · ${c("flagged")} flagged   ${id}`);
        }
      }
      return;
    }

    case "export": {
      const id = a.pos[0] ?? die("export needs a project id (npm run sectioner -- status lists them)");
      const p = (await PS.allProjects()).find((x) => x.id === id) ?? die(`no project ${id}`);
      const out = resolve(a.opt.out ?? join(data, "export", id));
      await mkdir(out, { recursive: true });
      if (p.kind === "text") {
        const T = await import("../src/app/text/_server/textProject");
        const tei = await import("../src/app/text/_lib/tei");
        const ser = await import("../src/app/text/_lib/serialise");
        const d = (await T.loadTextProject(id))!;
        const sections = d.project.volumes.flatMap((v) => v.sections.map((s) => ({ s, ws: v.slug })));
        await store.writeUtf8(join(out, "annotations.jsonl"), ser.toJsonl(d.anns));
        await store.writeUtf8(join(out, "documents.jsonl"), sections.map(({ s, ws }) => JSON.stringify({ id: s.doc_id, workset: ws, title: s.title, text: s.text })).join("\n") + "\n");
        const input = { project: d.project, sections: sections.map((x) => x.s), anns: d.anns.filter((x) => x.status !== "rejected"), tags: d.tags, version: "1" };
        await store.writeUtf8(join(out, "tei-standoff.xml"), tei.exportStandoff(input));
        const inline = tei.exportInline({ ...input, anns: input.anns.filter((x) => x.status === "accepted") });
        await store.writeUtf8(join(out, "tei-inline.xml"), inline.xml);
        const n = (st: string) => d.anns.filter((x) => x.status === st).length;
        console.log(`${out}\n  annotations.jsonl  ${d.anns.length} (${n("accepted")} accepted, ${n("proposed")} proposed, ${n("rejected")} rejected)\n  documents.jsonl    ${sections.length} documents (the text every offset counts in)\n  tei-standoff.xml   accepted + proposed\n  tei-inline.xml     accepted${inline.dropped.length ? ` — ${inline.dropped.length} overlapping span(s) left out, see the standoff` : ""}`);
      } else {
        let pages = 0;
        for (const wsId of p.worksets) {
          const w = await W.findWorkset(wsId);
          if (!w) continue;
          const lines: string[] = [];
          for (const pg of await W.listPages(w)) {
            const raw = await store.readIfPresent(W.outputFile(w, pg.id));
            if (raw !== null) lines.push(JSON.stringify(JSON.parse(raw)));
          }
          await store.writeUtf8(join(out, `${wsId}.jsonl`), lines.join("\n") + (lines.length ? "\n" : ""));
          console.log(`  ${wsId}.jsonl  ${lines.length} finished page(s)`);
          pages += lines.length;
        }
        console.log(`${out}: ${pages} page record(s) — one line per page marked done (or written from the Export dialog)`);
      }
      return;
    }

    case "schema": {
      const kinds = a.pos[0] ? [a.pos[0] as "book" | "newspaper" | "text"] : (["book", "newspaper", "text"] as const);
      const outObj: Record<string, unknown> = {};
      for (const k of kinds) {
        if (!P.KINDS.includes(k)) die(`unknown kind ${k}`);
        outObj[k] = { bases: k === "text" ? "any TEI element name, e.g. persName or seg[@type='x']; suggestions: " + P.bases("text").join(", ") : P.bases(k), library: P.tagLibrary(k), icons: P.TAG_ICONS };
      }
      console.log(JSON.stringify(outObj, null, 2));
      return;
    }

    default:
      console.error(`unknown command ${a.cmd}\n`);
      console.log(HELP);
      process.exit(1);
  }
}

main().catch((e: unknown) => die(e instanceof Error ? e.message : String(e)));
