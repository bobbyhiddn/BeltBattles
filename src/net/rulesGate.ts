// 0.7.0 (v070-rel M2; REQ-BFG-009, REQ-BFG-027, REQ-BFG-031): turret slots and belt joins are bb-0.6.2 rules. A ghost
// snapshot or a battle record whose rules predate bb-0.6.2 must not carry them. This is the one place that reads a rules
// version as a number: `bb-MAJOR.MINOR.PATCH` and nothing else, so a string it can't read is never "at least" anything.
//
// Every accepting path asks it:
//  - the strict snapshot decoder (snapshot.ts checkSnapshot), so the server's POST /v1/ghosts (decodeSnapshot) and its
//    store, the client's upload encoder (encodeSnapshot), ghostClient's check of a served ghost and the bundled pool
//    loader (fallback.ts loadGhostPool);
//  - battle records (replay.ts checkRecord);
//  - the player-upload deck check (validate.ts validateUpload, given the snapshot's rules).
// It is defence in depth. Today every one of those paths also demands rules === RULES_VERSION after it; a server that
// accepts more than one rules version still keeps the 0.6.2 features out of the older ones.

/** The first rules version with turret slots (Build.turrets, REQ-BFG-031) and belt joins (RouteDef.join, REQ-BFG-027). */
export const TURRETS_JOINS_RULES = "bb-0.6.2";

/** `bb-MAJOR.MINOR.PATCH`: decimal numbers without a sign or a leading zero, nothing before or after. */
const RULES_RE = /^bb-(0|[1-9][0-9]{0,5})\.(0|[1-9][0-9]{0,5})\.(0|[1-9][0-9]{0,5})$/;

/** [major, minor, patch] of a `bb-MAJOR.MINOR.PATCH` rules version, or null for anything else. */
export function parseRules(rules: unknown): [number, number, number] | null {
  if (typeof rules !== "string") return null;
  const m = RULES_RE.exec(rules);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** True when `rules` is a readable rules version at or after `min`. Anything parseRules can't read is refused (false).
 *  An unreadable `min` is a programming error and throws. */
export function rulesAtLeast(rules: unknown, min: string): boolean {
  const lo = parseRules(min);
  if (!lo) throw new Error(`rulesAtLeast: "${min}" is not a bb-MAJOR.MINOR.PATCH rules version`);
  const v = parseRules(rules);
  if (!v) return false;
  for (let i = 0; i < 3; i++) if (v[i] !== lo[i]) return v[i] > lo[i];
  return true;
}

/** The bb-0.6.2 features a build carries: a non-empty turret list and a route with a join. It reads a raw (undecoded)
 *  build safely too, so a path may ask before its own shape check. */
export function rulesFeatures(build: unknown): string[] {
  if (typeof build !== "object" || build === null) return [];
  const b = build as { turrets?: unknown; routes?: unknown };
  const out: string[] = [];
  if (Array.isArray(b.turrets) && b.turrets.length > 0) out.push("turret slots (build.turrets)");
  if (Array.isArray(b.routes)) {
    const i = b.routes.findIndex((r) => typeof r === "object" && r !== null && (r as { join?: unknown }).join !== undefined);
    if (i >= 0) out.push(`belt joins (build.routes[${i}].join)`);
  }
  return out;
}

/** Why a build can't travel under `rules`, or null. It is refused when it carries turret slots or belt joins and its
 *  rules are not a readable version at or after TURRETS_JOINS_RULES. The reason names the rules version and the
 *  features. */
export function rulesGateProblem(rules: unknown, build: unknown): string | null {
  const features = rulesFeatures(build);
  if (!features.length || rulesAtLeast(rules, TURRETS_JOINS_RULES)) return null;
  const what = `${features.join(" and ")} need ${TURRETS_JOINS_RULES} or later`;
  return parseRules(rules) ? `rules ${String(rules)} predate ${TURRETS_JOINS_RULES}: ${what}` : `rules ${JSON.stringify(rules)} is not a bb-MAJOR.MINOR.PATCH version: ${what}`;
}
