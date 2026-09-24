// PvE warlord builds. Every warlord is a real production build that runs under the
// same simulation rules as the player (spec §19). Builds escalate by round.

import { HEROES, type HeroId } from "./content";
import { key, type Build, type Placed, type RouteDef } from "./deck";
import { migrateDeck } from "./beltside";

const K = (x: number, y: number) => key(x, y);

interface Layout {
  items: Placed[];
  routes: RouteDef[];
  beltCap: number;
}

/** Weaver: Loom centred, three routes to three light turrets. */
function weaverBase(uid0: number): Layout {
  const loom = uid0;
  return {
    items: [{ uid: loom, def: "loom", x: 4, y: 5 }],
    routes: [
      { factory: loom, cells: [K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)] },
      { factory: loom, cells: [K(3, 5), K(2, 5), K(1, 5), K(1, 4), K(1, 3), K(1, 2), K(1, 1), K(1, 0)] },
      { factory: loom, cells: [K(6, 5), K(7, 5), K(8, 5), K(8, 4), K(8, 3), K(8, 2), K(8, 1), K(8, 0)] },
    ],
    beltCap: HEROES.weaver.belt,
  };
}

/** Furnace starting layout: Kiln with a short straight route. */
function furnaceStart(uid0: number): Layout {
  const kiln = uid0;
  return {
    items: [{ uid: kiln, def: "kiln", x: 4, y: 6 }],
    routes: [{ factory: kiln, cells: [K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)] }],
    beltCap: HEROES.furnace.belt,
  };
}

/** Furnace warlord from round 2: a winding cooking route. */
function furnaceCooker(uid0: number): Layout {
  const kiln = uid0;
  return {
    items: [{ uid: kiln, def: "kiln", x: 4, y: 6 }],
    routes: [{
      factory: kiln,
      cells: [K(4, 5), K(3, 5), K(2, 5), K(2, 4), K(2, 3), K(2, 2), K(3, 2), K(4, 2), K(4, 1), K(4, 0)],
    }],
    beltCap: 18,
  };
}

export function startingBuild(heroId: HeroId, uid0: number): Build {
  const l = heroId === "furnace" ? furnaceStart(uid0) : weaverBase(uid0);
  return migrateDeck({ hero: heroId, items: l.items, routes: l.routes, mods: [], beltCap: l.beltCap, hullBonus: 0 }, "preset:ai");
}

/** Enemy warlord build for a round (1-based). 0.6.2 BELTSIDE: a load boundary (D3): gates written on belt
 *  tiles (the 0.6.1 layouts) move beside them; once the layouts place rigs natively it is a safety net. */
export function warlordBuild(heroId: HeroId, round: number): Build {
  return migrateDeck(warlordLayout(heroId, round), "preset:ai");
}

function warlordLayout(heroId: HeroId, round: number): Build {
  const U = 9000;
  let uid = U + 10;
  const gate = (def: string, x: number, y: number): Placed => ({ uid: uid++, def, x, y });
  if (heroId === "weaver") {
    const l = weaverBase(U);
    const items = [...l.items];
    const steps: Placed[] = [
      gate("grease", 1, 3), // r2
      gate("temper", 4, 2), // r3
      gate("coil", 8, 3), // r4
      gate("whetstone", 1, 4), // r5
      gate("longhaul", 4, 1), // r6
      gate("grease", 7, 5), // r7
      gate("temper", 8, 2), // r8
    ];
    for (let i = 0; i < Math.min(steps.length, round - 1); i++) items.push(steps[i]);
    const mods = round >= 8 ? [{ uid: uid++, def: "calibrate", turret: 1 }] : [];
    return { hero: "weaver", items, routes: l.routes, mods, beltCap: l.beltCap, hullBonus: warlordHull(round) };
  }
  // Furnace warlord
  if (round <= 2) {
    const l = furnaceStart(U);
    const items = [...l.items];
    if (round === 2) items.push(gate("temper", 4, 3));
    return { hero: "furnace", items, routes: l.routes, mods: [], beltCap: l.beltCap, hullBonus: warlordHull(round) };
  }
  const l = furnaceCooker(U);
  const items = [...l.items, gate("temper", 2, 4)];
  const routes = [...l.routes];
  if (round >= 4) items.push(gate("brake", 3, 2));
  if (round >= 5) items.push(gate("longhaul", 4, 1));
  if (round >= 6) {
    const press = U + 1;
    items.push({ uid: press, def: "press", x: 6, y: 6 });
    routes.push({ factory: press, cells: [K(6, 5), K(5, 5), K(5, 4), K(5, 3), K(5, 2), K(5, 1), K(5, 0)] });
  }
  if (round >= 7) items.push(gate("grease", 5, 4));
  if (round >= 8) items.push(gate("whetstone", 2, 3));
  const mods = round >= 6 ? [{ uid: uid++, def: "calibrate", turret: 0 }] : [];
  return { hero: "furnace", items, routes, mods, beltCap: 18, hullBonus: warlordHull(round) };
}

/** Warlords start weaker than the player and outgrow them round by round (bb-0.4.0: x4/3). */
export function warlordHull(round: number): number {
  return (round - 1) * 11 - 27;
}

export function warlordName(heroId: HeroId, round: number): string {
  const weaver = ["THREADBARE SCOUT", "SILK RAIDER", "LOOM CAPTAIN", "SPARKWEAVE", "THE TAPESTRY", "WARP & WEFT", "SKYWRIGHT PRIME", "THE FINAL WEAVE"];
  const furnace = ["CINDER PUP", "SLOW BAKER", "TWIN KILNS", "LONG FIRE", "GREASE CHIEF", "BLACKSTACK", "OLD SMELTER", "THE GREAT FURNACE"];
  const list = heroId === "weaver" ? weaver : furnace;
  return list[Math.min(list.length - 1, Math.max(0, round - 1))];
}
