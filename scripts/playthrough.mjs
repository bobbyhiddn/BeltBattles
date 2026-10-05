// Scripted 10-day run with real input (mouse on desk, touch taps and drags on phones). UI targets are found
// through window.bb.regions(); deck cells through the build screen's dragPlan(). 0.6.0: each day is
// DAWN (buy + place with real drags/taps) -> the ROAD (an event picked with a real tap, REFIT once)
// -> DUSK vs the ghost from a pre-seeded local pool (or a stand-in). The run reloads the page once
// mid-battle, taps CONTINUE and checks it fights the same ghost; day 1 exercises 0.5X, II pause and
// 4X; later days SKIP. It plays on to the end screen (or stops after `days` days).

import { roadStop } from "./roadstop.mjs";

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function settle(page, screen, timeout = 20000) {
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

/** shoptap (BeltBattles 0.8.0 phone controls, D2): a touch drag with real touch events (CDP Input.dispatchTouchEvent):
 *  press at `a`, move to `b` in `steps` moves, hold, release. A touch tap only reads (it never buys or places), so on a
 *  phone a part goes where it goes by a drag, as a player's finger takes it there. */
export async function touchDrag(page, a, b, steps = 12) {
  const cdp = await page.context().newCDPSession(page);
  const tp = (p) => [{ x: p.x, y: p.y, id: 1, radiusX: 4, radiusY: 4, force: 1 }];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: tp(a) });
  for (let i = 1; i <= steps; i++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: tp({ x: a.x + ((b.x - a.x) * i) / steps, y: a.y + ((b.y - a.y) * i) / steps }) });
  }
  await sleep(150);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
  await sleep(120);
}

/** PACKS M2 (REQ-BFG-063): a fresh device meets the name screen at the title's first tap (NEW RUN, CONTINUE...). Type a
 *  name into its input and tap OK, as a player does; the tapped button then goes on. False when the screen is not up. */
export async function passName(page, touch, name = "TESTER") {
  if (!(await page.evaluate(() => !!window.bb.nameEntry?.()))) return false;
  await page.fill("#bb-name-input", name);
  if (touch) await page.tap("#bb-name-ok");
  else await page.click("#bb-name-ok");
  await page.waitForFunction(() => !window.bb.nameEntry(), null, { timeout: 5000 });
  await sleep(120);
  return true;
}

export async function tapRegion(page, touch, id) {
  if (!id.startsWith("runepick")) await takeDawnRune(page, touch); // RUNES-1: the dawn RUNE PICKER takes every tap first
  await press(page, touch, await regionCenter(page, id));
  await passName(page, touch); // PACKS M2: no name stored yet: the name screen first
}

/** RUNES-1 (REQ-BFG-058): while the dawn RUNE PICKER is up (a pick pending on the build screen at the caravan), take the
 *  first card: one tap opens it, a second takes it (src/screens/runePicker.ts regions runepick-<i>). False when no pick
 *  is pending. A run started before runes, or a run set up past day 1 by tooling, has none. */
export async function takeDawnRune(page, touch) {
  const up = await page.evaluate(() => {
    const g = window.bb.game, r = g.run;
    return !!r && !r.over && r.runeDay === r.day && r.stage === "caravan" && window.bb.screen() === "build" && !g.transitioning;
  });
  if (!up) return false;
  for (let k = 0; k < 2; k++) await press(page, touch, await regionCenter(page, "runepick-0"));
  await page.waitForFunction(() => window.bb.game.run.runeDay === undefined, null, { timeout: 5000 });
  await sleep(120);
  return true;
}

/** Drag the build screen's planned part onto its belt tile: the mouse, or (shoptap) a finger: until 0.8.0 a phone run
 *  tapped the card then the tile (tap-to-place), which a touch tap no longer does (it reads), so it drags as the mouse does.
 *  0.6.0c: `reserve` gold must be left after a shop buy (today's STAKE / SPY), else nothing is bought. */
