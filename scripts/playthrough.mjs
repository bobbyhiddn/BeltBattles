// Scripted run with real input (mouse on desk, touch taps on phones). UI targets are found
// through window.bb.regions(); deck cells through the build screen's dragPlan().

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function settle(page, screen, timeout = 20000) {
  await page.waitForFunction((s) => window.bb.screen() === s && !window.bb.game.transitioning, screen, { timeout });
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

export async function scriptedRun(page, touch, log) {
  const t0 = Date.now();
  const at = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;
  await tapRegion(page, touch, "new");
  await settle(page, "hero");
  log(`[${at()}] NEW RUN -> hero select`);
  await tapRegion(page, touch, "go");
  await settle(page, "build");
  await page.waitForFunction(() => window.bb.game.screen.caravan.ready, null, { timeout: 10000 });
  const before = await page.evaluate(() => ({ gold: window.bb.game.run.gold, items: window.bb.game.run.build.items.length, hero: window.bb.game.run.hero }));
  log(`[${at()}] COMMAND -> build screen (${before.hero}, ${before.gold} gold, ${before.items} deck item)`);

  // buy + place: drag a card onto its belt tile (mouse) or tap card, then tap tile (touch)
  const plan = await page.evaluate(() => {
    const p = window.bb.game.screen.dragPlan();
    return p && { a: window.bb.toClient(p.from.x, p.from.y), b: window.bb.toClient(p.to.x, p.to.y), def: p.def };
  });
  if (!plan) throw new Error("no affordable gate card to place");
  if (touch) {
    await press(page, true, plan.a);
    const sel = await page.evaluate(() => window.bb.game.screen.sel.kind);
    log(`[${at()}] tap card ${plan.def} -> selected (${sel}), ghost shown on the suggested belt tile`);
    await press(page, true, plan.b);
  } else {
    await page.mouse.move(plan.a.x, plan.a.y);
    await page.mouse.down();
    await page.mouse.move(plan.b.x, plan.b.y, { steps: 12 });
    await sleep(150);
    const carrying = await page.evaluate(() => !!window.bb.game.screen.ed.carry);
    log(`[${at()}] drag card ${plan.def} over the deck (carrying: ${carrying})`);
    await page.mouse.up();
  }
  await page.waitForFunction((n) => window.bb.game.run.build.items.length === n + 1, before.items, { timeout: 5000 });
  const after = await page.evaluate(() => {
    const run = window.bb.game.run;
    const p = run.build.items[run.build.items.length - 1];
    return { gold: run.gold, def: p.def, x: p.x, y: p.y, cue: window.bb.game.screen.placedOnce };
  });
  log(`[${at()}] BUY + PLACE: ${after.def} at deck cell (${after.x},${after.y}), gold ${before.gold} -> ${after.gold}, FIGHT cue: ${after.cue}`);

  // round 1: a real battle at 4x to the end
  await tapRegion(page, touch, "fight");
  await settle(page, "battle");
  log(`[${at()}] FIGHT -> battle`);
  await tapRegion(page, touch, "sp2");
  log(`[${at()}] speed 4X`);
  await page.waitForFunction(() => window.bb.game.screen.phase === "result", null, { timeout: 90000 });
  const r1 = await page.evaluate(() => {
    const run = window.bb.game.run, h = run.history[run.history.length - 1];
    return { outcome: h.outcome, time: h.time.toFixed(1), income: h.income, wins: run.wins, losses: run.losses };
  });
  log(`[${at()}] BATTLE END -> round summary card: ${r1.outcome.toUpperCase()} in ${r1.time}s sim, income +${r1.income}G (${r1.wins}W ${r1.losses}L)`);

  // continue until the run ends: FIGHT -> SKIP -> next
  for (let round = 2; round <= 14; round++) {
    await tapRegion(page, touch, "next");
    await page.waitForFunction(() => ["build", "summary"].includes(window.bb.screen()) && !window.bb.game.transitioning, null, { timeout: 20000 });
    if ((await page.evaluate(() => window.bb.screen())) === "summary") break;
    await page.waitForFunction(() => window.bb.game.screen.caravan.ready, null, { timeout: 10000 });
    await tapRegion(page, touch, "fight");
    await settle(page, "battle");
    await tapRegion(page, touch, "skip");
    await page.waitForFunction(() => window.bb.game.screen.phase === "result", null, { timeout: 30000 });
    const r = await page.evaluate(() => {
      const run = window.bb.game.run, h = run.history[run.history.length - 1];
      return { round: h.round, outcome: h.outcome, time: h.time.toFixed(1), wins: run.wins, losses: run.losses };
    });
    log(`[${at()}] round ${r.round}: FIGHT -> SKIP -> ${r.outcome.toUpperCase()} (${r.time}s sim) -> ${r.wins}W ${r.losses}L`);
  }
  await settle(page, "summary");
  const s = await page.evaluate(() => ({ over: window.bb.game.run.over, wins: window.bb.game.run.wins, losses: window.bb.game.run.losses }));
  log(`[${at()}] RUN SUMMARY screen: run ${s.over}, ${s.wins} wins, ${s.losses} losses`);
}
