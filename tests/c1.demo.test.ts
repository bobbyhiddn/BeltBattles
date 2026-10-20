// C1 (BRIEF-C1 item 5): the VITE_DEMO flag scaffold, following VITE_GHOST_SERVER (game/online.ts) and VITE_MOTION_KNOBS
// (render/motion.ts). One exported boolean, true only for the exact string "1"; a `build:demo` npm script that builds with it into its
// own folder; the gitignored folder; the typed env. Nothing reads the flag yet (job D3 builds the demo on top of it).
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const scripts = (JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { scripts: Record<string, string> }).scripts;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

/** src/demo.ts's DEMO as a build with VITE_DEMO = `value` makes it (undefined: the variable is not set at all). */
async function demo(value?: string): Promise<boolean> {
  vi.unstubAllEnvs();
  vi.resetModules();
  if (value !== undefined) vi.stubEnv("VITE_DEMO", value);
  return (await import("../src/demo")).DEMO;
}

describe("C1 item 5: the VITE_DEMO flag", () => {
  it("is false unless VITE_DEMO is the exact string \"1\": unset, empty, 0, true, yes, 2 and padded values are all false", async () => {
    expect(await demo()).toBe(false);
    for (const v of ["", "0", "true", "yes", "2", " 1", "1 ", "01", "on"]) expect(await demo(v), `VITE_DEMO=${JSON.stringify(v)}`).toBe(false);
    expect(await demo("1")).toBe(true);
  });

  it("the default and the online builds set no VITE_DEMO; build:demo is the same Vite build with VITE_DEMO=1 into its own folder, dist-demo", () => {
    for (const name of ["build", "build:online", "dev", "preview", "test"]) expect(scripts[name], name).not.toMatch(/VITE_DEMO/);
    const steps = scripts["build:demo"].split("&&").map((s) => s.trim());
    expect(steps).toEqual(["tsc --noEmit", "VITE_DEMO=1 vite build --outDir dist-demo"]);
    // the shape of build:online's own step, with its one variable and its folder swapped
    expect(scripts["build:online"].split("&&").map((s) => s.trim())).toEqual(["tsc --noEmit", "VITE_GHOST_SERVER=same-origin vite build --outDir dist-online"]);
    expect(readFileSync(join(ROOT, ".gitignore"), "utf8").split("\n")).toContain("dist-demo/");
  });

  it("is typed (src/env.d.ts: an optional string, as the other two) and exported from its own module, src/demo.ts", () => {
    const env = readFileSync(join(ROOT, "src/env.d.ts"), "utf8");
    expect(env).toMatch(/readonly VITE_DEMO\?: string;/);
    expect(env).toMatch(/readonly VITE_GHOST_SERVER\?: string;/);
    expect(env).toMatch(/readonly VITE_MOTION_KNOBS\?: string;/);
    expect(readFileSync(join(ROOT, "src/demo.ts"), "utf8")).toMatch(/export const DEMO: boolean = import\.meta\.env\.VITE_DEMO === "1";/);
  });
});
