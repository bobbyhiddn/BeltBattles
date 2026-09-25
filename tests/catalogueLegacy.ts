import { ITEMS, type MerchantId } from "../src/sim/content";

// Preserve pre-expansion harness pins against the stock those seeds originally drew.
// The live catalogue remains available to every other test and to the game.
const STOCK: Record<string, Set<string>> = {
  gate: new Set(["brake", "coil", "grease", "longhaul", "overdrive", "splitter", "temper", "whetstone"]),
  factory: new Set(["assembly", "doublestamp", "gantry", "hotswap", "press", "shottower", "slagpot"]),
  core: new Set(["drake", "gatling", "hullbreaker", "pressure", "rotary", "salvo", "scatter"]),
  mod: new Set(["calibrate", "chamber", "hopper", "mantlet", "ram"]),
};

export function withLegacyStock<T>(fn: () => T): T {
  const hidden: { id: string; merchant: MerchantId }[] = [];
  for (const d of Object.values(ITEMS)) {
    if (d.merchant && STOCK[d.kind] && !STOCK[d.kind].has(d.id)) {
      hidden.push({ id: d.id, merchant: d.merchant });
      d.merchant = undefined;
    }
  }
  try { return fn(); }
  finally { for (const { id, merchant } of hidden) ITEMS[id].merchant = merchant; }
}
