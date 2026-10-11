// SCOUT-1 (REQ-BFG-076): VIEW BATTLEFIELD after a fight, on BattleScreen itself (a stand-in Game in node: no canvas is
// drawn). SCOUT-1b (REQ-BFG-082): no scouting pause before it: the sail-in runs into the 3-2-1 count at WIDE and the first
// sim step comes when it did at scout-base; no "scout" phase for a dusk or a warlord; the camera WIDE and at rest through
// the sail-in and the count; a battle saved before its fight opens in the sail-in again; a warlord reloaded on its card
// never fights or pays again. Then VIEW BATTLEFIELD as SCOUT-1 left it: the summaries against the result card; BACK, the
// primary action and the warlord's pick; the faces; the camera's moves (and a move finishing while paused).

import { describe, expect, it } from "vitest";
import { viewWithSub } from "../src/game/viewGrid";
import { battleGrid, battleLayout, battleScale, laneLayout } from "../src/game/battleLayout";
import { sx, sy } from "../src/render/frame";
import { FACE_MIN_W, faceArea, summaryRects } from "../src/screens/battleScout";
import { BACK_WIDE_S, BattleScreen, VIEW_CLOSE_S } from "../src/screens/battle";
import { faceText, partAt, pickPart, readOnlyBlock, summaryRows } from "../src/screens/battleScout";
import { resultRows } from "../src/screens/battleHud";
import { setupRun, setupWarlord } from "../src/tooling";
import { npcDayRules, withNpcDay } from "../src/sim/npcDay"; // MERGE-099C: the warlord's pick is NPC_DAY off's
import { ON_TO_THE_ROAD } from "../src/screens/warlordHud"; // MERGE-099C: NPC_DAY on, the view offers the card's one way on
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
  const game = fakeGame(setupRun({ hero, day, seed }));
  return { game, s: new BattleScreen(game) };
}

/** SCOUT-1b: the frame (1-based, at DT) on which scout-base's intro says GO: its clock adds dt each frame until the
 *  sail-in (1.2 s) and the count (1.35 s) are over, as BattleScreen.update's does. */
function goFrame(): number {
  let pt = 0, n = 0;
  while (pt < 1.2 + 1.35) {
    pt += DT;
    n++;
  }
  return n;
}

