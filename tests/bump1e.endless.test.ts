// BUMP-1E P6 (RULING-BUMP1E-R3 R3.3 a and c): the two places where ENDLESS-1's merge meets this release's own checks.
//  (a) src/net/ghostClient.ts problem(): with SCALE_RIGS on, a served RUN ghost's record must be one a run carries into the dusk
//      (SCALE-2d's isReachable re-check), and a served ENDLESS ghost, whose wins stay at 10 past the victory day, is judged on the
//      endless model instead (records.ts endlessRecordProblem, which takes only what the snapshot holds, as the server's POST does).
//      The ghosts are served by a stub server; the honest ones are played through the game's own code (tests/endless1.honest.ts).
//  (c) src/game/saveGuard.ts (E.2) and ENDLESS-1's kept RUN WON save (src/game/save.ts saveRun keeps a marked, won run while its
//      offer is open): a kept RUN WON save that names a part this build does not know gets the guard's plain line and NEW RUN, no
//      CONTINUE; the same save without it is still offered ("RUN WON · DAY 13 · FURNACE" and the RUN WON card).
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer, type Server } from "node:http";
import "../src/sim/deck"; // load order: the ITEMS key order is part of the seeded draws
import { computeView } from "../src/core/io";
import { finishDay } from "../src/game/day";
import { SAVE_KEY, newRun, saveRun, type Run } from "../src/game/run";
import { setPlayerName } from "../src/game/ghostSnapshot";
import { SAVE_ASIDE_LINE, loadRunGuarded, saveProblem } from "../src/game/saveGuard";
import { fetchGhost } from "../src/net/ghostClient";
import { ghostId, type GhostSnapshot } from "../src/net/snapshot";
import { RULES_VERSION } from "../src/sim/content";
import { endlessOffered, endlessRules, setEndless, withEndless } from "../src/sim/endless";
import { withHearts } from "../src/sim/hearts";
import { withLongRun } from "../src/sim/longRun";
import { scaleRules, setScaleRigs } from "../src/sim/scale";
import { TitleScreen, continueSub } from "../src/screens/title";
import { UI } from "../src/ui/ui";
import type { Game, Screen } from "../src/game/game";
import type { G } from "../src/render/pixel";
import type { SideStats } from "../src/sim/battle";
import { TEST_NAME } from "./netIdentity";
import { LOSS, WIN, playEndless } from "./endless1.honest";

// ---- the drawn text of a screen (tests/endless1.screens.test.ts's way): every string drawText is given -----------------------------------
const placed = vi.hoisted(() => [] as string[]);
vi.mock("../src/render/font", async (importOriginal) => {
  const m = await importOriginal<typeof import("../src/render/font")>();
  return { ...m, drawText: (...a: Parameters<typeof m.drawText>) => { placed.push(String(a[1])); return m.drawText(...a); } };
});
interface RecCanvas { width: number; height: number; calls: string[]; getContext: () => G }
function recCanvas(): RecCanvas {
  const c: RecCanvas = { width: 0, height: 0, calls: [], getContext: () => g };
  const st: Record<string, unknown> = {
    canvas: c, fillStyle: "#000000", strokeStyle: "#000000", globalAlpha: 1, imageSmoothingEnabled: false, lineWidth: 1,
    globalCompositeOperation: "source-over", font: "10px sans-serif", textAlign: "start", textBaseline: "alphabetic", filter: "none",
  };
  const g = new Proxy(st, {
    get(t, k) {
      if (typeof k !== "string") return undefined;
      if (k in t) return t[k];
      if (k === "getImageData" || k === "createImageData") return (_x: number, _y: number, w = 1, h = 1) => ({ data: new Uint8ClampedArray(Math.max(4, w * h * 4)), width: w, height: h });
      if (k === "measureText") return () => ({ width: 0 });
      if (k === "createLinearGradient" || k === "createRadialGradient" || k === "createPattern") return () => ({ addColorStop() {} });
      return () => { c.calls.push(k); };
    },
    set(t, k, v) {
      if (typeof k === "string") t[k] = v;
      return true;
    },
  }) as unknown as G;
  return c;
}

