// NUM-4 (REQ-BFG-047, REQ-BFG-046; N1 2.5 "numbers.faces"): every face value through the formatter registry. The sweep is
// every piece the game sells, every supply and every hero's signature factory (the sustain pieces with their switch on, as
// RUNES-2b ships them) x its stars x every hero for MIMIC FORGE x every turret class factor a real turret has for a core:
// its face (stat rows, rule lines, clause, caveats, reminders), its kept sentences, gist, NEXT STAR and card lines, its
// shop chip, its ⓘ LEVELS and the KEYWORDS a tap shows. Each number printed meanwhile is recorded (statFormat.ts
// captureFormats); each must be whole (a % whole after x 100), printed as it is, and the whole formatters must have met no
// fraction (FRACTIONAL, the findings list). The RATE pair is the battle's SPEED: TurretSpec / FactorySpec `speed`.
import { describe, expect, it } from "vitest";
import { HEROES, ITEMS, buyableModules, classFactor, factorySpeed, withSustain, type HeroId, type ItemDef } from "../src/sim/content";
import { effectAt, fusible } from "../src/sim/stars";
import { FRACTIONAL, captureFormats, type FmtRecord } from "../src/ui/statFormat";
import { factoryStats, faceLines, hasFace, turretStats } from "../src/ui/faces";
import { abilityText, cardText, gist, hasAbilityText, nextStarText, type TextOpts } from "../src/ui/abilityText";
import { shopChip } from "../src/ui/chips";
import { levelLines, levelText } from "../src/screens/build/levels";
import { GLOSSARY, glossaryText } from "../src/ui/glossary";
import { KEYWORDS } from "../src/render/font";

const HERO_IDS = Object.keys(HEROES) as HeroId[];
/** Every class factor a real turret has at any star (cores.ts scaleCore reads it as a whole %). */
const KS = [...new Set(Object.values(ITEMS).filter((d) => d.kind === "turret")
  .flatMap((d) => [1, 2, 3].map((s) => classFactor(effectAt(d.id, s).turret!))))].sort();

function pieces(): ItemDef[] {
  const mods = buyableModules();
  const supplies = Object.values(ITEMS).filter((d) => d.kind === "supply" && d.price > 0);
  const signature = Object.values(HEROES).map((h) => ITEMS[h.factory]).filter((d, i, a) => d && a.indexOf(d) === i);
  return [...mods, ...supplies, ...signature];
}

const optsOf = (d: ItemDef): TextOpts[] =>
  d.kind === "core" ? KS.map((k) => ({ k })) : d.id === "mimic" ? [{}, ...HERO_IDS.map((hero) => ({ hero }))] : [{}];

/** Everything a player reads for `d` at `s` with `o`, inside one capture. */
function readAll(d: ItemDef, s: number, o: TextOpts): string[] {
  const out: string[] = [];
  if (hasFace(d.id)) {
    const fl = faceLines(d.id, s, o)!;
    out.push(...[fl.stats, fl.stats2, ...fl.rules.map((r) => r.text), fl.clause?.text, ...(fl.caveats ?? []), ...fl.reminders].filter((x): x is string => !!x));
    for (const l of levelLines(d.id, s, o) ?? []) out.push(levelText(l));
    for (const w of [...KEYWORDS, ...GLOSSARY.map((r) => r.word)]) {
      const t = glossaryText(w, { def: d.id, stars: s, o });
      if (t) out.push(t);
    }
  }
  if (hasAbilityText(d.id)) {
    out.push(...abilityText(d.id, s, o).sentences, gist(d.id, s, o));
    const next = nextStarText(d.id, s, o);
    if (next) out.push(next);
  }
  if (s === 1) {
    out.push(cardText(d.id, o));
    const chip = shopChip(d.id, o);
    if (chip) out.push(chip);
  }
  return out;
}

describe("numbers.faces (NUM-4): every number a piece's text prints is whole, through the registry", () => {
  it("the sweep: every record whole and printed as it is; the whole formatters met no fraction", () => {
    FRACTIONAL.length = 0;
    const records: FmtRecord[] = [];
    let texts = 0;
    withSustain(() => {
      for (const d of pieces()) {
        for (const s of fusible(d.id) ? [1, 2, 3] : [1]) {
          for (const o of optsOf(d)) {
            const site = `${d.id} ★${s}${o.k !== undefined ? ` k${o.k}` : ""}${o.hero ? ` ${o.hero}` : ""}`;
            const { value, records: r } = captureFormats(() => readAll(d, s, o), site);
            texts += value.length;
            records.push(...r);
          }
        }
      }
    });
    const bad = records.filter((r) => (r.unit === "pct"
      ? Math.abs(r.value * 100 - Math.round(r.value * 100)) > 1e-6 || r.printed !== `${Math.round(r.value * 100)}%`
      : !Number.isInteger(r.value) || r.printed !== String(r.value)));
    // one line per distinct value (its first site and how many records), so a finding names its source once
    const once = (rs: FmtRecord[]): string[] => {
      const m = new Map<string, { site: string; n: number }>();
      for (const r of rs) { const k = `${r.unit} ${r.value} printed ${r.printed}`; const v = m.get(k); if (v) v.n++; else m.set(k, { site: r.site, n: 1 }); }
      return [...m].map(([k, v]) => `${k} (first at ${v.site}, ${v.n} records)`);
    };
    expect(once(bad)).toEqual([]);
    expect(once(FRACTIONAL)).toEqual([]);
    expect(texts).toBeGreaterThan(2000);
    expect(records.length).toBeGreaterThan(3000);
    expect(KS.length).toBeGreaterThan(3);
  });

  it("a turret's and a factory's stat row lead with {RATE} n, n its battle SPEED; no stat row holds SEC", () => {
    let turrets = 0, factories = 0;
    withSustain(() => {
      for (const d of Object.values(ITEMS)) {
        for (const s of fusible(d.id) ? [1, 2, 3] : [1]) {
          if (d.kind === "turret") {
            const st = turretStats(d.id, s);
            expect(st[0], `${d.id} ★${s}`).toEqual(["RATE", String(effectAt(d.id, s).turret!.speed)]);
            expect(st.some(([ic]) => ic === "SEC")).toBe(false);
            turrets++;
          } else if (d.kind === "factory" && d.id !== "mimic") {
            const st = factoryStats(d.id, s);
            expect(st[0], `${d.id} ★${s}`).toEqual(["RATE", String(effectAt(d.id, s).factory!.speed)]);
            expect(st.some(([ic]) => ic === "SEC")).toBe(false);
            factories++;
          }
        }
      }
      // MIMIC FORGE: the hero factory's speed x its rate %, rounded once (Battle.factoryDef), for each hero
      for (const hero of HERO_IDS) for (const s of [1, 2, 3]) {
        const st = factoryStats("mimic", s, hero);
        expect(st[0], `mimic ★${s} ${hero}`).toEqual(["RATE", String(factorySpeed("mimic", effectAt("mimic", s).factory!, hero))]);
      }
    });
    expect(turrets).toBeGreaterThan(30);
    expect(factories).toBeGreaterThan(30);
  });

  it("the brief's two examples: MEND PRESS and FROSTBITE", () => {
    withSustain(() => {
      expect(factoryStats("mendpress", 1)).toEqual([["RATE", "19"], ["DMG", "30"], ["BELT", "2"]]);
      expect(factoryStats("frostbite", 1)).toEqual([["RATE", "11"], ["DMG", "20"], ["BELT", "2"]]);
    });
  });
});
