import { defineConfig } from "vite";

// Node build of the ghost server and tools: `npm run build:server` -> server/dist/*.mjs.
// Bundling resolves src/'s extensionless imports, which plain tsc output could not run.
export default defineConfig({
  publicDir: false,
  build: {
    ssr: true,
    outDir: "server/dist",
    emptyOutDir: true,
    target: "node20",
    minify: false,
    copyPublicDir: false,
    rollupOptions: {
      input: { "ghost-server": "server/main.ts", "gen-ghost-pool": "tools/genGhostPool.ts" },
      output: { format: "es", entryFileNames: "[name].mjs", chunkFileNames: "[name]-[hash].mjs" },
    },
  },
} as any);
