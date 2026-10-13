// CARD-5 (REQ-BFG-111, REQ-BFG-081, REQ-BFG-089, REQ-BFG-087, REQ-BFG-004): the phone shop card's new words (G), HOW TO
// PLAY's kinds and keyword lines (H), every first-sight note in turn (K), the day's numbers (L).
import { describe, expect, it } from "vitest";
import { ITEMS, buyableModules, classFactor } from "../src/sim/content";
import { effectAt } from "../src/sim/stars";
import { doubles, overclocked } from "../src/sim/overclock";
import { MAX_DAY } from "../src/net/snapshot";
import { C } from "../src/render/palette";
import { glyphRows, icons, textWidth } from "../src/render/font";
import { faceAt, type Face } from "../src/ui/faces";
import { PHONE_GISTS, phoneGist } from "../src/ui/chips";
import { CARD_CHIP_Y, CARD_GIST_Y, CARD_MARK_X, cardPriceX, drawCard } from "../src/screens/build/shop";
import { CARD_H, CARD_W } from "../src/screens/build/layout";
import { installRaster, fresh, G as gOf } from "./raster.helpers";

installRaster();

// --------------------------------------------------------------------------- G: the phone shop card's gists
/** GISTS-CARD5.md's 57 rows with REVIEW-CARD5PREP section 4's two changes (LIMPET WORKS takes its B; DRAKE NOZZLE keeps
 *  today's), as built: id -> [row A, row B] in markup at ★1 on day 5 (READ-5's scene; a core at k 1). */
const ROWS: Readonly<Record<string, readonly [string, string]>> = {
  // group 1: the factories (15, all new)
  frostbite: ["MAKES {STUN}{SLUG}", "{STUN}2{SEC}"], shottower: ["MAKES 3{SLUG}", "{RATE}20"], press: ["MAKES {SLUG}", "{RATE}21"],
  doublestamp: ["MAKES 2{SLUG}", "{RATE}14"], slagpot: ["HEAVY {SLUG}", "{RATE}11"], assembly: ["RIGS START", "SOONER"],
  armorpress: ["EVERY 3{SEC}", "{PLATE}+84"], mendpress: ["EVERY 3{SEC}", "{HEAL}56"], hotswap: ["MAKES {BURN}/{STUN}", "{BURN}2 {STUN}2"],
  sabot: ["KILLS RIGS", "{STUN}4"], scrapper: ["MAKES +{DMG}{SLUG}", "+{SLUG}PER{STUN}"], dragchain: ["MAKES {STUN}{SLUG}", "{STUN}1{SEC}"],
  limpet: ["BOMB {SLUG}", "3{SEC}FUSE"], gantry: ["4 BELTS", "{RATE}25"], twinmould: ["2 BELTS", "{SLUG}EACH"],
  // group 2: the conditional rigs (17: 16 new, TOLLBOOTH changed below)
  venom: ["EXTENDS {BURN}", "+3{SEC}"], bellows: ["RIDE TIME", "{BURN}+1"], quench: ["SPENDS {BURN}", "{DMG}+80"],
  staticbrush: ["HULL HITS:", "{STUN}A GUN"], pincer: ["PER RIG", "{DMG}+40"], lodestone: ["PER {STUN}", "{DMG}+20"],
  riveter: ["PER SLUG", "{HEAL}16"], plateroller: ["PER SLUG", "{PLATE}+42"], shieldwall: ["PER SLUG", "{PLATE}+28"],
  keg: ["EVERY 12{SEC}", "{DMG}+120"], counterweight: ["PER {BELT} RODE", "{DMG}+6"], stoker: ["AT FACTORY", "{RATE}+20%"],
  platebreaker: ["YOUR {PLATE}→{DMG}", "{DMG}+80"], longhaul: ["PRIOR RIGS", "{DMG}+20"], surge: ["EVERY 3{SEC}", "{DMG}+20"],
  overclocker: ["EVERY 4{SEC}:", "RIG x2"], twingauge: ["BELT=BELT", "{DMG}+60"],
  // group 3: the keyword cards (7)
  tollbooth: ["ITS BELT", "2{STUN}FAIL"], barbed: ["WEARS HULL", "{FRAY}+1"], twinlatch: ["WAITS 1{SEC}", "{PAIR}PAIR"],
  seamwelder: ["{*PAIR}", "{PLATE}+28"], twintrigger: ["PAIRED {SLUG}", "{DMG}+30%"], wardbell: ["EVERY 4{SEC}", "{SHIELD}WARD"],
  flak: ["SHOOT DOWN", "{STUN}-25%"],
  // group 5: the inner-column turrets (3, new)
  dartgun: ["ONE INTAKE", "{RATE}55"], spikegun: ["ONE INTAKE", "{RATE}50"], hailgun: ["ONE INTAKE", "{RATE}67"],
  // group 4: the cores and gear (15)
  drake: ["RIG DAMAGE", "TO{BURN}"], tesla: ["SHOTS ARC", "{STUN}1"], capacitor: ["EMPTY TIME", "{DMG}+40/{SEC}"],
  lance: ["WHOLE LINE", "{DMG}20%"], scatter: ["3 PELLETS", "{DMG}40%"], rotary: ["PART-FULL", "SOONER"],
  pressure: ["PER {SLUG} HELD", "{DMG}+24"], salvo: ["FIRES ALL", "{DMG}+40"], grapnel: ["FOE BELTS", "{SLUG}RIP"],
  mendingloom: ["YOUR HULL", "{HEAL}28/{SEC}"], chamber: ["FIRES 2{SLUG}", "A SHOT"], spotter: ["AIMS AGAIN", "AIM+1"],
  hopper: ["GUN HOLDS", "{SLUG}+1"], spallcatcher: ["HURT→SHOT", "{DMG}+20"], ram: ["LAST LOAD", "{DMG}+40%"],
};
/** The 37 pieces with a new entry (every factory, 19 rigs, the 3 inner-column turrets), the 15 changed, the 5 kept. */
const NEW = ["frostbite", "shottower", "press", "doublestamp", "slagpot", "assembly", "armorpress", "mendpress", "hotswap", "sabot",
  "scrapper", "dragchain", "limpet", "gantry", "twinmould", "venom", "bellows", "quench", "staticbrush", "pincer", "lodestone",
  "riveter", "plateroller", "shieldwall", "keg", "counterweight", "stoker", "platebreaker", "longhaul", "surge", "overclocker",
  "twingauge", "barbed", "twinlatch", "dartgun", "spikegun", "hailgun"];
