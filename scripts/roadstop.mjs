// 0.6.0b road fork for the scripted run (playthrough.mjs): FIGHT at dawn -> the ROAD FORK (a real
// click; on touch a first tap inspects and a second tap picks) -> the road event (playthrough's
// road()) or a WARLORD fight (SKIP, its result card, the Hard part pick, REFIT once or FIGHT NOW /
// ON TO DUSK). With reloadMid the page reloads in the middle of the warlord fight and CONTINUE
// must replay the same fight (same captain, same stored deck, from 0:00).

import { placePlanned, pressFight, road, settle, sleep, tapRegion } from "./playthrough.mjs";

const PICKS = ["v", "e", "m", "h"];
const LABEL = { v: "ROAD EVENT", e: "EASY", m: "MEDIUM", h: "HARD" };

const warlordNow = (page) => page.evaluate(() => {
  const run = window.bb.game.run, w = run.warlord;
  return w && {
    day: w.day, id: w.id, name: w.name, tier: w.tier, hull: w.build.hullBonus, cost: window.bb.deckCost(w.build),
    budget: window.bb.maxGoldByDay(w.day), sabotaged: w.sabotaged, bounty: w.bounty, reward: w.reward,
    build: JSON.stringify(w.build), lives: run.lives, gold: run.gold, done: !!w.result,
  };
});

async function reloadMidWarlord(page, touch, log, at, state, before) {
  await pressFight(page, touch); // SCOUT-1 (REQ-BFG-076): FIGHT after scouting, then the reload mid-fight
  await page.waitForFunction(() => window.bb.game.screen.phase === "fight", null, { timeout: 15000 });
  await sleep(900);
  const t = await page.evaluate(() => window.bb.game.screen.arena.b.t);
  await page.reload();
  await page.waitForFunction(() => !!window.bb && window.bb.screen() === "title", null, { timeout: 15000 });
  const sub = await page.evaluate(() => window.bb.game.screen.save && { day: window.bb.game.screen.save.day, stage: window.bb.game.screen.save.stage });
  log(`[${at()}] RELOAD mid-warlord (sim at ${t.toFixed(2)}s) -> title, CONTINUE offered (save: day ${sub && sub.day}, stage ${sub && sub.stage})`);
  await tapRegion(page, touch, "cont");
  await settle(page, "warlord");
  const again = await warlordNow(page);
  const t2 = await page.evaluate(() => window.bb.game.screen.arena.b.t);
  const same = !!again && again.name === before.name && again.build === before.build && again.day === before.day && !again.done;
  state.reloadWarlordSame = same;
  log(`[${at()}] CONTINUE -> the warlord fight again: ${again && again.name}, same captain + stored deck + day: ${same}, replaying from ${t2.toFixed(2)}s (battle seed = hashSeed(runSeed, "warlord", day))`);
  if (!same) throw new Error("the reload did not resume the same warlord fight");
}

