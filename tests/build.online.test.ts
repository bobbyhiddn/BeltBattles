import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { build } from "vite";
import { resolveServerUrl } from "../src/game/online";

// 0.7.0 (R1 M3; REQ-BFG-016): `npm run build:online` is the page for the Fly image. It is the same Vite build as
// `npm run build` with VITE_GHOST_SERVER=same-origin, into the gitignored dist-online/, so the page served at / of the
// ghost server plays online against the origin that serves it. `npm run build` (dist/) stays the offline default.
// The two bundles, made here the way the scripts make them, differ in one spot: the build's server setting.

const ROOT = new URL("..", import.meta.url).pathname;
const scripts = (JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { scripts: Record<string, string> }).scripts;

/** A build script's steps, and its `vite build` step's env assignments and arguments. */
function viteStep(script: string): { steps: string[]; env: Record<string, string>; args: string[] } {
  const steps = script.split("&&").map((s) => s.trim());
  const step = steps.find((s) => / ?vite build( |$)/.test(s));
  if (!step) throw new Error(`no vite build in "${script}"`);
  const words = step.split(/\s+/);
  const env: Record<string, string> = {};
  while (/^[A-Z_][A-Z0-9_]*=/.test(words[0])) {
    const [k, ...v] = words.shift()!.split("=");
    env[k] = v.join("=");
  }
  if (words.shift() !== "vite" || words.shift() !== "build") throw new Error(`unexpected vite step "${step}"`);
  return { steps, env, args: words };
}

/** The page's one JS chunk, built in-process as `vite build` does with these env variables (write: false). */
async function bundle(env: Record<string, string>): Promise<string> {
  const keys = ["VITE_GHOST_SERVER", "NODE_ENV", ...Object.keys(env)];
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  try {
    delete process.env.VITE_GHOST_SERVER;
    process.env.NODE_ENV = "production"; // as the CLI runs it (vitest sets "test")
    Object.assign(process.env, env);
    const out = await build({ root: ROOT, configFile: join(ROOT, "vite.config.ts"), logLevel: "silent", build: { write: false } });
    const outputs = (Array.isArray(out) ? out : [out]) as { output?: { type: string; code?: string }[] }[];
    const chunks = outputs.flatMap((o) => o.output ?? []).filter((c) => c.type === "chunk");
    expect(chunks).toHaveLength(1);
    return chunks[0].code!;
  } finally {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

describe("npm run build:online: the Fly page (0.7.0 R1 M3)", () => {
  it("is the same Vite build with VITE_GHOST_SERVER=same-origin into the gitignored dist-online/; npm run build sets nothing", () => {
    const off = viteStep(scripts.build), on = viteStep(scripts["build:online"]);
    expect(off).toEqual({ steps: ["tsc --noEmit", "vite build"], env: {}, args: [] }); // dist/ (vite.config.ts), offline
    expect(on.steps[0]).toBe("tsc --noEmit");
    expect(on.env).toEqual({ VITE_GHOST_SERVER: "same-origin" });
    expect(on.args).toEqual(["--outDir", "dist-online"]);
    expect(readFileSync(join(ROOT, ".gitignore"), "utf8").split("\n")).toContain("dist-online/");
    // what the setting means in the page (online.ts): the page's own origin; and nothing in the default build
    expect(resolveServerUrl("", null, { build: on.env.VITE_GHOST_SERVER, origin: "https://beltbattles.fly.dev" })).toBe("https://beltbattles.fly.dev");
    expect(resolveServerUrl("", null, { build: "same-origin", origin: "null" })).toBeNull(); // file:// has no origin: offline
    expect(resolveServerUrl("", null, { build: off.env.VITE_GHOST_SERVER ?? "", origin: "https://beltbattles.fly.dev" })).toBeNull();
  });

  it("built both ways, the online bundle is the default one with the setting's value in one spot, the build's server default", async () => {
    const value = viteStep(scripts["build:online"]).env.VITE_GHOST_SERVER ?? "";
    const off = await bundle(viteStep(scripts.build).env);
    const on = await bundle(viteStep(scripts["build:online"]).env);
    expect(value).toBe("same-origin");
    expect(on.length).toBe(off.length + value.length);
    let i = 0;
    while (i < off.length && off[i] === on[i]) i++;
    expect(on.slice(i, i + value.length)).toBe(value);
    expect(on.slice(i + value.length)).toBe(off.slice(i));
    // the spot: resolveServerUrl's `opts.build ?? BUILD_SERVER`, empty in the default build
    expect(on.slice(Math.max(0, i - 200), i + value.length + 1)).toMatch(/\.build\?\?`same-origin`$/);
  }, 60_000);
});
