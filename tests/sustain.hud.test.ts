// SUS-B (REQ-BFG-069; SUSTAIN-1 4.4's last bullet): the battle HUD for SHIELD, HEAL and REGEN, from SUS-A's state and
// events, display only. A plate whose side can hold SHIELD shows SHIELD_CAP pips before its bar (lit up to SideState.shield;
// a `shield` event of -1 flashes its pip out and throws rune sparks); a side with MENDING LOOMs shows a REGEN badge "+n"
// (TurretState.regen, its working looms, none in the dark wind); every `heal` event floats a green "+n" through fmtDmg, from
// every source (RIVETER at its rig, MEND PRESS at its factory, REGEN at the hull); fast mode skips the floats. The deck is
// the acceptance bench's heavy2r (tools/sustainBench.ts transform: WARD BELL ★3, MENDING LOOM ★3, MEND PRESS ★3, RIVETER ★3
// and WARD STONE) against a par deck without any.
import { describe, expect, it } from "vitest";
import { G, fresh, installRaster } from "./raster.helpers";
import { Arena } from "../src/game/arena";
import { HEAL_COLOUR, SHIELD_BREAK_TIME } from "../src/game/arenaReact";
import { SHIELD_PIPS_W, drawPlate, drawShieldPips, regenMax, regenNow, showsShield } from "../src/screens/battleHud";
import { plateRow } from "../src/screens/battleHud"; // WIND-1 (REQ-BFG-093): the plate's row (the hull number, then the badge)
import type { Game } from "../src/game/game";
import { RUNES } from "../src/sim/runes";
import { drawText, textWidth } from "../src/render/font";
import type { SimEvent } from "../src/sim/battle";
import { simulate } from "../src/sim/battle";
import { SHIELD_CAP, WIND_START, withSustain } from "../src/sim/content";
import { parField } from "../src/sim/harness/par";
import { hashSeed } from "../src/core/rng";
import { ICON, ICON_COLOUR, glyphRows } from "../src/render/font";
import { C } from "../src/render/palette";
import { fmtDmg } from "../src/ui/statFormat";
import { transform } from "../tools/sustainBench";

installRaster();

const DAY = 3;
/** The heavy2r deck on side 0 against BASTION's par deck without sustain (side 1), on a fixed seed. */
function fight(): { a: Arena; events: SimEvent[]; pops: { text: string; colour: string }[] } {
  const heavy = transform("heavy2r", DAY, parField("weaver", DAY, 1)[0], hashSeed("susb-hud", DAY)).b;
  const foe = parField("furnace", DAY, 1)[0];
  const a = new Arena(heavy, foe, 11, null);
  a.quiet = true;
  const events: SimEvent[] = [], pops: { text: string; colour: string }[] = [];
  const drain = a.b.drainEvents.bind(a.b);
  a.b.drainEvents = () => { const ev = drain(); events.push(...ev); return ev; };
  const popup = a.fx.popup.bind(a.fx);
  a.fx.popup = (x, y, text, colour, big) => { pops.push({ text, colour }); popup(x, y, text, colour, big); };
  return { a, events, pops };
}

