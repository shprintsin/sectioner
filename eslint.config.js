import { FlatCompat } from "@eslint/eslintrc";
import tseslint from "typescript-eslint";

const compat = new FlatCompat({
  baseDirectory: import.meta.dirname,
});

export default tseslint.config(
  {
    ignores: [".next", ".next-dev", "data", "examples"],
  },
  ...compat.extends("next/core-web-vitals"),
  {
    files: ["**/*.ts", "**/*.tsx"],
    extends: [
      ...tseslint.configs.recommended,
      ...tseslint.configs.recommendedTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
    ],
    rules: {
      "@typescript-eslint/array-type": "off",
      "@typescript-eslint/consistent-type-definitions": "off",
      "@typescript-eslint/consistent-type-imports": [
        "warn",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/require-await": "off",
      // `||` is used on purpose where an empty string means "absent" (a blank label, an
      // unset template); `??` would keep the blank.
      "@typescript-eslint/prefer-nullish-coalescing": "off",
      "@typescript-eslint/no-empty-function": "off",
      "@typescript-eslint/no-misused-promises": [
        "error",
        { checksVoidReturn: { attributes: false } },
      ],
    },
  },
  {
    // Leaving a page is a full load on purpose: the annotation page flushes its autosave
    // when it unloads, and a client-side transition would keep its state alive.
    rules: { "@next/next/no-html-link-for-pages": "off" },
  },
  {
    // The scan is evidence. next/image would re-encode it, and the design needs the
    // element's true intrinsic width/height reserved before the bytes arrive.
    files: ["src/app/**/*.tsx"],
    rules: {
      "@next/next/no-img-element": "off",
    },
  },
  {
    // Tests assert against the design's own data. A non-null assertion is how a known
    // fixture row is addressed, unbound-method fires on every vi.fn() passed as a
    // handler, and the JSON goldens are imported untyped by design.
    files: ["src/**/*.test.ts", "src/**/*.test.tsx", "vitest.setup.ts"],
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/unbound-method": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
    },
  },
  {
    linterOptions: {
      reportUnusedDisableDirectives: true,
    },
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
  },
);
