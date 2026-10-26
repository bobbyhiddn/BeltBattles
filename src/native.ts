// M1 (BRIEF-M1 Goal 2): the phone app's build flag. `npm run build:app` builds with VITE_NATIVE=1 into dist-app/ (the folder
// Capacitor bundles into the Android app); every other build (npm run build, build:online, build:demo, the dev server, vitest)
// leaves it unset. It follows src/demo.ts's pattern: Vite replaces import.meta.env.VITE_NATIVE at build time, so a module that
// reads NATIVE is decided by the build, never by the URL, a save or the player.
//
// THIS CONST NEVER GUARDS THE BOOT'S import(). main.ts loads src/native/boot.ts (the only module that imports @capacitor/*)
// behind the inline test `import.meta.env.VITE_NATIVE === "1"`, written in main.ts itself. Reason: this repo's Vite (8.3.0)
// bundles with Rolldown, which folds that inline test but NOT a const imported from another module: `if (NATIVE) import("./native/boot")`
// ships the boot chunk, with Capacitor's code, in EVERY web build (cap's fold check: output-m1/gates/m1base-foldcheck.txt). The
// web must never hold Capacitor: @capacitor/preferences has a web implementation over localStorage, and a page that registered it
// would make IDENT-1's capacitorMirror() non-null, so the web would make extractable device keys and keep their private JWK in
// localStorage (src/net/identityMirror.ts). So: use NATIVE for code that only needs to know "this is the app" (a label, a
// switch); to keep code OUT of the web bundle, write the inline test and run `npm run build` and the Capacitor grep
// (tests/m1.native.test.ts reads main.ts for it).

/** True only in a build made with VITE_NATIVE=1 (the exact string "1"). */
export const NATIVE: boolean = import.meta.env.VITE_NATIVE === "1";
