// Entry point: boots the game shell on #game and exposes a small hook for tooling
// (screenshots / smoke tests / metrics): window.bb.open("build", "furnace").

import { Game } from "./game/game";
import { newRun } from "./game/run";
import { gainModule } from "./game/fuse";
import { beginRoad, makeEvent } from "./game/events";
import type { EventId } from "./game/eventDefs";
import { ITEMS, buyableModules, type HeroId } from "./sim/content";
import { FUSE_MAX, fusible } from "./sim/stars";
import { settings, setReducedMotion } from "./core/settings";
import { VERSION } from "./version";
import { addGhosts, clearPool, pinClassicFoe, playOut, setupFork, setupRun, setupWarlord, showcaseRun, type GhostSpec, type RunSpec } from "./tooling";
import { ForkScreen } from "./screens/fork/fork";
import { forkFor } from "./game/road";
import type { Difficulty } from "./sim/rivals";
import { loadPool, standInFoe } from "./game/ghosts";
import { deckCost, maxGoldByDay } from "./sim/rivals";
import type { Build } from "./sim/deck";
import { TitleScreen } from "./screens/title";
import { HeroScreen, ORDER as HERO_ORDER } from "./screens/hero";
import { BuildScreen } from "./screens/build/build";
import { BattleScreen, DuskWaitScreen } from "./screens/battle";
import { SummaryScreen } from "./screens/summary";
import { EventScreen } from "./screens/event/event";
import type { Arena } from "./game/arena";
import { onlineSession, resolveServerUrl, startOnline } from "./game/online";
import { ReplayScreen } from "./screens/replay";
import { currentName } from "./game/ghostSnapshot"; // PACKS M2 (REQ-BFG-063) tooling
import { runeGrants } from "./sim/runes"; // RUNES-1 (REQ-BFG-058) tooling
import type { Boon } from "./sim/lastChance"; // LC-1 (REQ-BFG-073) tooling (shots)
import { pendingLastChance, pendingRune, takeLastChance, takeRune, type Run } from "./game/run"; // LC-1 tooling
import { finishDay, startDusk } from "./game/day"; // LC-1 tooling: the game's own day loop

const canvas = document.getElementById("game") as HTMLCanvasElement | null;
if (!canvas) throw new Error("#game canvas missing");
// 0.7.0a (decision D3): the ghost server URL, from ?server=<url> (saved; ?server=off clears it) or the build's
// VITE_GHOST_SERVER. None, the default: no session, so the game plays offline exactly as 0.6.2 (no identity, no
// IndexedDB, no request, no new storage key).
const serverUrl = resolveServerUrl(location.search, (() => {
  try {
    return localStorage;
  } catch {
    return null;
  }
})(), { origin: location.origin });
if (serverUrl) startOnline(serverUrl);
const game = new Game(canvas, (g) => new TitleScreen(g));
game.start();

