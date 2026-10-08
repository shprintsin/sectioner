---
name: sectioner
description: Set up, run and read annotation jobs in Sectioner (this repository) — regions on page images or spans in text exported as TEI. Use when asked to create an annotation project or working set from a folder of scans or texts, change a project's tags or keys, write machine proposals (pre-annotations) for a person to review, check annotation progress, or export and read the results.
---

# Sectioner

Read `AGENTS.md` at the repository root before acting: it has the rules (never key-test a
real working set; never touch `sessions/` or `output/`; `worksets.json` is append-only),
the CLI, and step-by-step recipes. Field reference: `docs/configuration.md`. File formats,
including the machine-proposal format: `docs/formats.md`.

The usual path:

1. `npm run sectioner -- add-images <folder>` or `add-texts <folder|corpus.jsonl>` with
   `--name` and `--tags "Label=base,…"`.
2. Adjust `data/projects.json` if needed (`npm run sectioner -- schema <kind>` lists bases
   and icons).
3. `npm run sectioner -- validate` until it says `all good`.
4. Give the person the printed address (`npm run dev` serves http://127.0.0.1:3040).
5. Later: `npm run sectioner -- status`, then `export <project>` and read
   `data/export/<project>/`.
