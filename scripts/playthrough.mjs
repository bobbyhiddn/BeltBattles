// Scripted 10-day run with real input (mouse on desk, touch taps on phones). UI targets are found
// through window.bb.regions(); deck cells through the build screen's dragPlan(). 0.6.0: each day is
// DAWN (buy + place with real drags/taps) -> the ROAD (an event picked with a real tap, REFIT once)
// -> DUSK vs the ghost from a pre-seeded local pool (or a stand-in). The run reloads the page once
// mid-battle, taps CONTINUE and checks it fights the same ghost; day 1 exercises 0.5X, II pause and
// 4X; later days SKIP. It plays on to the end screen (or stops after `days` days).

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
async function placePlanned(page, touch) {
  const plan = await page.evaluate(() => {
    const p = window.bb.game.screen.dragPlan();
    return p && { a: window.bb.toClient(p.from.x, p.from.y), b: window.bb.toClient(p.to.x, p.to.y), def: p.def };
  });
  if (!plan) return null;
  const n0 = await page.evaluate(() => window.bb.game.run.build.items.length);
  if (touch) {
    await press(page, true, plan.a);
    await press(page, true, plan.b);
  } else {
    await page.mouse.move(plan.a.x, plan.a.y);
    await page.mouse.down();
    await page.mouse.move(plan.b.x, plan.b.y, { steps: 12 });
    await sleep(150);
    await page.mouse.up();
  }
  await page.waitForFunction((n) => window.bb.game.run.build.items.length === n + 1, n0, { timeout: 5000 });
  return plan.def;
}

/** After FIGHT: a road event (pick with a real tap, maybe REFIT) or straight to the battle. */
async function road(page, touch, log, at, state) {
  const s = await settleAny(page, ["event", "battle"]);
  if (s === "battle") return log(`[${at()}] FIGHT -> quiet road -> DUSK`);
  const ev = await page.evaluate(() => {
    const sc = window.bb.game.screen, run = window.bb.game.run;
    return { id: run.event.id, day: run.day, gold: run.gold, choices: sc.choices.map((c) => ({ label: c.label, blocked: c.blocked || "", item: c.gain.some((d) => d.k === "item") })) };
  });
  log(`[${at()}] FIGHT -> ROAD EVENT ${ev.id} (day ${ev.day}, ${ev.gold} gold): ${ev.choices.map((c, i) => `${i + 1} ${c.label}${c.blocked ? ` [${c.blocked}]` : ""}`).join(" | ")}`);
  let pick = state.refitDone ? -1 : ev.choices.findIndex((c) => c.item && !c.blocked);
  if (pick < 0) pick = ev.choices.findIndex((c, i) => i >= (ev.day % 2) && !c.blocked);
  if (pick < 0) pick = ev.choices.length - 1;
  await tapRegion(page, touch, `choice${pick}`);
  const after = await page.evaluate(() => ({ picked: window.bb.game.run.event.picked, gold: window.bb.game.run.gold, item: window.bb.game.screen.deckItem || "" }));
  state.picks++;
  log(`[${at()}] picked ${pick + 1} ${ev.choices[pick].label} -> resolved (picked ${after.picked}), gold ${after.gold}${after.item ? `, part ${after.item} -> REFIT / FIGHT NOW` : ""}`);
  if (after.item) {
    await page.waitForFunction(() => window.bb.game.screen.pt > 0.7, null, { timeout: 5000 });
    if (!state.refitDone) {
      await tapRegion(page, touch, "refit");
      await settle(page, "build");
      const def = await placePlanned(page, touch);
      log(`[${at()}] REFIT -> placed ${def} from cargo -> FIGHT`);
      state.refitDone = true;
      await tapRegion(page, touch, "fight");
      await settle(page, "battle");
      return;
    }
    await tapRegion(page, touch, "fightnow");
  }
  await settle(page, "battle");
  log(`[${at()}] -> DUSK`);
}

const foeOf = (page) => page.evaluate(() => {
  const d = window.bb.game.run.dusk;
  return d && { day: d.day, kind: d.kind, name: d.name, build: JSON.stringify(d.build) };
});

/** Reload the page mid-battle, CONTINUE from the title, and check the same ghost comes back. */
async function reloadAndContinue(page, touch, log, at, state) {
  const before = await foeOf(page);
  await page.reload();
  await page.waitForFunction(() => !!window.bb && window.bb.screen() === "title", null, { timeout: 15000 });
  const sub = await page.evaluate(() => window.bb.game.screen.save && { day: window.bb.game.screen.save.day, stage: window.bb.game.screen.save.stage });
  log(`[${at()}] RELOAD mid-battle -> title, CONTINUE offered (save: day ${sub.day}, stage ${sub.stage})`);
  await tapRegion(page, touch, "cont");
  await settle(page, "build");
  const dawn = await page.evaluate(() => ({ foe: window.bb.game.screen.foe.name, refit: window.bb.game.screen.refit }));
  await tapRegion(page, touch, "fight");
  await road(page, touch, log, at, state);
  const again = await foeOf(page);
  const same = !!before && !!again && before.name === again.name && before.build === again.build && before.day === again.day;
  state.reloadSame = same;
  log(`[${at()}] CONTINUE -> refit build (refit ${dawn.refit}, NEXT BATTLE ${dawn.foe}) -> FIGHT -> dusk vs ${again.name}: same ghost as before the reload (name + build): ${same}`);
  if (!same) throw new Error("the reload did not keep the same dusk opponent");
}

