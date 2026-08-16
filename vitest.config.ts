import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Map the `@/` path alias (from tsconfig) without vite-tsconfig-paths, whose
// Plugin type resolves against a different vite copy than the app's and trips
// tsc. Alias points at the project root so `@/src/...` resolves correctly.
const projectRoot = fileURLToPath(new URL(".", import.meta.url)).replace(
  /\/$/,
  "",
);

export default defineConfig({
  resolve: {
    alias: { "@": projectRoot },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