describe("SUS-B the HUD: SHIELD pips, the REGEN badge, HEAL floats", () => {
  it("every heal event floats a green +n through fmtDmg, from every source (RIVETER, MEND PRESS, REGEN); none in fast mode", () => {
    withSustain(() => {
      const { a, events, pops } = fight();
      for (let f = 0; f < 60 * 30 && !a.b.over; f++) a.update(1 / 60);
      const heals = events.filter((e): e is Extract<SimEvent, { type: "heal" }> => e.type === "heal");
      const green = pops.filter((p) => p.colour === HEAL_COLOUR);
      expect(heals.length).toBeGreaterThan(0);
      expect(green.map((p) => p.text)).toEqual(heals.map((e) => `+${fmtDmg(e.amount)}`));
      expect(new Set(heals.map((e) => e.source))).toEqual(new Set(["riveter", "mendpress", "regen"]));
      expect(HEAL_COLOUR).toBe(C.green);
      for (const p of green) expect(p.text, "a whole N1 number, no toFixed(1) tail").not.toMatch(/\.0$/);
      // fast mode (4x): the same battle heals, and no float shows
      const fast = fight();
      fast.a.speed = 4;
      for (let f = 0; f < 60 * 30 && !fast.a.b.over; f++) fast.a.update(1 / 60);
      expect(fast.events.some((e) => e.type === "heal")).toBe(true);
      expect(fast.pops.filter((p) => p.colour === HEAL_COLOUR)).toEqual([]);
    });
  });

  it("a SHIELD broken by a hit (a shield event of -1) starts the break cue on its pip; the cue plays out", () => {
    withSustain(() => {
      const { a, events } = fight();
      let cued = false;
      for (let f = 0; f < 60 * 30 && !a.b.over && !cued; f++) {
        const before = events.length;
        a.update(1 / 60);
        const broke = events.slice(before).filter((e): e is Extract<SimEvent, { type: "shield" }> => e.type === "shield" && e.amount < 0);
        if (broke.length) {
          let last = broke[broke.length - 1];
          expect(a.sfx[last.side].shieldAt).toBe(last.shield);
          expect(a.sfx[last.side].shieldBreak).toBeGreaterThan(SHIELD_BREAK_TIME - 0.05);
          cued = true;
          // FLIP-X2 (REQ-BFG-058, REQ-BFG-069): on release X's decks (the bots' runes on both par decks) the foe's second hit
          // lands 0.73 s after the first (frames 683 and 727 here), inside the 60 frames, and breaks a second SHIELD: that
          // break restarts the cue on its pip (checked as the first), and the cue plays out 60 frames after the last break
          // (was 60 frames after the first, with no break between)
          for (let k = 0; k < 60; k++) {
            const at = events.length;
            a.update(1 / 60);
            const again = events.slice(at).filter((e): e is Extract<SimEvent, { type: "shield" }> => e.type === "shield" && e.amount < 0 && e.side === last.side);
            if (again.length) {
              last = again[again.length - 1];
              expect(a.sfx[last.side].shieldAt).toBe(last.shield);
              expect(a.sfx[last.side].shieldBreak).toBeGreaterThan(SHIELD_BREAK_TIME - 0.05);
              k = -1; // 60 more frames from this break
            }
          }
          expect(a.sfx[last.side].shieldBreak).toBe(0);
        }
      }
      expect(cued, "WARD STONE's 3 SHIELD meet the foe's first hits").toBe(true);
    });
  });

  it("which plates show them: the sustain side's pips and badge (its working looms, none in the dark wind); the foe's plate none", () => {
    withSustain(() => {
      const { a } = fight();
      expect([showsShield(a, 0), showsShield(a, 1)]).toEqual([true, false]);
      expect(a.b.sides[0].shield).toBe(SHIELD_CAP); // WARD STONE's 3 at t = 0
      const loom = a.b.sides[0].turrets.filter((t) => t.regen).reduce((n, t) => n + t.regen!, 0);
      expect(loom).toBeGreaterThan(0);
      expect([regenMax(a, 0), regenMax(a, 1), regenNow(a, 0), regenNow(a, 1)]).toEqual([loom, 0, loom, 0]);
      // a STUN or freeze on the loom's turret pauses it: the badge counts only working looms
      const tu = a.b.sides[0].turrets.find((t) => t.regen)!;
      tu.frozen = 1;
      expect(regenNow(a, 0)).toBe(loom - tu.regen!);
      tu.frozen = 0;
      // nothing heals in the dark wind: no badge from WIND_START
      while (a.b.t < WIND_START && !a.b.over) a.b.step();
      if (!a.b.over) expect(regenNow(a, 0)).toBe(0);
    });
  });

  it("the pips: SHIELD_CAP 3x5 SHIELD glyphs at a 4 px pitch, lit in SHIELD's colour up to the count, dim after, the broken one white", () => {
    expect(SHIELD_PIPS_W).toBe(SHIELD_CAP * 4 - 1);
    const rows = glyphRows(ICON.SHIELD, "3")!;
    const [lx, ly] = [rows.findIndex((r) => r.includes("#")) >= 0 ? rows[rows.findIndex((r) => r.includes("#"))].indexOf("#") : 0, rows.findIndex((r) => r.includes("#"))];
    const cv = fresh(16, 8);
    drawShieldPips(G(cv), 0, 0, 1, 1, 0); // 1 SHIELD left, the second just broke (t = 0: the flash's white phase)
    expect([cv.at(lx, ly), cv.at(4 + lx, ly), cv.at(8 + lx, ly)]).toEqual([ICON_COLOUR[ICON.SHIELD], C.white, C.slate2]);
    const cv2 = fresh(16, 8);
    drawShieldPips(G(cv2), 0, 0, 3, -1, 0);
    expect([cv2.at(lx, ly), cv2.at(4 + lx, ly), cv2.at(8 + lx, ly)]).toEqual(Array(3).fill(ICON_COLOUR[ICON.SHIELD]));
  });

  // FLIP-X1 (F-b, REVIEW-SUSD F-b, SUS-D finding 6): the badge read only the MENDING LOOMs, so a GREEN THREAD side regenerated
  // with no badge. It shows the side's whole REGEN now, looms plus rune, as Battle.sustainTick sums them.
  it("FLIP-X1 F-b: a side with GREEN THREAD and no loom shows the REGEN badge with the rune's amount", () => {
    withSustain(() => {
      const own = { ...parField("weaver", DAY, 1)[0], runes: [{ id: "green_thread" }] };
      const a = new Arena(own, parField("furnace", DAY, 1)[0], 11, null);
      a.quiet = true;
      const n = RUNES.green_thread.amount.n;
      expect(a.b.sides[0].turrets.some((t) => t.regen)).toBe(false); // no MENDING LOOM
      expect(a.b.sides[0].rune?.regen).toBe(n);
      expect([regenMax(a, 0), regenNow(a, 0), regenMax(a, 1), regenNow(a, 1)]).toEqual([n, n, 0, 0]);
      // the plate draws "+10" in REGEN's colour, right-aligned 3 px before the HP (drawPlate), and nothing else in it
      const r = { x: 0, y: 0, w: 160, h: 11 }, hp = "1000", badge = `+${fmtDmg(n)}`, col = ICON_COLOUR[ICON.REGEN];
      const cv = fresh(r.w, r.h), ref = fresh(r.w, r.h);
      drawPlate(G(cv), { t: 0 } as unknown as Game, a, r, 0, "YOU", hp);
      const ty = r.y + Math.floor((r.h - 5) / 2);
      // WIND-1 (REQ-BFG-093): the plate prints the hull itself, in the 5x7 face (plateRow: "current/max" where it fits), and
      // the badge sits right-aligned 3 px before it, as before it sat before the 3x5 HP text
      const s0 = a.b.sides[0];
      const row = plateRow({ x: r.x, y: r.y, w: r.w, h: r.h, lead: textWidth("YOU", "3"), hp: s0.hull.hp, max: s0.hull.max, shield: null, regenRoom: textWidth(badge, "3") + 3, plate: null });
      expect(row.regenX).toBe(row.hullX - 3);
      void hp;
      drawText(G(ref), badge, row.regenX!, ty, col, { font: "3", align: "right" });
      const lit = (c: typeof cv) => c.px.flatMap((p, i) => (p === col ? [i] : []));
      expect(lit(ref).length).toBeGreaterThan(0);
      expect(lit(cv)).toEqual(lit(ref));
      // a STUN pauses no rune (sustainTick skips only a stunned loom): with every turret stunned the badge still reads n;
      // none in the dark wind
      for (const tu of a.b.sides[0].turrets) tu.disrupted = 1;
      expect(regenNow(a, 0)).toBe(n);
      for (const tu of a.b.sides[0].turrets) tu.disrupted = 0;
      while (a.b.t < WIND_START && !a.b.over) a.b.step();
      if (!a.b.over) expect(regenNow(a, 0)).toBe(0);
    });
  });

  it("the HUD is display only: the heavy deck's battle through the Arena ends exactly as simulate() does", () => {
    withSustain(() => {
      const heavy = transform("heavy2r", DAY, parField("weaver", DAY, 1)[0], hashSeed("susb-hud", DAY)).b;
      const foe = parField("furnace", DAY, 1)[0];
      const ref = simulate(heavy, foe, 11);
      const a = new Arena(heavy, foe, 11, null);
      a.quiet = true;
      for (let f = 0; f < 60 * 400 && !a.b.over; f++) a.update(1 / 60);
      expect([a.b.over, a.b.ticks, a.b.winner, a.b.sides[0].hull.hp, a.b.sides[1].hull.hp]).toEqual([true, ref.ticks, ref.winner, ref.sides[0].hull.hp, ref.sides[1].hull.hp]);
    });
  });
});