const store = new Map<string, string>();
let restoreDom: () => void = () => undefined;
const was = { endless: false, scale: false };
beforeAll(() => {
  was.endless = endlessRules();
  was.scale = scaleRules();
  setEndless(true); // ENDLESS on (it ships off in ENDLESS-1's tree, on from P6's switch commit) ...
  setScaleRigs(true); // ... and SCALE_RIGS on, which is what this file is about
  setPlayerName(TEST_NAME);
  const doc = globalThis as { document?: unknown };
  const prev = doc.document;
  doc.document = { createElement: () => recCanvas() };
  restoreDom = () => { doc.document = prev; };
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); }, removeItem: (k: string) => { store.delete(k); },
    key: () => null, length: 0, clear: () => store.clear(),
  });
});
afterAll(() => { restoreDom(); vi.unstubAllGlobals(); setEndless(was.endless); setScaleRigs(was.scale); });
beforeEach(() => { placed.length = 0; store.clear(); });

// ---- (a) the client's check of a served ghost ----------------------------------------------------------------------------------------------
describe("BUMP-1E R3.3 (a): the client's check of a served ghost with SCALE_RIGS and ENDLESS on", () => {
  let server: Server, base: string, answer: unknown;
  let runSnaps: GhostSnapshot[], endlessSnaps: GhostSnapshot[];
  /** The ghost as the server serves it: without the seed. */
  const served = (s: GhostSnapshot): { id: string; snapshot: Omit<GhostSnapshot, "seed"> } => { const { seed: _seed, ...rest } = s; return { id: ghostId(s), snapshot: rest }; };
  const endlessReq = { rules: RULES_VERSION, day: 15, wins: 1, lives: 3, playerId: "other-player", seen: [] as string[], hero: "furnace" as const, seed: 7, runs: 5, endless: true as const };
  const runReq = { rules: RULES_VERSION, day: 3, wins: 0, lives: 8, playerId: "other-player", seen: [] as string[], hero: "furnace" as const, seed: 7, runs: 5 };

  beforeAll(async () => {
    const played = playEndless("furnace", 61, "bump1e-endless-client", { endlessOutcomes: [WIN, WIN, WIN, LOSS, WIN, WIN, WIN, WIN] });
    runSnaps = played.runSnaps;
    endlessSnaps = played.endlessSnaps;
    server = createServer((_req, res) => { res.setHeader("content-type", "application/json"); res.end(JSON.stringify(answer)); });
    await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  }, 300_000);
  afterAll(async () => { await new Promise<void>((ok) => server.close(() => ok())); });

  const asScale = async <T>(on: boolean, fn: () => Promise<T>): Promise<T> => { // (not withScaleRigs: its fn returns at the first await)
    const prev = scaleRules();
    setScaleRigs(on);
    try { return await fn(); } finally { setScaleRigs(prev); }
  };

  it("an honest endless ghost (the game's own snapshot, day 14: 3 endless wins, victory day 10) is accepted", async () => {
    const s = endlessSnaps.find((x) => x.day === 14)!;
    expect([s.mode, s.endlessWins, s.endlessLives, s.victoryDay, s.wins]).toEqual(["endless", 3, 3, 10, 10]);
    answer = served(s);
    expect(scaleRules()).toBe(true);
    const got = await fetchGhost(base, endlessReq);
    expect(got.source, got.error).toBe("server");
    expect(got.snapshot.mode).toBe("endless");
    expect(got.snapshot.day).toBe(14);
  });

  it("an endless ghost whose record no endless leads to (3 endless wins and 2 hearts in 3 dusks: wins cost no heart) is refused, with the endless model's words", async () => {
    const s = endlessSnaps.find((x) => x.day === 14)!;
    answer = served({ ...s, endlessLives: 2, lives: 2 }); // the decoder's bounds take it (2 hearts, 3 wins in 3 dusks); the endless model does not
    const got = await fetchGhost(base, endlessReq);
    expect(got.source).toBe("fallback");
    expect(got.error).toMatch(/endless ghost whose record no endless leads to/);
    expect(got.error).toMatch(/3 endless wins and 2 hearts is no record a run won on day 10 carries into endless dusk 14/);
    // the check is the new one's: SCALE_RIGS off leaves the served-ghost check as ENDLESS-1 built it (the decoder's bounds alone)
    const off = await asScale(false, () => fetchGhost(base, endlessReq));
    expect(off.source, off.error).toBe("server");
  });

  it("a RUN's ghost keeps SCALE-2d's check: a record no run carries into the dusk (day 3, no win, 3 hearts after 2 losses) is refused; the switch off takes it, as before", async () => {
    const d3 = runSnaps.find((x) => x.day === 3)!;
    answer = served({ ...d3, wins: 0, lives: 3, losses: 2 });
    const got = await fetchGhost(base, runReq);
    expect(got.source).toBe("fallback");
    expect(got.error).toMatch(/server returned a ghost whose record \(0W 3 lives\) no run carries into dusk 3/);
    const off = await asScale(false, () => fetchGhost(base, runReq));
    expect(off.source, off.error).toBe("server");
    // and an honest run ghost passes with the switch on
    answer = served(d3);
    const ok = await fetchGhost(base, { ...runReq, wins: d3.wins, lives: d3.lives });
    expect(ok.source, ok.error).toBe("server");
  });
});