const CHANGED = ["tollbooth", "twintrigger", "wardbell", "flak", "tesla", "capacitor", "lance", "scatter", "pressure", "salvo",
  "mendingloom", "chamber", "hopper", "spallcatcher", "ram"];
const KEPT = ["seamwelder", "rotary", "grapnel", "spotter", "drake"];

/** GISTS-CARD5's face-numbers column: where each number in a row comes from on the face (a keyed rule number, a stat of
 *  the stat row or of its second row), in reading order; x2, OVERCLOCKER's doubling (pinned below). A row of the 57 not
 *  named here holds no digit. */
type Src = readonly ["num" | "stat" | "stat2", string] | readonly ["x2"];
const SRC: Readonly<Record<string, { a?: readonly Src[]; b?: readonly Src[] }>> = {
  frostbite: { b: [["stat2", "STUN"]] }, shottower: { a: [["stat2", "SLUG"]], b: [["stat", "RATE"]] }, press: { b: [["stat", "RATE"]] },
  doublestamp: { a: [["stat2", "SLUG"]], b: [["stat", "RATE"]] }, slagpot: { b: [["stat", "RATE"]] },
  armorpress: { a: [["num", "every"]], b: [["num", "plate"]] }, mendpress: { a: [["num", "every"]], b: [["num", "heal"]] },
  hotswap: { b: [["stat2", "BURN"], ["stat2", "STUN"]] }, sabot: { b: [["stat2", "STUN"]] }, dragchain: { b: [["stat2", "STUN"]] },
  limpet: { b: [["num", "delay"]] }, gantry: { a: [["stat", "BELT"]], b: [["stat", "RATE"]] }, twinmould: { a: [["stat2", "SLUG"]] },
  venom: { b: [["num", "plus"]] }, bellows: { b: [["num", "burn"]] }, quench: { b: [["num", "per"]] }, pincer: { b: [["num", "each"]] },
  lodestone: { b: [["num", "each"]] }, riveter: { b: [["num", "heal"]] }, plateroller: { b: [["num", "plate"]] },
  shieldwall: { b: [["num", "plate"]] }, keg: { a: [["num", "every"]], b: [["num", "flat"]] }, counterweight: { b: [["num", "each"]] },
  stoker: { b: [["num", "stoke"]] }, platebreaker: { b: [["num", "flat"]] }, longhaul: { b: [["num", "per"]] },
  surge: { a: [["num", "every"]], b: [["num", "flat"]] }, overclocker: { a: [["num", "every"]], b: [["x2"]] },
  twingauge: { b: [["num", "matched"]] }, tollbooth: { b: [["num", "toll"]] }, barbed: { b: [["num", "fray"]] },
  twinlatch: { a: [["num", "hold"]] }, seamwelder: { b: [["num", "plate"]] }, twintrigger: { b: [["num", "bonus"]] },
  wardbell: { a: [["num", "every"]] }, flak: { b: [["num", "intercept"]] }, dartgun: { b: [["stat", "RATE"]] },
  spikegun: { b: [["stat", "RATE"]] }, hailgun: { b: [["stat", "RATE"]] }, tesla: { b: [["num", "stun"]] }, capacitor: { b: [["num", "per"]] },
  lance: { b: [["num", "share"]] }, scatter: { a: [["num", "pellets"]], b: [["num", "share"]] }, pressure: { b: [["num", "per"]] },
  salvo: { b: [["num", "flat"]] }, mendingloom: { b: [["num", "regen"]] }, chamber: { a: [["num", "shot"]] },
  spotter: { b: [["num", "rerolls"]] }, hopper: { b: [["num", "window"]] }, spallcatcher: { b: [["num", "add"]] }, ram: { b: [["num", "more"]] },
};
const NUM = /[+-]?\d+(?:\.\d+)?%?/;
const digits = (s: string): string[] => s.match(/\d+(?:\.\d+)?/g) ?? [];
/** A source's number on face `f`, as the face prints it ("" where the face has none). */
function srcNum(f: Face, s: Src): string {
  if (s[0] === "x2") return "2";
  if (s[0] === "num") return NUM.exec(f.nums.find(([k]) => k === s[1])?.[1] ?? "")?.[0] ?? "";
  const row = s[0] === "stat" ? f.stats : f.stats2 ?? [];
  return String(row.find(([ic]) => ic === s[1])?.[1] ?? "");
}
/** Every class factor a core's card can read (inspector.ts heroK: the first installed turret's), one per turret speed. */
const KS = [...new Set(buyableModules().concat(Object.values(ITEMS)).filter((d) => d.kind === "turret" && d.turret).map((d) => classFactor(d.turret!)))];
const DAYS = Array.from({ length: MAX_DAY }, (_, i) => i + 1);
const optsFor = (id: string, day: number, k = 1) => (ITEMS[id].kind === "core" ? { k, day } : { day });
/** The chip's room left of the coin (card3.test.ts's): 26 px at a one-digit price, 20 at two. */
const roomOf = (price: number): number => cardPriceX(0, CARD_W, price, false, true) - CARD_MARK_X - 1;