export async function scriptedRun(page, touch, log, opts) {
  const t0 = Date.now();
  const at = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;
  const state = { refitDone: false, picks: 0, reloadSame: false, losses: [], ghosts: 0, standins: 0, placed: 0 };
  const n = await page.evaluate((pool) => { window.bb.clearPool(); return window.bb.addGhosts(pool); }, opts.pool);
  log(`[${at()}] ghost pool seeded with ${n} snapshots (earlier runs in this browser): ${opts.pool.map((g) => `day ${g.day} ${g.hero} ${g.wins}-${g.losses}${g.power > 0 ? " (strong)" : g.power < 0 ? " (under-built)" : ""}`).join(", ")}`);
  await tapRegion(page, touch, "new");
  await settle(page, "hero");
  await tapRegion(page, touch, "go");
  for (let day = 1; day <= 10; day++) {
    await settle(page, "build");
    await page.waitForFunction(() => window.bb.game.screen.caravan.ready, null, { timeout: 10000 });
    const dawn = await page.evaluate(() => {
      const run = window.bb.game.run, s = window.bb.game.screen;
      return { day: run.day, gold: run.gold, lives: run.lives, wl: `${run.wins}-${run.losses}`, foe: s.foe.name, kind: s.foe.kind, seed: run.seed };
    });
    log(`[${at()}] DAWN · DAY ${dawn.day}/10: ${dawn.gold} gold, ${dawn.lives} lives, W-L ${dawn.wl}; NEXT BATTLE ${dawn.foe} (${dawn.kind})${day === 1 ? `, seed ${dawn.seed}` : ""}`);
    const parts = [];
    for (let k = 0; k < 2; k++) {
      const def = await placePlanned(page, touch);
      if (!def) break;
      parts.push(def);
      state.placed++;
    }
    if (parts.length) log(`[${at()}] ${touch ? "tap-buy + tap-place" : "drag"}: ${parts.join(", ")}`);
    await tapRegion(page, touch, "fight");
    await road(page, touch, log, at, state);
    const foe = await foeOf(page);
    if (foe.kind === "ghost") state.ghosts++;
    else state.standins++;
    log(`[${at()}] DUSK · DAY ${foe.day}: vs ${foe.name} (${foe.kind === "ghost" ? "pool ghost" : "stand-in"}), same as the dawn preview: ${foe.name === dawn.foe}`);
    if (day === opts.reloadDay) await reloadAndContinue(page, touch, log, at, state);
    if (day === 1) {
      await page.waitForFunction(() => window.bb.game.screen.phase === "fight", null, { timeout: 15000 });
      await tapRegion(page, touch, "sp0");
      await sleep(600);
      await tapRegion(page, touch, "pause");
      const p = await page.evaluate(() => ({ paused: window.bb.game.screen.paused, t: window.bb.game.screen.arena.b.t }));
      await sleep(500);
      const still = await page.evaluate((t) => window.bb.game.screen.arena.b.t === t, p.t);
      await tapRegion(page, touch, "pause");
      const resumed = await page.evaluate(() => !window.bb.game.screen.paused);
      log(`[${at()}] playback: 0.5X, II -> paused ${p.paused} (sim held at ${p.t.toFixed(2)}s: ${still}), II -> resumed ${resumed}, then 4X`);
      await tapRegion(page, touch, "sp3");
    } else await tapRegion(page, touch, "skip");
    await page.waitForFunction(() => window.bb.game.screen.phase === "result", null, { timeout: 90000 });
    await page.waitForFunction(() => window.bb.regions().some((r) => r.id === "next"), null, { timeout: 5000 });
    const r = await page.evaluate(() => {
      const run = window.bb.game.run, h = run.history[run.history.length - 1];
      return { day: h.day, outcome: h.outcome, time: h.time.toFixed(1), income: h.income, lives: run.lives, wl: `${run.wins}-${run.losses}`, over: run.over };
    });
    if (r.outcome === "loss") state.losses.push(`day ${r.day}: ${dawn.lives} -> ${r.lives} lives`);
    log(`[${at()}] RESULT CARD: ${r.outcome === "win" ? "WIN" : r.outcome === "loss" ? "LOSS -1 LIFE" : "DRAW"} (${r.time}s sim), income +${r.income}G, lives ${r.lives}, W-L ${r.wl}${r.over ? `, run ${r.over}` : ""}`);
    if (r.over || day >= opts.days) break;
    await tapRegion(page, touch, "next");
  }
  const end = await page.evaluate(() => {
    const run = window.bb.game.run;
    return { over: run.over, day: run.day, wl: `${run.wins}-${run.losses}`, lives: run.lives, days: run.history.map((h) => `D${h.day} ${(run.events.find((e) => e.day === h.day) || { id: "quiet" }).id} / ${h.foe} / ${h.outcome}`) };
  });
  if (end.over) {
    await tapRegion(page, touch, "next");
    await settle(page, "summary");
    log(`[${at()}] END SCREEN: ${end.over === "complete" ? "RUN COMPLETE" : "RUN LOST"} on day ${end.day}, W-L ${end.wl}, ${end.lives} lives`);
  } else log(`[${at()}] stopped after day ${end.day - 1 || end.day} as planned (run continues), W-L ${end.wl}, ${end.lives} lives`);
  log(`[${at()}] days: ${end.days.join(" | ")}`);
  log(`[${at()}] checks: event picks ${state.picks}, REFIT ${state.refitDone}, dusk losses ${state.losses.join("; ") || "none"}, reload kept the ghost ${state.reloadSame}, pool ghosts met ${state.ghosts}, stand-ins ${state.standins}, parts placed ${state.placed}`);
  const days = end.days.length;
  if (state.picks < 1 || !state.losses.some((l) => l.includes("5 -> 4")) || !state.reloadSame || days < 3) throw new Error("scripted run missed a required step (event, 5 -> 4 loss, reload with the same ghost, 3+ days)");
  return { ...end, state };
}
