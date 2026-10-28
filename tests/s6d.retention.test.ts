// S6D Goal 2 (REQ-BFG-119): retention. The operator's numbers (ghosts 180 days; a player until they delete it or 24 months without play; a weekly
// clean-up) as `ghost-admin prune-ghosts`, `prune-idle` and `weekly`, and the clock guard. Both stores: the JSON-lines directory, and Tigris on the
// in-process fake S3 (seven keys a LIST page). The tool's clock is set by the test (tests/s6dWorld.ts admin(): NOW = 2026-10-28 12:00 UTC).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { StoreConfig } from "../server/config";
import { USAGE, parseArgs, openAdmin, type AdminStore } from "../server/ghostAdmin";
import { JsonlAdmin } from "../server/ghostAdmin";
import { CLEANUP_PROMISE_DAYS, CLOCK_GUARD_MS, DAY_MS, GHOST_RETENTION_DAYS, IDLE_RETENTION_DAYS, IDLE_RETENTION_MONTHS, WEEKLY_CLEANUP_DAYS } from "../server/retention";
import type { FakeS3 } from "../tools/fakeS3";
import { startFake } from "./netStores";
import { DAY, NOW, R1, R2, admin, idOf, removeWorlds, statePath, world, type Kind, type World } from "./s6dWorld";

let fake: FakeS3;
beforeAll(async () => {
  fake = await startFake({ pageSize: 7 });
});
afterAll(async () => {
  await fake.close();
  removeWorlds();
});

const KINDS: Kind[] = ["jsonl", "tigris"];
const ago = (days: number) => NOW - days * DAY;
const P = idOf("p"), Q = idOf("q");

/** The ghost ids a "  delete ..." line list names. */
const ghostsIn = (planned: string[]) => planned.map((l) => /ghost (\S+)/.exec(l)?.[1]).filter((x): x is string => !!x).sort();

describe("the periods are in one place", () => {
  it("180 days for an upload; 24 months, counted as 730 days, for a player; a weekly run that the pages promise within 14 days", () => {
    expect(DAY_MS).toBe(DAY);
    expect(GHOST_RETENTION_DAYS).toBe(180);
    expect(IDLE_RETENTION_MONTHS).toBe(24);
    expect(IDLE_RETENTION_DAYS).toBe(730);
    expect(IDLE_RETENTION_DAYS).toBe((IDLE_RETENTION_MONTHS / 12) * 365);
    expect(WEEKLY_CLEANUP_DAYS).toBe(7);
    expect(CLEANUP_PROMISE_DAYS).toBe(2 * WEEKLY_CLEANUP_DAYS);
    expect(CLOCK_GUARD_MS).toBe(DAY_MS);
  });

  it("the commands default to them, say so in the usage, and take --days", () => {
    expect(parseArgs(["prune-ghosts"]).days).toBe(GHOST_RETENTION_DAYS);
    expect(parseArgs(["prune-idle"]).days).toBe(IDLE_RETENTION_DAYS);
    expect(parseArgs(["prune-ghosts", "--days", "30"]).days).toBe(30);
    expect(USAGE).toContain(`(default ${GHOST_RETENTION_DAYS})`);
    expect(USAGE).toContain(`(default ${IDLE_RETENTION_DAYS})`);
    expect(USAGE).toContain("weekly [--apply]");
  });
});

// ---------------------------------------------------------------------------------------------------------------- prune-ghosts

