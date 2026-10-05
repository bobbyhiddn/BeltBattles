import { describe, expect, it } from "vitest";
import { G, fresh, installRaster } from "./raster.helpers";
import { ITEMS, buyableModules } from "../src/sim/content";
import { effectAt } from "../src/sim/stars";
import { scaleCore } from "../src/sim/cores";
import { ICON, icons, stripIcons, textWidth } from "../src/render/font";
import { familiesOf } from "../src/ui/families";
import { captureFormats, fmtCount, fmtPct, fmtSec, fmtSpeed } from "../src/ui/statFormat";
import { hasFace } from "../src/ui/faces";
import { shopChip, shopChipGlyphs } from "../src/ui/chips";
import { CARD_CHIP_Y, CARD_MARK_X, cardPriceX, drawCard } from "../src/screens/build/shop";
import { CARD_H, CARD_W } from "../src/screens/build/layout";
import { C } from "../src/render/palette";
import { RATE_KEYS } from "../src/ui/chips"; // U2d F2
import { faceAt } from "../src/ui/faces"; // U2d F2
import { fmtDmg } from "../src/ui/statFormat"; // U2d F2
import { PLAYABLE_HEROES } from "../src/sim/heroBuilds"; // U2d F2
import { AMMO } from "../src/sim/content"; // U2e step 2
import { factorySpeed } from "../src/sim/content"; // NUM-4 (REQ-BFG-047): MIMIC FORGE's SPEED on a hero (was secPer: 30 / speed)
import { factoryStats, turretStats } from "../src/ui/faces"; // NUM-4: a cadence chip is the RATE stat pair

// U2c (REQ-BFG-046, REQ-BFG-047; R1 MEMO C4, U3): the shop card's stat chip (src/ui/chips.ts): one icon alone and one value
// from the face's own data (each number printed by a formatter), picked in the brief's order; a piece without a face keeps
// today's card. On the op view's narrow card (46 x 42) the chip takes the family marks' place and the price moves to the
// right corner: every buyable piece's ★1 card (a shop offers ★1 only) shows its chip whole.

installRaster();

const k = 1; // the FURNACE's class factor (the heroes' cores scale; tests pass the k they read)
const BUYABLE = buyableModules().map((d) => d.id);

