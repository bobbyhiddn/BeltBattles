// Scripted run with real input (mouse on desk, touch taps on phones). UI targets are found
// through window.bb.regions(); deck cells through the build screen's dragPlan(). 0.5.0: every
// FIGHT may lead to a road event; the run picks event choices with real taps, uses REFIT once
// (placing the salvaged part), and fights on to the run summary.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function settle(page, screen, timeout = 20000) {
  await page.waitForFunction((s) => window.bb.screen() === s && !window.bb.game.transitioning, screen, { timeout });
}

async function settleAny(page, screens, timeout = 20000) {
  await page.waitForFunction((s) => s.includes(window.bb.screen()) && !window.bb.game.transitioning, screens, { timeout });
  return page.evaluate(() => window.bb.screen());
}

async function regionCenter(page, id, timeout = 15000) {
  await page.waitForFunction((i) => window.bb.regions().some((r) => r.id === i), id, { timeout });
  return page.evaluate((i) => {
    const r = window.bb.regions().filter((q) => q.id === i).pop();
    return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  }, id);
}

async function press(page, touch, p) {
  if (touch) await page.touchscreen.tap(p.x, p.y);
  else await page.mouse.click(p.x, p.y);
  await sleep(120);
}

async function tapRegion(page, touch, id) {
  await press(page, touch, await regionCenter(page, id));
}

/** Drag (mouse) or tap-select + tap-place (touch) the build screen's planned part onto its belt tile. */
async function placePlanned(page, touch, log, at, what) {
  const plan = await page.evaluate(() => {
    const p = window.bb.game.screen.dragPlan();
    return p && { a: window.bb.toClient(p.from.x, p.from.y), b: window.bb.toClient(p.to.x, p.to.y), def: p.def };
  });
  if (!plan) throw new Error(`no ${what} to place`);
  const n0 = await page.evaluate(() => window.bb.game.run.build.items.length);
  if (touch) {
    await press(page, true, plan.a);
    const sel = await page.evaluate(() => window.bb.game.screen.sel.kind);
    log(`[${at()}] tap ${what} ${plan.def} -> selected (${sel}), ghost shown on the suggested belt tile`);
    await press(page, true, plan.b);
  } else {
    await page.mouse.move(plan.a.x, plan.a.y);
    await page.mouse.down();
    await page.mouse.move(plan.b.x, plan.b.y, { steps: 12 });
    await sleep(150);
    const carrying = await page.evaluate(() => !!window.bb.game.screen.ed.carry);
    log(`[${at()}] drag ${what} ${plan.def} over the deck (carrying: ${carrying})`);
    await page.mouse.up();
  }
  await page.waitForFunction((n) => window.bb.game.run.build.items.length === n + 1, n0, { timeout: 5000 });
  return plan.def;
}

/** After FIGHT: a road event (pick with a real tap, maybe REFIT) or straight to the battle. */
async function road(page, touch, log, at, state) {
  const s = await settleAny(page, ["event", "battle"]);
  if (s === "battle") return log(`[${at()}] FIGHT -> quiet road -> battle`);
  const ev = await page.evaluate(() => {
    const sc = window.bb.game.screen, run = window.bb.game.run;
    return { id: run.event.id, round: run.round, gold: run.gold, choices: sc.choices.map((c) => ({ label: c.label, blocked: c.blocked || "", item: c.gain.some((d) => d.k === "item") })) };
  });
  log(`[${at()}] FIGHT -> EVENT ${ev.id} (round ${ev.round}, ${ev.gold} gold): ${ev.choices.map((c, i) => `${i + 1} ${c.label}${c.blocked ? ` [${c.blocked}]` : ""}`).join(" | ")}`);
  // prefer a part (to REFIT once), else the first open choice after it, else the last (always free)
  let pick = state.refitDone ? -1 : ev.choices.findIndex((c) => c.item && !c.blocked);
  if (pick < 0) pick = ev.choices.findIndex((c, i) => i >= (ev.round % 2) && !c.blocked);
  if (pick < 0) pick = ev.choices.length - 1;
  await tapRegion(page, touch, `choice${pick}`);
  const after = await page.evaluate(() => ({ picked: window.bb.game.run.event.picked, gold: window.bb.game.run.gold, cargo: window.bb.game.run.inventory.length, item: window.bb.game.screen.deckItem || "" }));
  state.picks++;
  log(`[${at()}] picked ${pick + 1} ${ev.choices[pick].label} -> resolved (picked ${after.picked}), gold ${after.gold}, cargo ${after.cargo}${after.item ? `, part ${after.item} -> REFIT / FIGHT NOW offered` : ""}`);
  if (after.item) {
    await page.waitForFunction(() => window.bb.game.screen.pt > 0.7, null, { timeout: 5000 }); // outcome panel settled
    if (!state.refitDone) {
      await tapRegion(page, touch, "refit");
      await settle(page, "build");
      const refit = await page.evaluate(() => ({ refit: window.bb.game.screen.refit, offers: window.bb.regions().filter((r) => r.id === "reroll").length }));
      log(`[${at()}] REFIT -> build screen in refit mode: ${refit.refit}, caravan gone (reroll regions: ${refit.offers})`);
      const def = await placePlanned(page, touch, log, at, "cargo part");
      log(`[${at()}] placed ${def} from cargo`);
      state.refitDone = true;
      await tapRegion(page, touch, "fight");
      await settle(page, "battle");
      return log(`[${at()}] FIGHT (refit) -> battle`);
    }
    await tapRegion(page, touch, "fightnow");
  }
  await settle(page, "battle");
  log(`[${at()}] -> battle`);
}

