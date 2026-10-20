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
    // BUMP-1F P2 (F1 and Q5): fails any test that leaves Object.keys(ITEMS) or ITEMS.quench changed (test config only)
    setupFiles: ["tests/setup/itemsGuard.ts"],
  },
} as any);