(window as unknown as { bb: unknown }).bb = {
  game,
  settings,
  setReducedMotion,
  version: VERSION,
  open(screen: string, hero: HeroId = "furnace", seed = 12345): void {
    if (screen === "title") return game.go(new TitleScreen(game));
    if (screen === "hero") return game.go(new HeroScreen(game));
    game.run = game.run ?? newRun(hero, seed);
    if (screen === "build") return game.go(new BuildScreen(game));
    if (screen === "battle") {
      pinClassicFoe(game.run); // same opponent as 0.5.0's battle shots and metrics
      return game.go(new BattleScreen(game));
    }
    if (screen === "event") {
      beginRoad(game.run); // day 1 always has its intro event
      return game.go(new EventScreen(game));
    }
    if (screen === "summary") {
      // Z-BUMP (REQ-BFG-073, the flip): was "WLWLDLLL" (5 losses: RUN LOST on day 8); LAST CHANCE gives a life back at the
      // loss that leaves 1 (dusk 8 there), so the run now needs two more losses: RUN LOST on day 10, LAST CHANCE's +1 LIFE
      // row (its HULL card, playOut) on day 8
      game.run = playOut({ hero, seed, results: "WLWLDLLLLL" });
      return game.go(new SummaryScreen(game));
    }
  },
  /** Open a specific road event (shots): day, gold, lives and one cargo part set up first. */
  openEvent(id: EventId, o: { hero?: HeroId; seed?: number; round?: number; day?: number; gold?: number; lives?: number; cargo?: string } = {}): void {
    const run = newRun(o.hero ?? "furnace", o.seed ?? 12345);
    run.day = o.day ?? o.round ?? 3;
    run.gold = o.gold ?? 9;
    run.lives = o.lives ?? 2;
    if (o.cargo) gainModule(run, o.cargo); // 0.6.1a: tooling gains go through gainModule too
    run.event = makeEvent(run.seed, run.day, id);
    run.stage = "event";
    game.run = run;
    game.go(new EventScreen(game));
  },
  /** 0.6.0 tooling: the ghost pool, a run at a given dawn, a dusk vs the pool, a played-out run. */
  clearPool,
  addGhosts: (specs: GhostSpec[]) => addGhosts(specs),
  poolSize: () => loadPool().length,
  /** M3b: what a deck costs (= buildCost) and the gold a player can have by a day's dusk. */
  deckCost: (b: Build) => deckCost(b).total,
  maxGoldByDay: (day: number) => maxGoldByDay(day),
  /** STAGE-090 (cap's ruling eaf260a2a192acf6; read-only tooling): what a deck's runes have put on the build and into the
   *  purse by `day`'s dusk (runes.ts runeGrants: { hull, belt, gold }), for the scripted runs' rune-aware honesty check
   *  (scripts/playthrough.mjs honestFoe: boughtCost <= maxGoldByDay + the runes' gold, as standin.honest and captains.luck). */
  runeGrant: (b: Build, day: number) => runeGrants(b.runes, day),
  setupRun(o: RunSpec = {}): void {
    game.run = setupRun(o);
  },
  /** RUNES-1 tooling (shots): the run holds `ids` in pick order as if each was taken at its dawn (run.ts takeRune: a
   *  HULL or BELT rune's amount on build.hullBonus / build.beltCap); replaces what it held before. */
  holdRunes(ids: string[]): void {
    const run = game.run;
    if (!run) return;
    const was = runeGrants(run.build.runes, run.day);
    run.build.hullBonus -= was.hull;
    run.build.beltCap -= was.belt;
    run.build.runes = ids.map((id) => ({ id }));
    const now = runeGrants(run.build.runes, run.day);
    run.build.hullBonus += now.hull;
    run.build.beltCap += now.belt;
    // FLIP-X2 (REVIEW-FLIPX1 answer 4): as runePicker's pick does, so a shot frames the game's own layout (the rune row
    // may step the build screen's scale: BuildScreen.pickScale, runeRowFits)
    game.resize();
  },
  openDawn(o: RunSpec = {}, ghosts: GhostSpec[] = []): void {
    clearPool();
    addGhosts(ghosts);
    game.run = setupRun(o);
    game.go(new BuildScreen(game));
  },
  /** 0.6.2 BELTSIDE: a showcase deck (tooling.ts SHOWCASE) in the build screen or a dusk battle vs `foe`. */
  openShowcase(name: string, screen: "build" | "battle" = "build", o: RunSpec & { foe?: string } = {}): void {
    clearPool();
    game.run = showcaseRun(name, o);
    game.go(screen === "battle" ? new BattleScreen(game) : new BuildScreen(game));
  },
  openDusk(o: RunSpec = {}, ghosts: GhostSpec[] = []): void {
    clearPool();
    addGhosts(ghosts);
    game.run = setupRun(o);
    game.go(new BattleScreen(game));
  },
  openEnd(o: RunSpec & { results: string; roads?: string }, ghosts: GhostSpec[] = []): void {
    clearPool();
    addGhosts(ghosts);
    game.run = playOut(o);
    game.go(new SummaryScreen(game));
  },
  /** LC-1 (REQ-BFG-073) tooling (shots; scripts never call it in a default game): (Z-BUMP: LAST CHANCE is the game's rule;
   *  the page-wide switch it turned on is gone) plays a run of `hero` through the game's own day loop (startDusk with no
   *  ghost pool, finishDay with the scripted `results`; each dawn's rune is the first card, a LAST CHANCE before the last
   *  one takes HULL), so LAST CHANCE fires on the last dusk ("LLLLL": day 5). Then: the build screen with the pick pending;
   *  with `pick`, that card taken (and the next dawn's rune) and the regained heart lit; with `rest` too, those dusks played
   *  and the run summary shown. `open`: the picker's opened card. */
  openLastChance(o: { hero?: HeroId; seed?: number; results?: string; pick?: Boon; rest?: string; open?: number; heartT?: number } = {}): void {
    clearPool();
    const run: Run = newRun(o.hero ?? "furnace", o.seed ?? 12345);
    const zero = { shots: 0, damage: 0, firstShot: 0, idle: 0, turretTime: 0, maxQueue: 0, jams: 0, disrupted: 0, windTaken: 0, burnDealt: 0, payloadSum: 0, produced: 0, stalled: 0 };
    const dawn = (pick: Boon): void => {
      if (pendingLastChance(run)) takeLastChance(run, pick);
      const r = pendingRune(run);
      if (r) takeRune(run, r.ids[0]);
    };
    const dusk = (c: string): void => {
      dawn("hull");
      startDusk(run, []);
      finishDay(run, c === "W" ? 0 : c === "L" ? 1 : -1, 20 + run.day, { ...zero }, { ...zero });
    };
    for (const c of o.results ?? "LLLLL") if (!run.over) dusk(c);
    game.run = run;
    if (o.pick) dawn(o.pick);
    if (o.rest) {
      for (const c of o.rest) if (!run.over) dusk(c);
      game.go(new SummaryScreen(game));
      return;
    }
    const s = new BuildScreen(game);
    if (o.pick) s.lcHeartT = o.heartT ?? 0;
    if (o.open !== undefined) s.lastChancePicker.open = o.open;
    game.go(s);
  },
  /** 0.6.0b: the road fork at a day's dawn (matriarchBeatenOn for R3). */
  openFork(o: RunSpec & { matriarchBeatenOn?: number; bounty?: boolean; sabotage?: boolean } = {}, ghosts: GhostSpec[] = []): void {
    clearPool();
    addGhosts(ghosts);
    game.run = setupFork(o);
    game.go(new ForkScreen(game));
  },
  /** 0.6.0b: a warlord fight picked at the fork; with `outcome` its result card (0 win, 1 loss). */
  openWarlord(tier: Difficulty, o: RunSpec & { matriarchBeatenOn?: number; outcome?: 0 | 1 | -1 } = {}): void {
    clearPool();
    game.run = setupWarlord(tier, o);
    game.go(new BattleScreen(game, "warlord"));
  },
  /** The run's stand-in captain for each day 1-10 and its deck's deckCost against maxGoldByDay;
   *  0.6.2 TUNE-C: the deck is the captain's named build, standInBuild (pool: false; 0.6.0d-0.6.2 it
   *  was the stand-in pool's pick, pool: true, floor = ceil(0.9 x budget)). */
  standInSpend(runSeed: number) {
    return Array.from({ length: 10 }, (_, i) => {
      const f = standInFoe(runSeed, i + 1), budget = maxGoldByDay(i + 1);
      return {
        day: i + 1, name: f.name, hero: f.hero, pool: false, hull: f.build.hullBonus,
        cost: deckCost(f.build).total, floor: Math.ceil(0.9 * budget), budget,
      };
    });
  },
  /** 0.6.0b: today's fork and the dusk foe it leads to, for the scripted-run log. */
  forkInfo() {
    const run = game.run;
    if (!run) return null;
    const f = forkFor(run);
    return { day: run.day, event: f.event, warlords: f.warlords, road: run.road, warlord: run.warlord, lives: run.lives, gold: run.gold, matriarchBeatenOn: run.matriarchBeatenOn };
  },
  /** 0.6.0c metrics: restart the current screen's arena effects RNG at `seed` (cosmetic, never
   *  the sim's), so a measured shake repeats exactly. False when the screen has no arena. */
  seedFx(seed: number): boolean {
    const a = (game.screen as unknown as { arena?: Arena }).arena;
    a?.fx.reseed(seed);
    return !!a;
  },
  /** 0.6.2t (REQ-BFG-032): the buyable modules (buyableModules()) and each supply: id, name, kind and top star, for
   *  the ability-text contact sheet (scripts/contact-sheet.mjs). Read only; a module the catalogue adds shows up here. */
  catalogue(): { id: string; name: string; kind: string; stars: number; merchant: string; price: number }[] {
    return [...buyableModules(), ...Object.values(ITEMS).filter((d) => d.kind === "supply" && d.price > 0)]
      .map((d) => ({ id: d.id, name: d.name, kind: d.kind, stars: fusible(d.id) ? FUSE_MAX : 1, merchant: d.merchant ?? "ironmonger", price: d.price }));
  },
  /** 0.8.0 H1 tooling: hero select's state, the hero on show and the roster (PLAYABLE_HEROES); null on any other screen. */
  heroSelect(): { current: HeroId; order: readonly HeroId[] } | null {
    const s = game.screen;
    return s instanceof HeroScreen ? { current: s.current, order: HERO_ORDER } : null;
  },
  /** 0.8.0 H1 tooling: on hero select, show hero `id` (no slide-in); false elsewhere or for a hero not on offer. */
  showHero(id: HeroId): boolean {
    const s = game.screen;
    return s instanceof HeroScreen ? s.showHero(id) : false;
  },
  /** Current screen name (for harness assertions). */
  screen(): string {
    const s = game.screen;
    return s instanceof TitleScreen ? "title" : s instanceof HeroScreen ? "hero" : s instanceof BuildScreen ? "build"
      : s instanceof BattleScreen ? (s.kind === "warlord" ? "warlord" : "battle") : s instanceof SummaryScreen ? "summary"
      : s instanceof EventScreen ? "event" : s instanceof ForkScreen ? "fork" : s instanceof ReplayScreen ? "replay"
      : s instanceof DuskWaitScreen ? "duskwait" : "?";
  },
  /** 0.7.0a tooling (read only): the online session, or null when offline (no server URL). No key, no signature. */
  online() {
    const s = onlineSession();
    if (!s) return null;
    const run = game.run;
    const f = s.lastFetch;
    return {
      url: s.url, active: s.active, failed: s.failed, playerId: s.identity?.playerId ?? null, runs: s.runs(),
      fetches: s.fetches, uploads: s.uploads, lastUpload: s.lastUpload,
      lastFetch: f ? { source: f.source, id: f.id, error: f.error ?? null, hero: f.snapshot.hero, wins: f.snapshot.wins, lives: f.snapshot.lives } : null,
      seen: run?.seenGhosts ?? [], dusk: run?.dusk ? { day: run.dusk.day, kind: run.dusk.kind, name: run.dusk.name, source: run.dusk.source ?? null, ghostId: run.dusk.ghostId ?? null } : null,
      records: run ? run.history.filter((h) => h.record).length : 0,
    };
  },
  /** 0.7.0a tooling: end the current run as lost and show its summary (the round history with its stored dusk records,
   *  for the REPLAY check), without playing the remaining days. */
  endRun(): void {
    if (!game.run) return;
    game.run.over = game.run.over ?? "lost";
    game.go(new SummaryScreen(game));
  },
  /** shoptap tooling (read only; scripts/touchcheck.mjs): the build screen's details panel as drawn (title, sub line,
   *  button labels, body lines, kept text whole), or null (another screen, or no panel). */
  panel() {
    const s = game.screen;
    return s instanceof BuildScreen ? s.panelInfo() : null;
  },
  /** PACKS M2 (REQ-BFG-063) tooling (read only): the stored player name, and the name screen as drawn (null: not up). */
  playerName: () => currentName(),
  nameEntry() {
    return game.nameEntry ? game.nameEntry.info() : null;
  },
  /** Logical -> CSS pixel factor and the UI regions of the last frame. */
  regions(): { id: string; x: number; y: number; w: number; h: number }[] {
    const k = game.view.scale / game.view.dpr;
    const r = game.canvas.getBoundingClientRect();
    return game.ui.regions.map((q) => ({ id: q.id, x: r.left + q.r.x * k, y: r.top + q.r.y * k, w: q.r.w * k, h: q.r.h * k }));
  },
  /** Logical point -> CSS client point. */
  toClient(x: number, y: number): { x: number; y: number } {
    const k = game.view.scale / game.view.dpr;
    const r = game.canvas.getBoundingClientRect();
    return { x: r.left + x * k, y: r.top + y * k };
  },
};
