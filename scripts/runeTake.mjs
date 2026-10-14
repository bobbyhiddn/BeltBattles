// CARD-4 (REQ-BFG-081, P): the one scripted rune take. Since CARD-4 only an opened rune card's TAP AGAIN TO TAKE IT bar
// takes its rune: the bar's own region (runepick-take on the dawn picker's opened card, lcrune-take on LAST CHANCE's RUNE
// card), never within TAKE_GUARD_S (0.35 s, the game's clock or the wall's) of the card opening (P2), and while a note
// that opened by itself (K1's first sight) is up, the next press only closes it (P3). A press on the opened card's body
// takes nothing (P1). Every script that takes a dawn rune or LAST CHANCE's RUNE card calls takeRuneCard with its own
// press, so each take is a player's: open the card, wait past the guard, press the bar's centre, and see the take land.
// The PART and HULL cards of LAST CHANCE are as before (a second tap on the open card takes it): not this helper's.

/** At least this much wall time between the open and the take press (the guard is 350 ms). */
export const GUARD_WAIT_MS = 400;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Region `id` as the page's tooling reports it (bb.regions(): client CSS px; the last one drawn is the one on top). */
const regionOf = (page, id) => page.evaluate((i) => window.bb.regions().filter((q) => q.id === i).pop() ?? null, id);
const centre = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

/** The picker's state and the run's, read in the page (no tooling hook). */
const pickState = (page, lc) => page.evaluate((lc) => {
  const g = window.bb.game, s = g.screen, run = g.run;
  const p = lc ? s?.lastChancePicker : s?.runePicker;
  return {
    screen: window.bb.screen(),
    open: p ? p.open : null,
    note: p && p.auto && p.word ? p.word : null, // a note that opened by itself (P3: the next press only closes it)
    day: run?.day ?? null,
    runeDay: run?.runeDay ?? null,
    boon: run?.lastChance?.boon ?? null,
    held: (run?.build?.runes ?? []).map((q) => q.id),
  };
}, lc);

/**
 * Take a rune with the caller's own press: `press(p)` taps or clicks client point p (CSS px) and steps whatever frames the
 * caller steps after a tap. Options:
 *  - lastChance: LAST CHANCE's RUNE card (lcpick-rune; its bar lcrune-take) in place of the dawn picker's card;
 *  - card: the dawn picker's card to take (default 0: runepick-<card>; its bar runepick-take);
 *  - wait(ms): how the caller lets wall time pass (default a sleep; a frame-stepped page may step its frames as well);
 *  - timeout: ms to wait for the card to open and for the take to land (default 5000).
 * Returns null when no such pick is up (no card region), else { id, card, closedNote, presses, guardMs } once the take
 * landed (the dawn's runeDay cleared, or LAST CHANCE's boon "rune"). Throws an Error naming what it saw when it didn't.
 */
export async function takeRuneCard(page, press, opts = {}) {
  const lc = !!opts.lastChance, card = opts.card ?? 0, timeout = opts.timeout ?? 5000;
  const wait = opts.wait ?? sleep;
  const cardId = lc ? "lcpick-rune" : `runepick-${card}`, barId = lc ? "lcrune-take" : "runepick-take";
  const what = lc ? "LAST CHANCE's RUNE card" : `the dawn rune (card ${card})`;
  const until = async (ok, label) => {
    const t0 = Date.now();
    for (;;) {
      const s = await pickState(page, lc);
      if (await ok(s)) return s;
      if (Date.now() - t0 > timeout) throw new Error(`runeTake: ${what}: ${label} not seen within ${timeout} ms (${JSON.stringify(s)})`);
      await sleep(50);
    }
  };
  let s = await pickState(page, lc);
  const offer = lc ? null : await page.evaluate(() => { const sc = window.bb.game.screen; const o = sc?.runePicker?.info?.(sc); return o ? o.ids : null; });
  const isOpen = async (st) => (lc ? st.open >= 0 : st.open === card) && !!(await regionOf(page, barId));
  // 1. open the card (unless it is open already: then its open time is unknown, so the guard's wait runs from now)
  if (!(await isOpen(s))) {
    const r = await regionOf(page, cardId);
    if (!r) return null; // no such pick is up
    await press(centre(r));
    s = await until(isOpen, `the card opened (${cardId} pressed)`);
  }
  const opened = Date.now(), id = lc ? null : offer?.[card] ?? null;
  // 2. past the guard: at least GUARD_WAIT_MS of wall time after the open
  await wait(GUARD_WAIT_MS);
  while (Date.now() - opened < GUARD_WAIT_MS) await sleep(20);
  // P3: a note that opened by itself takes the next press: the bar's press then only closes it, so press once for it
  let presses = 0, closedNote = null;
  if (s.note) {
    closedNote = s.note;
    const b = await regionOf(page, barId);
    if (!b) throw new Error(`runeTake: ${what}: no ${barId} region with the note ${s.note} up`);
    await press(centre(b));
    presses++;
    s = await until(async (st) => !st.note, `the self-opened note ${closedNote} closed`);
  }
  // 3. the bar's centre (its region is re-read: it grows when a note box closes)
  const bar = await regionOf(page, barId);
  if (!bar) throw new Error(`runeTake: ${what}: no ${barId} region (${JSON.stringify(s)})`);
  const guardMs = Date.now() - opened;
  await press(centre(bar));
  presses++;
  // 4. the take landed: the dawn pick done (runeDay cleared), or LAST CHANCE's boon the rune
  const day = s.day;
  await until((st) => (lc ? st.boon === "rune" : st.runeDay !== day), `the take (${barId} at ${centre(bar).x.toFixed(0)},${centre(bar).y.toFixed(0)}, ${guardMs} ms after the open)`);
  return { id, card: lc ? "rune" : card, closedNote, presses, guardMs };
}
