// 0.8.0 RC M3 (REQ-BFG-011): the version label is the same in every place that carries it, so none can be left behind
// (src/version.ts says "keep in step with package.json", and nothing checked it): the title screen's VERSION, the
// package's version and package-lock.json's two root fields.
// 0.8.1 (the phone controls, REQ-BFG-034 to 037) is a UI-only release on 0.8.0's rules: the label moves to 0.8.1 and
// the rules stay bb-0.8.0, so the live ghosts and uploads stay valid. A battle change gets its own rules version.
// 0.8.2 (the title screen on phones, REQ-BFG-038) is UI-only too: the label moves to 0.8.2 and the rules stay bb-0.8.0.
// 0.8.3 (a part's whole description on a phone tap, REQ-BFG-034/035) is UI-only too, built on 0.8.2: the label moves to
// 0.8.3 and the rules stay bb-0.8.0.
// 0.8.4 (a roomier build screen on phones, REQ-BFG-040) is UI-only too, built on 0.8.3: the label moves to 0.8.4 and
// the rules stay bb-0.8.0.
// 0.8.5 is BELTS (REQ-BFG-043, REQ-BFG-044), built on 0.8.4: it changes battles (belt slots by level, the hero's two
// gold upgrades), so the rules move to bb-0.8.3, and the label moves to 0.8.5.
// 0.8.6 is PACKS (REQ-BFG-051, REQ-BFG-063), built on 0.8.5: it changes battles (the belt and armor packs) and the
// uploads (a required player name), so the rules move to bb-0.8.6, and the label moves to 0.8.6.
// 0.8.7 is RUNES (REQ-BFG-058), built on 0.8.6: the runes change battles and the uploads, so the rules move to bb-0.8.7
// (with bb-0.8.6's seed and stand-in pools carried, content.ts POOL_RULES_CARRIED), and the label moves to 0.8.7.
// 0.8.8 (the card faces, REQ-BFG-045) is UI-only, built on 0.8.7: the label moves to 0.8.8 and the rules stay bb-0.8.7.
// 0.8.9 (the captains' catch-up, REQ-BFG-024 and REQ-BFG-051, and U2f's card fixes, REQ-BFG-070 and REQ-BFG-046), built
// on 0.8.8: the captains' road decks buy ARMOR PACKs, but the battle sim, the upload check and the pools don't move, so
// the label moves to 0.8.9 and the rules stay bb-0.8.7.
// 0.9.0 is release X (whole numbers, sustain and the bots' runes; REQ-BFG-047, REQ-BFG-069, REQ-BFG-058) with Y1's card
// faces (REQ-BFG-070, REQ-BFG-046): the battles, the pools and the upload check change, so FLIP-X2 moved the rules once
// to bb-0.9.0 (nothing carried), and the label moves to 0.9.0.
// 0.9.1 is the hero balance pass (REQ-BFG-069, REQ-BFG-058): the hulls, the KILN's HEAT and FURNACE's four runes change
// battles, the pools and the upload check, so BAL-2 moved the rules once to bb-0.9.1 (nothing carried), and the label
// moves to 0.9.1.
// 0.9.2 is the captains' catch-up (REQ-BFG-024, REQ-BFG-058, REQ-BFG-051): it changes only the captains' plans and rune
// picks, so the rules stay bb-0.9.1 (no bump, nothing carried), and the label moves to 0.9.2.
// 0.9.3 is release Y (REQ-BFG-070, REQ-BFG-046) with the phone finger targets (REQ-BFG-040): one-line part rules (the
// star switch flipped for good), POISON folded into VENOM DRIP's longer BURN, and FOUNDRY's fuse change battles, the
// pools and the upload check, so Y7b2 moved the rules once to bb-0.9.3 (nothing carried), and the label moves to 0.9.3.
// 0.9.4 is the captains' pass on 0.9.3's rules (REQ-BFG-024, REQ-BFG-058, REQ-BFG-051) with the touch check's fix
// (REQ-BFG-040): only captain plans, captain runes and a test script change, so the rules stay bb-0.9.3 and the label
// moves to 0.9.4.
// 0.9.5 is 0.9.4 with two small fixes on the same rules: SALVO RACK's info note and the shop card's hover text
// (REQ-BFG-070, REQ-BFG-046), and a factory or turret hold that takes its full time (REQ-BFG-040). No battle changes,
// so the rules stay bb-0.9.3 and the label moves to 0.9.5.
// 0.9.6 is 0.9.5 with battles in motion on the same rules: both ships sail over the day's sea while their boards stay
// level, and the same ship shows on every screen (REQ-BFG-071). No battle changes, so the rules stay bb-0.9.3 and the
// label moves to 0.9.6.
// 0.9.7 is 0.9.6 with LAST CHANCE on new rules: a run down to its last life gets one pick (REQ-BFG-073), with the
// captains' re-plan and six card faces that say what the game already did. Battles change, so the rules move to
// bb-0.9.7 and the label to 0.9.7.
// 0.9.8 is 0.9.7 with styles you earn for your carrier, its floor panels, its belts and your stats panels, picked on
// the new CUSTOMIZE screen (REQ-BFG-072, REQ-BFG-074). No battle changes, so the rules stay bb-0.9.7 and the label
// moves to 0.9.8.
// 0.9.9 is 0.9.8 with the battle view: a setting for every battle, a wider view of the fight, VIEW BATTLEFIELD after
// it, a scouted foe's carrier, the dark wind's numbers on both carriers and cleaner cards. The hull release rides in
// it: AZ-BUMP (its one bump; REQ-BFG-079, REQ-BFG-077, REQ-BFG-078) changes battles (the hull by the day, the NPC day,
// the star ladders), so the rules move to bb-0.10.0 and the label to 0.9.9 (the combined 0.9.9 on branch c099).
// 0.9.10 is 0.9.9.1 (0.9.9 with easier first opponents, a server-side seed pool: the page and the label stayed 0.9.9) with
// REPLAY after every fight (REQ-BFG-112) and the dark wind's REGEN badge fix (PAIR-2). A client release: no battle changes,
// so the rules stay bb-0.10.0 and the label moves to 0.9.10 (STAGE-0910, branch r0910).
// BUMP-1D (the 10-wins rules release; its one bump): battles change (a run is won at 10 wins or lost at 0 hearts with no day
// limit, the hearts cost [1, 2, 2], six plain rigs and six shaped ones), so the rules move to bb-0.11.0; the label stays 0.9.10
// here, and the release lane picks the release's label at staging.
// 0.9.11 is 0.9.10 with BUMP-1D's rules release (above): a run is won at 10 wins, the twelve new rigs, the 192-ghost pool and
// the profile upload. The rules are bb-0.11.0 (src/sim/content.ts:47) and the label moves to 0.9.11 (STAGE-0911, branch r0911).
// 0.9.12 is 0.9.11 with SHOPCARD-1's shop cards (REQ-BFG-115, 113, 081): a client release, display only, so the rules stay
// bb-0.11.0 (src/sim/content.ts:47) and the label moves to 0.9.12 (STAGE-0912, branch r0912).
// BUMP-1E (the scaling-rules release; its one bump): battles change (SCALE_RIGS is on: POISON a keyword, five reworked rigs and seven new,
// every pool regenerated once, ENDLESS on), so the rules move to bb-0.12.0 (src/sim/content.ts:47); the label stays 0.9.12 here (VERSION,
// package.json and the lock's two root fields are untouched), and the release lane picks the release's label at staging.
// 0.9.13 is 0.9.12 with BUMP-1E's rules release (above): the seven rigs that count, POISON, the five reworks and ENDLESS. The rules are
// bb-0.12.0 (src/sim/content.ts:53) and the label moves to 0.9.13 (STAGE-0913, branch r0913).
// 0.9.14 is 0.9.13 with BUMP-1F's rules release: GATES (the three converters FUSER, SCATTER MILL and SMELTER), ENCHANT (the ENCHANTER's words, with ENCHANT-2's
// rivals' words and ENCHANT-2W), POISON at 2 a second, the softer field (SOFT_TARGET 150), the god hull step 1500 and one regeneration of the pools. The rules are
// bb-0.13.0 (src/sim/content.ts:57) and the label moves to 0.9.14 (STAGE-0914, branch r0914).
// 0.9.14.1 is 0.9.14 with four accepted rides: S1 (the server refuses an endless upload past day 25 at once), ROWS-1 (a belt's timeline says what a scaling rig reads;
// YOUR RUNES pages), POLISH-1 (words and small display fixes) and PRESENT-2 with PRESENT-1 (footprint grids on cards, the title, the panels' notes and families).
// A client release with that one server guard: no battle changes, so the rules stay bb-0.13.0 (src/sim/content.ts:57) and the label moves to 0.9.14.1, four parts on
// purpose (BUMP-1G will be 0.9.15) (STAGE-09141, branch r09141).
// 0.9.15 is 0.9.14.1 with BUMP-1G's rules release (SHOCK-1's effect floor: a SHOCK and a BURN ware in every run's wares; the bots' B1-B3; RATCHET's and GRIMHOLD's late captain decks;
// one regeneration of the pools) and two display rides: POLISH-2 (what a belt's panel counts and leaves out; one ? glyph) and PRESENT-3 (the five-point star, folded empty gear rows, first-run
// and desk notes, the road card's arrow, the heavy turrets' icon). The rules are bb-0.14.0 (src/sim/content.ts:61) and the label moves to 0.9.15, three parts again (STAGE-0915, branch r0915).
// 0.9.15.1 is 0.9.15 with two accepted display rides: PRESENT-4 (a run of small stars reads whole, the road's drop row shows a shaped part's icon and its footprint, the first-run rig sentence
// clears the deck on a phone, the info view's last page reads TAP TO CLOSE) and the POLISH chain POLISH-3 to POLISH-6 (battle faces, panels and words, the ENCHANTER's days). A client release,
// no battle changes, so the rules stay bb-0.14.0 (src/sim/content.ts:61) and the label moves to 0.9.15.1, four parts again (STAGE-09151, branch r09151).
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { VERSION } from "../src/version";
import { RULES_VERSION } from "../src/sim/content";