describe("U2c the shop chip: the pick and its numbers", () => {
  // NUM-4 (REQ-BFG-047): retitled, the checks kept: DART GUN's chip is its RATE pair, {RATE}55 (its SPEED), and TESLA ARC's
  // STUN at k 0.55 is NUM-3's whole second, {STUN}1 (the title said DART GUN 0.55{SEC} and TESLA ARC {STUN}0.8)
  it("the brief's examples: HOT SWAP {BURN}2, TESLA ARC {STUN}1 (at k 0.55), DART GUN {RATE}55 (its SPEED), SCATTER CHOKE {DMG}40%", () => {
    const swap = effectAt("hotswap", 1).factory!.cycle!.find((p) => p.tint === "ember")!.burn!;
    // U2e step 2 (REQ-BFG-070): HOT SWAP's slugs carry their BURN, a stat of its second row ({BURN}2), so its chip is that
    // stat (was {BURN}+2, its rule's number)
    expect(shopChip("hotswap")).toBe(`{BURN}${fmtCount(swap)}`);
    // MIMIC FORGE stamps the hero's slugs: on FURNACE they carry the CINDER SLUG's HEAT (its second row), the chip
    expect(shopChip("mimic", { k, hero: "furnace" })).toBe(`{HEAT}${fmtDmg(AMMO.cinder.rideScale)}`);
    expect(shopChip("tesla", { k: 0.55 })).toBe(`{STUN}${fmtSec(scaleCore(ITEMS.tesla.core!, 0.55).stall!)}`);
    // NUM-4 (REQ-BFG-047): a gun's cadence chip is its RATE stat pair (turretStats' first pair), its SPEED through fmtSpeed,
    // unsigned ({RATE}55); was its interval, 30 / speed, with SEC after it (NUM-2: 0.55{SEC}; fireInterval before)
    expect(turretStats("dartgun", 1)[0]).toEqual(["RATE", fmtSpeed(effectAt("dartgun", 1).turret!.speed)]);
    expect(shopChip("dartgun")).toBe(`{RATE}${turretStats("dartgun", 1)[0][1]}`);
    expect(shopChip("dartgun")).toBe(`{RATE}${fmtSpeed(effectAt("dartgun", 1).turret!.speed)}`);
    expect(shopChip("scatter", { k })).toBe(`{DMG}${fmtPct(scaleCore(ITEMS.scatter.core!, k).share!)}`);
    // 3. the rule's first number with its icon; FASTER is the RATE icon (C1's fold)
    expect(shopChip("pressure", { k })).toMatch(/^\{DMG\}\+/);
    expect(shopChip("calibrate")).toMatch(/^\{RATE\}\+\d+%$/);
    // no face (RULES, STUN-fold), a supply, or a face whose numbers carry no icon: today's card
    // NUM-3 (R1's STUN fold): SCRAPPER has a face, so its chip is its first stat pair, its cadence (it was faceless here);
    // TOLLBOOTH, FLAK SCREEN and MANTLET have faces whose numbers carry no STUN count (a block count, a share, none): no chip
    for (const def of ["drake", "tollbooth", "flak", "mantlet", "hopper", "beltcrate", "plating", "sorting", "spotter", "brake", "overdrive", "grapnel"]) expect(shopChip(def, { k }), def).toBeNull();
    // NUM-4 (REQ-BFG-047): its cadence is its RATE pair (factoryStats' first pair), its SPEED, unsigned (was 30 / speed{SEC})
    expect(factoryStats("scrapper", 1)[0]).toEqual(["RATE", fmtSpeed(effectAt("scrapper", 1).factory!.speed)]);
    expect(shopChip("scrapper")).toBe(`{RATE}${fmtSpeed(effectAt("scrapper", 1).factory!.speed)}`);
    // the STUN-fold rounds carry their STUN, a stat of the second row: {STUN} and the round's seconds
    for (const def of ["sabot", "frostbite", "dragchain"]) expect(shopChip(def), def).toBe(`{STUN}${fmtSec((effectAt(def, 1).factory!.round as { seconds: number }).seconds)}`);
  });

  it("every chip's number is one its face printed through a formatter (the registry), for every buyable piece", () => {
    let n = 0;
    for (const def of BUYABLE) {
      const { value: chip, records } = captureFormats(() => shopChip(def, { k, hero: "furnace" }));
      if (!chip) continue;
      expect(hasFace(def), def).toBe(true);
      const num = /[+-]?\d+(?:\.\d+)?%?/.exec(chip)![0].replace(/^\+/, "");
      expect(records.map((r) => r.printed.replace(/^\+/, "")), `${def}: ${chip}`).toContain(num);
      expect((chip.match(/\{[A-Z]+\}/g) ?? []).length, `${def}: one icon alone`).toBe(1);
      n++;
    }
    expect(n).toBeGreaterThan(30);
  });
});

