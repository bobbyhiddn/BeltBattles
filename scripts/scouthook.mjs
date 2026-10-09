// SCOUT-1 (REQ-BFG-076): the harness's FIGHT step for the flows that don't test scouting. Every page of a browser context
// (or one page) gets an init script that calls the page tooling bb.fight(true) as soon as window.bb is there (polled each
// millisecond, before any script's first bb call): from then on every battle skips scouting, its sail-in running into
// the count at WIDE as before SCOUT-1, so the flow, its frames and its timings are what they were. On a page from before
// SCOUT-1 (no bb.fight) it does nothing. scripts/touchcheck.mjs's scout section and scripts/scoutshots.mjs tap the real
// FIGHT instead.
// Usage: import { autoFight } from "./scouthook.mjs"; const ctx = await browser.newContext(...); await autoFight(ctx);

export async function autoFight(target) {
  await target.addInitScript(() => {
    const t = setInterval(() => {
      if (!window.bb) return;
      clearInterval(t);
      if (typeof window.bb.fight === "function") window.bb.fight(true);
    }, 1);
  });
}
