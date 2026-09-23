import { defineConfig } from "vite";

// Relative base so the static build works under any Shore path (e.g. /beltbattles-proto/).
export default defineConfig({
  base: "./",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    assetsInlineLimit: 0,
    target: "es2020",
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // the rivals' seeded sim sweeps take 1-3 s each on an idle machine; on a shared, loaded host
    // they can pass vitest's 5 s default, so allow 30 s per test (no assertion changes)
    testTimeout: 30000,
  },
} as any);