describe.each(KINDS)("prune-ghosts on %s", (kind) => {
  function plant(w: World): void {
    w.upload(R1, 1, "u179", P, ago(179));
    w.upload(R1, 2, "u180", P, ago(180)); // exactly 180 days: not MORE than 180 days ago
    w.upload(R1, 3, "u180b", P, ago(180) - 1); // one millisecond more
    w.upload(R2, 1, "u181", Q, ago(181));
    w.upload(R2, 2, "unew", Q, ago(1));
    w.upload(R2, 3, "uundated", Q, undefined); // a record with no receipt time
    w.pool(R1, 1, "pool-old", ago(900)); // a seed-pool record's `at` is an old createdAt: never aged
    w.pool(R2, 1, "pool-old2", 5);
  }
  const KEEP = ["player bb-0.11.0 uundated", "player bb-0.12.0 u179", "player bb-0.12.0 u180", "player bb-0.11.0 unew", "pool bb-0.11.0 pool-old2", "pool bb-0.12.0 pool-old"].sort();

  it("the boundaries: 179 and 180 days stay, a millisecond more and 181 days go; the dry run deletes nothing and --apply exactly what it listed", async () => {
    const w = world(kind, fake);
    plant(w);
    const before = w.state();
    const dry = await admin(w, ["prune-ghosts"]);
    expect(dry.code, dry.text).toBe(0);
    expect(dry.out[0]).toContain("ghosts:admin prune-ghosts --days 180 (every rules version): ");
    expect(dry.out[0]).toContain("(DRY RUN)");
    expect(ghostsIn(dry.planned)).toEqual(["u180b", "u181"]);
    expect(dry.text).toContain(`uploads received before ${new Date(ago(180)).toISOString().replace(".000Z", "Z")} (more than 180 days ago) are deleted: 2 of 6`);
    expect(dry.text).toContain("plan: delete 2 upload(s); keep 3; the seed pool is never touched; 1 upload(s) with no readable receipt time are kept");
    expect(dry.text).toContain("DRY RUN: nothing was deleted. --apply deletes exactly the 2 record(s) above.");
    expect(dry.planned.every((l) => /\(received 20\d\d-\d\d-\d\dT[\d:]+Z, 18\d days ago\)$/.test(l))).toBe(true);
    expect(w.state()).toEqual(before);

    const r = await admin(w, ["prune-ghosts", "--apply"]);
    expect(r.code, r.text).toBe(0);
    expect(r.out[0]).toContain("(APPLY)");
    expect(r.text).toContain("APPLIED: deleted 2 of 2 record(s).");
    expect(r.text).toContain(kind === "tigris" ? "BB_GHOST_CACHE_TTL_S" : "Restart the ghost server");
    expect(w.ids()).toEqual(KEEP);
    const again = await admin(w, ["prune-ghosts", "--apply"]);
    expect(again.code).toBe(0);
    expect(again.text).toContain("APPLIED: deleted 0 of 0 record(s).");
  });

  it("--days N moves the line: 30 days takes 179 and 180 too; 179 keeps the 179-day-old upload", async () => {
    const w = world(kind, fake);
    plant(w);
    const thirty = await admin(w, ["prune-ghosts", "--days", "30"]);
    expect(ghostsIn(thirty.planned)).toEqual(["u179", "u180", "u180b", "u181"]);
    expect(thirty.out[0]).toContain("prune-ghosts --days 30 ");
    const at179 = await admin(w, ["prune-ghosts", "--days", "179"]);
    expect(ghostsIn(at179.planned)).toEqual(["u180", "u180b", "u181"]);
    expect(w.ids()).toHaveLength(8); // dry runs
  });

  it("never touches the seed pool, a player's profile or anything but uploads, and says what it kept", async () => {
    const w = world(kind, fake);
    plant(w);
    await w.profile(P, ago(1000)); // an old profile is not an upload
    await w.entry(P, ago(1000), "old-run");
    const stateOf = (s: Record<string, string>) => Object.fromEntries(Object.entries(s).filter(([k]) => /profiles|history|identity/.test(k)));
    const identityBefore = stateOf(w.state());
    const r = await admin(w, ["prune-ghosts", "--days", "1", "--apply"]);
    expect(r.code, r.text).toBe(0);
    expect(w.ids().filter((id) => id.startsWith("pool "))).toEqual(["pool bb-0.11.0 pool-old2", "pool bb-0.12.0 pool-old"]);
    expect(stateOf(w.state())).toEqual(identityBefore);
  });

  it("a store the tool cannot read is exit 1; usage mistakes are exit 2", async () => {
    const w = world(kind, fake);
    plant(w);
    const dead: AdminStore = { kind: "jsonl", where: "double", read: async () => { throw new Error("disk exploded"); }, remove: async () => 0, rulesVersions: async () => [R1] };
    const r = await admin(w, ["prune-ghosts"], NOW, (() => dead) as never);
    expect(r.code).toBe(1);
    expect(r.text).toContain("ghosts:admin failed: disk exploded");
    const partial = kind === "jsonl" ? new JsonlAdmin(w.argv[1]) : null;
    if (partial) {
      const some: AdminStore = { kind: partial.kind, where: partial.where, read: (rules) => partial.read(rules), remove: (x) => partial.remove(x.slice(0, 1)), rulesVersions: () => partial.rulesVersions() };
      const p = await admin(w, ["prune-ghosts", "--apply"], NOW, (() => some) as never);
      expect(p.code).toBe(1);
      expect(p.text).toContain("APPLIED: deleted 1 of 2 record(s).");
      expect(p.text).toContain("1 planned record(s) had already changed or gone");
    }
    for (const args of [["prune-ghosts", "--days", "0"], ["prune-ghosts", "extra"], ["prune-ghosts", "--rules", R1]]) expect((await admin(w, args)).code, args.join(" ")).toBe(2);
  });
});

