// Entry point: boots the game shell on #game and exposes a small hook for tooling
// (screenshots / smoke tests / metrics): window.bb.open("build", "furnace").

import { Game } from "./game/game";
import { newRun } from "./game/run";
import { gainModule } from "./game/fuse";
import { beginRoad, makeEvent } from "./game/events";
import type { EventId } from "./game/eventDefs";
import { HEROES, ITEMS, buyableModules, type HeroId } from "./sim/content";
import { heroStartBuild } from "./sim/heroBuilds"; // MIRROR-1 (REQ-BFG-093) tooling: the mirror test's silent deck
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
import { kx, ky } from "./sim/deck"; // PAIR-CUE (REQ-BFG-100) tooling: bb.pairs's intake tiles
import { TitleScreen } from "./screens/title";
import { HeroScreen, ORDER as HERO_ORDER } from "./screens/hero";
import { BuildScreen } from "./screens/build/build";
import { BattleScreen, DuskWaitScreen } from "./screens/battle";
import { partsOnScreen } from "./screens/battleScout"; // SCOUT-1 tooling: bb.parts
import { SummaryScreen } from "./screens/summary";
import { EventScreen } from "./screens/event/event";
import type { Arena } from "./game/arena";
import { onlineSession, resolveServerUrl, startOnline } from "./game/online";
import { ReplayScreen } from "./screens/replay";
import { CustomizeScreen } from "./screens/customize"; // CUSTOM-2a (REQ-BFG-072) tooling
import { chosenSkin, loadProfile, unseen } from "./game/profile"; // CUSTOM-2a (REQ-BFG-072) tooling (read only)
import { currentName } from "./game/ghostSnapshot"; // PACKS M2 (REQ-BFG-063) tooling
import { runeGrants } from "./sim/runes"; // RUNES-1 (REQ-BFG-058) tooling
import { setTipsForTests, tipsDone } from "./ui/tips"; // EXPLAIN-1 (REQ-BFG-089, E5) tooling: bb.tips
import { MOTION, MOTION_KNOBS, isSceneId } from "./render/motion"; // MOTION-1 (REQ-BFG-071) tooling
import { forceScene, forcedScene } from "./render/scenery"; // FIELD-1 (REQ-BFG-075) tooling: bb.scene
import { openReplay } from "./game/replays"; // MOTION-2 (REQ-BFG-071) tooling: a replay still
import { battleRecordFor } from "./net/replay";
import { battleSeed } from "./game/run";
import type { Boon } from "./sim/lastChance"; // LC-1 (REQ-BFG-073) tooling (shots)
import { pendingLastChance, pendingRune, takeLastChance, takeRune, type Run } from "./game/run"; // LC-1 tooling
import { finishDay, startDusk } from "./game/day"; // LC-1 tooling: the game's own day loop
import { C } from "./render/palette"; // WIND-1 (REQ-BFG-093) tooling: bb.windInfo's colour

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
    if (screen === "customize") return game.go(new CustomizeScreen(game)); // CUSTOM-2a (REQ-BFG-072)
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
  /** MIRROR-1 (REQ-BFG-093) tooling: a read-only dev hook that rides the release beside openShowcase and windInfo
   *  (WIND-2: scripts/mirror1shots.mjs opens it for the mirror check; no player path calls it). The operator's mirror
   *  test: both sides are `hero`'s starting deck with its belts cut (heroStartBuild with routes []: nothing loads,
   *  nothing fires; uids 1 and 101, as tests/mirror.wind.test.ts builds them), so only the dark wind moves a hull. Opened
   *  as a stored record replayed (openReplay(battleRecordFor(a, b, seed)) into a ReplayScreen, as bb.openReplay and the
   *  summary's REPLAY play one), BACK to the title; `day` only picks the replay's sea and banner. Changes no run state. */
  openMirror(hero: HeroId = "furnace", seed = 7, day = 1): boolean {
    clearPool();
    const silent = (uid: number): Build => ({ ...heroStartBuild(hero, uid), routes: [] });
    const r = openReplay(battleRecordFor(silent(1), silent(101), seed));
    if (!r.ok) return false;
    game.go(new ReplayScreen(game, new TitleScreen(game), r.battle, { day, foe: HEROES[hero].name }));
    return true;
  },
  /** COUNT-1 (REQ-BFG-100) tooling: a read-only dev hook beside openMirror (no player path calls it): the fight of two given
   *  builds `a` (yours) and `b` (the foe's) at `seed`, as a stored record replayed (openReplay(battleRecordFor(a, b, seed))
   *  into a ReplayScreen, as openMirror and the summary's REPLAY play one), so every still of the counters is reproducible
   *  from its two decks and its seed; BACK to the title. `day` picks the replay's banner, `foe` the foe plate's name.
   *  Changes no run state. False when the record is refused. */
  openFight(a: Build, b: Build, seed = 7, o: { day?: number; foe?: string } = {}): boolean {
    clearPool();
    const r = openReplay(battleRecordFor(a, b, seed));
    if (!r.ok) return false;
    game.go(new ReplayScreen(game, new TitleScreen(game), r.battle, { day: o.day ?? 8, foe: o.foe ?? HEROES[b.hero].name }));
    return true;
  },
  /** COUNT-1 (REQ-BFG-100) tooling (read only): the counters as drawn in the last frame of the current battle or replay:
   *  each status row (its box and chips), each gun's and belt's box (count, text, colour state), every counter group's tap
   *  target and the open panel (its heads and lines), boxes in CSS client px; C5's rule; null on another screen. With
   *  `mode`, C5's rule becomes it first (the stills' comparison: "all" or "readers"). */
  counters(mode?: "all" | "readers") {
    const s = game.screen;
    if (!(s instanceof BattleScreen) && !(s instanceof ReplayScreen)) return null;
    if (mode === "all" || mode === "readers") s.counters.mode = mode;
    const k = game.view.scale / game.view.dpr, c = game.canvas.getBoundingClientRect();
    const css = (q: { x: number; y: number; w: number; h: number } | null | undefined) => (q ? { x: c.left + q.x * k, y: c.top + q.y * k, w: q.w * k, h: q.h * k } : null);
    const d = s.counters.last;
    return {
      mode: s.counters.mode, open: s.counters.open, cached: s.counters.cached, skipped: d.skipped, k, W: game.W, H: game.H,
      tabs: d.tabs.map((t) => (t ? { side: t.side, below: t.below, chips: t.chips, r: css(t.r), art: { ...t.r } } : null)),
      guns: d.guns.map((q) => ({ side: q.side, slot: q.slot, n: q.n, text: q.text, state: q.state, r: css(q.r), art: { ...q.r } })),
      belts: d.belts.map((q) => ({ side: q.side, route: q.route, n: q.n, r: css(q.r), art: { ...q.r } })),
      targets: d.targets.map((q) => ({ id: q.id, r: css(q.r), art: { ...q.r } })),
      panel: d.panel ? { id: d.panel.id, heads: d.panel.heads, lines: d.panel.lines, r: css(d.panel.r) } : null,
      pops: s.arena.fx.popCount,
    };
  },
  /** PAIR-CUE (REQ-BFG-100, REQ-BFG-081) tooling (read only): the PAIR cue as of the last frame of the current battle or
   *  replay: whether it shows, the pairs showing (side, turret, both intakes' routes, how they were found, age), what the
   *  board drew (glows, flashed intakes, brackets), the PAIR pops alive (glyphs and marks), the pool's use (numbers +
   *  PAIR pops, of 48) and the watch's tally; each intake tile's centre in CSS client px; null on another screen. */
  pairs() {
    const s = game.screen;
    if (!(s instanceof BattleScreen) && !(s instanceof ReplayScreen)) return null;
    const cue = s.arena.cue;
    if (!cue) return null;
    const a = s.arena, fx = a.fx, k = game.view.scale / game.view.dpr, c = game.canvas.getBoundingClientRect();
    const tile = (side: 0 | 1, ri: number) => {
      const r = a.b.sides[side].routes[ri];
      if (!r || !r.cells.length) return null;
      const last = r.cells[r.cells.length - 1];
      const [x, y] = s.motion.tileCentre(a, side, kx(last), ky(last));
      return { x: c.left + x * k, y: c.top + y * k };
    };
    const pops = fx.pairList.slice(0, fx.pairCount);
    return {
      on: cue.on, k,
      shown: cue.shown.map((q) => ({ ...q, routes: [...q.routes], tiles: q.routes.map((ri) => tile(q.side, ri)) })),
      drawn: { glows: cue.drawn.glows.map((g) => g.map((q) => ({ ...q }))), flashes: cue.drawn.flashes.map((g) => g.map((q) => ({ ...q }))), brackets: [...cue.drawn.brackets] },
      glyphs: pops.filter((p) => !p.mark).length, marks: pops.filter((p) => p.mark).length,
      pool: { numbers: fx.popCount, pairs: fx.pairCount, of: 48 },
      tally: { ...cue.tally },
    };
  },
  openDusk(o: RunSpec = {}, ghosts: GhostSpec[] = []): void {
    clearPool();
    addGhosts(ghosts);
    game.run = setupRun(o);
    game.go(new BattleScreen(game));
  },
  /** MOTION-2 (REQ-BFG-071) tooling (stills): the set-up run's dusk against its stand-in, as a stored record replayed
   *  (openReplay: a fresh Battle under this build's rules, as the summary's REPLAY plays one), BACK to the title. Changes
   *  no run state but the set-up run itself. */
  openReplay(o: RunSpec = {}): boolean {
    clearPool();
    const run = (game.run = setupRun(o));
    const foe = standInFoe(run.seed, run.day);
    const r = openReplay(battleRecordFor(run.build, foe.build, battleSeed(run)));
    if (!r.ok) return false;
    game.go(new ReplayScreen(game, new TitleScreen(game), r.battle, { day: run.day, foe: foe.name }));
    return true;
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
  /** CUSTOM-2a (REQ-BFG-072) tooling (read only): the stored profile (seeded if absent), what the player wears, the
   *  unlocks not yet seen, and CUSTOMIZE's state and layout when it is up. */
  profile() {
    const p = loadProfile();
    const s = game.screen;
    return { profile: p, wears: chosenSkin(p), unseen: unseen(p), customize: s instanceof CustomizeScreen ? s.info() : null };
  },
  /** SCOUT-1 (REQ-BFG-076) tooling. SCOUT-1b (REQ-BFG-082): no fight waits for FIGHT any more (the sail-in runs into the
   *  count by itself), so this does nothing and returns false; it stays so the scripts that call bb.fight(true) run as
   *  they are. */
  fight(auto?: boolean): boolean {
    void auto;
    return false;
  },
  /** SCOUT-1 tooling: open (true) or close (false: BACK) VIEW BATTLEFIELD on the current battle's result card. Returns
   *  whether it changed. */
  viewBattlefield(open = true): boolean {
    const s = game.screen;
    if (!(s instanceof BattleScreen)) return false;
    return open ? s.openView() : s.closeView();
  },
  /** SCOUT-1 tooling (read only): VIEW BATTLEFIELD as drawn: the phase, the camera, the open face (its side, part, title,
   *  sub line, body lines and rects), BACK's and the primary action's tap targets and the summaries, in CSS client px; null
   *  off a battle. SCOUT-1b (REQ-BFG-083): `speed`, the bar's speed (an index into 0.5X 1X 2X 4X), the arena's and the
   *  sim's ticks; `card`, the result card's box as drawn (REQ-BFG-082). */
  scout() {
    const s = game.screen;
    if (!(s instanceof BattleScreen)) return null;
    const k = game.view.scale / game.view.dpr, c = game.canvas.getBoundingClientRect();
    const css = (q: { x: number; y: number; w: number; h: number } | null | undefined) => (q ? { x: c.left + q.x * k, y: c.top + q.y * k, w: q.w * k, h: q.h * k } : null);
    const f = s.faces.last, r = s.scoutRects;
    return {
      phase: s.phaseName(), canView: s.canView(), camera: s.motion.camera ? { shot: s.motion.camera.shot, zoom: s.motion.camera.zoom, moving: s.motion.camera.moving } : null,
      calm: s.motion.model.calmAt(),
      face: f ? { side: f.side, sel: f.sel, title: f.title, sub: f.sub, line: f.line, lines: f.lines, r: css(f.r), close: css(f.close) } : null,
      back: css(r.back), primary: css(r.primary), summaries: r.summaries.map(css), card: css(r.card),
      viewPrimary: s.viewPrimary()?.label ?? null, speed: s.speed, arenaSpeed: s.arena.speed, ticks: s.arena.b.ticks,
    };
  },
  /** SCOUT-1 tooling (read only): every part on board `side` of the current battle (each installed turret, item and belt)
   *  with a point inside it where it is drawn now, in CSS client px (what a tap must hit to open its face); [] off a
   *  battle. */
  parts(side: 0 | 1): { kind: string; id: number; name: string; x: number; y: number }[] {
    const s = game.screen;
    if (!(s instanceof BattleScreen)) return [];
    const k = game.view.scale / game.view.dpr, c = game.canvas.getBoundingClientRect();
    return partsOnScreen(s.arena, s.motion, side).map((p) => ({
      kind: p.sel.kind, id: p.sel.kind === "item" ? p.sel.uid : p.sel.index, name: p.name, x: c.left + p.x * k, y: c.top + p.y * k,
    }));
  },
  /** SCOUT-1c tooling (read only; REQ-BFG-082): the build screen's scouted foe (build/foeView.ts): whether the NEXT BATTLE
   *  card opens one (`scouted`), whether its view is open, the card's and BACK's tap targets, the open face (title, sub
   *  line, body lines, its rect and CLOSE's target) and every part of the foe's carrier with a point inside it, all in CSS
   *  client px; null off the build screen. */
  foeView() {
    const s = game.screen;
    if (!(s instanceof BuildScreen)) return null;
    const k = game.view.scale / game.view.dpr, c = game.canvas.getBoundingClientRect();
    const css = (q: { x: number; y: number; w: number; h: number } | null | undefined) => (q ? { x: c.left + q.x * k, y: c.top + q.y * k, w: q.w * k, h: q.h * k } : null);
    const v = s.foeView.info(s), f = v.face;
    return {
      scouted: v.scouted, open: v.open, card: css(v.card), back: css(v.back),
      face: f ? { sel: f.sel, title: f.title, sub: f.sub, lines: f.lines, r: css(f.r), close: css(f.close) } : null,
      parts: v.parts.map((p) => ({ kind: p.sel.kind, id: p.sel.kind === "item" ? p.sel.uid : p.sel.index, name: p.name, x: c.left + p.x * k, y: c.top + p.y * k })),
    };
  },
  /** WIND-1 (REQ-BFG-093) tooling (read only; scripts/wind1shots.mjs): the dark wind on the current battle or replay: its
   *  colour (palette.ts C.windHit), each hull bar's wind flash (s left), the callout's clock and its box, the wind numbers
   *  drawn in the last frame (side, text, box; `beside`: by its plate, its carrier out of view) and each plate as drawn (its
   *  box and its hull text), boxes in CSS client px; null on another screen. */
  windInfo() {
    const s = game.screen;
    if (!(s instanceof BattleScreen) && !(s instanceof ReplayScreen)) return null;
    const k = game.view.scale / game.view.dpr, c = game.canvas.getBoundingClientRect();
    const css = (q: { x: number; y: number; w: number; h: number } | null | undefined) => (q ? { x: c.left + q.x * k, y: c.top + q.y * k, w: q.w * k, h: q.h * k } : null);
    const a = s.arena;
    return {
      colour: C.windHit, flash: [a.sfx[0].windFlash, a.sfx[1].windFlash], callT: a.windCallT, call: css(s.windCallR),
      numbers: s.motion.windDrawn.map((n) => ({ side: n.side, text: n.text, beside: n.beside, r: css(n) })),
      plates: s.plateRows.map((p) => (p ? { ...p, r: css(p.r), bar: css(p.bar), hullBox: css(p.hullBox) } : null)),
    };
  },
  /** Current screen name (for harness assertions). SCOUT-1 (REQ-BFG-076): `phase` true, on a battle its phase instead
   *  ("intro", "count", "fight", "outro", "result", "view"; SCOUT-1b: no "scout"); without it the names as before, so every
   *  flow that waits for "battle" or "warlord" still does. */
  screen(phase = false): string {
    const s = game.screen;
    if (phase && s instanceof BattleScreen) return s.phaseName();
    return s instanceof TitleScreen ? "title" : s instanceof HeroScreen ? "hero" : s instanceof BuildScreen ? "build"
      : s instanceof BattleScreen ? (s.kind === "warlord" ? "warlord" : "battle") : s instanceof SummaryScreen ? "summary"
      : s instanceof EventScreen ? "event" : s instanceof ForkScreen ? "fork" : s instanceof ReplayScreen ? "replay"
      : s instanceof DuskWaitScreen ? "duskwait" : s instanceof CustomizeScreen ? "customize" : "?";
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
  /** EXPLAIN-1 (REQ-BFG-089, E5) tooling (stills, checks): the first-run tips: "new" (every tip shows), "done" (none shows;
   *  stored, so a reload keeps it) or "reload" (read the store again); returns the done tips. Absent: the done tips.
   *  CARD-2 (REQ-BFG-004, K1): "new" and "done" cover the first-sight notes too; "sight": every tip done, every note new. */
  tips: (mode?: "new" | "done" | "reload" | "sight") => (mode ? setTipsForTests(mode) : tipsDone()),
  /** PACKS M2 (REQ-BFG-063) tooling (read only): the stored player name, and the name screen as drawn (null: not up). */
  playerName: () => currentName(),
  nameEntry() {
    return game.nameEntry ? game.nameEntry.info() : null;
  },
  /** MOTION-1 (REQ-BFG-071) tooling (read only): the knobs (MOTION-2: a test build's only), the options and, in a battle in
   *  motion, its display clock, sea, poses, gap, the last board tap, the per-layer ms split (?perf=1) and the shots in
   *  flight. MOTION-2: on the title and in a replay, its sea, clock and poses too. */
  motion() {
    const s = game.screen;
    const m = s instanceof BattleScreen ? s.motion : null;
    const base = {
      knobs: MOTION_KNOBS, opts: { ...MOTION }, on: !!m, phase: s instanceof BattleScreen ? s.phase : null,
    };
    if (s instanceof BuildScreen && s.perf) return { ...base, perf: s.perf.mean(), perfTotals: s.perf.totals() };
    const om = s instanceof TitleScreen || s instanceof ReplayScreen ? s.motion : null;
    // FIELD-1: the setting (`sea`, its id), its medium and the camera (shot, zoom, grid; null at the title's framing)
    const cam = (x: { camera: { shot: string; zoom: number; moving: boolean; grid: object } | null }) => (x.camera ? { shot: x.camera.shot, zoom: x.camera.zoom, moving: x.camera.moving, grid: { ...x.camera.grid } } : null);
    if (om) return { ...base, on: true, t: om.model.t, sea: om.kind, medium: om.medium, camera: cam(om), reduced: om.model.reduced, poses: [om.model.pose(0), om.model.pose(1)], drawnBank: [...om.bankDrawn], perf: om.perf ? om.perf.mean() : null, perfTotals: om.perf ? om.perf.totals() : null };
    if (!m || !(s instanceof BattleScreen)) return base;
    return {
      ...base, t: m.model.t, sea: m.kind, medium: m.medium, camera: cam(m), reduced: m.model.reduced, spec: m.model.spec, gap: m.model.gapAt(),
      poses: [m.model.pose(0), m.model.pose(1)], drawnBank: [...m.bankDrawn], lastTap: m.lastTap, taps: m.taps,
      perf: m.perf ? m.perf.mean() : null, perfTotals: m.perf ? m.perf.totals() : null, seaBuilds: m.sea.builds,
      shots: s.arena.b.projectiles.length, over: s.arena.b.over, shake: [s.arena.fx.shakeX, s.arena.fx.shakeY],
    };
  },
  /** FIELD-1 (REQ-BFG-075) tooling (shots and videos; nothing in play calls it): every battle and replay from now on
   *  shows setting `id` (scenery.ts: calm, storm, ember, forest, desert, badlands, sky, clouds); null, back to each
   *  battle's own pick. Returns the setting forced (null: none, or an unknown id). */
  scene(id: string | null): string | null {
    forceScene(isSceneId(id) ? id : null);
    return forcedScene();
  },
  /** FIELD-1 tooling (stills; SCOUT-1's API in a script's hands): ease the current battle's or replay's camera to `shot`
   *  ("close": today's framing; "wide") over `secs` (0: cut). Returns the camera's state, or null on another screen. */
  camera(shot?: "close" | "wide", secs = 0): { shot: string; zoom: number; moving: boolean; grid: unknown } | null {
    const s = game.screen;
    const m = s instanceof BattleScreen || s instanceof ReplayScreen ? s.motion : null;
    const c = m?.camera;
    if (!c) return null;
    if (shot === "close" || shot === "wide") c.easeTo(shot, secs);
    return { shot: c.shot, zoom: c.zoom, moving: c.moving, grid: { ...c.grid } };
  },
  /** MOTION-1 tooling: board `side`'s tile (cx, cy) centre where it is drawn now, in CSS client px (null: no motion). */
  motionTile(side: 0 | 1, cx: number, cy: number): { x: number; y: number } | null {
    const s = game.screen;
    const m = s instanceof BattleScreen ? s.motion : null;
    if (!m || !(s instanceof BattleScreen)) return null;
    const [x, y] = m.tileCentre(s.arena, side, cx, cy);
    const k = game.view.scale / game.view.dpr;
    const r = game.canvas.getBoundingClientRect();
    return { x: r.left + x * k, y: r.top + y * k };
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
