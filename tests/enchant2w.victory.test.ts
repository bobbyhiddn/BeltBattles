// ENCHANT-2W (REQ-BFG-085, REQ-BFG-089; BRIEF-ENCHANT2W W4, E2-03's doubt): THE VICTORY CARD'S GOLD LINE SAYS WHAT IS INSIDE IT.
//   The warlord result card (warlordHud.ts drawWarlordResult) drew `+13 GOLD (BOUNTY +10)`. WarlordOutcome.gold is the win's gold PLUS the bounty (road.ts finishWarlord:
//   gold = reward.gold + bountyPaid), so the line was true, but five of six readers of the strict read's round 2 left open whether the bounty is inside the 13.
//   Now, with a bounty paid, the line names its parts: `+13 GOLD: 3 WIN, 10 BOUNTY` (3 is the Hard warlord's reward, 10 the staked bounty); with none, `+3 GOLD` as before.
//   This is base text: the line reads the same with ENCHANT off. A loss or a draw draws no gold line (REWARD FORFEIT), so there is no other gold line to keep true.
import { afterEach, describe, expect, it, vi } from "vitest";
import { G, fresh, installRaster, type RasterCanvas } from "./raster.helpers";

installRaster();

const rec = vi.hoisted(() => ({ text: [] as { s: string; x: number; y: number; font: string; color: string }[] }));
vi.mock("../src/render/font", async (importOriginal) => {
  const m = await importOriginal<typeof import("../src/render/font")>();
  const drawText: typeof m.drawText = (g, s, x, y, color, opts) => {
    rec.text.push({ s, x, y, font: opts?.font ?? "5", color });
    return m.drawText(g, s, x, y, color, opts);
  };
  return { ...m, drawText };
});

import { drawWarlordResult, goldLineParts, goldLineText } from "../src/screens/warlordHud";
import { finishWarlord, pickRoad, REWARD_GOLD, EASY_PAY_LATE, MATRIARCH_GOLD } from "../src/game/road";
import { setupFork } from "../src/tooling";
import { ENCHANT, setEnchant, withEnchant } from "../src/sim/enchant";
import { npcDayRules, withNpcDay } from "../src/sim/npcDay";
import { UI } from "../src/ui/ui";
import { C } from "../src/render/palette";
import { drawText, textWidth, type FontId } from "../src/render/font";
import type { Game } from "../src/game/game";
import type { Difficulty } from "../src/sim/rivals";
import type { Run } from "../src/game/run";

afterEach(() => setEnchant(ENCHANT));

/** glyph pixels of `s` in `colour` in `font` */
function glyphPx(s: string, colour: string, font: FontId, outline?: string): number {
  const c = fresh(textWidth(s, font) + 6, 12);
  drawText(G(c), s, 2, 2, colour, { font, ...(outline ? { outline } : {}) });
  return c.px.filter((p) => p === colour).length;
}

/** A Hard (or other tier) warlord win on `day`, with a pending bounty and/or sabotage when asked: the run, its stored fight finished (the game's own functions). */
function winRun(tier: Difficulty, o: { day?: number; seed?: number; bounty?: boolean; sabotage?: boolean } = {}): Run {
  const run = setupFork({ hero: "furnace", day: o.day ?? 4, seed: o.seed ?? 9, bounty: !!o.bounty, sabotage: !!o.sabotage });
  expect(pickRoad(run, tier).ok).toBe(true);
  finishWarlord(run, 0, 24.6);
  return run;
}

function drawCard(run: Run, W: number, H = 330): { c: RasterCanvas; card: { x: number; y: number; w: number; h: number }; calls: typeof rec.text } {
  const game = { W, H, ui: new UI(), run, portrait: W < H } as unknown as Game;
  const c = fresh(W, H), noop = (): void => undefined;
  game.ui.begin();
  rec.text.length = 0;
  const box = drawWarlordResult(G(c), game, run.warlord!, 1.4, { take: [noop, noop], refit: noop, fight: noop, road: noop });
  return { c, card: box, calls: [...rec.text] };
}

