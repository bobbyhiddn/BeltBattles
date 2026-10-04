// 0.8.0 H2 M1b (REQ-BFG-009, REQ-BFG-016; the Prime's 0.8.x-11, VERIFIED-RC F1): near-miss rules strings are refused
// and never stored. The server's rules check is string equality with RULES_VERSION (bb-0.8.0 when H2 wrote this; BELTS's
// bb-0.8.3 now: the near misses below still miss it, with the same answers, and tests/belts.rules.test.ts adds bb-0.8.3's
// own, bb-0.8.0 first); a check loosened to compare only "bb-0.8" (the Prime's mutant CM2) let bb-0.8.1 in while every
// test stayed green. On both stores (tests/netStores.ts), uploads open in-process, each near miss goes up signed, on
// three decks, with a reachable record:
//  - a FURNACE deck with no turret and no join (the decoder's rules gate has nothing to refuse, and FURNACE travels under
//    any rules), so every near miss the decoder's pattern takes meets the server's exact check: 422;
//  - a FURNACE deck with turrets and a join: rules the gate can't read as bb-MAJOR.MINOR.PATCH get 400 at the decoder;
//  - a FOUNDRY deck: rules below bb-0.8.0 or unreadable carry FURNACE and WEAVER only (RULES_HEROES): 400 at the decoder.
// " bb-0.8.0" and "bb-0.8.0 " fail the decoder's rules pattern on every deck: 400. Nothing is stored under any of them:
// health's count, the store's records, every Tigris object, and the near miss's own bucket stay as they were, and the
// match route has no ghost for it (404).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RULES_VERSION } from "../src/sim/content";
import { parseRules, rulesAtLeast } from "../src/net/rulesGate";
import { encodeSnapshot, type GhostSnapshot } from "../src/net/snapshot";
import { isReachable } from "../src/net/records";
import type { Identity } from "../src/net/identity";
import type { GhostServer } from "../server/app";
import type { TigrisStore } from "../server/tigrisStore";
import { generateSamplePool } from "../tools/samplePool";
import { storeBackends } from "./netStores";
import { ownedBy, signedHeaders, testIdentity } from "./netIdentity";

const POOL = generateSamplePool();
const plainOf = (s: GhostSnapshot) => !s.build.turrets?.length && !s.build.routes.some((r) => r.join !== undefined);
const twoFeatures = (s: GhostSnapshot) => !!s.build.turrets?.length && s.build.routes.some((r) => r.join !== undefined);
const DECKS: Record<"plain" | "turretsJoin" | "foundry", GhostSnapshot> = {
  plain: POOL.find((s) => s.hero === "furnace" && plainOf(s))!,
  turretsJoin: POOL.find((s) => s.hero === "furnace" && twoFeatures(s))!,
  foundry: POOL.find((s) => s.hero === "foundry")!,
};

/** The brief's five near misses, then a few more of the same kind. */
const NEAR = ["bb-0.8.1", "bb-0.8.0x", "bb-0.8", "BB-0.8.0", " bb-0.8.0", "bb-0.8.0 ", "bb-0.8.00", "bb-0.08.0", "bb-0.8.10", "bb-0.8.0.1", "bb-0.7.9", "bb-1.8.0", "bb_0.8.0"];
const PATTERN_OK = (r: string) => /^[A-Za-z0-9._-]{1,32}$/.test(r); // src/net/snapshot.ts RULES_PATTERN

/** What each near miss gets on each deck, from the decoder's rules (the pattern, the gate, RULES_HEROES), then the
 *  server's exact check. */
function expected(rules: string, deck: keyof typeof DECKS): { status: number; error: RegExp } {
  if (!PATTERN_OK(rules)) return { status: 400, error: /^snapshot\.rules: / };
  const readable = parseRules(rules) !== null;
  if (deck === "turretsJoin" && !readable) return { status: 400, error: /^snapshot\.rules: rules ".*" is not a bb-MAJOR\.MINOR\.PATCH version: turret slots/ };
  // the hero gate's threshold: FOUNDRY travels from bb-0.8.0 on (rulesGate.ts HEROES_RULES), under BELTS's rules too
  if (deck === "foundry" && !rulesAtLeast(rules, "bb-0.8.0")) return { status: 400, error: /^snapshot\.hero: rules .* accept only FURNACE, WEAVER, not FOUNDRY$/ };
  return { status: 422, error: new RegExp(`^rules ${rules.replace(/[.]/g, "\\.")} not accepted: this server validates bb-0\\.8\\.3$`) };
}

