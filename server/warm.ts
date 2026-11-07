// BUMP-1E P6 (REPORT-BUMP section 7, "roadCap's warm-up at the server's boot"): the first deep upload a process validates paid about 5 s for roadCap's
// memo (src/net/roadCap.ts: the road plan of each day, with and without the hoard), built on demand. warmRoadCap builds the memo for days 1..maxDay once,
// in the world the live rules give (the same nest validate.ts validateUpload judges a deck of those rules in: inGatesWorld > inRulesWorld > inShapesWorld >
// inShapes2World > inScaleWorld > inEnchantWorld > withFreeJoins; the memo keys carry the switches, so only that world's entries serve a live upload), one day at a
// time with the event loop yielded between days (the slowest day, 25, is about 3 s), so a request is never held for more than a day's work.
// Nothing here changes a rule: it only fills a cache the validator would fill on its first deep upload. This file is outside the pool generators'
// import closure (server/ is not in it); it imports validate.ts and roadCap.ts without editing them.
import { RULES_VERSION } from "../src/sim/content";
import { LONG_RUN_MAX_DAY } from "../src/sim/longRun";
import { withFreeJoins } from "../src/sim/freeJoins";
import { inEnchantWorld, inGatesWorld, inRulesWorld, inScaleWorld, inShapes2World, inShapesWorld } from "../src/net/validate";
import { roadCap, roadCapHoard } from "../src/net/roadCap";

/** Fill roadCap's memo for days 1..maxDay in the world of `rules`; resolves with the days warmed and the milliseconds spent. */
export async function warmRoadCap(log: (line: string) => void = () => {}, rules: string = RULES_VERSION, maxDay: number = LONG_RUN_MAX_DAY): Promise<{ days: number; ms: number }> {
  const t0 = Date.now();
  for (let d = 1; d <= maxDay; d++) {
    // BUMP-1F P2: validate.ts's whole nest (GATES outermost, ENCHANT innermost): the same worlds a live upload is judged in
    inGatesWorld(rules, () => inRulesWorld(rules, () => inShapesWorld(rules, () => inShapes2World(rules, () => inScaleWorld(rules, () => inEnchantWorld(rules, () => withFreeJoins(() => {
      roadCap(d);
      roadCapHoard(d);
    })))))));
    await new Promise<void>((resolve) => setTimeout(resolve, 0)); // let a waiting request in between days
  }
  const ms = Date.now() - t0;
  log(`road model warmed for days 1-${maxDay} under rules ${rules} in ${ms} ms`);
  return { days: maxDay, ms };
}