describe("W4: the gold line's words", () => {
  it("with a bounty paid the line names its parts, `+13 GOLD: 3 WIN, 10 BOUNTY`; with none it is `+3 GOLD` as before; the parts always add up to the total", () => {
    expect(goldLineText(13, 10)).toBe("+13 GOLD: 3 WIN, 10 BOUNTY");
    expect(goldLineText(3, 0)).toBe("+3 GOLD");
    expect(goldLineText(15, 10)).toBe("+15 GOLD: 5 WIN, 10 BOUNTY");
    for (const [gold, bounty] of [[13, 10], [15, 10], [4, 0], [3, 0], [104, 100]] as const) {
      const t = goldLineText(gold, bounty), m = /^\+(\d+) GOLD(?:: (\d+) WIN, (\d+) BOUNTY)?$/.exec(t)!;
      expect(m, t).not.toBeNull();
      expect(Number(m[1])).toBe(gold);
      if (bounty > 0) expect(Number(m[2]) + Number(m[3]), t).toBe(gold);
      else expect(m[2]).toBeUndefined();
    }
  });

  it("it is TRUE on the game's own numbers: the stored result's gold is the reward plus the bounty, and the line reads that split (Hard: 3 + 10; a bounty is paid on a Hard win only)", () => {
    const hard = winRun("hard", { bounty: true }), r = hard.warlord!.result!;
    expect(hard.warlord!.reward.gold).toBe(REWARD_GOLD.hard);
    expect(r.bountyPaid).toBe(10);
    expect(r.gold).toBe(hard.warlord!.reward.gold + r.bountyPaid);
    expect(goldLineText(r.gold, r.bountyPaid)).toBe("+13 GOLD: 3 WIN, 10 BOUNTY");
    // no bounty: the plain line, whatever the tier
    for (const tier of ["easy", "medium", "hard"] as const) {
      const run = winRun(tier), res = run.warlord!.result!;
      expect(res.bountyPaid, tier).toBe(0);
      expect(goldLineText(res.gold, res.bountyPaid), tier).toBe(`+${run.warlord!.reward.gold} GOLD`);
    }
    // a pending bounty is NOT paid on an Easy or Medium win (road.ts warlordFight takes it for the Hard warlord only)
    for (const tier of ["easy", "medium"] as const) {
      const run = winRun(tier, { bounty: true }), res = run.warlord!.result!;
      expect(res.bountyPaid, tier).toBe(0);
      expect(goldLineText(res.gold, res.bountyPaid), tier).toBe(`+${run.warlord!.reward.gold} GOLD`);
    }
    expect([REWARD_GOLD.easy, EASY_PAY_LATE, REWARD_GOLD.medium, REWARD_GOLD.hard, MATRIARCH_GOLD].every((n) => n >= 1 && n <= 9)).toBe(true); // one digit: the widest line is the one the fit table below measures
  });

  it("a loss draws no gold line at all (REWARD FORFEIT), so no gold line can be false there", () => {
    const run = setupFork({ hero: "furnace", day: 4, seed: 9, bounty: true });
    pickRoad(run, "hard");
    finishWarlord(run, 1, 24.6);
    const { calls } = drawCard(run, 201);
    expect(calls.some((t) => /GOLD/.test(t.s) && t.s.startsWith("+"))).toBe(false);
    expect(calls.some((t) => t.s.startsWith("REWARD FORFEIT"))).toBe(true);
  });
});