export async function placePlanned(page, touch, reserve = 0) {
  const plan = await page.evaluate(() => {
    const s = window.bb.game.screen, run = window.bb.game.run, p = s.dragPlan();
    if (!p) return null;
    const prices = s.refit ? [] : run.shop.wagons.flatMap((w) => w.offers).filter((o) => !o.sold && o.def === p.def && o.price <= run.gold).map((o) => o.price);
    return { a: window.bb.toClient(p.from.x, p.from.y), b: window.bb.toClient(p.to.x, p.to.y), def: p.def, left: run.gold - Math.max(0, ...prices) };
  });
  if (!plan || plan.left < reserve) return null;
  // 0.6.1a: a bought copy whose twin is placed merges into it (ARSENAL.md §4.1 rule 5), so the deck
  // keeps its item count; the run's copy weight (sum of 2^(stars - 1) over deck, turrets and cargo)
  // grows by one instead. A move from cargo adds a deck item and keeps the weight.
  const count = () => {
    const run = window.bb.game.run, w = (l) => l.reduce((s, c) => s + 2 ** ((c.stars || 1) - 1), 0);
    return { items: run.build.items.length, weight: w(run.build.items) + w(run.build.mods) + w(run.inventory) };
  };
  const n0 = await page.evaluate(count);
  if (touch) {
    await touchDrag(page, plan.a, plan.b);
  } else {
    await page.mouse.move(plan.a.x, plan.a.y);
    await page.mouse.down();
    await page.mouse.move(plan.b.x, plan.b.y, { steps: 12 });
    await sleep(150);
    await page.mouse.up();
  }
  await page.waitForFunction((n) => {
    const run = window.bb.game.run, w = (l) => l.reduce((s, c) => s + 2 ** ((c.stars || 1) - 1), 0);
    return run.build.items.length === n.items + 1 || w(run.build.items) + w(run.build.mods) + w(run.inventory) === n.weight + 1;
  }, n0, { timeout: 5000 });
  const merged = (await page.evaluate(() => window.bb.game.run.build.items.length)) === n0.items;
  return merged ? `${plan.def} (merged)` : plan.def;
}

// FB-C: the desk run's dawn spends like a player. It bought at most 2 planned gates a dawn (8 on the
// bounty's day) and never rerolled, which left 36G unspent by day 9's dusk (deck 65 vs par 91,
// maxGoldByDay 105). Now it buys planned parts until none is affordable and placeable, then taps the
// caravan's REROLL (2G, or free) while that still leaves the reserve (today's STAKE / SPY) plus 3G for a
// part, at most 4 rerolls a dawn.
export async function rerollShop(page, touch, reserve = 0) {
  const r = await page.evaluate(() => ({ gold: window.bb.game.run.gold, free: window.bb.game.run.shop.free || 0, n: window.bb.game.run.shop.rerolls }));
  if (!r.free && r.gold - 2 < reserve + 3) return false;
  await clearSel(page);
  await tapRegion(page, touch, "reroll");
  await page.waitForFunction((n) => window.bb.game.run.shop.rerolls === n + 1 && window.bb.game.screen.caravan.ready, r.n, { timeout: 10000 });
  return true;
}