describe("U2d F2 (cap's answer to U2c question 3): the chip rule, a chip's icon is the mechanic its number measures", () => {
  it("GREASE WORKS (its belts' speed) and OVERCLOCKER (its rest) keep today's card, with no chip", () => {
    expect(faceAt("grease", 1)!.nums.map(([key]) => key)).toEqual(["speed"]); // its FASTER is a belt's speed: not RATE
    expect(shopChip("grease")).toBeNull();
    expect(faceAt("overclocker", 1)!.nums[0][1]).toMatch(/\{SEC\}$/); // RESTS n{SEC}: a waiting timer
    expect(shopChip("overclocker")).toBeNull();
  });

  // NUM-4 (REQ-BFG-047): retitled, its checks kept or replaced by their equivalents. A gun's or a factory's cadence is its RATE
  // stat pair now (faces.ts speedPair: its SPEED, an unsigned stat; chips.ts signs only a rule's FASTER), so a {RATE} chip is
  // either a RATE_KEYS FASTER (signed) or that cadence pair (unsigned), and no cadence is a {SEC} chip any more (was "a {SEC}
  // chip is only a cadence, never a waiting timer": the cadence was its interval, 30 / speed, with SEC after it)
  it("FASTER is {RATE} only for a gun firing or a factory working (RATE_KEYS); a cadence is its unsigned {RATE} stat pair, never {SEC}; a {SEC} chip is never a waiting timer", () => {
    expect(Object.keys(RATE_KEYS).sort()).toEqual(["rate", "spin", "stoke"]);
    const rate: string[] = [], cadence: string[] = [];
    // every context that changes a ★1 face: a core's class factor (faceText's k list), MIMIC FORGE's hero
    for (const def of BUYABLE) for (const [hero, kk] of PLAYABLE_HEROES.flatMap((h) => [1, 0.8, 0.75, 0.55, 0.4].map((x) => [h, x] as const))) {
      const o = { k: kk, hero }, chip = shopChip(def, o), f = faceAt(def, 1, o);
      if (!chip || !f) continue;
      if (chip.startsWith("{RATE}+")) {
        // a rule's FASTER (signed): the number's own key says it measures how often a gun fires or a factory works
        expect(chip, def).toMatch(/^\{RATE\}\+\d+%$/); // NUM-4: signed, a whole % (chips.ts signs a FASTER only)
        const at = f.nums.find(([, v]) => /FASTER/.test(v) && v.includes(chip.replace(/^\{RATE\}\+/, "")));
        expect(at && at[0] in RATE_KEYS, `${def}: ${chip}`).toBe(true);
        if (!rate.includes(def)) rate.push(def);
      } else if (chip.startsWith("{RATE}")) {
        // NUM-4 (REQ-BFG-047): an unsigned {RATE} chip is a gun's or a factory's cadence, never a rig's (a belt's speed) or a
        // rule's number: the face's first stat pair, equal to its turretStats / factoryStats RATE pair, its SPEED through
        // fmtSpeed (MIMIC FORGE's on the hero through factorySpeed). Was the {SEC} chip below: that pair as 30 / speed
        const kind = ITEMS[def].kind;
        expect(kind === "turret" || kind === "factory", `${def}: ${chip}`).toBe(true);
        const pair = kind === "turret" ? turretStats(def, 1)[0] : factoryStats(def, 1, hero)[0];
        const speed = kind === "turret" ? effectAt(def, 1).turret!.speed : factorySpeed(def, effectAt(def, 1).factory!, hero);
        expect([f.stats[0], pair, chip], `${def} (${hero})`).toEqual([["RATE", fmtSpeed(speed)], ["RATE", fmtSpeed(speed)], `{RATE}${fmtSpeed(speed)}`]);
        if (!cadence.includes(def)) cadence.push(def);
      }
      // a chip in seconds is a stat pair's (the first pair, SEC), never a rule's timer. NUM-4: kept; no stat pair is SEC now,
      // so a {SEC} chip can come from nothing but a rule's {SEC} number, a waiting timer (chips.ts isTimer), and fails here
      if (chip.endsWith("{SEC}")) expect([f.stats[0]?.[0], chip], def).toEqual(["SEC", `${f.stats[0]?.[1]}{SEC}`]);
      // NUM-4 (REQ-BFG-047): no cadence is a {SEC} chip any more: a gun's or a factory's speed pair is RATE (faces.ts speedPair)
      if (f.stats.length && (ITEMS[def].kind === "turret" || ITEMS[def].kind === "factory")) {
        expect(f.stats[0][0], def).toBe("RATE");
        expect(chip, def).not.toMatch(/\{SEC\}/);
      }
    }
    expect(rate.sort()).toEqual(["calibrate", "escapement", "gatling", "stoker"]);
    // NUM-4: every buyable gun's chip is its cadence (its face has no keyword to show first), and some factories' too
    expect(cadence).toEqual(expect.arrayContaining(BUYABLE.filter((d) => ITEMS[d].kind === "turret")));
    expect(cadence.filter((d) => ITEMS[d].kind === "factory")).toEqual(expect.arrayContaining(["press", "scrapper", "mimic"]));
    // the speed rigs' FASTER, TIMES and SPEED are their belts': SURGE's chip is its damage, the others keep today's card
    expect(shopChip("surge")).toBe(`{DMG}+${fmtDmg(effectAt("surge", 1).gate!.pulse!.flat)}`);
    for (const def of ["grease", "brake", "overdrive"]) expect(shopChip(def), def).toBeNull();
  });
});