describe("CARD-5 (G): the phone shop card's gists (REQ-BFG-111)", () => {
  it("every GISTS-CARD5 row is built, keyed by piece id: 37 new entries, 15 changed, 5 kept (day 5, ★1)", () => {
    expect([NEW.length, CHANGED.length, KEPT.length, Object.keys(ROWS).length]).toEqual([37, 15, 5, 57]);
    expect(new Set([...NEW, ...CHANGED, ...KEPT]).size).toBe(57);
    for (const id of [...NEW, ...CHANGED, ...KEPT]) {
      expect(ITEMS[id], id).toBeDefined();
      expect(Object.prototype.hasOwnProperty.call(PHONE_GISTS, id), id).toBe(true);
      expect(phoneGist(id, optsFor(id, 5)), `${id} (${ITEMS[id].name})`).toEqual(ROWS[id]);
    }
    expect(Object.keys(PHONE_GISTS).length).toBe(33 + NEW.length); // card5-base's 33 entries and the 37 new ones
    // every factory READ-5 read has one now; MIMIC FORGE (no cadence of its own: its hero's) is not on the work list
    expect(buyableModules().filter((m) => m.kind === "factory" && !phoneGist(m.id)).map((m) => m.id)).toEqual(["mimic"]);
  });

  it("every entry fits at every star (★1-3), every day of a run (1-10) and every core's class factor: row A at most 10 capitals in 39 px, row B in its room; every glyph in the 3x5 face", () => {
    const bad: string[] = [];
    let n = 0;
    for (const id of Object.keys(PHONE_GISTS)) {
      const d = ITEMS[id], room = roomOf(d.price);
      for (const s of [1, 2, 3]) for (const day of DAYS) for (const k of d.kind === "core" ? KS : [1]) {
        const g = phoneGist(id, optsFor(id, day, k), s);
        if (!g) { bad.push(`${id} ★${s} d${day}: no gist`); continue; }
        n++;
        const a = icons(g[0]), b = icons(g[1], "alone"), aw = textWidth(a, "3"), bw = textWidth(b, "3");
        const caps = (a.match(/[A-Z]/g) ?? []).length;
        if (aw > CARD_W - 2 * CARD_MARK_X - 1 || caps > 10) bad.push(`${id} ★${s} d${day} k${k}: row A ${g[0]} ${aw} px, ${caps} capitals`);
        if (bw > room) bad.push(`${id} ★${s} d${day} k${k}: row B ${g[1]} ${bw} px of ${room}`);
        for (const ch of a + b) if (ch !== " " && !glyphRows(ch, "3")) bad.push(`${id}: no 3x5 glyph for ${JSON.stringify(ch)}`);
      }
    }
    expect(bad).toEqual([]);
    expect(n).toBeGreaterThan(71 * 30);
  });

  it("every digit in a row is its face's number (GISTS-CARD5's face-numbers column), so it follows the star and the day", () => {
    const scaled: string[] = [];
    for (const id of Object.keys(ROWS)) {
      const src = SRC[id] ?? {};
      const seen = new Map<string, string>(); // a source's number -> the row's digits, across stars and days
      for (const s of [1, 2, 3]) for (const day of DAYS) {
        const o = optsFor(id, day), f = faceAt(id, s, o)!, g = phoneGist(id, o, s)!;
        for (const [row, list] of [[g[0], src.a ?? []], [g[1], src.b ?? []]] as const) {
          const want = list.map((x) => srcNum(f, x));
          for (const w of want) expect(w, `${id} ★${s} d${day}: a face number for ${row}`).not.toBe("");
          expect(digits(row), `${id} ★${s} d${day}: ${row}`).toEqual(want.flatMap(digits));
          for (const [i, x] of list.entries()) seen.set(`${x.join(":")}=${want[i]}`, row);
        }
      }
      // where a source's number differs between two stars or days, the drawn rows differ too
      const bySrc = new Map<string, Set<string>>();
      for (const [k, row] of seen) {
        const key = k.split("=")[0];
        (bySrc.get(key) ?? bySrc.set(key, new Set()).get(key)!).add(`${k.split("=")[1]}>${row}`);
      }
      for (const [key, vals] of bySrc) {
        const nums = new Set([...vals].map((v) => v.split(">")[0])), rows = new Set([...vals].map((v) => v.split(">")[1]));
        expect(rows.size, `${id} ${key}`).toBeGreaterThanOrEqual(nums.size);
        if (nums.size > 1) scaled.push(`${id} ${key}: ${[...nums].join(", ")}`);
      }
    }
    // the day grows the sustain and damage numbers (ARMOR PRESS's SHIELD: +30 on day 1, +84 on day 5), the star the rest
    expect(phoneGist("armorpress", { day: 1 })).toEqual(["EVERY 3{SEC}", "{PLATE}+30"]);
    expect(phoneGist("keg", { day: 1 }, 3)![0]).not.toBe(phoneGist("keg", { day: 1 }, 1)![0]);
    expect(scaled.length).toBeGreaterThan(20);
    console.log(`CARD5 (G) numbers that scale with the star or the day, ${scaled.length}:\n${scaled.join("\n")}`);
  });

  // overclock.ts overclocked(): every amount doubles (each its own literal * 2; no named constant to import); a copy rule
  // (SPLITTER's split, SORTING ARM's sort) makes one extra copy, its own rule (REPORT section 6: for SORTING ARM ★3, one
  // becomes 4 rather than 5, as loose as the face's own HITS TWICE)
  it("OVERCLOCKER's RIG x2 is overclocked()'s doubling: every amount of every rig's effect that the rule changes, at every star, exactly x2", () => {
    let rigs = 0, fields = 0;
    const leaves = (o: unknown, p = ""): [string, number][] =>
      o && typeof o === "object" ? Object.entries(o).flatMap(([k, v]) => leaves(v, `${p}.${k}`)) : typeof o === "number" ? [[p, o]] : [];
    for (const d of buyableModules().filter((m) => m.kind === "gate")) for (const s of [1, 2, 3]) {
      const e = effectAt(d.id, s).gate;
      if (!e || !doubles(e)) continue;
      rigs++;
      const before = new Map(leaves(e)), after = leaves(overclocked(e));
      for (const [k, v] of after) {
        const was = before.get(k);
        if (was === undefined || was === v) continue;
        fields++;
        if (k.endsWith(".copies")) expect(v, `${d.id} ★${s} ${k} (a copy rule: one extra copy)`).toBe(was + 1);
        else expect(v, `${d.id} ★${s} ${k}`).toBe(was * 2);
      }
    }
    expect(rigs).toBeGreaterThan(20);
    expect(fields).toBeGreaterThan(rigs - 1);
    expect(phoneGist("overclocker", { day: 1 }, 3)![1]).toBe("RIG x2");
  });

  it("every gist card keeps its 46x42 size: row A and row B drawn inside it, no art, nothing outside (day 5)", () => {
    expect([CARD_W, CARD_H]).toEqual([46, 42]);
    const st = { sold: false, affordable: true, selected: false, hover: false, pulse: false, hidden: false, shake: 0 };
    for (const id of Object.keys(PHONE_GISTS)) {
      const d = ITEMS[id], gst = phoneGist(id, optsFor(id, 5))!;
      const c = fresh(60, 60), r = { x: 5, y: 5, w: CARD_W, h: CARD_H };
      drawCard(gOf(c), r, d, d.price, d.merchant ?? "ironmonger", { ...st, gist: gst }, 0);
      let outside = 0, rowA = 0, rowB = 0;
      for (let y = 0; y < 60; y++) for (let x = 0; x < 60; x++) {
        const px = c.at(x, y);
        if (px === null) continue;
        if (x < r.x || x >= r.x + r.w || y < r.y || y >= r.y + r.h) outside++;
        if (y >= r.y + CARD_GIST_Y && y < r.y + CARD_GIST_Y + 5 && x > r.x + 2 && x < r.x + r.w - 3 && px !== C.slate0) rowA++;
        if (y >= r.y + CARD_CHIP_Y && y < r.y + CARD_CHIP_Y + 5 && x > r.x + 2 && x < cardPriceX(r.x, r.w, d.price, false, true) && px !== C.slate0) rowB++;
      }
      expect([outside, rowA > 0, rowB > 0], id).toEqual([0, true, true]);
    }
  });
});

