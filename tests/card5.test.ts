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
