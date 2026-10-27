// S6 (REQ-BFG-119): Vite's `?raw` import of the two static pages (server/pages.ts). The bundler puts the file's text into the server
// bundle, so server/dist is all the Docker image needs. Server-side only: pages.ts references this file, so every program that type-checks
// pages.ts (tsconfig.server.json, tsconfig.tests.json) sees the declaration, and no existing config or declaration file changes.
declare module "*.html?raw" {
  const text: string;
  export default text;
}
