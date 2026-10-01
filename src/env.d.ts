// 0.7.0a: the one build-time setting the game reads (src/game/online.ts, decision D3). Vite replaces
// import.meta.env.VITE_GHOST_SERVER at build time; the default build sets nothing, so it is undefined and the
// game plays offline exactly as 0.6.2. "same-origin" means the page's own origin (a later Fly page build).
interface ImportMetaEnv {
  readonly VITE_GHOST_SERVER?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
