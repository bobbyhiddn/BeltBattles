// 0.7.0a: the one build-time setting the game reads (src/game/online.ts, decision D3). Vite replaces
// import.meta.env.VITE_GHOST_SERVER at build time; the default build sets nothing, so it is undefined and the
// game plays offline exactly as 0.6.2. "same-origin" means the page's own origin (a later Fly page build).
interface ImportMetaEnv {
  readonly VITE_GHOST_SERVER?: string;
  /** MOTION-2 (REQ-BFG-071): "1" makes a test build with the motion dev knobs (?motion, ?sway, ?sea, ?perf; src/render/
   *  motion.ts MOTION_KNOBS) for the scripts' pages. Unset (every player build), the knobs are not in the bundle. */
  readonly VITE_MOTION_KNOBS?: string;
  /** C1 (BRIEF-C1 item 5): "1" makes the free demo's build (`npm run build:demo`, into dist-demo/; src/demo.ts DEMO). Unset (every
   *  other build) DEMO is false. Nothing reads it yet: job D3 builds the demo on top of it. */
  readonly VITE_DEMO?: string;
  /** M1 (BRIEF-M1 Goal 2): "1" makes the phone app's web build (`npm run build:app`, into dist-app/; src/native.ts NATIVE, and main.ts's
   *  inline test that loads src/native/boot.ts, the only module that imports @capacitor/*). Unset (every other build) no Capacitor code is
   *  in the bundle. */
  readonly VITE_NATIVE?: string;
  /** Vite's own: true under the dev server and vitest, false in a build. */
  readonly DEV: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