// ---- (c) E.2's save guard and ENDLESS-1's kept RUN WON save -------------------------------------------------------------------------------
describe("BUMP-1E R3.3 (c): a kept RUN WON save that names a part this build does not know", () => {
  const S = {} as SideStats;
  /** A run made with the long run, hearts and ENDLESS on (so it carries the endless mark); won on day 13 after 3 losses. */
  const won13 = (): Run => {
    const run = withHearts(() => withLongRun(() => withEndless(() => newRun("furnace", 11, "bump1e-e2-endless"))));
    for (const c of "LLL" + "WWWWWWWWWW" + "WWW") { if (run.over) break; finishDay(run, c === "W" ? 0 : 1, 30, S, S); }
    return run;
  };
  function titleOf(): { s: TitleScreen; cmds: string[] } {
    const view = computeView(402, 690, 3);
    const audio = new Proxy({}, { get: () => () => undefined });
    const went: Screen[] = [];
    const game = {
      run: null, audio, view, W: view.W, H: view.H, portrait: view.portrait, t: 0, ui: new UI(), canvas: recCanvas(), toast() {}, go(s: Screen) { went.push(s); }, error() {}, soundButton() {},
      transitioning: false, resize() {},
    } as unknown as Game;
    (game as unknown as { openName(): void }).openName = () => undefined;
    const s = new TitleScreen(game);
    placed.length = 0;
    game.ui.begin();
    s.draw(recCanvas().getContext());
    game.ui.end();
    return { s, cmds: [...placed] };
  }

  it("the control: the kept RUN WON save (marked, won, undecided) loads through the guard, is offered, and the title shows CONTINUE with 'RUN WON · DAY 13 · FURNACE'", () => {
    const run = won13();
    expect([run.over, run.wins, run.day, run.endless]).toEqual(["won", 10, 13, true]);
    saveRun(run);
    expect(store.has(SAVE_KEY)).toBe(true); // ENDLESS-1: kept while the offer is open
    const back = loadRunGuarded()!;
    expect(back).not.toBeNull();
    expect(saveProblem()).toBeNull();
    expect(endlessOffered(back)).toBe(true);
    expect(continueSub(back)).toBe("RUN WON · DAY 13 · FURNACE");
    const { cmds } = titleOf();
    expect(cmds).toContain("CONTINUE");
    expect(cmds).toContain("NEW RUN");
    expect(cmds.join(" ")).not.toContain("NEEDS A NEWER VERSION"); // no set-aside line while the save is one this build can play
  });

  it("the same save naming a part this build lacks gets the plain line and NEW RUN, no CONTINUE, and stays in storage untouched", () => {
    const run = won13();
    saveRun(run);
    const raw = JSON.parse(store.get(SAVE_KEY)!) as { build: { items: { uid: number; def: string; x: number; y: number }[] } };
    raw.build.items.push({ uid: 990, def: "needletrain", x: 0, y: 0 }); // a part a newer build knows
    const text = JSON.stringify(raw);
    store.set(SAVE_KEY, text);
    expect(loadRunGuarded()).toBeNull();
    expect(saveProblem()).toBe(SAVE_ASIDE_LINE);
    const { cmds } = titleOf();
    expect(cmds).toContain("NEW RUN");
    expect(cmds).not.toContain("CONTINUE");
    expect(cmds.join(" ")).toContain("THE SAVED RUN NEEDS A NEWER VERSION OF THE GAME");
    expect(store.get(SAVE_KEY)).toBe(text); // a build that knows the part can still continue it
  });
});