describe("W4: the gold line fits the card on every view, with the SABOTAGED tag on the same row, and is never cut", () => {
  /** the views the victory card is drawn on: the narrowest phone (W 190: card 180), the 402x690 phone at scale 2 (W 201: 191), a laptop and the 1280x800 desk (the card caps at 214) */
  const VIEWS: [string, number][] = [["narrowest phone", 190], ["phone 402x690", 201], ["320 wide", 320], ["desk 1280x800", 640]];
  const CASES: { name: string; tier: Difficulty; bounty: boolean; sabotage: boolean }[] = [
    { name: "no bounty", tier: "hard", bounty: false, sabotage: false },
    { name: "no bounty, sabotaged", tier: "hard", bounty: false, sabotage: true },
    { name: "a bounty", tier: "hard", bounty: true, sabotage: false },
    { name: "a bounty, sabotaged", tier: "hard", bounty: true, sabotage: true },
    { name: "medium win", tier: "medium", bounty: false, sabotage: false },
  ];

  it("every view x every case: the whole line is drawn (one 5x7 string, or the total in 5x7 and its parts in 3x5), inside the card, clear of SABOTAGED, in yellow", () => {
    const seen: string[] = [];
    for (const [view, W] of VIEWS) {
      for (const k of CASES) {
        const run = winRun(k.tier, { bounty: k.bounty, sabotage: k.sabotage }), res = run.warlord!.result!;
        const { c, card, calls } = drawCard(run, W);
        const tag = `${view} ${k.name}`, want = goldLineText(res.gold, res.bountyPaid);
        const gold = calls.filter((t) => t.s.startsWith("+") && t.s.includes("GOLD") || t.s.startsWith(": ") && t.s.includes("WIN"));
        // the whole line: the pieces joined are the line (the small part starts with its colon)
        const joined = gold.map((t) => t.s).join("");
        expect(joined, tag).toBe(want);
        expect(gold.every((t) => t.color === C.yellow), `${tag}: yellow`).toBe(true);
        expect(gold.length, tag).toBeLessThanOrEqual(2);
        // inside the card: its content runs from x + 10 to x + cw - 10
        const left = card.x + 10, right = card.x + card.w - 10;
        for (const t of gold) {
          expect(t.x, tag).toBeGreaterThanOrEqual(left);
          expect(t.x + textWidth(t.s, t.font as FontId), `${tag}: ends inside the card (${right})`).toBeLessThanOrEqual(right);
        }
        const tail = gold.at(-1)!, end = tail.x + textWidth(tail.s, tail.font as FontId);
        const sab = calls.find((t) => t.s === "SABOTAGED");
        expect(!!sab, `${tag}: SABOTAGED is drawn exactly when the fight was sabotaged`).toBe(k.sabotage);
        if (sab) {
          const sabLeft = right - textWidth("SABOTAGED", "3");
          expect(end + 6, `${tag}: the line ends 6 px clear of SABOTAGED (${end} of ${sabLeft})`).toBeLessThanOrEqual(sabLeft + 0);
        }
        // the pixels: every glyph of the line is on the canvas, in yellow (the 5x7 string's and the 3x5 string's glyph pixels), none missing
        const big = gold[0], small = gold[1];
        const wantPx = glyphPx(big.s, C.yellow, big.font as FontId, C.ink) + (small ? glyphPx(small.s, C.yellow, small.font as FontId) : 0);
        let yellow = 0;
        for (let yy = big.y - 1; yy < big.y + 8; yy++) for (let xx = left - 1; xx <= right + 1; xx++) if (c.at(xx, yy) === C.yellow) yellow++;
        expect(yellow, `${tag}: every glyph of the line is drawn`).toBe(wantPx);
        expect(c.oob, tag).toBe(0);
        seen.push(`${view}/${k.name}: ${gold.length === 1 ? `one 5x7 line (${textWidth(big.s, "5") + 1} px)` : `5x7 total + 3x5 parts (${textWidth(big.s, "5")} + ${textWidth(small.s, "3")} px)`}${sab ? `, room ${right - textWidth("SABOTAGED", "3") - 6 - left} px beside SABOTAGED` : ""}`);
      }
    }
    console.log(`ENCHANT-2W W4 gold line fit: ${seen.join("; ")}`);
  });

  it("a card with no bounty draws exactly the line it drew before: one 5x7 string `+3 GOLD` at the same place in yellow with the ink outline", () => {
    for (const [view, W] of VIEWS) for (const sabotage of [false, true]) {
      const run = winRun("hard", { sabotage }), { calls, card } = drawCard(run, W);
      const g = calls.filter((t) => t.s.startsWith("+") && t.s.includes("GOLD"));
      expect(g.map((t) => [t.s, t.font, t.x, t.color]), `${view} sabotaged ${sabotage}`).toEqual([["+3 GOLD", "5", card.x + 10, C.yellow]]);
    }
  });

  it("goldLineParts: the one-line form where it fits the room, else the total and its parts in the 3x5 face, never cut; the widest realistic amounts fit the narrowest room", () => {
    const sabW = textWidth("SABOTAGED", "3") + 6;
    for (const cw of [180, 191, 214]) {
      for (const sab of [false, true]) {
        const room = cw - 20 - (sab ? sabW : 0);
        for (const [gold, bounty] of [[13, 10], [15, 10], [3, 0], [4, 0], [9, 0]] as const) {
          const p = goldLineParts(gold, bounty, room);
          expect(p.big + p.small, `${cw} ${sab} ${gold}/${bounty}`).toBe(goldLineText(gold, bounty));
          const used = p.small ? textWidth(p.big, "5") + 1 + textWidth(p.small, "3") : textWidth(p.big, "5") + 1;
          expect(used, `${cw} ${sab} ${gold}/${bounty}: within the room ${room}`).toBeLessThanOrEqual(room);
          if (bounty === 0) expect(p).toEqual({ big: `+${gold} GOLD`, small: "" });
        }
      }
    }
    // the one-line form is chosen exactly when its 5x7 string (and the outline's pixel) fits
    for (let room = 60; room <= 220; room++) {
      const p = goldLineParts(13, 10, room), one = textWidth("+13 GOLD: 3 WIN, 10 BOUNTY", "5") + 1 <= room;
      expect(p.small === "", `room ${room}`).toBe(one);
    }
  });

  it("with NPC_DAY on the card also holds the drop card, and the gold line is the same (the card is one row taller)", () => {
    withNpcDay(() => {
      expect(npcDayRules()).toBe(true);
      const run = winRun("hard", { bounty: true });
      const { calls } = drawCard(run, 201, 345);
      expect(calls.filter((t) => (t.s.startsWith("+") && t.s.includes("GOLD")) || t.s.startsWith(": ")).map((t) => t.s).join("")).toBe("+13 GOLD: 3 WIN, 10 BOUNTY");
    });
  });

  it("with ENCHANT on and off the line is the same (base text)", () => {
    for (const on of [false, true]) withEnchant(() => {
      const run = winRun("hard", { bounty: true }), { calls } = drawCard(run, 201);
      expect(calls.filter((t) => (t.s.startsWith("+") && t.s.includes("GOLD")) || t.s.startsWith(": ")).map((t) => t.s).join(""), `ENCHANT ${on}`).toBe("+13 GOLD: 3 WIN, 10 BOUNTY");
    }, on);
  });
});
