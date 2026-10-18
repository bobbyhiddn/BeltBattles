// ENDLESS-1 3.3 (REQ-BFG-059): the client's online wiring for an endless dusk (src/game/online.ts, with fakes as tests/online.test.ts has them):
// the request carries the ENDLESS wins and hearts and asks for endless ghosts only; a served endless ghost is the foe; and past
// ENDLESS_ONLINE_LAST_DAY (25) an endless dusk asks nobody and uploads nothing (the player-mode deck check is too slow there:
// REPORT finding 1), so the foe is the GOD at once.
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { finishDay, startEndless, storedFoe } from "../src/game/day";
import { newRun, pendingRune, takeRune, type Run } from "../src/game/run";
import { setPlayerName } from "../src/game/ghostSnapshot";
import { Online, stopOnline, type OnlineDeps } from "../src/game/online";
import { ENDLESS, ENDLESS_ONLINE_LAST_DAY, setEndless, withEndless } from "../src/sim/endless";
import { LONG_RUN_MAX_DAY } from "../src/sim/longRun";
import { GOD_NAME } from "../src/sim/godStandIn";
import { ghostId } from "../src/net/snapshot";
import type { FetchedGhost, SubmitResult, fetchGhost, submitGhost } from "../src/net/ghostClient";
import type { Identity } from "../src/net/identity";
import { testIdentity, TEST_NAME } from "./netIdentity";
import { playEndless, WIN } from "./endless1.honest";

setPlayerName(TEST_NAME);
const NOSTATS = {} as never;
let me: Identity;
beforeAll(async () => {
  setEndless(true);
  me = await testIdentity(3);
});
afterEach(() => stopOnline());
afterAll(() => setEndless(ENDLESS));

const until = async (cond: () => boolean, ms = 6000): Promise<void> => {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error("timed out waiting");
    await new Promise((r) => setTimeout(r, 5));
  }
};

function fakes(answer: (req: unknown) => FetchedGhost) {
  const calls = { fetch: [] as unknown[][], submit: [] as unknown[][], saves: 0 };
  const store = new Map<string, string>();
  const deps: OnlineDeps = {
    fetchGhost: (async (...a: unknown[]) => { calls.fetch.push(a); return answer(a[1]); }) as unknown as typeof fetchGhost,
    submitGhost: ((...a: unknown[]) => { calls.submit.push(a); return new Promise<SubmitResult>(() => {}); }) as unknown as typeof submitGhost,
    identity: async () => me,
    store: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) },
    now: () => 1_790_000_000_000, save: () => void calls.saves++,
  };
  return { deps, calls };
}

/** A marked run won on day 10, in endless, `n` endless dusks played (each a win): its day is 11 + n. */
function endlessAt(n: number): Run {
  const run = withEndless(() => newRun("furnace", 4321, "online-run"));
  while (!run.over) {
    const o = pendingRune(run);
    if (o) takeRune(run, o.ids[0]);
    finishDay(run, 0, 20, NOSTATS, NOSTATS);
  }
  startEndless(run);
  for (let i = 0; i < n; i++) finishDay(run, 0, 20, NOSTATS, NOSTATS);
  return run;
}

describe("ENDLESS-1 3.3: the online session in endless", () => {
  it("ENDLESS_ONLINE_LAST_DAY is LONG_RUN_MAX_DAY (25): the day the upload checks were sized for", () => {
    expect(ENDLESS_ONLINE_LAST_DAY).toBe(LONG_RUN_MAX_DAY);
  });

  it("the request: the endless wins and hearts, endless true; a run's request is as before", async () => {
    const f = fakes(() => { throw new Error("not asked here"); });
    const s = new Online("https://ghosts.example", f.deps);
    await until(() => s.active);
    const run = endlessAt(3); // day 14, 3 endless wins, 3 hearts
    run.lives = 2;
    expect(s.request(run)).toMatchObject({ day: 14, wins: 3, lives: 2, endless: true });
    const plain = newRun("furnace", 9);
    expect(s.request(plain)).not.toHaveProperty("endless");
    expect(s.request(plain).wins).toBe(plain.wins);
  });

  it("a served endless ghost is the foe (stamped, stored, saved); the request went out once", async () => {
    const donor = playEndless("weaver", 77, "other-player", { endlessOutcomes: [WIN, WIN, WIN, WIN] }).endlessSnaps.find((x) => x.day === 14)!;
    const f = fakes(() => ({ id: ghostId(donor), snapshot: donor, source: "server" }));
    const s = new Online("https://ghosts.example", f.deps);
    await until(() => s.active);
    const run = endlessAt(3);
    s.tick(run);
    await until(() => f.calls.fetch.length === 1);
    await new Promise((r) => setTimeout(r, 30));
    s.tick(run);
    expect(f.calls.fetch).toHaveLength(1);
    expect((f.calls.fetch[0][1] as { endless?: boolean }).endless).toBe(true);
    const foe = storedFoe(run)!;
    expect(foe).toMatchObject({ kind: "ghost", source: "online", ghostId: ghostId(donor) });
    expect(foe.record!.endlessWins).toBe(donor.endlessWins);
    expect(f.calls.saves).toBeGreaterThan(0);
  });

  it("past day 25 an endless dusk asks nobody: the GOD is stored at once, offline, saved; and nothing is uploaded", async () => {
    const f = fakes(() => { throw new Error("must not be asked"); });
    const s = new Online("https://ghosts.example", f.deps);
    await until(() => s.active);
    const run = endlessAt(ENDLESS_ONLINE_LAST_DAY - 10 + 1); // day 11 + 16 = 27 > 25
    expect(run.day).toBeGreaterThan(ENDLESS_ONLINE_LAST_DAY);
    s.tick(run);
    expect(f.calls.fetch).toHaveLength(0);
    expect(storedFoe(run)).toMatchObject({ kind: "standin", name: GOD_NAME, god: true, source: "offline" });
    expect(f.calls.saves).toBe(1);
    s.submitDusk(run);
    expect(f.calls.submit).toHaveLength(0);
    expect(run.uploaded).toBeUndefined();
  });

  it("on day 25 itself an endless dusk still takes part (the last day)", async () => {
    const f = fakes(() => ({ id: "g0000000000000", snapshot: undefined as never, source: "fallback" as const }));
    const s = new Online("https://ghosts.example", f.deps);
    await until(() => s.active);
    const run = endlessAt(ENDLESS_ONLINE_LAST_DAY - 11);
    expect(run.day).toBe(ENDLESS_ONLINE_LAST_DAY);
    s.tick(run);
    await until(() => f.calls.fetch.length === 1);
  });
});
