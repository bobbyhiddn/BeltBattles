// SCOUT-1 (REQ-BFG-076): scouting before a fight and VIEW BATTLEFIELD after it, on BattleScreen itself (a stand-in Game in
// node: no canvas is drawn). The phase order; FIGHT gating the first sim step; the fight unchanged by scouting (scouted for
// 0 s or 30 s: the same events and the same result); the saved-battle rules; the summaries against the result card; BACK,
// the primary action and the warlord's pick; the camera's moves (and a move finishing while paused).

import { describe, expect, it } from "vitest";
import { viewWithSub } from "../src/game/viewGrid";
import { battleGrid, battleScale } from "../src/game/battleLayout";
import { BattleScreen, FIGHT_WIDE_S, SCOUT_CLOSE_S, setAutoFight } from "../src/screens/battle";
import { faceText, partAt, pickPart, readOnlyBlock, summaryRows } from "../src/screens/battleScout";
import { resultRows } from "../src/screens/battleHud";
import { setupRun, setupWarlord } from "../src/tooling";
import { turretSlots } from "../src/sim/deck";
import { ITEMS } from "../src/sim/content";
import type { SimEvent } from "../src/sim/battle";
import type { Game } from "../src/game/game";
import type { Run } from "../src/game/run";

const DT = 1 / 60;
const pickSub = (pw: number, ph: number, p: boolean, scale: number) => { const g = battleGrid(pw, ph, p); return g.close === scale ? g.sub : 1; };

/** A stand-in Game: the run, a silent audio, the view a 390x844 phone at DPR 3 gets, and go() recording the next screen. */
function fakeGame(run: Run, w = 390, h = 844, dpr = 3): Game & { gone: unknown[] } {
  const view = viewWithSub(w, h, dpr, (pw, ph, p) => battleScale(pw, ph, p), pickSub);
  const silent = new Proxy({}, { get: () => () => undefined });
  const g = { run, audio: silent, view, W: view.W, H: view.H, portrait: view.portrait, gone: [] as unknown[], t: 0 } as unknown as Game & { gone: unknown[] };
  (g as unknown as { go: (s: unknown) => void }).go = (s: unknown) => { g.gone.push(s); };
  return g;
}

function dusk(day = 6, seed = 7, hero: "furnace" | "weaver" = "furnace"): { game: Game & { gone: unknown[] }; s: BattleScreen } {
  setAutoFight(false);
  const game = fakeGame(setupRun({ hero, day, seed }));
  return { game, s: new BattleScreen(game) };
}

/** Step the screen n frames (or until `stop`), returning every sim event the fight drained (copied). */
function run(s: BattleScreen, n: number, stop?: () => boolean): SimEvent[] {
  const out: SimEvent[] = [];
  const real = s.arena.update.bind(s.arena);
  s.arena.update = (dt: number, drive = true) => { const ev = real(dt, drive); for (const e of ev) out.push({ ...e }); return ev; };
  for (let i = 0; i < n && !(stop && stop()); i++) s.update(DT);
  s.arena.update = real;
  return out;
}

