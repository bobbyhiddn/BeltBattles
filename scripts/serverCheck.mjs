// STAGE-0910 step 3 (STAGE-099C F10; scripts only): the server's own deck check, for the browser runners.
//
// Why. scripts/playthrough.mjs judged a dusk foe by a copy of the numbers (the day's gold + the foe's rune gold + NPC_DAY's
// road allowance, NPC_ROAD_DUSK) and called a deck the server admits NOT HONEST: at 0.9.9 the day-1 seed ghost WEAVER
// (deckCost 18 against "8 + 0 + 3 road"), so rcruns' online half read 32 of 35. The server counts something else.
//
// The server's rule is src/net/validate.ts:169 validateUpload in the player mode (the budget block :529-540, then
// src/net/roadCap.ts:704 playerSupplyBudget): the BOUGHT cost (the runes' hull and belt taken out) must be at most
// maxGoldByDay(day) + roadCapFor(day, the cheapest road mix that explains the deck's hull and belt) + the runes' gold + a
// free LAST CHANCE part + the value of the road log's drops (src/sim/npcDay.ts:233 roadDropValue). It is called as
// server/seed.ts:61-62 calls it for the seed pool and server/app.ts:335-336 for an upload: ctx = { seed, lastChance, road }
// of the stored snapshot. This module bundles validate.ts for node once a process (vite's build(), as scripts/stylecheck.mjs:56
// does for tools/styleRefs.ts and vite.server.config.ts for the server; no esbuild is installed) and calls it; no number of
// the server's is copied here.
//
// A ghost the ghost server served is judged here (run.dusk.source "online" with its ghostId: src/game/day.ts:59-65
// onlineFoe). A stand-in and a tooling pool ghost (src/tooling.ts makeGhost: kind "ghost", no source, no runes, which the
// player mode's exact rune count refuses) keep playthrough.mjs's own rule. The page's dusk has no road log, seed or LAST
// CHANCE (src/game/run.ts:103-116 DuskFoe), so the snapshot comes from the server's store (the data dir: pool.jsonl for the
// seed pool, ghosts.jsonl for uploads, one {"id","at","snapshot"} a line, server/store.ts:7-17; with its seed: the exact ctx
// of server/seed.ts), or else from the match answer the page got (served without its seed, server/app.ts:52-56 and :360:
// the ctx of the page's own check, src/net/ghostClient.ts:72). The deck judged is the deck the page fights (run.dusk.build).
//
// Self-test (no browser, about 10 s): `node scripts/serverCheck.mjs selftest` bundles server/seedPoolData.ts too, judges
// every seed-pool ghost by the same call, and then an over-ceiling deck (each one plus 10000 hull = 40 ARMOR PACKs, 200 G
// over): it must read NOT HONEST. Exit 1 if a pool ghost is refused or an over-ceiling deck is admitted.

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const loaded = new Map();

/** The server's validateUpload (src/net/validate.ts), maxHonestSpend and roadDropValue, bundled for node once a process.
 *  `pool`: also the bundled seed pool (server/seedPoolData.ts SEED_POOL), for the self-test. */
export function loadServerCheck({ pool = false } = {}) {
  const key = pool ? "pool" : "base";
  if (!loaded.has(key)) {
    loaded.set(key, (async () => {
      const { build } = await import("vite");
      const out = mkdtempSync(join(tmpdir(), "bb-servercheck-"));
      try {
        const input = { validate: join(ROOT, "src/net/validate.ts"), npcDay: join(ROOT, "src/sim/npcDay.ts") };
        if (pool) input.seedPoolData = join(ROOT, "server/seedPoolData.ts");
        await build({
          root: ROOT, configFile: false, publicDir: false, cacheDir: join(out, ".vite"), logLevel: "error",
          build: {
            ssr: true, outDir: out, emptyOutDir: false, target: "node20", minify: false, copyPublicDir: false,
            rolldownOptions: { input, output: { format: "es", entryFileNames: "[name].mjs", chunkFileNames: "[name]-[hash].mjs" } },
          },
        });
        const v = await import(pathToFileURL(join(out, "validate.mjs")).href);
        const n = await import(pathToFileURL(join(out, "npcDay.mjs")).href);
        const p = pool ? await import(pathToFileURL(join(out, "seedPoolData.mjs")).href) : null;
        return { validateUpload: v.validateUpload, maxHonestSpend: v.maxHonestSpend, roadDropValue: n.roadDropValue, SEED_POOL: p?.SEED_POOL };
      } finally {
        rmSync(out, { recursive: true, force: true });
      }
    })());
  }
  return loaded.get(key);
}

/** The stored snapshot of ghost `id` in a ghost server's data dir (pool.jsonl, then ghosts.jsonl), or null. */
export function storedSnapshot(dir, id) {
  for (const file of ["pool.jsonl", "ghosts.jsonl"]) { // server/store.ts:16-17: the seed pool, the uploads
    let text = "";
    try {
      text = readFileSync(join(dir, file), "utf8");
    } catch {
      continue;
    }
    for (const line of text.split("\n")) {
      try {
        const r = JSON.parse(line);
        if (r.id === id) return r.snapshot;
      } catch { /* a blank or torn line */ }
    }
  }
  return null;
}

