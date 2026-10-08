import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Testing Library registers this itself only when `globals: true`. This config keeps
// globals off — every test imports `describe`/`it`/`expect` explicitly — so the unmount
// has to be wired by hand. Without it each render stacks on the last and every query
// fails with "found multiple elements".
afterEach(() => {
  cleanup();
});
