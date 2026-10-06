// 0.7.0a: the one build-time setting the game reads (src/game/online.ts, decision D3). Vite replaces
// import.meta.env.VITE_GHOST_SERVER at build time; the default build sets nothing, so it is undefined and the
// game plays offline exactly as 0.6.2. "same-origin" means the page's own origin (a later Fly page build).
interface ImportMetaEnv {
  readonly VITE_GHOST_SERVER?: string;
  /** MOTION-1 (REQ-BFG-071): "1" builds the battles-in-motion prototype (src/render/motion.ts); unset, the game as before. */
  readonly VITE_MOTION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