describe("SCOUT-1: scouting before the fight", () => {
  it("the sail-in ends in scouting at CLOSE; FIGHT runs the 3-2-1 count at WIDE; the sim takes no step before the count ends", () => {
    const { s } = dusk();
    expect(s.phaseName()).toBe("intro");
    expect(s.motion.camera?.shot).toBe("wide");
    run(s, 71); // the sail-in (1.2 s) not yet over
    expect(s.phase).toBe("intro");
    run(s, 2);
    expect(s.phase).toBe("scout");
    expect(s.motion.camera?.shot).toBe("close");
    run(s, Math.ceil(SCOUT_CLOSE_S / DT) + 1);
    expect(s.motion.camera?.moving).toBe(false);
    expect(s.motion.camera?.zoom).toBe(1);
    expect(s.motion.model.calmAt()).toBe(1); // steady sailing: no bank, drift, surge or bob
    expect(s.motion.model.pose(0)).toMatchObject({ x: 0, y: 0, bank: 0, bob: 0 });
    // scouting waits as long as it takes: 30 s, no sim step, the clock at 0
    run(s, 30 * 60);
    expect(s.phase).toBe("scout");
    expect(s.arena.b.ticks).toBe(0);
    expect(s.fight()).toBe(true);
    expect(s.phaseName()).toBe("count");
    expect(s.motion.camera?.shot).toBe("wide");
    // the count (1.35 s): the camera at rest at WIDE before GO, and still no sim step
    run(s, Math.ceil(FIGHT_WIDE_S / DT) + 1);
    expect(s.motion.camera?.moving).toBe(false);
    expect(s.arena.b.ticks).toBe(0);
    run(s, 200, () => s.phase === "fight");
    expect(s.phase).toBe("fight");
    expect(s.arena.b.ticks).toBe(0); // GO: the first step comes with the fight's first frame
    run(s, 1);
    expect(s.arena.b.ticks).toBeGreaterThan(0);
    expect(s.fight()).toBe(false); // once
  });

  it("scouted for 0 s or for 30 s, the fight is the same: the same events, the same result", () => {
    const fightOf = (wait: number) => {
      const { s } = dusk(8, 21);
      run(s, 600, () => s.phase === "scout");
      run(s, wait);
      s.fight();
      run(s, 600, () => s.phase === "fight");
      const ev = run(s, 60 * 200, () => s.phase !== "fight");
      const b = s.arena.b;
      return { ev, winner: b.winner, ticks: b.ticks, hp: [b.sides[0].hull.hp, b.sides[1].hull.hp], stats: [b.sides[0].stats, b.sides[1].stats] };
    };
    const a = fightOf(0), b = fightOf(30 * 60);
    expect(a.ev.length).toBeGreaterThan(50);
    expect(b.ev).toEqual(a.ev);
    expect(b.winner).toBe(a.winner);
    expect(b.ticks).toBe(a.ticks);
    expect(b.hp).toEqual(a.hp);
    expect(b.stats).toEqual(a.stats);
  });

  it("S skips from scouting as from the intro; the auto mode (bb.fight(true)) runs the sail-in into the count at WIDE", () => {
    const { s } = dusk();
    run(s, 600, () => s.phase === "scout");
    s.key("S");
    expect(["outro", "result"]).toContain(s.phase);
    expect(s.arena.b.over).toBe(true);
    expect(s.motion.camera?.shot).toBe("wide");
    setAutoFight(true);
    const game = fakeGame(setupRun({ hero: "furnace", day: 6, seed: 7 }));
    const t = new BattleScreen(game);
    setAutoFight(false);
    const shots: string[] = [];
    run(t, 300, () => { shots.push(t.phaseName()); return t.phase === "fight"; });
    expect(shots).not.toContain("scout");
    expect(t.motion.camera?.shot).toBe("wide");
    expect(t.phase).toBe("fight");
  });

  it("Enter or Space is FIGHT in scouting; P pauses, and a camera move finishes while paused", () => {
    const { s } = dusk();
    run(s, 72, () => s.phase === "scout");
    run(s, 2);
    expect(s.motion.camera?.moving).toBe(true);
    s.key("P");
    expect(s.paused).toBe(true);
    run(s, 60);
    expect(s.motion.camera?.moving).toBe(false); // BattleScreen.update returns early while paused: the move still ends
    expect(s.phase).toBe("scout");
    s.key("P");
    s.key("Enter");
    expect(s.phaseName()).toBe("count");
    const t = dusk().s;
    run(t, 600, () => t.phase === "scout");
    t.key(" ");
    expect(t.phaseName()).toBe("count");
  });

  it("a battle saved before its fight began opens in scouting again; a warlord reloaded on its card never fights or pays again", () => {
    const { game, s } = dusk();
    const foe = s.foeName;
    run(s, 600, () => s.phase === "scout");
    // the save holds tonight's foe (startDusk stored it): a reload builds the screen again on the same run
    const again = new BattleScreen(game);
    expect(again.foeName).toBe(foe);
    expect(again.phase).toBe("intro");
    run(again, 600, () => again.phase === "scout");
    expect(again.phase).toBe("scout");
    expect(again.arena.b.ticks).toBe(0);
    // the warlord's card: stored result, reloaded
    setAutoFight(false);
    const wr = setupWarlord("hard", { hero: "furnace", day: 4, seed: 9, outcome: 0 });
    const wg = fakeGame(wr);
    const gold = wr.gold;
    const w = new BattleScreen(wg, "warlord");
    expect(w.phase).toBe("result");
    expect(w.canView()).toBe(true); // the end rebuilt display side (Arena.finish on the stored fight)
    run(w, 120);
    expect(wr.gold).toBe(gold);
    expect(w.phase).toBe("result");
  });
});

