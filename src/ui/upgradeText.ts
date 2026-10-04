// bb-0.8.3 (REQ-BFG-043 D11, REQ-BFG-032): the texts of the hero's two gold upgrades, TURRET SPEED and FACTORY. Each is
// ONE short line on a panel. Its numbers are read off the sim: the prices (content.ts UPGRADE_PRICE), the level count
// (UPGRADE_MAX) and the hero factory's next belts (its ItemDef.levels, stars.ts outputsAt).
// T47 (REQ-BFG-047, whole numbers only): no line shows a decimal. A level's speed-up is a whole percentage only on the
// turret's first step (x0.85: 15% sooner), and the factory cycles step to 0.01 s, so both tracks say FASTER at every
// level instead of a number. tests/belts.text.test.ts and tests/t47.decimals.test.ts tie each to the battle.

import { UPGRADE_MAX, UPGRADE_PRICE, type UpgradeTrack } from "../sim/content";
import { effectAt, levelOf, outputsAt } from "../sim/stars";

/** The tracks' names, as the panels and the toast say them. */
export const TRACK_NAME: Readonly<Record<UpgradeTrack, string>> = { turret: "TURRET SPEED", factory: "FACTORY" };

/** The panel's level line: "FACTORY: LEVEL 2/4.", "TURRET SPEED: LEVEL 1/4." (U2c step 5: T1 2.2's notice form, LABEL:
 *  TEXT.; was "FACTORY LEVEL 2/4"). */
export const levelLine = (track: UpgradeTrack, level: number): string => `${TRACK_NAME[track]}: LEVEL ${levelOf(level)}/${UPGRADE_MAX}.`;

/** The UPGRADE button: the next level's price, "UPGRADE 10G"; null at the top level (no button). */
export function upgradeLabel(level: number): string | null {
  const l = levelOf(level);
  return l >= UPGRADE_MAX ? null : `UPGRADE ${UPGRADE_PRICE[l + 1]}G`;
}

/**
 * The hero factory's next level in one line, what its UPGRADE button does: "UPGRADE: 3 BELTS, WORKS FASTER." (its belt
 * slots at the next level; every level runs its cycle faster, stars.ts effectAt); null at the top level. T47: no seconds.
 * U2c step 5: T1 2.2's notice form (was "NEXT: 3 BELTS, FASTER").
 */
export function factoryNext(def: string, level: number): string | null {
  const l = levelOf(level);
  if (l >= UPGRADE_MAX) return null;
  return effectAt(def, l + 1).factory ? `UPGRADE: ${outputsAt(def, l + 1)} BELTS, WORKS FASTER.` : null;
}

/**
 * A starting turret's next level in one line, what its UPGRADE button does: "UPGRADE: FIRES FASTER."; null at the top
 * level. T47: no seconds. `every`, the seconds between its shots now, stays in the signature for the callers; the next
 * level scales it by TURRET_SPEED[next] / TURRET_SPEED[now] in the battle (deck.ts turretSlots). U2c step 5: T1 2.2's
 * notice form (was "NEXT: FIRES FASTER").
 */
export function turretNext(_every: number, level: number): string | null {
  return levelOf(level) >= UPGRADE_MAX ? null : "UPGRADE: FIRES FASTER.";
}

/** A starting turret's speed on its panel, after its "SPEED:" label: "LEVEL 1/4. UPGRADE: FASTER." ("LEVEL 4/4." at the
 *  top). T47: no seconds. U2c step 5: the notice form (was "LEVEL 1/4, NEXT: FASTER"), two lines of the desk column. */
export function turretSpeedRow(every: number, level: number): string {
  return `LEVEL ${levelOf(level)}/${UPGRADE_MAX}.${turretNext(every, level) ? " UPGRADE: FASTER." : ""}`;
}

/** The board's level marker on the hero factory and the starting turrets: the level as a numeral ("2"); "" at level 1. */
export const levelMark = (level: number): string => (levelOf(level) > 1 ? String(levelOf(level)) : "");