// --------------------------------------------------------------------------- H: HOW TO PLAY
import { ICON, wrap } from "../src/render/font";
import { REMINDER } from "../src/ui/faces";
import { JOIN_OVER_LIMIT, JOIN_PACE_PCT } from "../src/sim/deck";
import { computeView, defaultScale } from "../src/core/io";
import { HELP, HELP_HEARTS_2, HELP_KEYWORDS, helpLine3, helpLines } from "../src/screens/title";
import { helpCard, titleScale } from "../src/screens/titleLayout";

/** card5-base's card as the title drew it (helpLines: FREE_JOINS and HEARTS on, as shipped): before. */
const HELP_BEFORE = [HELP[0], HELP_HEARTS_2,
  "3  AT DAWN, BUY RIGS FROM THE CARAVAN. DRAG OUT OF YOUR FACTORY TO LAY BELT TO A TURRET INTAKE. DRAG A BELT INTO ANOTHER TO JOIN THEM.",
  "4  STAND RIGS BESIDE THE BELT, ARROWS AT IT (TAP TO TURN): BURN, SHOCK, SPLIT, SPEED UP OR SLOW DOWN. LONGER CINDER ROUTES COOK HOTTER SLUGS.",
  HELP[4]];
/** The title's view as the game computes it (TitleScreen.pickScale; intro.title.test.ts's titleView). */
function titleView(cssW: number, cssH: number, dpr: number): { W: number; H: number; k: number } {
  const v = computeView(cssW, cssH, dpr, (pw, ph, p) => titleScale(pw, ph, p, dpr));
  const menu = defaultScale(Math.floor(cssW * dpr), Math.floor(cssH * dpr), v.portrait);
  return { W: v.W, H: v.H, k: menu / v.scale };
}
const SCREENS: Readonly<Record<string, [number, number, number]>> = {
  "402x690 @3": [402, 690, 3], "390x844 @3": [390, 844, 3], "390x660 @3": [390, 660, 3], "844x390 @3": [844, 390, 3],
  "360x640 @2": [360, 640, 2], "desk 1440x900 @1": [1440, 900, 1], "desk 1440x900 @2": [1440, 900, 2], "desk 1280x720 @1": [1280, 720, 1],
};