// ---------------------------------------------------------------------------------------------------------------- prune-idle

describe.each(KINDS)("prune-idle on %s", (kind) => {
  const IDLE1 = idOf("idle1"), UP = idOf("up"), PR = idOf("pr"), HI = idOf("hi");
  const P5 = idOf("p5"), K5 = idOf("k5"), P6 = idOf("p6"), P7 = idOf("p7"), K7 = idOf("k7"), K7B = idOf("k7b");
  const B729 = idOf("b729"), B730 = idOf("b730"), B731 = idOf("b731"), TB = idOf("tb"), UO = idOf("uo"), UNREAD = idOf("unread");

  /** One store with every case of "last play": who is idle (IDLE1, B731) and who is kept, each for a different reason. */
  async function plant(w: World): Promise<void> {
    await w.profile(IDLE1, ago(800)); // idle: only an old profile
    await w.entry(IDLE1, ago(900), "old");
    await w.profile(UP, ago(800)); // kept: active only through an upload
    w.upload(R1, 1, "up1", UP, ago(10), { name: "UPN", hero: "ranger" });
    await w.profile(PR, ago(10)); // kept: active only through the profile
    await w.profile(HI, ago(800)); // kept: active only through the run history
    await w.entry(HI, ago(10), "h1");
    await w.profile(P5, ago(800)); // kept: active only through a link (a device linked ten days ago)
    await w.playerRec(P5, [K5], ago(800));
    await w.keyLink(K5, P5, ago(10));
    await w.profile(P6, ago(800)); // kept: active only through the player record (SHOW MY CODE a week ago)
    await w.playerRec(P6, [], ago(7));
    await w.profile(P7, ago(800)); // kept: a linked player whose second device is still active (its history sits under the key's own id)
    await w.playerRec(P7, [K7, K7B], ago(800));
    await w.keyLink(K7, P7, ago(800));
    await w.keyLink(K7B, P7, ago(800));
    await w.entry(K7B, ago(5), "second-device");
    await w.profile(B729, ago(729)); // kept
    await w.profile(B730, ago(730)); // kept: exactly 730 days is not MORE than 730 days
    await w.profile(B731, ago(731)); // idle
    await w.profile(TB, ago(900)); // kept: it has a tombstone already (deleted), a player is never idle again
    await w.tombstone(TB, [TB], ago(100));
    w.upload(R1, 2, "uo1", UO, ago(800), { name: "UON", hero: "mage" }); // not judged: a player with uploads only (prune-ghosts ages them)
    w.raw("profiles/" + UNREAD + ".json", "this is not a profile"); // kept: its time cannot be read
    w.pool(R1, 1, "pool1", ago(900));
  }
  const profilesLeft = (w: World) => Object.keys(w.state()).filter((k) => k.startsWith("profiles/")).map((k) => k.slice("profiles/".length, -".json".length)).sort();
  const everyone = [IDLE1, UP, PR, HI, P5, P6, P7, B729, B730, B731, TB, UNREAD].sort();

  it("the definition: the newest of the profile, the uploads, the history, the links and the player record, over the player and every id linked to it", async () => {
    const w = world(kind, fake);
    await plant(w);
    const before = w.state();
    const dry = await admin(w, ["prune-idle"]);
    expect(dry.code, dry.text).toBe(0);
    expect(dry.out[0]).toContain("ghosts:admin prune-idle --days 730 (every rules version): ");
    expect(dry.out[0]).toContain("(DRY RUN)");
    expect(dry.text).toMatch(/players with stored records: 11; idle \(no server-side sign of play since 2024-10-\d\dT12:00:00Z, more than 730 days\): 2; kept: 8; left alone because they cannot be judged: 1/);
    expect(dry.text).toContain(`kept (not judged) ${UNREAD}: a record that dates it cannot be read`);
    const idle = dry.out.filter((l) => l.startsWith("idle player "));
    expect(idle.map((l) => l.split(" ")[2].replace(":", "")).sort()).toEqual([IDLE1, B731].sort());
    expect(idle.find((l) => l.includes(IDLE1))).toContain("(the profile of");
    expect(idle.find((l) => l.includes(B731))).toMatch(/last play 2024-10-2\dT12:00:00Z \(the profile of \S+ \(receivedAt\)\), 731 days ago/);
    expect(dry.planned).toContain(`profile ${IDLE1}`);
    expect(dry.planned).toContain(`profile ${B731}`);
    expect(dry.text).toContain("DRY RUN: nothing was deleted. --apply deletes exactly the 2 player(s) above");
    expect(w.state()).toEqual(before);

    const r = await admin(w, ["prune-idle", "--apply"]);
    expect(r.code, r.text).toBe(0);
    expect(r.text).toContain("APPLIED: deleted 2 idle player(s) as delete-player does; deleted 0 of 0 upload(s).");
    expect(profilesLeft(w)).toEqual(everyone.filter((x) => x !== IDLE1 && x !== B731));
    const s = w.state();
    for (const id of [IDLE1, B731]) expect(JSON.parse(s[statePath(kind, `tombstones/${id}.json`)])).toEqual({ at: NOW, ids: [id] });
    expect(Object.keys(s).filter((k) => k.includes("history/" + IDLE1))).toEqual([]);
    expect(Object.keys(s).filter((k) => k.includes("history/" + K7B)).length).toBe(1); // the active player's history stays
    expect(w.ids()).toEqual(["player bb-0.12.0 uo1", "player bb-0.12.0 up1", "pool bb-0.12.0 pool1"].sort()); // uploads are prune-ghosts' to age, not prune-idle's
    expect(s[statePath(kind, `tombstones/${TB}.json`)]).toBe(before[statePath(kind, `tombstones/${TB}.json`)]); // a tombstoned player is left as it was
    const again = await admin(w, ["prune-idle", "--apply"]);
    expect(again.code, again.text).toBe(0);
    expect(again.text).toContain("APPLIED: deleted 0 idle player(s)");
    expect(w.state()).toEqual(s);
  });

  it("an idle player is deleted exactly as delete-player deletes it, and their uploads go with them", async () => {
    const make = async (): Promise<World> => {
      const w = world(kind, fake);
      const X = idOf("x"), KX = idOf("kx");
      await w.profile(X, ago(800));
      await w.playerRec(X, [KX], ago(800), { steam: ["76561198000000009"] });
      await w.keyLink(KX, X, ago(800));
      await w.steamLink("76561198000000009", X, ago(800));
      await w.entry(X, ago(790), "r1");
      await w.entry(KX, ago(795), "r0");
      w.upload(R1, 1, "x1", X, ago(790), { name: "XN", hero: "ranger" });
      w.upload(R2, 1, "x2", KX, ago(795), { name: "XN", hero: "ranger" });
      await w.profile(Q, ago(3));
      w.upload(R1, 2, "q1", Q, ago(3), { name: "QN", hero: "ranger" });
      w.pool(R1, 1, "pool1", ago(900));
      return w;
    };
    const viaPrune = await make();
    const viaDelete = await make();
    const a = await admin(viaPrune, ["prune-idle", "--apply"]);
    const b = await admin(viaDelete, ["delete-player", idOf("x"), "--apply"]);
    expect(a.code, a.text).toBe(0);
    expect(b.code, b.text).toBe(0);
    expect(a.text).toContain("APPLIED: deleted 1 idle player(s) as delete-player does; deleted 2 of 2 upload(s).");
    expect(viaPrune.state()).toEqual(viaDelete.state());
    expect(viaPrune.ids()).toEqual(["player bb-0.12.0 q1", "pool bb-0.12.0 pool1"]);
  });

  it("--days N changes the line; a player with uploads only is never judged; a player whose ids name two players is left alone and said", async () => {
    const w = world(kind, fake);
    await plant(w);
    const two = idOf("two-a"), twoB = idOf("two-b"), twoC = idOf("two-c");
    await w.profile(two, ago(900));
    await w.profile(twoB, ago(900));
    await w.profile(twoC, ago(900));
    await w.playerRec(two, [twoB], ago(900)); // two players' records both list twoB as their key (damaged data): the ids name two players
    await w.playerRec(twoC, [twoB], ago(900));
    const idleOf = (out: string[]) => out.filter((l) => l.startsWith("idle player ")).map((l) => l.split(" ")[2].replace(":", "")).sort();
    const nine = await admin(w, ["prune-idle", "--days", "9"]);
    expect(nine.code, nine.text).toBe(0);
    expect(nine.out[0]).toContain("prune-idle --days 9 ");
    expect(idleOf(nine.out)).toEqual([IDLE1, UP, PR, HI, P5, B729, B730, B731].sort()); // everyone whose newest sign is more than 9 days old
    expect(nine.text).toMatch(/players with stored records: 12; idle \(no server-side sign of play since 2026-10-19T12:00:00Z, more than 9 days\): 8; kept: 2; left alone because they cannot be judged: 2/);
    expect(nine.text).toContain("does not say which of these ids is the player");
    expect(idleOf(nine.out)).not.toContain(UO); // uploads only: never judged by prune-idle
    expect(idleOf(nine.out)).not.toContain(P7); // the second device's history, five days ago, keeps the linked player
    const seven = await admin(w, ["prune-idle", "--days", "700"]);
    expect(idleOf(seven.out)).toEqual([IDLE1, B729, B730, B731].sort());
    expect(profilesLeft(w)).toEqual([...everyone, two, twoB, twoC].sort()); // dry runs: nobody was deleted
  });

  it("with a clock a day short of the newest record it still runs; two days short, it refuses (exit 1) and deletes nothing", async () => {
    const w = world(kind, fake);
    await plant(w);
    await w.profile(idOf("future"), NOW + DAY); // exactly one day ahead: allowed
    const ok = await admin(w, ["prune-idle", "--apply"]);
    expect(ok.code, ok.text).toBe(0);
    const w2 = world(kind, fake);
    await plant(w2);
    await w2.profile(idOf("future"), NOW + DAY + 1); // more than one day ahead
    const before = w2.state();
    for (const args of [["prune-idle"], ["prune-idle", "--apply"]]) {
      const r = await admin(w2, args);
      expect(r.code, r.text).toBe(1);
      expect(r.text).toMatch(/refused: the store holds a receipt time of 2026-10-29T12:00:00Z \(profile \S+\), later than now \(2026-10-28T12:00:00Z\) plus one day\. This machine's clock is wrong/);
      expect(r.text).toContain("Nothing was deleted");
      expect(w2.state()).toEqual(before);
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------- the clock guard

describe.each(KINDS)("the clock guard on %s", (kind) => {
  it("prune-ghosts refuses (exit 1, nothing deleted) when an upload was received more than a day after now; a day exactly is fine", async () => {
    const w = world(kind, fake);
    w.upload(R1, 1, "old", P, ago(200));
    w.upload(R1, 2, "future", P, NOW + DAY + 1);
    const before = w.state();
    for (const args of [["prune-ghosts"], ["prune-ghosts", "--apply"], ["prune-ghosts", "--days", "1", "--apply"]]) {
      const r = await admin(w, args);
      expect(r.code, r.text).toBe(1);
      expect(r.text).toMatch(/refused: the store holds a receipt time of 2026-10-29T12:00:00Z \(upload \S+\), later than now \(2026-10-28T12:00:00Z\) plus one day/);
      expect(r.text).not.toContain("DRY RUN: nothing was deleted");
      expect(w.state()).toEqual(before);
    }
    const w2 = world(kind, fake);
    w2.upload(R1, 1, "old", P, ago(200));
    w2.upload(R1, 2, "edge", P, NOW + DAY);
    const ok = await admin(w2, ["prune-ghosts", "--apply"]);
    expect(ok.code, ok.text).toBe(0);
    expect(w2.ids()).toEqual(["player bb-0.12.0 edge"]);
  });

  it("a seed-pool record dated in the future does not trip it (a pool record's time is an old createdAt, never a receipt time)", async () => {
    const w = world(kind, fake);
    w.upload(R1, 1, "old", P, ago(200));
    w.pool(R1, 1, "pool-future", NOW + 30 * DAY);
    const r = await admin(w, ["prune-ghosts", "--apply"]);
    expect(r.code, r.text).toBe(0);
    expect(w.ids()).toEqual(["pool bb-0.12.0 pool-future"]);
  });

  it("weekly refuses before any step when any record has a receipt time more than a day ahead: nothing deleted", async () => {
    const w = world(kind, fake);
    await w.profile(P, ago(800)); // idle
    w.upload(R1, 1, "old", Q, ago(200)); // an old ghost
    await w.keyLink(idOf("kf"), Q, NOW + 3 * DAY); // a link record from the future
    const before = w.state();
    for (const args of [["weekly"], ["weekly", "--apply"]]) {
      const r = await admin(w, args);
      expect(r.code, r.text).toBe(1);
      expect(r.text).toMatch(/refused: the store holds a receipt time of 2026-10-31T12:00:00Z \(key link \S+\), later than now/);
      expect(r.text).not.toMatch(/weekly \d\/3/);
      expect(w.state()).toEqual(before);
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------- weekly

describe.each(KINDS)("weekly on %s", (kind) => {
  const X = idOf("wx"), KX = idOf("wkx"), T = idOf("wt"), A1 = idOf("wa");
  /** An idle player X with a linked key, a deleted player T whose ghosts and history are still stored, an active player A1 with an old ghost, a seed pool. */
  async function plant(w: World): Promise<void> {
    await w.profile(X, ago(800));
    await w.playerRec(X, [KX], ago(800));
    await w.keyLink(KX, X, ago(800));
    await w.entry(X, ago(790), "x-run");
    w.upload(R1, 1, "x1", X, ago(790), { name: "XN", hero: "ranger" });
    await w.tombstone(T, [T], ago(9));
    w.upload(R1, 1, "t1", T, ago(5), { name: "TN", hero: "ranger" }); // recent, so only the purge of tombstoned players takes it
    w.upload(R2, 1, "t2", T, ago(6), { name: "TN", hero: "ranger" });
    await w.entry(T, ago(20), "t-run");
    await w.profile(A1, ago(10));
    w.upload(R1, 2, "a-old", A1, ago(200), { name: "AN", hero: "ranger" }); // older than 180 days
    w.upload(R1, 3, "a-new", A1, ago(100), { name: "AN", hero: "ranger" });
    w.pool(R1, 1, "pool1", ago(900));
    w.pool(R2, 1, "pool2", 5);
  }

  it("a dry run reads the store once, prints one plan for the three steps and ONE DRY RUN line, and deletes nothing", async () => {
    const w = world(kind, fake);
    await plant(w);
    const before = w.state();
    const r = await admin(w, ["weekly"]);
    expect(r.code, r.text).toBe(0);
    expect(r.out[0]).toContain("ghosts:admin weekly (every rules version): ");
    expect(r.out[0]).toContain("(DRY RUN)");
    const steps = r.out.filter((l) => /^weekly \d\/3 /.test(l));
    expect(steps).toEqual(["weekly 1/3 prune-idle (730 days):", "weekly 2/3 purge-tombstoned:", "weekly 3/3 prune-ghosts (180 days):"]);
    expect(r.out.filter((l) => l.startsWith("DRY RUN:"))).toHaveLength(1);
    expect(r.out[r.out.length - 1]).toMatch(/^DRY RUN: nothing was deleted\. --apply runs the three steps above in that order: 1 idle player\(s\), 2 upload\(s\) and 1 history object\(s\) of already deleted players, 1 upload\(s\) older than 180 days /);
    expect(r.text).toContain(`idle player ${X}: last play`);
    expect(r.text).toContain("tombstones: ");
    expect(w.state()).toEqual(before);
  });

  it("--apply runs prune-idle, then purge-tombstoned, then prune-ghosts, one summary line each; every plan is carried out and nothing else is touched", async () => {
    const w = world(kind, fake);
    await plant(w);
    const before = w.state();
    const r = await admin(w, ["weekly", "--apply"]);
    expect(r.code, r.text).toBe(0);
    expect(r.out[0]).toContain("(APPLY)");
    expect(r.out.slice(1)).toEqual([
      "weekly 1/3 prune-idle: deleted 1 idle player(s) (more than 730 days without play) and 1 of their upload(s)",
      "weekly 2/3 purge-tombstoned: deleted 2 of 2 upload(s) and 1 of 1 history object(s) of the 3 id(s) in tombstones",
      "weekly 3/3 prune-ghosts: deleted 1 of 1 upload(s) received more than 180 days ago",
      "weekly: done, all three steps succeeded",
    ]);
    const s = w.state();
    // X: deleted as delete-player does, its uploads purged in the same run
    expect(JSON.parse(s[statePath(kind, `tombstones/${X}.json`)])).toEqual({ at: NOW, ids: [X, KX] });
    for (const gone of [`profiles/${X}.json`, `links/keys/${KX}.json`, `players/${X}.json`]) expect(s[statePath(kind, gone)], gone).toBeUndefined();
    expect(Object.keys(s).filter((k) => k.includes(`history/${X}`) || k.includes(`history/${T}`))).toEqual([]);
    // T: its ghosts and history are purged; its tombstone stays
    expect(s[statePath(kind, `tombstones/${T}.json`)]).toBe(before[statePath(kind, `tombstones/${T}.json`)]);
    // A1: only the ghost older than 180 days goes; the profile and the newer ghost stay; so do the seed pool
    expect(w.ids()).toEqual(["player bb-0.12.0 a-new", "pool bb-0.11.0 pool2", "pool bb-0.12.0 pool1"].sort());
    expect(s[`profiles/${A1}.json`]).toBe(before[`profiles/${A1}.json`]);
    // a second run has nothing to do and succeeds, changing nothing
    const again = await admin(w, ["weekly", "--apply"]);
    expect(again.code, again.text).toBe(0);
    expect(again.out.slice(1)).toEqual([
      "weekly 1/3 prune-idle: deleted 0 idle player(s) (more than 730 days without play) and 0 of their upload(s)",
      "weekly 2/3 purge-tombstoned: deleted 0 of 0 upload(s) and 0 of 0 history object(s) of the 3 id(s) in tombstones",
      "weekly 3/3 prune-ghosts: deleted 0 of 0 upload(s) received more than 180 days ago",
      "weekly: done, all three steps succeeded",
    ]);
    expect(w.state()).toEqual(s);
  });

  it("the order matters: uploads that prune-idle could not remove are purged by the next step of the same run, because the player is tombstoned by then", async () => {
    const w = world(kind, fake);
    await plant(w);
    const firstRemoveDeletesNothing = (cfg: StoreConfig): AdminStore => {
      const real = openAdmin(cfg);
      let calls = 0;
      return {
        kind: real.kind, where: real.where, read: (rules, b) => real.read(rules, b), rulesVersions: () => real.rulesVersions!(), tombstoned: () => real.tombstoned!(),
        history: (ids) => real.history!(ids), removeHistory: (h) => real.removeHistory!(h), identity: () => real.identity!(),
        remove: async (records) => (++calls === 1 ? 0 : real.remove(records)), // the first removal is prune-idle's: it deletes nothing
      };
    };
    const r = await admin(w, ["weekly", "--apply"], NOW, firstRemoveDeletesNothing as never);
    expect(r.code, r.text).toBe(1);
    expect(r.out.filter((l) => /^weekly \d\/3 /.test(l))).toEqual([
      "weekly 1/3 prune-idle: deleted 1 idle player(s) (more than 730 days without play) and 0 of their upload(s) (FAILED: exit 1)",
      "weekly 2/3 purge-tombstoned: deleted 3 of 3 upload(s) and 1 of 1 history object(s) of the 3 id(s) in tombstones", // X's upload x1 is here: X is tombstoned
      "weekly 3/3 prune-ghosts: deleted 1 of 1 upload(s) received more than 180 days ago",
    ]);
    expect(w.ids()).toEqual(["player bb-0.12.0 a-new", "pool bb-0.11.0 pool2", "pool bb-0.12.0 pool1"].sort());
  });

  it("a step that fails is said, does not stop the next one, and makes the exit code 1", async () => {
    const w = world(kind, fake);
    await plant(w);
    const real = kind === "jsonl" ? new JsonlAdmin(w.argv[1]) : null;
    if (!real) return;
    let calls = 0;
    const flaky: AdminStore = {
      kind: real.kind, where: real.where, read: (rules) => real.read(rules), rulesVersions: () => real.rulesVersions(), tombstoned: () => real.tombstoned(),
      history: (ids) => real.history(ids), removeHistory: (h) => real.removeHistory(h), identity: () => real.identity(),
      remove: async (records) => {
        if (++calls === 3) throw new Error("the disk is full"); // the third removal: prune-ghosts'
        return real.remove(records);
      },
    };
    const r = await admin(w, ["weekly", "--apply"], NOW, (() => flaky) as never);
    expect(r.code, r.text).toBe(1);
    expect(r.out.filter((l) => /^weekly \d\/3 /.test(l))).toEqual([
      expect.stringContaining("weekly 1/3 prune-idle: deleted 1 idle player(s)"),
      expect.stringContaining("weekly 2/3 purge-tombstoned: deleted 2 of 2 upload(s)"),
      "weekly 3/3 prune-ghosts: failed: the disk is full (FAILED: exit 1)",
    ]);
    expect(r.out[r.out.length - 1]).toBe("weekly: finished with 1 failed step(s)");
    expect(w.ids()).toContain("player bb-0.12.0 a-old"); // the failed step left its ghost for the next run
  });
});
