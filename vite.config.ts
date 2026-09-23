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
  },
} as any);