describe("CARD-5 (H): HOW TO PLAY names the kinds and the keywords (REQ-BFG-111; REQ-BFG-089 holds: rules text on demand)", () => {
  it("items 3, 4 and 6 as drafted, with the two clauses and WARD's HIT'S DAMAGE; both FREE_JOINS forms keep their join clauses", () => {
    const three = "3  AT DAWN, BUY FROM THE CARAVAN: FACTORIES MAKE SLUGS FOR THE TURRET THEIR BELT REACHES, RIGS CHANGE THEM ON THE BELT, TURRETS FIRE THEM, CORES AND GEAR FIT A TURRET. DRAG OUT OF YOUR FACTORY TO LAY BELT TO A TURRET INTAKE. DRAG A BELT INTO ANOTHER TO JOIN THEM";
    expect(helpLine3(true)).toBe(`${three}.`);
    expect(helpLine3(false)).toBe(`${three} (${JOIN_OVER_LIMIT}). A JOINED FACTORY RUNS AT ${JOIN_PACE_PCT}% PACE.`);
    expect(HELP[3]).toBe("4  STAND RIGS BESIDE THE BELT, ARROWS AT IT (TAP TO TURN): BURN, STUN, SPLIT, SPEED UP OR SLOW DOWN. MOST RIGS WORK ON EACH SLUG ON A TILE THEIR ARROWS POINT AT. LONGER CINDER ROUTES COOK HOTTER SLUGS.");
    expect(HELP_KEYWORDS).toBe(`6  ${ICON.BURN}BURN: HULL DAMAGE OVER TIME. ${ICON.STUN}STUN: STOPS THE PART IT HITS FOR A WHILE. ${ICON.PLATE}SHIELD: SOAKS HULL DAMAGE. ${ICON.SHIELD}WARD: BLOCKS ALL OF ONE HIT'S DAMAGE. ${ICON.PAIR}PAIR: SLUGS FROM TWO BELTS REACH ONE TURRET AT ONCE. ${ICON.FRAY}FRAY: LATER HULL HITS DEAL MORE.`);
    expect([HELP.length, helpLines().length, helpLines()[5]]).toEqual([6, 6, HELP_KEYWORDS]);
    expect(helpLines().slice(0, 5).map((l, i) => (i === 2 || i === 3 ? "" : l))).toEqual(HELP_BEFORE.map((l, i) => (i === 2 || i === 3 ? "" : l))); // items 1, 2, 5 as before
  });

  it("each clause true where the sim says it: item 6 is each keyword's own reminder cut short; MOST RIGS: more than half the buyable rigs work on each slug on a tile their arrows point at (a HIT: rule)", () => {
    const r = (k: keyof typeof REMINDER) => REMINDER[k]();
    expect(r("BURN")).toMatch(/HULL DAMAGE A SEC FOR/);
    expect(r("STUN")).toMatch(/THE ENEMY PART IT HITS STOPS FOR/);
    expect(r("PLATE")).toMatch(/SOAKS HULL DAMAGE/);
    expect(r("SHIELD")).toMatch(/BLOCKS ALL OF ONE HIT'S DAMAGE/);
    expect(r("PAIR")).toMatch(/TWO LOADS REACH ONE TURRET FROM TWO BELTS AT ONCE/);
    expect(r("FRAY")).toMatch(/EVERY LATER SHOT THAT HITS THE HULL \+/);
    const rigs = buyableModules().filter((m) => m.kind === "gate");
    const hit = rigs.filter((m) => faceAt(m.id, 1, {})!.rules.some((x) => x.label === "HIT:"));
    expect(hit.length * 2).toBeGreaterThan(rigs.length);
    console.log(`CARD5 (H) rigs with a HIT: rule ${hit.length} of ${rigs.length}; without: ${rigs.filter((m) => !hit.includes(m)).map((m) => m.id).join(", ")}`);
  });

  it("the card fits on 402x690 @3 and on the desk: on screen, 20 px clear, no line cut, every glyph in its face, today's row pitch and item gap", () => {
    const out: string[] = [];
    for (const [name, [w, h, dpr]] of Object.entries(SCREENS)) {
      const v = titleView(w, h, dpr), lines = helpLines();
      const c = helpCard(v.W, v.H, v.k, lines), b = helpCard(v.W, v.H, v.k, HELP_BEFORE);
      expect(c.x >= 0 && c.x + c.w <= v.W && c.y >= 20 && c.y + c.h <= v.H - 20, `${name}: card ${JSON.stringify(c)} on ${v.W}x${v.H}`).toBe(true);
      expect([c.row, c.font, c.w], name).toEqual([b.row, b.font, b.w]); // the pitch, the face and the width as before
      const rows = lines.map((ln) => wrap(ln, c.w - 16, c.font));
      for (const rr of rows) for (const row of rr) {
        expect(textWidth(row, c.font), `${name}: ${row}`).toBeLessThanOrEqual(c.w - 16);
        for (const ch of row) if (ch !== " ") expect(glyphRows(ch, c.font), `${name}: ${JSON.stringify(ch)}`).toBeDefined();
      }
      expect(c.h, name).toBe(20 + rows.flat().length * c.row + lines.length * 3 + 5); // the item gap: 3, as before
      out.push(`${name} (${v.W}x${v.H}, k ${v.k.toFixed(2)}, ${c.font === "5" ? "5x7" : "3x5"}): before ${b.h} px (${b.y} to ${b.y + b.h}), after ${c.h} px (${c.y} to ${c.y + c.h}); rows per item ${rows.map((x) => x.length).join(", ")}`);
    }
    console.log(`CARD5 (H) the card:\n${out.join("\n")}`);
  });
});

// --------------------------------------------------------------------------- L: the numbers follow the day
import { cardText } from "../src/ui/abilityText";
import { dmgDayScale, dmgMulTenths } from "../src/sim/hullScale";

describe("CARD-5 (L): LIMPET WORKS' desk line and SCRAPPER's panel follow the day (REQ-BFG-081; READ-5 12.6, DAYNUM.md)", () => {
  const dmgOf = (id: string, day: number): number => Number(faceAt(id, 1, { day })!.stats.find(([ic]) => ic === "DMG")![1]);
  it("LIMPET WORKS: the desk line's blast is the one the sim lands that day (dmgDayScale with D), as its panel's DMG: day 1 100, day 5 200", () => {
    const blast = (effectAt("limpet", 1).factory!.round as { blast: number }).blast;
    for (const [day, n] of [[1, 100], [5, 200]] as const) {
      expect(dmgDayScale(blast, dmgMulTenths(day), {}), `the sim's blast on day ${day}`).toBe(n);
      expect(cardText("limpet", { day }), `day ${day}`).toMatch(new RegExp(`^BLASTS THE FOE'S HULL FOR ${n}\\.?$`));
      expect(dmgOf("limpet", day), `the panel's DMG on day ${day}`).toBe(n);
    }
  });

  it("SCRAPPER: its panel prints the desk line's number where its rule is, from the same source: day 1 30, day 5 60; its DMG stat a plain slug's and this", () => {
    for (const [day, n] of [[1, 30], [5, 60]] as const) {
      expect(faceAt("scrapper", 1, { day })!.rules.map((r) => r.text), `day ${day}`).toEqual(["EACH {*STUN} YOU LAND: 1 EXTRA {SLUG}.", `ITS {SLUG} DEAL ${n} MORE {DMG} THAN PLAIN.`]);
      expect(cardText("scrapper", { day }), `day ${day}`).toMatch(new RegExp(`^SCRAP SLUGS, ${n} MORE DAMAGE\\.?$`));
      expect(dmgOf("scrapper", day) - dmgOf("press", day), `day ${day}: the scrap slug over a plain one`).toBe(n);
    }
    // the line fits the panel's one-line band (225 px, the 5x7 face) at every star and day
    for (const s of [1, 2, 3]) for (const day of DAYS) {
      const t = faceAt("scrapper", s, { day })!.rules[1].text;
      expect(textWidth(icons(t), "5"), `★${s} day ${day}: ${t}`).toBeLessThanOrEqual(225);
    }
  });
});

// --------------------------------------------------------------------------- K: every first-sight note, in turn
import { afterEach, beforeEach } from "vitest";
import { newRun, type DuskFoe, type Run } from "../src/game/run";
import { UI } from "../src/ui/ui";
import { TAP_CSS } from "../src/ui/tap";
import { buildLayout, buildScale, panelArea, phoneBarLift, phoneScreen, type Sel } from "../src/screens/build/layout";
import { runeRowFits, runeRowH, shiftLayout } from "../src/ui/runeBar";
import { drawDetails, panelFit } from "../src/screens/build/inspector";
import { keywordState, keywordsIdle, keywordsPressed } from "../src/screens/build/keywords";
import { kwSight, setTipsForTests, sightDone } from "../src/ui/tips";
import { sightKey } from "../src/ui/firstSight";
import type { Ctx } from "../src/screens/build/actions";
import { key as KEY, rotField } from "../src/sim/deck";

/** A localStorage for the store (tests/card4.test.ts's Mem). */
class Mem {
  private m = new Map<string, string>();
  getItem(k: string): string | null { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string): void { this.m.set(k, String(v)); }
  removeItem(k: string): void { this.m.delete(k); }
}
const gl = globalThis as unknown as { localStorage?: unknown };
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
/** The build screen's frame on a CSS viewport (tests/card4.test.ts's framed). */
function framed(w: number, h: number, dpr: number, runes = 1, offers = 5) {
  const pw = Math.floor(w * dpr), ph = Math.floor(h * dpr), portrait = ph > pw * 1.05;
  const fake = { run: { build: { runes: Array.from({ length: runes }, () => ({ id: "many_hands" })) } }, refit: false, offers: () => Array.from({ length: offers }) } as unknown as Parameters<typeof runeRowFits>[0];
  let S = buildScale(pw, ph, portrait, dpr);
  while (S > 1 && !runeRowFits(fake, pw, ph, portrait, S, dpr)) S--;
  const isPh = phoneScreen(pw, ph, dpr), phone = portrait && isPh, tap = isPh ? Math.ceil(TAP_CSS / (S / dpr)) : 0;
  const v = { scale: S, dpr }, W = Math.floor(pw / S), H = Math.floor(ph / S);
  const lay = (unit: number) => {
    const row = runeRowH(v, runes), lift = phone ? phoneBarLift(W, H, offers, tap, runeRowH(v, 1)) : 0;
    return shiftLayout(buildLayout(W, H - row, portrait, offers, phone, tap, lift, { scale: S, unit }), row, H);
  };
  const Z = lay(1).cam.z, unit = gcd(S, Z), sub = S / unit;
  return { S, W, H, L: lay(unit), tap, phone, portrait, view: { W, H, scale: S, dpr, portrait, sub } };
}
/** A build screen's panel (tests/card4.test.ts's panelCtx): each draw a frame, the pointer off the panel. */
function panelCtx(run: Run, sel: Sel, f: ReturnType<typeof framed>, touch: boolean) {
  const ctx = { game: { ui: new UI(), t: 0, view: f.view, W: f.W, H: f.H }, run, touch, L: f.L } as unknown as Ctx;
  const area = panelArea(f.L, sel, { touch, hover: false, busy: false }, panelFit(ctx, sel, !!f.L.phone));
  const draw = () => {
    const ui = (ctx.game as unknown as { ui: UI }).ui;
    ui.pointer.kind = touch ? "touch" : "mouse";
    Object.assign(ui.pointer, { x: -1, y: -1, down: false });
    ui.begin();
    drawDetails(gOf(fresh(f.W, f.H)), ctx, sel, null, area, {} as DuskFoe);
    ui.end();
    return ui;
  };
  return { ctx, draw };
}
/** Plays the panel's first sights: each frame records its note boxes (kwdef: a word's box; kwsight: the desk's first-sight
 *  box or the rig sentence's) and what opened, then a press off every word closes it (keywordsPressed, as BuildScreen's
 *  press does), until a frame opens nothing or `presses` run out. */
function playSights(pc: ReturnType<typeof panelCtx>, touch: boolean, presses = 12): { opened: string[]; most: number } {
  const opened: string[] = [];
  let most = 0;
  for (let i = 0; i <= presses; i++) {
    const ui = pc.draw(), boxes = ui.regions.filter((q) => q.id === "kwdef" || q.id === "kwsight").length;
    most = Math.max(most, boxes);
    const st = keywordState(pc.ctx)!, what = st.rig ? "rig sentence" : touch ? st.word : st.auto;
    if (!boxes || !what) break;
    opened.push(what);
    if (i < presses) keywordsPressed(pc.ctx, null);
  }
  return { opened, most };
}
const spotterRun = (): Run => {
  const run = newRun("furnace", 5, "card5-k");
  run.build.mods = [{ uid: 950, def: "spotter", turret: 0 }];
  return run;
};
const FITTED: Sel = { kind: "fitted", uid: 950 };

describe("CARD-5 (K): every keyword's first-sight note opens, one at a time (REQ-BFG-004)", () => {
  beforeEach(() => { gl.localStorage = new Mem(); setTipsForTests("sight"); });
  afterEach(() => { delete gl.localStorage; setTipsForTests("reload"); });

  it("SPOTTER's fitted panel on 402x690 @3 (touch): PART's note, then AIM's when PART's closes while the panel is open; never two boxes; then none", () => {
    const f = framed(402, 690, 3, 1), pc = panelCtx(spotterRun(), FITTED, f, true);
    const { opened, most } = playSights(pc, true);
    console.log(`CARD5 (K) SPOTTER fitted, touch: ${opened.join(" -> ")}`);
    expect(opened.slice(0, 2)).toEqual(["PART", "AIM"]);
    expect(new Set(opened).size).toBe(opened.length); // each once
    expect(most).toBe(1);
    for (const w of opened) expect(sightDone(kwSight(sightKey(w))), w).toBe(true);
    // the panel again (closed, then opened): nothing left to open
    keywordsIdle(pc.ctx);
    expect(playSights(pc, true).opened).toEqual([]);
  });

  it("one left when the panel closes still opens on a later open, as before; the desk (mouse) opens them in turn too", () => {
    const f = framed(402, 690, 3, 1), pc = panelCtx(spotterRun(), FITTED, f, true);
    pc.draw();
    expect(keywordState(pc.ctx)!.word).toBe("PART");
    keywordsIdle(pc.ctx); // the panel closed with PART's note still up (done: its box was on screen)
    const again = playSights(pc, true);
    expect(again.opened[0]).toBe("AIM");
    expect(again.most).toBe(1);
    setTipsForTests("sight");
    const d = framed(1440, 900, 1, 1), dk = panelCtx(spotterRun(), FITTED, d, false);
    const desk = playSights(dk, false);
    console.log(`CARD5 (K) SPOTTER fitted, desk: ${desk.opened.join(" -> ")}`);
    expect(desk.opened.slice(0, 2)).toEqual(["PART", "AIM"]);
    expect(desk.most).toBe(1);
  });

  it("a rig: the rig sentence first, then each of its keywords in turn (TEMPER placed: HIT, BURN); a box the player opens waits for its own close", () => {
    const f = framed(402, 690, 3, 1);
    // tests/card4.test.ts's furnaceRun: a KILN at 4,6 with its belt up column 4; the rig at 3,3 turned to it
    const run = newRun("furnace", 5, "card5-k");
    run.build = { hero: "furnace", items: [{ uid: 1, def: "kiln", x: 4, y: 6 }, { uid: 10, def: "temper", x: 3, y: 3, ...rotField("temper", 1) }],
      routes: [{ factory: 1, cells: [KEY(4, 5), KEY(4, 4), KEY(4, 3), KEY(4, 2), KEY(4, 1), KEY(4, 0)] }], mods: [], beltCap: 40, hullBonus: 0 };
    run.inventory = [];
    const pc = panelCtx(run, { kind: "item", uid: 10 }, f, true);
    const temper = playSights(pc, true);
    console.log(`CARD5 (K) TEMPER placed, touch: ${temper.opened.join(" -> ")}`);
    expect(temper.opened[0]).toBe("rig sentence");
    expect(temper.opened).toContain("BURN");
    expect([temper.most, new Set(temper.opened).size]).toEqual([1, temper.opened.length]);
    // SPOTTER again: PART's note up by itself, the player taps AIM himself: his box takes its place (one box), and when it
    // closes nothing is left
    setTipsForTests("sight");
    const sp = panelCtx(spotterRun(), FITTED, f, true);
    const ui = sp.draw();
    expect(keywordState(sp.ctx)!.word).toBe("PART");
    const aim = ui.regions.find((q) => /^kw:\d+:AIM$/.test(q.id));
    expect(aim, "AIM's word target").toBeDefined();
    keywordsPressed(sp.ctx, aim!.id);
    aim!.onTap?.();
    const ui2 = sp.draw();
    expect([keywordState(sp.ctx)!.word, ui2.regions.filter((q) => q.id === "kwdef" || q.id === "kwsight").length]).toEqual(["AIM", 1]);
    keywordsPressed(sp.ctx, null);
    expect(playSights(sp, true).opened).toEqual([]);
  });
});