/** SCOUT-1b: step a battle to its result card, returning each phase it showed (bb.screen(true)'s names), in order. */
function phases(s: BattleScreen): string[] {
  const seen: string[] = [s.phaseName()];
  for (let i = 0; i < 60 * 400 && s.phase !== "result"; i++) {
    s.update(DT);
    if (seen[seen.length - 1] !== s.phaseName()) seen.push(s.phaseName());
  }
  return seen;
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

describe("SCOUT-1b: the fight starts at once (no scouting pause)", () => {
  it("the sail-in runs into the 3-2-1 count by itself; the first sim step comes at INTRO + 1.35 s, as at scout-base", () => {
    const { s } = dusk();
    const go = goFrame();
    expect(go).toBe(154); // 2.55 s at 60 fps: the clock's float sum of 1/60 reaches 2.55 on frame 154
    for (let i = 1; i < go; i++) {
      s.update(DT);
      expect(s.phase).toBe("intro");
      expect(s.arena.b.ticks).toBe(0); // the sim takes no step in the sail-in or the count
      if (i !== 72) expect(s.phaseName()).toBe(i < 72 ? "intro" : "count"); // the sail-in is 1.2 s (72 frames)
    }
    s.update(DT); // GO
    expect(s.phase).toBe("fight");
    expect(s.arena.b.ticks).toBe(0); // the first step comes with the fight's first frame, as at scout-base
    s.update(DT);
    expect(s.arena.b.ticks).toBeGreaterThan(0);
  });

  it("no scout phase is ever entered, for the dusk or for a warlord: intro, count, fight, outro, result", () => {
    const { s } = dusk();
    expect(phases(s)).toEqual(["intro", "count", "fight", "outro", "result"]);
    expect(dusk(8, 21, "weaver").s.phaseName()).toBe("intro");
    expect(phases(dusk(8, 21, "weaver").s)).toEqual(["intro", "count", "fight", "outro", "result"]);
    const wr = setupWarlord("hard", { hero: "furnace", day: 4, seed: 9 });
    const w = new BattleScreen(fakeGame(wr), "warlord");
    expect(w.kind).toBe("warlord");
    expect(phases(w)).toEqual(["intro", "count", "fight", "outro", "result"]);
    expect(w.warlord!.result).toBeTruthy(); // fought and paid once
  });

  it("the camera is WIDE and at rest through the sail-in and the count, the carriers in their full motion", () => {
    const { s } = dusk();
    const cam = s.motion.camera!;
    const wide = cam.zoom;
    expect(cam.shot).toBe("wide");
    expect(wide).toBeLessThan(1); // a DPR-3 phone's WIDE (2/3)
    for (let i = 0; i < goFrame() + 30; i++) {
      s.update(DT);
      expect(cam.shot).toBe("wide");
      expect(cam.moving).toBe(false);
      expect(cam.zoom).toBe(wide);
      expect(s.motion.model.calmAt()).toBe(0); // no steady sailing before the fight
    }
    expect(s.phase).toBe("fight");
  });

  it("S skips from the sail-in or the count, as at scout-base", () => {
    for (const at of [20, 100]) {
      const { s } = dusk();
      run(s, at);
      expect(s.phaseName()).toBe(at < 72 ? "intro" : "count");
      s.key("S");
      expect(["outro", "result"]).toContain(s.phase);
      expect(s.arena.b.over).toBe(true);
      expect(s.motion.camera?.shot).toBe("wide");
    }
  });

  it("a battle saved before its fight began opens in the sail-in and runs into the count; a warlord reloaded on its card never fights or pays again", () => {
    const { game, s } = dusk();
    const foe = s.foeName;
    run(s, 100);
    expect(s.phaseName()).toBe("count");
    // the save holds tonight's foe (startDusk stored it): a reload builds the screen again on the same run
    const again = new BattleScreen(game);
    expect(again.foeName).toBe(foe);
    expect(again.phaseName()).toBe("intro");
    expect(again.arena.b.ticks).toBe(0);
    const go = goFrame();
    run(again, go - 1);
    expect(again.phaseName()).toBe("count");
    expect(again.arena.b.ticks).toBe(0);
    run(again, 1);
    expect(again.phase).toBe("fight");
    // the warlord's card: stored result, reloaded
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
    run(s, Math.ceil(VIEW_CLOSE_S / DT) + 1);
    expect(s.motion.camera?.moving).toBe(false);
    expect(s.motion.camera?.zoom).toBe(1);
    expect(s.motion.model.calmAt()).toBe(1); // steady sailing in the view: no bank, drift, surge or bob
    const p = s.viewPrimary();
    expect(p?.label).toBe(`ON TO DAWN · DAY ${game.run!.day}`);
    expect(s.closeView()).toBe(true);
    expect(s.phase).toBe("result");
    expect(s.motion.camera?.shot).toBe("wide");
    run(s, Math.ceil(BACK_WIDE_S / DT) + 1);
    expect(s.motion.camera?.moving).toBe(false);
    s.openView();
    run(s, 30);
    p!.onTap();
    expect(game.gone.length).toBe(1); // ON TO DAWN from the view: the dawn's build screen
  });

  it("ESC's menu holds the view, and a camera move begun there still comes to rest", () => {
    const { s } = dusk();
    run(s, 60 * 400, () => s.phase === "result");
    s.openView();
    run(s, 2);
    expect(s.motion.camera?.moving).toBe(true);
    s.key("Escape");
    expect(s.menu).toBe(true);
    run(s, 60);
    expect(s.motion.camera?.moving).toBe(false); // BattleScreen.update returns early in the menu: the move still ends
    expect(s.phase).toBe("view");
    s.key("P"); // no pause in the view
    expect(s.phase).toBe("view");
  });

  it("the warlord's pick is untouched: no primary in the view while it waits; BACK, pick, then the view offers REFIT", () => {
    // MERGE-099C: a Hard win's pick of 2 is NPC_DAY off's flow (0.9.8's, kept behind the switch), so it is checked off;
    // with NPC_DAY on, as c099 ships it (NPC-1, REQ-BFG-077), the win drops a part instead (no pick) and the card's one way
    // on is ON TO THE ROAD, which the view offers too (battle.ts viewPrimary)
    withNpcDay(() => {
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
    }, false);
    expect(npcDayRules()).toBe(true); // the shipped value
    const wr = setupWarlord("hard", { hero: "furnace", day: 4, seed: 9, outcome: 0 });
    const w = new BattleScreen(fakeGame(wr), "warlord");
    run(w, 30);
    expect(w.warlord!.result!.parts).toEqual([]); // no pick
    expect(w.openView()).toBe(true);
    expect(w.viewPrimary()?.label).toBe(ON_TO_THE_ROAD);
  });

  it("each part's face: the side's own build and hero, read only; a turret's fight line in the view", () => {
    const { s } = dusk(8, 21);
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
    run(s, 60 * 400, () => s.phase === "result");
    const n = s.arena.partShots[0].reduce((a, x) => a + (x ?? 0), 0);
    expect(n).toBe(s.arena.b.sides[0].stats.shots);
  });

  it("on every view the summaries and a face in the open floor lie over no board's tile at CLOSE", () => {
    const VIEWS: [number, number, number][] = [[390, 844, 3], [430, 932, 3], [844, 390, 3], [1920, 1080, 1], [1366, 768, 1], [1280, 720, 1]];
    for (const [w, h, dpr] of VIEWS) {
      const v = viewWithSub(w, h, dpr, (pw, ph, p) => battleScale(pw, ph, p), pickSub);
      const L = laneLayout(battleLayout(v.W, v.H, v.portrait));
      // each deck's tiles at rest (CLOSE, the calm: no drift): the deck frame's corners
      const decks = L.frames.map((f) => {
        const xs = [sx(f, 0, 0), sx(f, 120, 120)], ys = [sy(f, 0, 0), sy(f, 120, 120)];
        return { x: Math.min(...xs), y: Math.min(...ys), w: Math.abs(xs[1] - xs[0]), h: Math.abs(ys[1] - ys[0]) };
      });
      const over = (a: { x: number; y: number; w: number; h: number }) => decks.some((d) => a.x < d.x + d.w && d.x < a.x + a.w && a.y < d.y + d.h && d.y < a.y + a.h);
      const { r, stacked } = summaryRects(L);
      expect(over(r[0]) || over(r[1]), `summaries on ${w}x${h}`).toBe(false);
      expect(r.every((q) => q.x >= 0 && q.y >= 0 && q.x + q.w <= v.W && q.y + q.h <= v.H), `summaries on screen ${w}x${h}`).toBe(true);
      if (!v.portrait) expect(stacked).toBe(L.gapBox.w - 4 < 96);
      for (const side of [0, 1] as const) {
        const fa = faceArea(L, side);
        const inFloor = v.portrait || L.gapBox.w >= FACE_MIN_W;
        if (inFloor) expect(over(fa.area), `a face on ${w}x${h}`).toBe(false);
        else expect(fa.area.x >= L.hulls[1 - side].x && fa.area.x + fa.area.w <= L.hulls[1 - side].x + L.hulls[1 - side].w).toBe(true); // over the other carrier
      }
    }
  });

  it("a tap hits the part under it on either board through the camera: at CLOSE, at WIDE and mid-move", () => {
    const { s } = dusk(8, 21);
    run(s, 60 * 400, () => s.phase === "result");
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
    check(); // WIDE (the result card)
    expect(s.openView()).toBe(true);
    run(s, 10);
    s.motion.frame(s.arena);
    expect(s.motion.camera?.moving).toBe(true);
    check(); // mid-move
    run(s, 60);
    s.motion.frame(s.arena);
    expect(s.motion.camera?.shot).toBe("close");
    check(); // CLOSE
    s.closeView();
    run(s, 20);
    s.motion.frame(s.arena);
    check(); // on its way back to WIDE
  });
});