/** The ctx the server gives a snapshot's check: server/seed.ts:61-62, server/app.ts:335-336 (each key only when it has one). */
export const snapshotCtx = (s) => ({
  ...(s.seed !== undefined ? { seed: s.seed } : {}),
  ...(s.lastChance ? { lastChance: s.lastChance } : {}),
  ...(s.road ? { road: s.road } : {}),
});

const OVER_HULL = 10000; // 40 ARMOR PACKs at +250 hull and 5 G each (src/sim/content.ts plating): 200 G over any day's ceiling
let controlled = false; // the over-ceiling control runs once a process

/**
 * Judge a dusk foe the ghost server served. `foe`: { day, build (JSON text of run.dusk.build), ghostId }; `src`: { store (a
 * data dir), answers (promises of parsed /v1/ghosts/match bodies { id, snapshot }) }. Resolves { ok, from, why, control }:
 * ok = the server's validateUpload admits the deck the page fights; `control` (the first call of a process only) = the same
 * check on that deck plus 10000 hull, which must refuse.
 */
export async function judgeFoe(foe, src = {}) {
  const stored = src.store ? storedSnapshot(src.store, foe.ghostId) : null;
  const served = stored ? null : (await Promise.all(src.answers ?? [])).find((a) => a?.id === foe.ghostId)?.snapshot ?? null;
  const s = stored ?? served;
  if (!s) return { ok: false, from: "nowhere", why: `no snapshot of ghost ${foe.ghostId} (store ${src.store ?? "not given"}, ${(src.answers ?? []).length} match answers)`, control: null };
  const V = await loadServerCheck();
  const ctx = snapshotCtx(s), build = JSON.parse(foe.build);
  const v = V.validateUpload(build, foe.day, s.rules, ctx);
  const from = stored ? "the server's store, with its seed" : "the match answer, served without its seed";
  const sameDay = s.day === foe.day;
  let control = null;
  if (!controlled) {
    controlled = true;
    const over = V.validateUpload({ ...build, hullBonus: build.hullBonus + OVER_HULL }, foe.day, s.rules, ctx);
    control = { ok: over.ok, why: over.ok ? "validateUpload ok" : `validateUpload: ${over.errors.join("; ")}` };
  }
  const why = !sameDay ? `the stored ghost ${foe.ghostId} is a day ${s.day} deck, not day ${foe.day}`
    : v.ok ? `validateUpload ok; maxHonestSpend(${foe.day}) ${V.maxHonestSpend(foe.day)}, road-log drops ${V.roadDropValue(s.road)}`
      : `validateUpload: ${v.errors.join("; ")}`;
  return { ok: v.ok && sameDay, from, why, control };
}

async function selftest() {
  const V = await loadServerCheck({ pool: true });
  const pool = V.SEED_POOL.map((t) => JSON.parse(t));
  let refused = 0, admitted = 0, first = "";
  for (const s of pool) {
    const ctx = snapshotCtx(s);
    if (!V.validateUpload(s.build, s.day, s.rules, ctx).ok) refused++;
    const over = V.validateUpload({ ...s.build, hullBonus: s.build.hullBonus + OVER_HULL }, s.day, s.rules, ctx);
    if (over.ok) admitted++;
    else first ||= over.errors.join("; ");
  }
  console.log(`serverCheck selftest: ${pool.length} seed-pool ghosts (server/seedPoolData.ts, rules ${pool[0]?.rules}); validateUpload admits ${pool.length - refused} of ${pool.length} (server/seed.ts:61-62's call and ctx)`);
  console.log(`serverCheck selftest: the control, each deck + ${OVER_HULL} hull (${OVER_HULL / 250} ARMOR PACKs, ${OVER_HULL / 250 * 5} G over): NOT HONEST for ${pool.length - admitted} of ${pool.length}; the first: ${first}`);
  // judgeFoe by the store, as rcruns calls it: a data dir with the pool as pool.jsonl
  const dir = mkdtempSync(join(tmpdir(), "bb-servercheck-store-"));
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "pool.jsonl"), pool.map((s, i) => JSON.stringify({ id: `selftest-${i}`, at: 0, snapshot: s })).join("\n") + "\n");
    let bad = 0;
    for (const [i, s] of pool.entries()) {
      const j = await judgeFoe({ day: s.day, build: JSON.stringify(s.build), ghostId: `selftest-${i}` }, { store: dir });
      if (!j.ok) bad++;
      if (i === 0) console.log(`serverCheck selftest: judgeFoe(ghost 0, the store): ok ${j.ok} (${j.why}; from ${j.from}); its once-a-process control: ${j.control ? `${j.control.ok ? "honest" : "NOT HONEST"} (${j.control.why})` : "none"}`);
    }
    console.log(`serverCheck selftest: judgeFoe by the store: ${pool.length - bad} of ${pool.length} honest`);
    const gone = await judgeFoe({ day: 1, build: "{}", ghostId: "not-there" }, { store: dir });
    console.log(`serverCheck selftest: a ghost the store does not hold: ok ${gone.ok} (${gone.why})`);
    if (gone.ok) refused++;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  const pass = refused === 0 && admitted === 0;
  console.log(`serverCheck selftest: ${pass ? "PASS" : "FAIL"}`);
  process.exit(pass ? 0 : 1);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url && process.argv[2] === "selftest") {
  selftest().catch((e) => { console.error(e); process.exit(1); });
}