describe("U2c the shop chip on the op view's card", () => {
  it("every buyable piece's ★1 card shows its chip whole: in the marks' place, clear of the name, the price and the edge", () => {
    const x = 0, y = 0, fits: string[] = [], marksToo: string[] = [];
    for (const def of BUYABLE) {
      const chip = shopChipGlyphs(def, { k, hero: "furnace" });
      if (!chip) continue;
      const cw = textWidth(chip, "3");
      for (const price of [ITEMS[def].price, Math.max(0, ITEMS[def].price - 2)]) { // the catalogue price, and a scout's discount
        const px = cardPriceX(x, CARD_W, price, false, true);
        expect(x + CARD_MARK_X + cw + 2, `${def} (${stripIcons(chip)}, ${cw} px) beside the price ${price}`).toBeLessThanOrEqual(px);
      }
      expect(y + CARD_CHIP_Y, def).toBeGreaterThanOrEqual(y + 18 + 6 + 5 + 1); // under a two-line name (y + 18 and y + 24, 3x5)
      expect(y + CARD_CHIP_Y + 5, def).toBeLessThanOrEqual(y + CARD_H - 3); // above the rarity edge
      fits.push(`${def} ${stripIcons(chip)}`);
      // would the marks fit too (marks, a gap, the chip, a gap, the price)?
      const tags = familiesOf(def).length, marksW = tags ? tags * 4 - 1 + 2 : 0;
      if (x + CARD_MARK_X + marksW + cw + 2 <= cardPriceX(x, CARD_W, ITEMS[def].price, false, true)) marksToo.push(def);
    }
    console.log(`U2c chips: ${fits.length} buyable pieces show a chip on the op card; the marks would fit beside it on ${marksToo.length} (so the chip replaces them, C4)`);
    expect(fits.length).toBeGreaterThan(30);
  });

  it("the card draws the chip in the marks' place and the price in the right corner; a piece without a chip draws today's card", () => {
    const draw = (def: string, chip?: string) => {
      const c = fresh(60, 50);
      drawCard(G(c), { x: 2, y: 2, w: CARD_W, h: CARD_H }, ITEMS[def], ITEMS[def].price, ITEMS[def].merchant!, {
        sold: false, affordable: true, selected: false, hover: false, pulse: false, hidden: false, shake: 0, ...(chip ? { chip } : {}),
      }, 0);
      return c;
    };
    const chip = shopChipGlyphs("hotswap")!;
    const withChip = draw("hotswap", chip), without = draw("hotswap");
    // the chip's white number in the marks' row ("+2" after the BURN icon); without a chip, the marks (coloured) and no white
    const cw = textWidth(chip, "3");
    const white = (c: ReturnType<typeof fresh>) => { let n = 0; for (let yy = 2 + CARD_CHIP_Y; yy < 2 + CARD_CHIP_Y + 5; yy++) for (let xx = 2 + CARD_MARK_X; xx < 2 + CARD_MARK_X + cw; xx++) if (c.at(xx, yy) === C.white) n++; return n; };
    expect(icons("{BURN}", "alone")).toBe(ICON.BURN);
    expect(chip.startsWith(ICON.BURN)).toBe(true);
    expect(white(withChip)).toBeGreaterThan(0);
    expect(white(without)).toBe(0);
  });
});
