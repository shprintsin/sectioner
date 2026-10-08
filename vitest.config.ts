import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // tsconfig.json sets "jsx": "preserve", which is correct for Next's own compiler and
  // wrong for esbuild: it would leave the JSX in place and the test file would not parse.
  // Overridden here only, so the app build is untouched.
  esbuild: { jsx: "automatic", jsxImportSource: "react" },

  resolve: {
    // the app's "~/*" -> "./src/*" alias, which tsconfig declares and Vitest does not read
    alias: { "~": fileURLToPath(new URL("./src", import.meta.url)) },
  },

  test: {
    // node by default: everything under _lib/ is pure and needs no DOM. The few component
    // tests opt in with a `// @vitest-environment jsdom` docblock.
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "scripts/**/*.test.ts"],
    setupFiles: ["./vitest.setup.ts"],
    restoreMocks: true,
    coverage: {
      provider: "v8",
      reportsDirectory: "coverage",
      include: ["src/app/**/_lib/**"],
    },
  },
});
