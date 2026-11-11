// BUMP-1H (REQ-BFG-124, battle rules bb-0.15.0): THE CURVE, the difficulty curve's one switch, in effectFloor.ts's form.
//
// What it turns on, and only under rules at or after LEAD_RULES (rulesGate.ts leadFor: the switch AND the rules):
//  - the LEAD PICK (pick.ts matchPick): a record PickRule.lead.at or more wins ahead of its losses draws from the strongest
//    PickRule.lead.share of its eligible ghosts by grade, then the nearest-record pick runs inside them (the mirror of
//    `deep`); D1 (never a better record) is unchanged and an endless request picks as before;
//  - the seed pool's new slots (tools/samplePool.ts, the generators only): slot 1 of each (hero, day) picked on the CASUAL
//    grade, the streak tier's ghosts, and the busiest matchups' second ghosts. The server and the game read none of these
//    as a rule: they read the pool the generators wrote and the pick above.
// While it is off the pick and every generator are exactly what they were at bb-0.14.0 (tests/curve.pick.test.ts; the
// switch-off proof of BRIEF-BUMP1H P1). A bb-0.14.0 request picks exactly as before even with the switch on, so the
// bb-0.14.0 bucket keeps the odds it was benched with.
//
// THE SWITCH: CURVE (false), effectFloor.ts's form: curveRules(), setCurve(on) and withCurve(fn, on = true), which puts the
// switch back even on a throw. P2's flip sets the constant true. A generator that runs async holds it with setCurve(true)
// inside try/finally for its whole run, never withCurve(async ...) (the switch would be put back at the first await).
//
// Shared and dependency-free (no DOM, no catalogue): src/net/rulesGate.ts, src/net/pick.ts and tools/samplePool.ts read the
// same switch, and this file imports nothing so it adds no cycle.

/** THE switch (REQ-BFG-124): ON since BUMP-1H P2 (battle rules bb-0.15.0). It was false at P1, where the switch-off proof was read (fp, parBench, the seed pool
 *  and SOFT-1's rows byte for byte); this line is the flip, with RULES_VERSION's bump. */
export const CURVE: boolean = true;

let curveOn = false;

/** Is the difficulty curve in the game now (CURVE, or a withCurve call)? */
export function curveRules(): boolean {
  return curveOn;
}

/** Turn the curve on or off (tests and tools). Setting the state it already has does nothing. */
export function setCurve(on: boolean): void {
  curveOn = on;
}

/** Run `fn` with the curve on (or off), then put the switch back as it was, even if `fn` throws (withEffectFloor's form). */
export function withCurve<T>(fn: () => T, on = true): T {
  const was = curveOn;
  setCurve(on);
  try {
    return fn();
  } finally {
    setCurve(was);
  }
}

setCurve(CURVE);
