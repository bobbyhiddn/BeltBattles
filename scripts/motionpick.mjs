// MOTION-1 (REQ-BFG-071): pick the battle for the video and the frame-time runs: dusk battles (hero, day, seed) resolved
// instantly in a frozen page (Arena.finish, the game's own SKIP), reporting each fight's length and each side's first
// shot, so the recording can be a STORM battle (day 4-7) that lasts and where shots fly early. Read only.
// Usage: PLAYWRIGHT_BROWSERS_PATH=... node scripts/motionpick.mjs <page.html>
import { chromium } from "playwright-core";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { autoFight } from "./scouthook.mjs"; // SCOUT-1 (REQ-BFG-076): the FIGHT step (bb.fight(true): battles skip scouting)

const PAGE = resolve(process.argv[2] ?? "dist-motion/index.html");
const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"] });
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 })).newPage();
await autoFight(page); // SCOUT-1: battles skip scouting, as before SCOUT-1
await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
await page.goto(pathToFileURL(PAGE).href);
await page.waitForFunction(() => !!window.bb && !!window.bb.game);
const rows = await page.evaluate(() => {
  const out = [];
  for (const hero of ["furnace", "weaver", "foundry", "bastion"]) for (const day of [4, 5, 6, 7]) for (const seed of [7, 11, 21, 33]) {
    window.bb.openDusk({ hero, day, seed }, []);
    for (let i = 0; i < 30; i++) window.bb.game.step(1 / 60);
    const a = window.bb.game.screen.arena;
    if (!a) continue;
    a.finish();
    const b = a.b;
    out.push({ hero, day, seed, t: +b.t.toFixed(1), winner: b.winner, first: [b.sides[0].stats.firstShot, b.sides[1].stats.firstShot].map((x) => +x.toFixed(1)), shots: [b.sides[0].stats.shots, b.sides[1].stats.shots] });
  }
  return out;
});
await browser.close();
rows.sort((x, y) => y.t - x.t);
for (const r of rows) console.log(`${r.hero.padEnd(8)} day ${r.day} seed ${String(r.seed).padEnd(3)} fight ${String(r.t).padStart(5)} s, winner ${r.winner}, first shots ${r.first.join(" / ")} s, shots ${r.shots.join(" / ")}`);