/** After FIGHT: a road event (pick with a real tap, maybe REFIT) or straight to the battle. */
export async function road(page, touch, log, at, state) {
  const s = await settleAny(page, ["event", "battle"]);
  if (s === "battle") return log(`[${at()}] FIGHT -> today's road stop is done -> DUSK`);
  const ev = await page.evaluate(() => {
    const sc = window.bb.game.screen, run = window.bb.game.run;
    return { id: run.event.id, day: run.day, gold: run.gold, choices: sc.choices.map((c) => ({ label: c.label, blocked: c.blocked || "", item: c.gain.some((d) => d.k === "item") })) };
  });
  log(`[${at()}] FIGHT -> ROAD EVENT ${ev.id} (day ${ev.day}, ${ev.gold} gold): ${ev.choices.map((c, i) => `${i + 1} ${c.label}${c.blocked ? ` [${c.blocked}]` : ""}`).join(" | ")}`);
  // 0.6.0c: the run's `take` list names a choice to take at an event (desk: HERALD's STAKE, SCOUT's SPY)
  const want = state.take[ev.id];
  let pick = want ? ev.choices.findIndex((c) => c.label === want[0] && !c.blocked) : -1;
  if (want) {
    if (pick >= 0) state.took[ev.id] = ev.day;
    else log(`[${at()}] ${want[0]} is not open at ${ev.id} (${(ev.choices.find((c) => c.label === want[0]) || { blocked: "missing" }).blocked})`);
  }
  if (pick < 0 && !state.refitDone) pick = ev.choices.findIndex((c) => c.item && !c.blocked);
  if (pick < 0) pick = ev.choices.findIndex((c, i) => i >= (ev.day % 2) && !c.blocked);
  if (pick < 0) pick = ev.choices.length - 1;
  await tapRegion(page, touch, `choice${pick}`);
  const after = await page.evaluate(() => ({ picked: window.bb.game.run.event.picked, gold: window.bb.game.run.gold, item: window.bb.game.screen.deckItem || "", reveal: !!window.bb.game.screen.reveal, bounty: window.bb.game.run.bounty, sabotage: window.bb.game.run.sabotage }));
  state.picks++;
  log(`[${at()}] picked ${pick + 1} ${ev.choices[pick].label} -> resolved (picked ${after.picked}), gold ${after.gold}${after.item ? `, part ${after.item} -> REFIT / FIGHT NOW` : ""}${after.bounty ? `, ELITE BOUNTY pending (+${after.bounty.pay} on the next Hard win)` : ""}${after.sabotage ? ", SABOTAGE pending (next warlord)" : ""}`);
  if (after.reveal) {
    // 0.6.0b SCOUT: the revealed deck is tonight's stored dusk foe; then FIGHT NOW (dusk must fight it)
    const spied = await page.evaluate(() => { const d = window.bb.game.run.dusk; return { name: d.name, build: JSON.stringify(d.build) }; });
    state.scouted = spied;
    log(`[${at()}] SCOUT REPORT: tonight's dusk is ${spied.name}; REFIT / FIGHT NOW -> FIGHT NOW`);
    await page.waitForFunction(() => window.bb.game.screen.pt > 0.7, null, { timeout: 5000 });
    await tapRegion(page, touch, "fightnow");
    await settle(page, "battle");
    return;
  }
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

// M3b: every dusk foe is logged with its hullBonus and deckCost against the day's gold budget
// STAGE-090 (cap's ruling eaf260a2a192acf6): the rune-aware rule of the unit tests (standin.honest, captains.luck;
// standins.ts boughtCost). Since FLIP-X2 a stand-in fights with its captain's runes, whose HULL and BELT sit on the build:
// `bought` is deckCost with the runes' hull and belt taken out (runeGrant(b, 0), as boughtCost), and the budget gains the
// runes' gold by the dusk (runeGrant(b, day).gold). A rune-less foe reads exactly as before (bought = cost, runeGold 0).
const foeOf = (page) => page.evaluate(() => {
  const d = window.bb.game.run.dusk;
  if (!d) return d;
  const g = window.bb.runeGrant(d.build, 0);
  return {
    day: d.day, kind: d.kind, name: d.name, hero: d.hero, build: JSON.stringify(d.build),
    hull: d.build.hullBonus, cost: window.bb.deckCost(d.build), budget: window.bb.maxGoldByDay(d.day),
    runes: (d.build.runes ?? []).length,
    bought: g.hull || g.belt ? window.bb.deckCost({ ...d.build, hullBonus: d.build.hullBonus - g.hull, beltCap: d.build.beltCap - g.belt }) : window.bb.deckCost(d.build),
    runeGold: window.bb.runeGrant(d.build, d.day).gold,
    mine: window.bb.deckCost(window.bb.game.run.build),
  };
});
const honestFoe = (f) => f.hull >= 0 && f.hull % 25 === 0 && f.bought <= f.budget + f.runeGold;
// STAGE-090: a rune-holding foe shows both numbers, a rune-less one reads as before
const costLine = (f) => (f.runes ? `deckCost ${f.cost} (bought ${f.bought}) of ${f.budget} + ${f.runeGold} rune gold` : `deckCost ${f.cost} of ${f.budget} gold`);
// 0.6.2 TUNE-C: a stand-in brings its captain's named build (standInBuild: the plan at ordinary luck, whole paid
// plating, at most the day's gold); 0.6.0d-0.6.2 it was a full-purse stand-in pool deck (>= ceil(0.9 x budget))
const foeLine = (f) => `${f.kind === "ghost" ? "pool ghost" : "stand-in"} ${f.hero}, hullBonus +${f.hull}, ${costLine(f)}: ${honestFoe(f) ? "honest" : "NOT HONEST"}${f.kind === "standin" ? `, ${f.name}'s named build` : ""}; your deck ${f.mine}`;

/** Reload the page mid-battle, CONTINUE from the title, and check the same ghost comes back. */
async function reloadAndContinue(page, touch, log, at, state) {
  const before = await foeOf(page);
  await page.reload();
  await page.waitForFunction(() => !!window.bb && window.bb.screen() === "title", null, { timeout: 15000 });
  const sub = await page.evaluate(() => window.bb.game.screen.save && { day: window.bb.game.screen.save.day, stage: window.bb.game.screen.save.stage });
  log(`[${at()}] RELOAD mid-battle -> title, CONTINUE offered (save: day ${sub.day}, stage ${sub.stage}); before the reload: ${before ? `${before.name} (${foeLine(before)})` : "no dusk foe stored"}`);
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

// 0.6.1r F2: the desk run's dusk loss, by construction. On `weakenDay`'s dawn, after its buys,
// every part the run gained goes TO CARGO through the inspector (click the part, click TO CARGO),
// so that dusk fights the bare starting deck. Against the pool's strong day-2 ghost that deck
// always loses (the FURNACE kiln alone vs kiln, temper, brake and longhaul lost 1005 of 1005
// battle seeds in 0.6.1r's check), whatever the shop rolled. The next dawn drags each part from
// cargo back to its cell before buying. Escape clears the selection first: a click on a deck cell
// while a cargo part is selected would drop that part there.
// beltside-062 (the merge brief): rig-aware. A rig is found and stored the same way (its panel has TO CARGO, beside
// ROTATE); the click that selects it also turns it (B2), which doesn't matter, because its rot is recorded first.
// Cargo keeps no rot, and a drop auto-aims (Decision 18), so the restore sets the recorded rot explicitly (a tap per
// quarter turn, B2) and checks cells, stars and rot.
const clearSel = (page) => page.keyboard.press("Escape").then(() => sleep(60));
const deckParts = (page, keep) => page.evaluate((keep) => {
  const s = window.bb.game.screen;
  return window.bb.game.run.build.items.filter((p) => !keep.includes(p.uid)).map((p) => {
    const c = s.fuseAnimPos({ where: "deck", survivor: p.uid }); // an existing build-screen helper: the part's centre
    // beltside-062: rot (absent = 0; only rigs carry one)
    return { uid: p.uid, def: p.def, stars: p.stars || 1, rot: p.rot || 0, cell: `${p.x},${p.y}`, at: window.bb.toClient(c.x, c.y) };
  });
}, keep);
const partName = (p) => `${p.def}${p.stars > 1 ? ` ★${p.stars}` : ""}${p.rot ? ` rot ${p.rot}` : ""} (${p.cell})`;
const rotNow = (page, uid) => page.evaluate((u) => window.bb.game.run.build.items.find((q) => q.uid === u)?.rot || 0, uid);

async function weakenDeck(page, touch, log, at, keep) {
  const parts = await deckParts(page, keep);
  for (const p of parts) {
    await clearSel(page);
    await press(page, touch, p.at); // a rig: selects it (and turns it; its rot is already recorded)
    await page.waitForFunction((u) => { const s = window.bb.game.screen.sel; return s.kind === "item" && s.uid === u; }, p.uid, { timeout: 5000 });
    await tapRegion(page, touch, "store");
    await page.waitForFunction((u) => window.bb.game.run.inventory.some((i) => i.uid === u), p.uid, { timeout: 5000 });
  }
  await clearSel(page);
  const left = await page.evaluate(() => ({ items: window.bb.game.run.build.items.map((p) => p.def), cost: window.bb.deckCost(window.bb.game.run.build) }));
  log(`[${at()}] WEAKEN (F2, the dusk loss by construction): TO CARGO ${parts.map(partName).join(", ") || "nothing"} -> deck ${left.items.join(", ")} (deckCost ${left.cost}), the bare starting deck`);
  return parts;
}

async function restoreDeck(page, touch, log, at, parts) {
  for (const p of parts) {
    await clearSel(page);
    const from = await page.evaluate((u) => {
      const s = window.bb.game.screen, i = window.bb.game.run.inventory.findIndex((it) => it.uid === u);
      if (i < 0 || i >= s.cargoSlots()) return null;
      const r = s.slotRect(i);
      return window.bb.toClient(r.x + r.w / 2, r.y + r.h / 2);
    }, p.uid);
    if (!from) throw new Error(`restore: ${partName(p)} is not in a visible cargo slot`);
    if (touch) {
      await touchDrag(page, from, p.at); // shoptap: a touch tap no longer places; a finger drags it back
    } else {
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await page.mouse.move(p.at.x, p.at.y, { steps: 12 });
      await sleep(150);
      await page.mouse.up();
    }
    await page.waitForFunction((u) => window.bb.game.run.build.items.some((q) => q.uid === u), p.uid, { timeout: 5000 });
    // beltside-062: the drop aimed the rig itself (Decision 18); tap it until it has the recorded rot again (an X rig
    // and a factory are always 0, so they take no tap). Each tap turns a placed rig a quarter turn clockwise. shoptap
    // (D2): a finger's tap turns only the rig already selected, so on touch the first tap selects it and the loop's taps
    // (no Escape between them) turn it
    let turns = 0;
    if (touch) {
      await clearSel(page);
      if ((await rotNow(page, p.uid)) !== p.rot) await press(page, true, p.at);
    }
    for (let rot = await rotNow(page, p.uid); rot !== p.rot; rot = await rotNow(page, p.uid)) {
      if (++turns > 3) throw new Error(`restore: ${partName(p)} did not turn back to rot ${p.rot} (stuck at ${rot})`);
      if (!touch) await clearSel(page);
      await press(page, touch, p.at);
      await page.waitForFunction(([u, r]) => (window.bb.game.run.build.items.find((q) => q.uid === u)?.rot || 0) !== r, [p.uid, rot], { timeout: 5000 });
    }
    p.turns = turns;
  }
  await clearSel(page);
  const back = await deckParts(page, []);
  const same = parts.every((p) => back.some((q) => q.uid === p.uid && q.cell === p.cell && q.stars === p.stars && q.rot === p.rot));
  const aimed = parts.filter((p) => p.turns).map((p) => `${p.def} ${p.turns}`).join(", ");
  log(`[${at()}] RESTORE: dragged ${parts.map(partName).join(", ") || "nothing"} from cargo back to the deck (same cells, stars and rot: ${same}; re-aimed by tap: ${aimed || "none needed"})`);
  if (!same) throw new Error("restore: a stored part did not come back to its cell, stars and rot");
}

export async function scriptedRun(page, touch, log, opts) {
  const t0 = Date.now();
  const at = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;
  const state = {
    refitDone: false, picks: 0, reloadSame: false, losses: [], ghosts: 0, standins: 0, placed: 0, foes: 0, dishonest: [],
    // 0.6.0b road fork
    forkPicks: {}, tapPicks: 0, warlordLosses: [], livesChanged: [], matriarchDays: [], reloadWarlordSame: false, warlordRefit: false, dayLog: [], spend: [],
    // 0.6.0c: choices to take ({ eventId: [label, gold] }), the days they were taken, the bounty's end, scout check
    take: opts.take || {}, took: {}, bountyLog: null, scoutFought: false,
    // 0.6.0d feel check: one row per day (foe, deckCost/budget, result, lives)
    feel: [],
  };
  const n = await page.evaluate((pool) => { window.bb.clearPool(); return window.bb.addGhosts(pool); }, opts.pool);
  log(`[${at()}] ghost pool seeded with ${n} snapshots (earlier runs in this browser): ${opts.pool.map((g) => `day ${g.day} ${g.hero} ${g.wins}-${g.losses}${g.power > 0 ? " (strong)" : g.power < 0 ? " (under-built)" : ""}`).join(", ") || "none (a fresh player: every dusk is a stand-in)"}`);
  await tapRegion(page, touch, "new");
  await settle(page, "hero");
  // 0.6.0d: opts.hero picks the cruiser with the hero screen's > button (FURNACE first, then WEAVER). 0.8.0 H1: the hero on
  // show is the screen's `current` (the roster, PLAYABLE_HEROES: FURNACE, WEAVER, FOUNDRY, BASTION); FURNACE and WEAVER take
  // the same taps as before
  for (let k = 0; opts.hero && k < 4 && (await page.evaluate(() => window.bb.game.screen.current)) !== opts.hero; k++) {
    await tapRegion(page, touch, "next");
  }
  await tapRegion(page, touch, "go");
  if (opts.hero) {
    await settle(page, "build");
    const hero = await page.evaluate(() => window.bb.game.run.hero);
    if (hero !== opts.hero) throw new Error(`hero select: got ${hero}, wanted ${opts.hero}`);
    log(`[${at()}] COMMAND ${hero.toUpperCase()} (picked on the hero screen); buys up to ${opts.buys || 2} parts a dawn`);
  }
  for (let day = 1; day <= 10; day++) {
    await settle(page, "build");
    await page.waitForFunction(() => window.bb.game.screen.caravan.ready, null, { timeout: 10000 });
    if (await takeDawnRune(page, touch)) state.runes = (state.runes ?? 0) + 1; // RUNES-1: the dawn pick, before the shop
    const dawn = await page.evaluate(() => {
      const run = window.bb.game.run, s = window.bb.game.screen;
      return { day: run.day, gold: run.gold, lives: run.lives, wl: `${run.wins}-${run.losses}`, foe: s.foe.name, kind: s.foe.kind, seed: run.seed, refund: run.refund ?? null };
    });
    log(`[${at()}] DAWN · DAY ${dawn.day}/10: ${dawn.gold} gold, ${dawn.lives} lives, W-L ${dawn.wl}; NEXT BATTLE ${dawn.foe} (${dawn.kind})${day === 1 ? `, seed ${dawn.seed}` : ""}`);
    // STAGE-090 (cap's ruling eaf260a2a192acf6): the desk run's forced day-2 loss earns the early-loss refund (day.ts
    // REFUND_DAY 3, REFUND_LIVES 1): day 3's dawn reads 5 lives, and run.refund is { day: 3, lives: 1 }
    if (opts.check === "desk" && day === 3) {
      state.refund3 = dawn.lives === 5 && dawn.refund?.day === 3 && dawn.refund?.lives === 1;
      log(`[${at()}] REFUND at dawn 3: ${dawn.lives} lives, run.refund ${JSON.stringify(dawn.refund)}: ${state.refund3 ? "as expected" : "NOT as expected"}`);
    }
    // 0.6.1r F2: the starting deck (kept aboard by weakenDeck), and yesterday's stored parts go back first
    if (day === 1) state.startUids = await page.evaluate(() => window.bb.game.run.build.items.map((p) => p.uid));
    if (state.stored && day === opts.weakenDay + 1) {
      await restoreDeck(page, touch, log, at, state.stored);
      state.stored = null;
    }
    const parts = [];
    // keep today's STAKE / SPY affordable when the road goes to that event
    const today = await page.evaluate(() => window.bb.forkInfo().event);
    const want = ((opts.roads || "")[day - 1] || "v") === "v" ? state.take[today] : null;
    const reserve = want ? want[1] : 0;
    // backing a stake: the dawn before the bounty's Hard warlord spends freely (else 2 gates a day)
    const backing = ((opts.roads || "")[day - 1] || "v") === "h" && !!state.took.herald && !state.bountyLog;
    // FB-C: the desk run spends like a player (rerollShop), except on the F2 weaken day (its dusk loss by
    // construction only needs the bare deck; what it buys goes to cargo anyway)
    const spend = opts.check === "desk" && day !== opts.weakenDay, gold0 = dawn.gold;
    let rerolls = 0;
    for (let k = 0; k < (spend ? 30 : backing ? 8 : opts.buys || 2); k++) {
      const def = await placePlanned(page, touch, reserve);
      if (!def && spend && rerolls < 4 && (await rerollShop(page, touch, reserve))) { rerolls++; continue; }
      if (!def) break;
      parts.push(def);
      state.placed++;
    }
    const spent = spend ? await page.evaluate((g) => ({ gold: window.bb.game.run.gold, deck: window.bb.deckCost(window.bb.game.run.build), spent: g - window.bb.game.run.gold }), gold0) : null;
    if (parts.length || reserve || backing) log(`[${at()}] ${touch ? "touch drag" : "drag"}: ${parts.join(", ") || "nothing"}${reserve ? ` (keeping ${reserve} gold for ${today}'s ${want[0]})` : ""}${backing ? " (backing the bounty: buying all it can)" : ""}${spent ? ` [FB-C spend: ${rerolls} reroll(s), gold ${gold0} -> ${spent.gold} (spent ${spent.spent}), deck ${spent.deck}]` : ""}`);
    if (day === opts.weakenDay) state.stored = await weakenDeck(page, touch, log, at, state.startUids);
    await tapRegion(page, touch, "fight");
    await roadStop(page, touch, log, at, state, (opts.roads || "")[day - 1] || "v", day === opts.reloadWarlordDay);
    const foe = await foeOf(page);
    if (foe.kind === "ghost") state.ghosts++;
    else state.standins++;
    state.foes++;
    state.spend.push(`day ${foe.day} ${foe.kind === "ghost" ? "pool ghost" : `stand-in ${foe.name}`} ${foe.cost}/${foe.budget}`);
    if (state.scouted) {
      const same = state.scouted.name === foe.name && state.scouted.build === foe.build;
      log(`[${at()}] dusk fights the scouted deck (name + build): ${same}`);
      if (!same) throw new Error("the dusk foe is not the deck SCOUT revealed");
      state.scoutFought = true;
      state.scouted = null;
    }
    if (!honestFoe(foe)) state.dishonest.push(`day ${foe.day}`);
    log(`[${at()}] DUSK · DAY ${foe.day}: vs ${foe.name} (${foeLine(foe)}), same as the dawn preview: ${foe.name === dawn.foe}`);
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
      return { day: h.day, outcome: h.outcome, time: h.time.toFixed(1), income: h.income, lives: run.lives, refund: h.refund ?? 0, wl: `${run.wins}-${run.losses}`, over: run.over };
    });
    // STAGE-090 (cap's ruling eaf260a2a192acf6): a loss is the lives that dusk left, before the dawn's refund (finishDay
    // gives the early-loss refund as day becomes 3, so run.lives already reads it on the result card): run.lives -
    // h.refund, the result card's own hearts (battleHud.ts)
    if (r.outcome === "loss") state.losses.push(`day ${r.day}: ${dawn.lives} -> ${r.lives - r.refund} lives${r.refund ? ` (+${r.refund} at dawn ${r.day + 1}: early-loss refund)` : ""}`);
    state.feel.push(`D${foe.day} ${foe.kind === "ghost" ? "ghost" : foe.name} (${foe.hero}) ${foe.cost}/${foe.budget}g vs yours ${foe.mine}g: ${r.outcome.toUpperCase()} ${r.time}s, ${r.lives} lives`);
    log(`[${at()}] RESULT CARD: ${r.outcome === "win" ? "WIN" : r.outcome === "loss" ? "LOSS -1 LIFE" : "DRAW"} (${r.time}s sim), income +${r.income}G, lives ${r.lives}, W-L ${r.wl}${r.over ? `, run ${r.over}` : ""}`);
    if (r.over || (day >= opts.days && (!opts.untilLoss || state.losses.length))) break;
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
  log(`[${at()}] checks: event picks ${state.picks}, REFIT ${state.refitDone}, dusk losses ${state.losses.join("; ") || "none"}, reload kept the ghost ${state.reloadSame}, pool ghosts met ${state.ghosts}, stand-ins ${state.standins}, parts placed ${state.placed}, honest dusk decks ${state.foes - state.dishonest.length}/${state.foes}${state.dishonest.length ? ` (NOT HONEST: ${state.dishonest.join(", ")})` : ""}`);
  const days = end.days.length;
  const fp = state.forkPicks;
  log(`[${at()}] road: ${state.dayLog.map((d) => `D${d.day} ${d.road}`).join(" | ")}`);
  log(`[${at()}] fork picks: event ${fp.v || 0}, easy ${fp.e || 0}, medium ${fp.m || 0}, hard ${fp.h || 0} (by tap: ${state.tapPicks}); warlord losses ${state.warlordLosses.join("; ") || "none"}; lives changed by a warlord: ${state.livesChanged.join(", ") || "never"}; Matriarch met on day(s) ${state.matriarchDays.join(", ") || "-"}; reload mid-warlord kept the fight: ${state.reloadWarlordSame}`);
  log(`[${at()}] dusk spend (deckCost/budget): ${state.spend.join(" | ")}`);
  if (opts.check === "fresh") {
    // 0.6.0d feel check (logged, not pass/fail): never throws on the outcome
    log(`[${at()}] FEEL ${String(opts.hero || "furnace").toUpperCase()} (empty pool, every dusk a stand-in): ${end.over === "complete" ? "RUN COMPLETE" : end.over === "lost" ? `RUN LOST on day ${end.day}` : "stopped"}, W-L ${end.wl}, ${end.lives} lives`);
    for (const row of state.feel) log(`  ${row}`);
  }
  const sis = await page.evaluate(() => window.bb.standInSpend(window.bb.game.run.seed));
  log(`[${at()}] this run's stand-in captain per day (used when no pool ghost matches; 0.6.2 TUNE-C: the captain's named build, standInBuild, deckCost/budget): ${sis.map((s) => `D${s.day} ${s.name} +${s.hull} ${s.cost}/${s.budget}${s.pool ? " (stand-in pool deck)" : ""}`).join(" | ")}`);
  if (state.livesChanged.length) throw new Error(`a warlord fight changed lives (${state.livesChanged.join(", ")})`);
  if (days < 3) throw new Error("scripted run played fewer than 3 days");
  if (opts.check === "desk" && (["v", "e", "m", "h"].some((k) => (fp[k] || 0) < 2) || !state.warlordLosses.length || !state.matriarchDays.includes(8) || days < 10)) {
    throw new Error("desk run missed a required step (each tier twice, an event twice, a warlord loss, the Matriarch on day 8, 10 days)");
  }
  if (opts.check === "desk") {
    // 0.6.0c: the 0.6.0a throws are back (a dusk loss from 5 to 4 lives; CONTINUE after the dusk
    // reload meets the same ghost), and the takes: HERALD's STAKE paid out or lost on the next Hard
    // warlord, SCOUT's SPY followed by a dusk against the scouted deck
    const took = Object.entries(state.took).map(([id, d]) => `${id} ${state.take[id][0]} on day ${d}`);
    log(`[${at()}] takes: ${took.join(", ") || "none"}; bounty: ${state.bountyLog || "-"}; dusk fought the scouted deck: ${state.scoutFought}; dusk lost 5 -> 4: ${state.losses.some((l) => l.includes("5 -> 4"))}; dusk reload kept the ghost: ${state.reloadSame}`);
    if (!state.losses.some((l) => l.includes("5 -> 4"))) throw new Error("desk run never lost a dusk fight from 5 to 4 lives");
    if (!state.refund3) throw new Error("desk run: day 3's dawn did not read 5 lives with run.refund { day: 3, lives: 1 }"); // STAGE-090
    if (!state.reloadSame) throw new Error("desk run: CONTINUE after the dusk reload did not meet the same ghost");
    for (const id of Object.keys(state.take)) if (!state.took[id]) throw new Error(`desk run did not take ${id}'s ${state.take[id][0]}`);
    if (state.took.herald && !state.bountyLog) throw new Error("desk run: the staked bounty never met a Hard warlord");
    if (state.took.scout && !state.scoutFought) throw new Error("desk run: dusk never fought the scouted deck");
  }
  if (opts.check === "phone" && (state.tapPicks < 1 || !state.reloadWarlordSame)) throw new Error("phone run missed a required step (a fork pick by tap, a reload mid-warlord with the same fight)");
  if (state.dishonest.length) throw new Error(`a dusk foe was not an honest deck (${state.dishonest.join(", ")})`);
  return { ...end, state };
}