/** The fork and today's road stop, ending at the dusk battle screen. */
export async function roadStop(page, touch, log, at, state, pick, reloadMid = false) {
  await settle(page, "fork");
  const f = await page.evaluate(() => window.bb.forkInfo());
  log(`[${at()}] FIGHT -> ROAD FORK · DAY ${f.day}: 1 EVENT ${f.event} | 2 EASY ${f.warlords.easy} | 3 MEDIUM ${f.warlords.medium} | 4 HARD ${f.warlords.hard}${f.matriarchBeatenOn ? ` (Matriarch beaten on day ${f.matriarchBeatenOn})` : ""}`);
  const i = PICKS.indexOf(pick);
  await tapRegion(page, touch, `fork${i}`);
  if (touch) {
    const sel = await page.evaluate(() => window.bb.game.screen.sel);
    log(`[${at()}] tap card ${i + 1} -> inspect (blurb + GO shown, sel ${sel}); tap again -> go`);
    await tapRegion(page, touch, `fork${i}`);
    state.tapPicks++;
  }
  state.forkPicks[pick] = (state.forkPicks[pick] || 0) + 1;
  if (pick === "v") {
    log(`[${at()}] road choice: ${i + 1} ROAD EVENT (${f.event})`);
    state.dayLog.push({ day: f.day, road: `EVENT ${f.event}` });
    return road(page, touch, log, at, state);
  }
  await settle(page, "warlord");
  const w = await warlordNow(page);
  if (w.id === "matriarch") state.matriarchDays.push(w.day);
  const rw = w.reward.legendary ? `+${w.reward.gold}G + LEGENDARY ${w.reward.parts.join("")}` : w.reward.parts.length ? `+${w.reward.gold}G + pick 1 of ${w.reward.parts.join(" / ")}` : `+${w.reward.gold}G`;
  log(`[${at()}] road choice: ${i + 1} ${LABEL[pick]} WARLORD ${w.name} (PvE deck rivalBuild: hullBonus ${w.hull}, deckCost ${w.cost} vs budget ${w.budget}${w.sabotaged ? ", SABOTAGED" : ""}); win pays ${rw}`);
  if (reloadMid) await reloadMidWarlord(page, touch, log, at, state, w);
  await page.waitForFunction(() => window.bb.game.screen.phase === "fight" || window.bb.game.screen.phase === "intro", null, { timeout: 15000 });
  await tapRegion(page, touch, "skip");
  await page.waitForFunction(() => window.bb.game.screen.phase === "result", null, { timeout: 90000 });
  await sleep(450);
  const r = await page.evaluate(() => {
    const run = window.bb.game.run, x = run.warlord.result;
    return { outcome: x.outcome, time: x.time.toFixed(1), gold: x.gold, bountyPaid: x.bountyPaid, parts: x.parts, took: x.took, lives: run.lives, goldNow: run.gold };
  });
  if (w.bounty) {
    // 0.6.0c: HERALD's stake rides on this Hard warlord (run.bounty is taken when the fight starts)
    state.bountyLog = r.outcome === "win"
      ? `PAID +${r.bountyPaid}G on day ${w.day} vs ${w.name} (win ${r.gold}G = reward ${r.gold - r.bountyPaid} + bounty ${r.bountyPaid}; staked on day ${state.took.herald})`
      : `LOST on day ${w.day} vs ${w.name} (${r.outcome}: the +${w.bounty}G bounty is gone; staked on day ${state.took.herald})`;
    log(`[${at()}] ELITE BOUNTY ${state.bountyLog}`);
  }
  const livesSame = r.lives === w.lives;
  if (!livesSame) state.livesChanged.push(`day ${w.day}`);
  if (r.outcome !== "win") state.warlordLosses.push(`day ${w.day} ${w.name}: lives ${w.lives} -> ${r.lives}`);
  log(`[${at()}] WARLORD RESULT: ${r.outcome.toUpperCase()} vs ${w.name} (${r.time}s sim), lives ${w.lives} -> ${r.lives} (${livesSame ? "unchanged" : "CHANGED"}), reward ${r.outcome === "win" ? `+${r.gold}G` : "forfeit (0G)"}${r.took ? `, LEGENDARY ${r.took} in cargo` : ""}, gold ${w.gold} -> ${r.goldNow}`);
  let part = r.took;
  if (r.outcome === "win" && r.parts.length && !r.took) {
    await tapRegion(page, touch, "take0");
    part = await page.evaluate(() => window.bb.game.run.warlord.result.took);
    log(`[${at()}] HARD PICK: took ${part} (offered ${r.parts.join(" / ")}) -> cargo; REFIT / FIGHT NOW`);
  }
  state.dayLog.push({ day: w.day, road: `${LABEL[pick]} ${w.name} ${r.outcome}${r.outcome === "win" ? ` +${r.gold}G${part ? ` + ${part}` : ""}` : " (no life lost)"}` });
  if (part) {
    if (!state.warlordRefit) {
      await tapRegion(page, touch, "refit");
      await settle(page, "build");
      const def = await placePlanned(page, touch);
      log(`[${at()}] REFIT -> ${def ? `placed ${def} from cargo` : `${part} stays in cargo (no belt tile planned for it)`} -> FIGHT`);
      state.warlordRefit = true;
      await tapRegion(page, touch, "fight");
      await settle(page, "battle");
      return;
    }
    await tapRegion(page, touch, "fightnow");
  } else await tapRegion(page, touch, "next");
  await settle(page, "battle");
  log(`[${at()}] -> DUSK`);
}
