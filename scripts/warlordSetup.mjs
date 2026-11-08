// POLISH-5 (REQ-BFG-089; P5-1): the warlord set-up of scripts/scoutshots.mjs after TOUCH-099's NPC_DAY drop card.
// With NPC_DAY on (road.ts warlordReward: the reward carries its drop chance) a Hard win gives no part pick: it rolls a drop (or NO DROP), shown as the drop card, and the card's one way on is ON TO THE ROAD (region `toroad`,
// warlordHud.ts): the day's road event (EventScreen: choice0..2, then REFIT once the choice is made), then the REFIT build screen. The 0.9.7 card has no drop chance: a part pick (`take0`), then REFIT. scripts/touchcheck.mjs
// scoutWarlord (:2130) tells the two by `screen.warlord.reward.chance !== undefined` and checks the NPC_DAY card in scoutWarlordNpcDay; scoutshots.mjs did not, and its still and its tour ended in FAILED lines (take0, refit ...).
// This module is what scoutshots.mjs shares with the test (tests/polish5.warlordsetup.test.ts): the detection, the card's geometry rule (touchcheck's own) and the set-up path. Pure but for the page it is given and the
// three functions of `io`: `region(id)` (the UI region's CENTRE and size in CSS px, as scoutshots' region(): or null), `tap(x, y)` (a real tap, then a frame) and `steps(n)` (n frames of the game's clock).

/** NPC_DAY's reward carries its drop chance (road.ts warlordReward); 0.9.7's has none. In the page. */
export const isNpcDayCard = (page) => page.evaluate(() => window.bb.game.screen.warlord?.reward?.chance !== undefined);

/** A UI region as scoutshots' region() returns it (the centre and the size) -> the top-left rect; null stays null. */
export const rectOf = (q) => (q ? { x: q.x - q.w / 2, y: q.y - q.h / 2, w: q.w, h: q.h } : null);

const overlaps = (a, b) => !!a && !!b && a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5; // touchcheck.mjs's own (:1990): 0.5 CSS px of slack

/**
 * touchcheck.mjs scoutWarlordNpcDay's rule for the NPC_DAY card (:2171-2173), the same conditions: VIEW BATTLEFIELD (`vf`) lies under the drop card (the card's foot is 96 logical px under the card's top, `card.y`) by at least
 * 10 logical px and ends at or above ON TO THE ROAD (`road`; 0.5 CSS px of slack), and the two do not overlap. Rects are top-left, in CSS px; `k` is the CSS px a logical px (view.scale / view.dpr).
 * Returns { ok, gap } with `gap` in logical px under the drop card (-1 when a rect is missing).
 */
export function betweenDropAndRoad({ vf, road, card, k }) {
  if (!vf || !road || !card) return { ok: false, gap: -1 };
  const gap = (vf.y - (card.y + 96 * k)) / k;
  return { ok: vf.y + vf.h <= road.y + 0.5 && gap * k >= 10 * k - 0.5 && !overlaps(vf, road), gap };
}

/**
 * From the Hard warlord's result card to the build screen (REFIT), the way a player goes: with NPC_DAY on, ON TO THE ROAD, the day's road event (the first choice that resolves: choice0..2; the road may skip the event when it was
 * already picked), REFIT; else (the 0.9.7 card) the part pick `take0`, then REFIT. Returns { how, problems } (never throws on a missing region: the caller logs each problem as a FAILED line, as the old inline set-up did).
 */
export async function toTheBuildScreen(page, io) {
  const problems = [];
  const screen = () => page.evaluate(() => window.bb.screen());
  if (!(await isNpcDayCard(page))) {
    for (const id of ["take0", "refit"]) {
      const q = await io.region(id);
      if (q) await io.tap(q.x, q.y);
      else problems.push(`the set-up's ${id}`);
      await io.steps(60);
    }
    return { how: "the part pick (take0), then REFIT", problems };
  }
  const road = await io.region("toroad");
  if (!road) return { how: "NPC_DAY card: ON TO THE ROAD is not there", problems: ["the set-up's toroad"] };
  await io.tap(road.x, road.y);
  await io.steps(60);
  let how = "NPC_DAY card: ON TO THE ROAD";
  if ((await screen()) === "event") {
    let picked = -1;
    for (let i = 0; i < 3 && picked < 0; i++) {
      const q = await io.region(`choice${i}`);
      if (!q) continue;
      await io.tap(q.x, q.y);
      await io.steps(40);
      if (await page.evaluate(() => window.bb.game.screen.phase === "result")) picked = i;
    }
    if (picked < 0) return { how: `${how}, the day's event: no choice resolved`, problems: ["the set-up's event choice"] };
    for (let f = 0; f < 6 && !(await page.evaluate(() => window.bb.game.screen.pt > 0.7)); f++) await io.steps(20); // the result's beat: a REFIT tap sent as the button appears can be lost (touchcheck foeCardSteps)
    const refit = await io.region("refit");
    if (!refit) return { how: `${how}, the day's event (choice ${picked + 1}): REFIT is not there`, problems: ["the set-up's refit"] };
    await io.tap(refit.x, refit.y);
    await io.steps(60);
    how += `, the day's event (choice ${picked + 1}), REFIT`;
  } else how += ", the day's event was already picked: REFIT";
  return { how, problems };
}