describe("H2 M1b: the near-miss rules strings (pure)", () => {
  it("are all different from RULES_VERSION, and the three decks are honest bb-0.8.3 seed decks with a reachable record", () => {
    expect(RULES_VERSION).toBe("bb-0.8.3");
    for (const r of NEAR) expect(r).not.toBe(RULES_VERSION);
    expect(new Set(NEAR).size).toBe(NEAR.length);
    for (const s of Object.values(DECKS)) expect([s.rules, isReachable(s.day, s.wins, s.lives)]).toEqual([RULES_VERSION, true]);
    // the decoder's view of each: the brief's five, and which of them its pattern refuses first
    expect(NEAR.slice(0, 5).map((r) => [r, PATTERN_OK(r), parseRules(r) !== null])).toEqual([
      ["bb-0.8.1", true, true], ["bb-0.8.0x", true, false], ["bb-0.8", true, false], ["BB-0.8.0", true, false], [" bb-0.8.0", false, false],
    ]);
  });
});

describe.each(storeBackends())("H2 M1b: near-miss rules strings on the $name store (uploads open in-process)", (backend) => {
  let app: GhostServer, base: string, me: Identity;
  beforeAll(async () => {
    await backend.setup();
    app = backend.server({ uploads: "open", log: () => {}, matchSalt: () => 0, rateLimit: { windowMs: 60_000, max: 1_000_000 } });
    base = `http://127.0.0.1:${await app.listen(0)}`;
    me = await testIdentity(1);
  });
  afterAll(async () => {
    await app.close();
    await backend.teardown();
  });

  const state = async () => ({
    ghosts: ((await (await fetch(`${base}/v1/health`)).json()) as { ghosts: number }).ghosts,
    size: app.store.size,
    records: backend.storedRecords(),
    objects: backend.name === "tigris" ? (await (app.store as TigrisStore).s3.listAll("")).map((o) => o.key).sort() : null,
  });

  it("refuses every near miss on every deck, with the status and error its first failing check gives, and stores nothing", async () => {
    const before = await state();
    const seen: Record<string, number[]> = {};
    let k = 0;
    for (const rules of NEAR) {
      for (const deck of Object.keys(DECKS) as (keyof typeof DECKS)[]) {
        const s = ownedBy({ ...DECKS[deck], rules, runId: `h2-near-${k}`, createdAt: 1_790_400_000_000 + k++ }, me);
        const body = JSON.stringify(s); // raw: encodeSnapshot itself refuses what the decoder refuses
        const r = await fetch(`${base}/v1/ghosts`, { method: "POST", headers: await signedHeaders(me, body), body });
        const got = { status: r.status, error: ((await r.json()) as { error: string }).error };
        const want = expected(rules, deck);
        (seen[JSON.stringify(rules)] ??= []).push(got.status);
        expect(got.status, `${JSON.stringify(rules)} on ${deck}: ${got.error}`).toBe(want.status);
        expect(got.error, `${JSON.stringify(rules)} on ${deck}`).toMatch(want.error);
      }
    }
    // the statuses, per near miss: plain FURNACE, FURNACE with turrets and a join, FOUNDRY
    expect(seen).toEqual({
      '"bb-0.8.1"': [422, 422, 422], '"bb-0.8.0x"': [422, 400, 400], '"bb-0.8"': [422, 400, 400], '"BB-0.8.0"': [422, 400, 400],
      '" bb-0.8.0"': [400, 400, 400], '"bb-0.8.0 "': [400, 400, 400], '"bb-0.8.00"': [422, 400, 400], '"bb-0.08.0"': [422, 400, 400],
      '"bb-0.8.10"': [422, 422, 422], '"bb-0.8.0.1"': [422, 400, 400], '"bb-0.7.9"': [422, 422, 400], '"bb-1.8.0"': [422, 422, 422],
      '"bb_0.8.0"': [422, 400, 400],
    });
    expect(await state()).toEqual(before);
    for (const rules of NEAR.filter(PATTERN_OK)) {
      const day = DECKS.plain.day;
      expect(await app.store.bucket(rules, day, "all"), rules).toEqual([]);
      const m = await fetch(`${base}/v1/ghosts/match?rules=${encodeURIComponent(rules)}&day=${day}&wins=0&lives=5&player=near-miss&seen=&runs=3`);
      expect(m.status, rules).toBe(404);
    }
  });

  it("this build's own rules string on the same three decks is taken (201): the refusals above are the rules string's alone", async () => {
    let k = 0;
    for (const deck of Object.keys(DECKS) as (keyof typeof DECKS)[]) {
      const s = ownedBy({ ...DECKS[deck], runId: `h2-near-ok-${k}`, createdAt: 1_790_400_100_000 + k++ }, me);
      const body = encodeSnapshot(s);
      const r = await fetch(`${base}/v1/ghosts`, { method: "POST", headers: await signedHeaders(me, body), body });
      expect(r.status, deck).toBe(201);
    }
  });
});