const json = (f: string) => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url), "utf8")) as { version: string; packages?: Record<string, { version?: string }> };

describe("the 0.9.15.1 label", () => {
  it("is 0.9.15.1 on the title screen (VERSION), in package.json and in package-lock.json's two root fields; the rules are BUMP-1G's bb-0.14.0 (BUMP-1F's were bb-0.13.0, BUMP-1E's bb-0.12.0, BUMP-1D's bb-0.11.0, AZ-BUMP's bb-0.10.0, Z-BUMP's bb-0.9.7, Y7b2's bb-0.9.3, BAL-2's bb-0.9.1, release X's bb-0.9.0, RUNES-1's bb-0.8.7, PACKS's bb-0.8.6)", () => {
    const pkg = json("package.json"), lock = json("package-lock.json");
    expect([VERSION, pkg.version, lock.version, lock.packages?.[""]?.version]).toEqual(["0.9.15.1", "0.9.15.1", "0.9.15.1", "0.9.15.1"]);
    expect(RULES_VERSION).toBe("bb-0.15.0") /* BUMP-1H (rules bb-0.14.0 -> bb-0.15.0, the stamped literal): was bb-0.14.0. BUMP-1G (label bb-0.13.0 -> bb-0.14.0, RULES_VERSION): was bb-0.13.0. BUMP-1F (label bb-0.12.0 -> bb-0.13.0, RULES_VERSION): the bump (was bb-0.12.0). BUMP-1E: the bump (was bb-0.11.0). BUMP-1D: the bump (was bb-0.10.0; AZ-BUMP: was bb-0.9.7; Z-BUMP: was bb-0.9.3; Y7b2: was bb-0.9.1; BAL-2: was bb-0.9.0; FLIP-X2: was bb-0.8.7) */; // 0.8.6 played PACKS's bb-0.8.6; RUNES changes battles, so it bumps the rules
  });
});
