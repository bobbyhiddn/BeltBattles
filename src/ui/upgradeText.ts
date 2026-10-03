// bb-0.8.3 (REQ-BFG-043 D11, REQ-BFG-032): the texts of the hero's two gold upgrades, TURRET SPEED and FACTORY. Each is
// ONE short line on a panel, and every number in it is read off the sim: the prices (content.ts UPGRADE_PRICE), the
// turret's share (TURRET_SPEED), the hero factory's next level (its ItemDef.levels, stars.ts effectAt and outputsAt).
// tests/belts.upgrades.test.ts ties each to the battle.

import { TURRET_SPEED, UPGRADE_MAX, UPGRADE_PRICE, type UpgradeTrack } from "../sim/content";
import { effectAt, levelOf, outputsAt } from "../sim/stars";
import { n2 } from "./abilityText";

/** The tracks' names, as the panels and the toast say them. */
export const TRACK_NAME: Readonly<Record<UpgradeTrack, string>> = { turret: "TURRET SPEED", factory: "FACTORY" };

/** The panel's level line: "FACTORY LEVEL 2/4", "TURRET SPEED LEVEL 1/4". */
export const levelLine = (track: UpgradeTrack, level: number): string => `${TRACK_NAME[track]} LEVEL ${levelOf(level)}/${UPGRADE_MAX}`;

/** The UPGRADE button: the next level's price, "UPGRADE 10G"; null at the top level (no button). */
export function upgradeLabel(level: number): string | null {
  const l = levelOf(level);
  return l >= UPGRADE_MAX ? null : `UPGRADE ${UPGRADE_PRICE[l + 1]}G`;
}

/** The hero factory's next level in one line: "NEXT: 3 BELTS, A SLUG EVERY 0.98 SEC"; null at the top level. */
export function factoryNext(def: string, level: number): string | null {
  const l = levelOf(level);
  if (l >= UPGRADE_MAX) return null;
  const f = effectAt(def, l + 1).factory;
  return f ? `NEXT: ${outputsAt(def, l + 1)} BELTS, A SLUG EVERY ${n2(f.interval)} SEC` : null;
}

/**
 * A starting turret's next level in one line, from `every`, the seconds between its shots now (the panel's FIRES row:
 * gear, core and the long-belt cadence included): "NEXT: FIRES EVERY 0.72 SEC"; null at the top level. The next level
 * scales the interval by TURRET_SPEED[next] / TURRET_SPEED[now].
 */
export function turretNext(every: number, level: number): string | null {
  const l = levelOf(level);
  if (l >= UPGRADE_MAX) return null;
  return `NEXT: FIRES EVERY ${n2((every * TURRET_SPEED[l + 1]) / TURRET_SPEED[l])} SEC`;
}

/** A starting turret's SPEED row on its panel: "LEVEL 1/4, NEXT EVERY 0.85 SEC" ("LEVEL 4/4" at the top). */
export function turretSpeedRow(every: number, level: number): string {
  const next = turretNext(every, level);
  return `LEVEL ${levelOf(level)}/${UPGRADE_MAX}${next ? `, ${next.replace("NEXT: FIRES ", "NEXT ")}` : ""}`;
}

/** The board's level marker on the hero factory and the starting turrets: the level as a numeral ("2"); "" at level 1. */
export const levelMark = (level: number): string => (levelOf(level) > 1 ? String(levelOf(level)) : "");
