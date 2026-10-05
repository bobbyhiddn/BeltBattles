// bb-0.8.3 (REQ-BFG-043 D11, REQ-BFG-032): the texts of the hero's two gold upgrades, TURRET SPEED and FACTORY. Each is
// ONE short line on a panel. Its numbers are read off the sim: the prices (content.ts UPGRADE_PRICE), the level count
// (UPGRADE_MAX) and the hero factory's next belts (its ItemDef.levels, stars.ts outputsAt).
// T47 (REQ-BFG-047, whole numbers only): no line shows a decimal. (Until NUM-4 both tracks said FASTER instead of a
// number: the intervals stepped to 0.01 s.) tests/belts.text.test.ts and tests/t47.decimals.test.ts tie each to the battle.

// NUM-4 (REQ-BFG-047; N1 2.2, "{UP}1/4, NEXT {RATE}36"): SPEED is whole since NUM-2, so each UPGRADE line names the next
// level's SPEED again, through fmtSpeed after the RATE icon, in the notice form: "UPGRADE: 3 BELTS, {RATE}30." and the
// starting turret's "LEVEL 1/4. UPGRADE: {RATE}36." (was "WORKS FASTER" / "FASTER", T47's no-decimal stand-in). The toast
// stays "TURRET SPEED LEVEL 2" (actions.ts), N1's form. tests/belts.numbers.test.ts ties each n to the battle's speed.

import { UPGRADE_MAX, UPGRADE_PRICE, type UpgradeTrack } from "../sim/content";
import { effectAt, levelOf, outputsAt } from "../sim/stars";
import { icons } from "../render/font";
import { fmtSpeed } from "./statFormat";

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
  const next = effectAt(def, l + 1).factory; // NUM-4: the next level's SPEED (its data; Battle.stamp's 30 / speed)
  return next ? icons(`UPGRADE: ${outputsAt(def, l + 1)} BELTS, {RATE}${fmtSpeed(next.speed)}.`) : null;
}

/**
 * A starting turret's next level in one line, what its UPGRADE button does: "UPGRADE: {RATE}36."; null at the top level.
 * NUM-4: `nextSpeed` is the turret's SPEED at the next TURRET SPEED level as the battle builds it (inspector.ts:
 * makeTurret on the build with that level; content.ts levelSpeed), printed through fmtSpeed. U2c step 5: T1 2.2's notice
 * form (was "NEXT: FIRES FASTER").
 */
export function turretNext(nextSpeed: number, level: number): string | null {
  return levelOf(level) >= UPGRADE_MAX ? null : icons(`UPGRADE: {RATE}${fmtSpeed(nextSpeed)}.`);
}

/** A starting turret's speed on its panel, after its "SPEED:" label: "LEVEL 1/4. UPGRADE: {RATE}36." ("LEVEL 4/4." at
 *  the top). U2c step 5: the notice form, two lines of the desk column. NUM-4: the next level's SPEED (was FASTER). */
export function turretSpeedRow(nextSpeed: number, level: number): string {
  const next = turretNext(nextSpeed, level);
  return `LEVEL ${levelOf(level)}/${UPGRADE_MAX}.${next ? ` ${next}` : ""}`;
}

/** The board's level marker on the hero factory and the starting turrets: the level as a numeral ("2"); "" at level 1. */
export const levelMark = (level: number): string => (levelOf(level) > 1 ? String(levelOf(level)) : "");
