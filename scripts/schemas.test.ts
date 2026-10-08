import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { normalizeProject, validateProject, type ProjectDef } from "../src/app/_lib/project";
import { buildSchemas, serialise } from "./schemas";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

describe("the committed JSON Schemas", () => {
  it("are what scripts/schemas.ts builds (run `npx tsx scripts/schemas.ts` after changing roles, types or icons)", () => {
    for (const [name, s] of Object.entries(buildSchemas())) {
      expect(readFileSync(`${ROOT}schema/${name}`, "utf8").replace(/\r\n/g, "\n")).toBe(serialise(s));
    }
  });
});

describe("the example configuration", () => {
  it("passes the app's own project validation", () => {
    const cfg = JSON.parse(readFileSync(`${ROOT}examples/example-config.json`, "utf8")) as { projects: ProjectDef[] };
    for (const p of cfg.projects) expect(validateProject(normalizeProject(p))).toEqual([]);
  });
});