describe("SCOUT-1: VIEW BATTLEFIELD", () => {
  it("the summaries' numbers are the result card's where both show one; BACK returns to the card; the bar's primary is the card's", () => {
    const { game, s } = dusk();
    run(s, 600, () => s.phase === "scout");
    s.fight();
    run(s, 60 * 400, () => s.phase === "result");
    expect(s.phase).toBe("result");
    expect(s.canView()).toBe(true);
    const card = resultRows((s as unknown as { result: Parameters<typeof resultRows>[0] }).result);
    const row = (rows: [string, string, string][], lb: string) => rows.find((r) => r[0] === lb)!;
    for (const side of [0, 1] as const) {
      const sum = Object.fromEntries(summaryRows(s.arena, side));
      expect(sum["DAMAGE DEALT"]).toBe(row(card, "DAMAGE DEALT")[side + 1]);
      expect(sum.SHOTS).toBe(row(card, "SHOTS")[side + 1]);
    }
    expect(s.openView()).toBe(true);
    expect(s.phase).toBe("view");
    expect(s.motion.camera?.shot).toBe("close");
    run(s, 60);
    expect(s.motion.camera?.moving).toBe(false);
    const p = s.viewPrimary();
    expect(p?.label).toBe(`ON TO DAWN · DAY ${game.run!.day}`);
    expect(s.closeView()).toBe(true);
    expect(s.phase).toBe("result");
    expect(s.motion.camera?.shot).toBe("wide");
    s.openView();
    run(s, 30);
    p!.onTap();
    expect(game.gone.length).toBe(1); // ON TO DAWN from the view: the dawn's build screen
  });

  it("the warlord's pick is untouched: no primary in the view while it waits; BACK, pick, then the view offers REFIT", () => {
    const wr = setupWarlord("hard", { hero: "furnace", day: 4, seed: 9, outcome: 0 });
    const wg = fakeGame(wr);
    const w = new BattleScreen(wg, "warlord");
    run(w, 30);
    expect(w.openView()).toBe(true);
    expect(w.viewPrimary()).toBeNull();
    w.take(0); // the card's pick isn't reachable from the view
    expect(w.warlord!.result!.took).toBeFalsy();
    w.closeView();
    w.take(0);
    expect(w.warlord!.result!.took).toBeTruthy();
    w.openView();
    expect(w.viewPrimary()?.label).toBe("REFIT");
  });

  it("each part's face: the side's own build and hero, read only; a turret's fight line in the view", () => {
    const { s } = dusk(8, 21);
    run(s, 600, () => s.phase === "scout");
    for (const side of [0, 1] as const) {
      const b = s.arena.b.sides[side].build;
      const slots = turretSlots(b);
      const i = slots.findIndex((q) => q.td);
      const t = faceText(b, { kind: "turret", index: i })!;
      expect(t.title).toContain(ITEMS[slots[i].turret!.def].name);
      expect(t.labels).toEqual(["CLOSE"]);
      for (const bl of [...t.body, ...(t.variants ?? []).flatMap((v) => v.body)]) {
        expect(bl.role).not.toBe("hint");
        expect(bl.text).not.toMatch(/^STARTING TURRET:|UPGRADE|SELL/);
      }
      for (const p of b.items) expect(faceText(b, { kind: "item", uid: p.uid })?.labels).toEqual(["CLOSE"]);
    }
    expect(readOnlyBlock({ role: "ability", text: "SPEED: LEVEL 1/4. UPGRADE: »66." })?.text).toBe("SPEED: LEVEL 1/4.");
    s.fight();
    run(s, 60 * 400, () => s.phase === "result");
    const n = s.arena.partShots[0].reduce((a, x) => a + (x ?? 0), 0);
    expect(n).toBe(s.arena.b.sides[0].stats.shots);
  });

  it("a tap hits the part under it on either board through the camera: at CLOSE, at WIDE and mid-move", () => {
    const { s } = dusk(8, 21);
    run(s, 600, () => s.phase === "scout");
    const check = () => {
      for (const side of [0, 1] as const) {
        const b = s.arena.b.sides[side].build;
        for (const [i, q] of turretSlots(b).entries()) {
          if (!q.td) continue;
          const [x, y] = s.motion.localToScreen(s.arena, side, (q.col0 + q.width / 2) * 12, -9);
          expect(pickPart(s.arena, s.motion, x, y)).toEqual({ side, sel: { kind: "turret", index: i } });
        }
        for (const p of b.items) {
          const [x, y] = s.motion.localToScreen(s.arena, side, p.x * 12 + 6, p.y * 12 + 6);
          expect(pickPart(s.arena, s.motion, x, y)).toEqual({ side, sel: { kind: "item", uid: p.uid } });
        }
        expect(partAt(b, -40, 200)).toBeNull();
      }
    };
    s.motion.frame(s.arena);
    check(); // CLOSE (moving or at rest)
    run(s, 60);
    s.motion.frame(s.arena);
    check();
    s.fight();
    run(s, 20);
    s.motion.frame(s.arena);
    expect(s.motion.camera?.moving).toBe(true);
    check(); // mid-move
    run(s, 60);
    s.motion.frame(s.arena);
    check(); // WIDE
  });
});