export async function scriptedRun(page, touch, log) {
  const t0 = Date.now();
  const at = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;
  const state = { refitDone: false, picks: 0 };
  await tapRegion(page, touch, "new");
  await settle(page, "hero");
  log(`[${at()}] NEW RUN -> hero select`);
  await tapRegion(page, touch, "go");
  await settle(page, "build");
  await page.waitForFunction(() => window.bb.game.screen.caravan.ready, null, { timeout: 10000 });
  const before = await page.evaluate(() => ({ gold: window.bb.game.run.gold, items: window.bb.game.run.build.items.length, hero: window.bb.game.run.hero, seed: window.bb.game.run.seed }));
  log(`[${at()}] COMMAND -> build screen (${before.hero}, seed ${before.seed}, ${before.gold} gold, ${before.items} deck item)`);
  const def = await placePlanned(page, touch, log, at, "card");
  const after = await page.evaluate(() => {
    const run = window.bb.game.run;
    const p = run.build.items[run.build.items.length - 1];
    return { gold: run.gold, x: p.x, y: p.y, cue: window.bb.game.screen.placedOnce };
  });
  log(`[${at()}] BUY + PLACE: ${def} at deck cell (${after.x},${after.y}), gold ${before.gold} -> ${after.gold}, FIGHT cue: ${after.cue}`);

  // round 1: road event, then a real battle at 4x to the end
  await tapRegion(page, touch, "fight");
  await road(page, touch, log, at, state);
  await tapRegion(page, touch, "sp2");
  log(`[${at()}] speed 4X`);
  await page.waitForFunction(() => window.bb.game.screen.phase === "result", null, { timeout: 90000 });
  const r1 = await page.evaluate(() => {
    const run = window.bb.game.run, h = run.history[run.history.length - 1];
    return { outcome: h.outcome, time: h.time.toFixed(1), income: h.income, bounty: h.bounty || 0, wins: run.wins, losses: run.losses };
  });
  log(`[${at()}] BATTLE END -> round summary card: ${r1.outcome.toUpperCase()} in ${r1.time}s sim, income +${r1.income}G${r1.bounty ? ` bounty +${r1.bounty}G` : ""} (${r1.wins}W ${r1.losses}L)`);

  // continue until the run ends: FIGHT -> (event) -> SKIP -> next
  for (let round = 2; round <= 14; round++) {
    await tapRegion(page, touch, "next");
    const s = await settleAny(page, ["build", "summary"]);
    if (s === "summary") break;
    await page.waitForFunction(() => window.bb.game.screen.caravan.ready, null, { timeout: 10000 });
    await tapRegion(page, touch, "fight");
    await road(page, touch, log, at, state);
    await tapRegion(page, touch, "skip");
    await page.waitForFunction(() => window.bb.game.screen.phase === "result", null, { timeout: 30000 });
    const r = await page.evaluate(() => {
      const run = window.bb.game.run, h = run.history[run.history.length - 1];
      return { round: h.round, outcome: h.outcome, time: h.time.toFixed(1), bounty: h.bounty || 0, wins: run.wins, losses: run.losses };
    });
    log(`[${at()}] round ${r.round}: SKIP -> ${r.outcome.toUpperCase()} (${r.time}s sim)${r.bounty ? ` bounty +${r.bounty}G` : ""} -> ${r.wins}W ${r.losses}L`);
  }
  await settle(page, "summary");
  const s = await page.evaluate(() => ({ over: window.bb.game.run.over, wins: window.bb.game.run.wins, losses: window.bb.game.run.losses, events: window.bb.game.run.events.map((e) => `${e.id}:${e.choice}`) }));
  log(`[${at()}] RUN SUMMARY screen: run ${s.over}, ${s.wins} wins, ${s.losses} losses; road events taken: ${s.events.join(", ")}`);
  log(`[${at()}] checks: event choices picked ${state.picks} (>= 1: ${state.picks >= 1}), REFIT used: ${state.refitDone}`);
  if (state.picks < 1 || !state.refitDone) throw new Error("scripted run did not pick an event choice and use REFIT");
}
