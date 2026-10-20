// C1 (store hardening, BRIEF-C1 item 5): the free demo's build flag, a scaffold. `npm run build:demo` builds with
// VITE_DEMO=1 into its own folder (dist-demo/); every other build (npm run build, build:online, the dev server, vitest) leaves it
// unset. It follows the VITE_GHOST_SERVER (game/online.ts BUILD_SERVER) and VITE_MOTION_KNOBS (render/motion.ts MOTION_KNOBS)
// pattern: Vite replaces import.meta.env.VITE_DEMO at build time, so a module that reads DEMO is decided by the build, never
// by the URL, a save or the player.
// NOTHING READS DEMO YET: no screen, rule or sim file imports this module, so the demo build is the default build, byte for byte
// (the folder differs, the page does not). Job D3 builds the demo itself on top of it (ends at 5 wins with a wishlist screen, locks
// the two other heroes, customization and achievements).

/** True only in a build made with VITE_DEMO=1 (the exact string "1"). */
export const DEMO: boolean = import.meta.env.VITE_DEMO === "1";
