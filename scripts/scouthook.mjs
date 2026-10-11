// SCOUT-1 (REQ-BFG-076): the harness's FIGHT step for the flows that don't test scouting. Every page of a browser context
// (or one page) gets an init script that calls the page tooling bb.fight(true) as soon as window.bb is there (polled each
// millisecond, before any script's first bb call). On a SCOUT-1 page that made every battle skip scouting, its sail-in
// running into the count at WIDE as before SCOUT-1. SCOUT-1b (REQ-BFG-082): no battle scouts any more (the sail-in runs
// into the count by itself), so bb.fight(true) does nothing and returns false; the hook stays so the scripts that call it
// run as they are, on a SCOUT-1 page as on today's. On a page from before SCOUT-1 (no bb.fight) it does nothing.
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
