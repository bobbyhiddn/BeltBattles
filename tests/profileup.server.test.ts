// PROFILE-UP step 3 (REQ-BFG-074 clause 4, backlog #371; BRIEF-PROFILEUP P2, P6): PUT /v1/profile through the real server in
// process, on both stores (the JSON-lines directory and Tigris on the in-process fake S3). Every status in P2 in its order
// (403, 401, 413, 401, 400, 422, 503, 200), the merged echo, two uploads merging, one key writing only its own record, the
// cross-domain refusals on the wire (both ways), CORS with PUT, 405 for other methods, the request log without ids, and the
// rate limit unchanged.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { KEY_HEADER, PROFILE_PREFIX, SIG_HEADER, UPLOAD_PREFIX, type Identity, type SignDomain } from "../src/net/identity";
import { MAX_PROFILE_BYTES, encodeWire, mergeWire, type WireProfile } from "../src/net/profileWire";
import { encodeSnapshot } from "../src/net/snapshot";
import { HEARTS_START } from "../src/sim/hearts";
import { createGhostServer, type GhostServer, type ServerOptions } from "../server/app";
import { FileProfileStore, MemoryProfileStore, TigrisProfileStore, profileStoreFor, type ProfileStore, type StoredProfile } from "../server/profileStore";
import { StorageError, type GhostStore, type JsonlStore } from "../server/store";
import type { TigrisStore } from "../server/tigrisStore";
import type { FakeS3 } from "../tools/fakeS3";
import { upSnap } from "./netHelpers";
import { ownedBy, testIdentity } from "./netIdentity";
import { jsonlBackend, startFake, tigrisFor, type StoreBackend } from "./netStores";
import { NOW, earnedWire } from "./profileupWire";

const SHORE = "http://127.0.0.1:7778"; // DEFAULT_ORIGINS
let ME: Identity, OTHER: Identity;
let backend: StoreBackend;
let fake: FakeS3;
let buckets = 0;

beforeAll(async () => {
  ME = await testIdentity(0);
  OTHER = await testIdentity(1);
  backend = jsonlBackend();
  await backend.setup();
  fake = await startFake();
});
afterAll(async () => {
  await backend.teardown();
  await fake.close();
});

// ------------------------------------------------------------------------------------------------------- the rig

type Kind = "jsonl" | "tigris";
type Opts = Omit<ServerOptions, "store" | "dataDir">;

interface Rig {
  kind: Kind;
  app: GhostServer;
  base: string;
  log: string[];
  clock: { now: number };
  /** The player's raw stored record, or null. */
  stored(playerId: string): Promise<string | null>;
  /** Write a raw record where the store keeps this player's. */
  seed(playerId: string, text: string): Promise<void>;
  /** Ghost files or objects that exist (a profile upload must create none). */
  ghostFiles(): number;
  /** Profile objects in the bucket (tigris), or the ids known to exist (jsonl: unknown, so null). */
  profileKeys(): string[] | null;
  /** Make the next profile write fail in this backend's own way. */
  breakWrites(): void;
  /** Make this player's record unreadable in this backend's own way (not absent: a directory in its place, or refused reads). */
  breakReads(playerId: string): void;
  close(): Promise<void>;
}

const opened: Rig[] = [];

/** A server over fresh, empty storage of the given kind, with a fixed clock (rig.clock.now) and its log captured. */
async function rig(kind: Kind, over: Opts = {}): Promise<Rig> {
  const log: string[] = [];
  const clock = { now: NOW };
  const opts: Opts = { log: (l) => log.push(l), now: () => clock.now, ...over };
  let app: GhostServer;
  let bucket = "";
  if (kind === "jsonl") {
    app = backend.server(opts, true); // a new empty directory each time
  } else {
    bucket = `bb-profile-${++buckets}`;
    fake.createBucket(bucket);
    app = createGhostServer({ ...opts, store: tigrisFor(fake, bucket, {}, { log: (l) => log.push(l) }) }); // the S3 client's own retry lines too
  }
  const base = `http://127.0.0.1:${await app.listen(0)}`;
  const dir = kind === "jsonl" ? (app.store as JsonlStore).dataDir : "";
  const s3 = kind === "tigris" ? (app.store as TigrisStore).s3 : null;
  const r: Rig = {
    kind, app, base, log, clock,
    async stored(id) {
      if (s3) return s3.getText(`profiles/${id}.json`);
      const f = join(dir, "profiles", `${id}.json`);
      return existsSync(f) ? readFileSync(f, "utf8") : null;
    },
    async seed(id, text) {
      if (s3) return s3.put(`profiles/${id}.json`, text);
      mkdirSync(join(dir, "profiles"), { recursive: true });
      writeFileSync(join(dir, "profiles", `${id}.json`), text);
    },
    ghostFiles: () => (kind === "tigris" ? fake.keys(bucket, "ghosts/").length : existsSync(join(dir, "ghosts.jsonl")) ? 1 : 0),
    profileKeys: () => (kind === "tigris" ? fake.keys(bucket, "profiles/") : null),
    breakWrites() {
      if (kind === "tigris") fake.failNext(3, 503, "PUT"); // the client retries twice: three attempts, all refused
      else writeFileSync(join(dir, "profiles"), "a file where the directory should be"); // mkdir fails
    },
    breakReads(id) {
      if (kind === "tigris") fake.failNext(3, 503, "GET"); // three attempts, all refused
      else mkdirSync(join(dir, "profiles", `${id}.json`), { recursive: true }); // a directory where the record's file should be: EISDIR
    },
    close: () => app.close(),
  };
  opened.push(r);
  return r;
}

afterAll(async () => {
  for (const r of opened) await r.close();
});

interface Reply {
  status: number;
  text: string;
  json: Record<string, unknown> | null;
  headers: Headers;
}

async function send(r: Rig, method: string, path: string, body?: string | Uint8Array<ArrayBuffer>, headers: Record<string, string> = {}): Promise<Reply> {
  const res = await fetch(`${r.base}${path}`, { method, headers, ...(body === undefined ? {} : { body }) });
  const text = await res.text();
  let json: Record<string, unknown> | null = null;
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : null;
  } catch {
    json = null;
  }
  return { status: res.status, text, json, headers: res.headers };
}

/** Headers for a body signed by `id` in `domain` (the profile's by default). */
async function signedBy(id: Identity, body: string | Uint8Array<ArrayBuffer>, domain: SignDomain = PROFILE_PREFIX): Promise<Record<string, string>> {
  const bytes = typeof body === "string" ? new TextEncoder().encode(body) : body;
  const { key, sig } = await id.sign(bytes, domain);
  return { "content-type": "application/json", [KEY_HEADER]: key, [SIG_HEADER]: sig };
}

/** PUT the canonical form of `w`, signed by `id` in the profile domain. */
async function putWire(r: Rig, w: WireProfile, id: Identity = ME): Promise<Reply> {
  const body = encodeWire(w);
  return send(r, "PUT", "/v1/profile", body, await signedBy(id, body));
}

/** PUT raw text signed correctly (so only the decode, the caps or the store can refuse it). */
async function putText(r: Rig, text: string | Uint8Array<ArrayBuffer>, id: Identity = ME): Promise<Reply> {
  return send(r, "PUT", "/v1/profile", text, await signedBy(id, text));
}

const record = (w: WireProfile, receivedAt = NOW): string => `{"receivedAt":${receivedAt},"profile":${encodeWire(w)}}`;

const W1 = (): WireProfile => earnedWire({ runs: 5, runsFinished: 2, duskWins: 9, bestDay: 6 }, { won: ["weaver"], finished: ["weaver"] }, { updatedAt: NOW - 1000 });
const W2 = (): WireProfile => earnedWire({ runs: 3, runsFinished: 3, duskWins: 14, bestDay: 4, mostBelts: 5 }, { won: ["furnace"] }, { updatedAt: NOW });

// ---------------------------------------------------------------------------------------------- per store backend

describe.each(["jsonl", "tigris"] as const)("PUT /v1/profile on the %s store", (kind) => {
  it("200: stores the upload under the signer's id and echoes the merged profile, canonical, with nothing else kept", async () => {
    const r = await rig(kind);
    const res = await putWire(r, W1());
    expect(res.status).toBe(200);
    expect(res.text).toBe(encodeWire(W1())); // the merged profile, in the canonical form
    expect(res.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(res.headers.get("cache-control")).toBe("no-store");
    const raw = await r.stored(ME.playerId);
    expect(raw).toBe(record(W1())); // {"receivedAt":<ms>,"profile":<merged>} and nothing else
    expect(Object.keys(JSON.parse(raw!))).toEqual(["receivedAt", "profile"]);
    expect(raw).not.toContain(ME.playerId);
    expect(await r.stored(OTHER.playerId)).toBeNull();
    // one key, one record; the ghost files and objects are untouched; /v1/health never reads profiles
    if (kind === "tigris") expect(r.profileKeys()).toEqual([`profiles/${ME.playerId}.json`]);
    expect(r.ghostFiles()).toBe(0);
    const health = await send(r, "GET", "/v1/health");
    expect(health.json).toMatchObject({ ok: true, store: kind, ghosts: 0, uploads: "open" });
  });

  it("two uploads merge: counters take the max, sets the union, chosen the newer one's; a second key stays apart", async () => {
    const r = await rig(kind);
    const a = W1(), b = W2();
    expect((await putWire(r, a)).status).toBe(200);
    r.clock.now = NOW + 5000;
    const second = await putWire(r, b);
    const merged = mergeWire(a, b);
    expect(second.status).toBe(200);
    expect(second.text).toBe(encodeWire(merged));
    expect(second.json).toMatchObject({ counters: { runs: 5, runsFinished: 3, duskWins: 14, bestDay: 6, mostBelts: 5 }, heroesWon: ["furnace", "weaver"], heroesFinished: ["weaver"], updatedAt: NOW });
    expect(await r.stored(ME.playerId)).toBe(record(merged, NOW + 5000)); // receivedAt is the second upload's
    // another device's profile is its own record
    const theirs = await putWire(r, W2(), OTHER);
    expect(theirs.text).toBe(encodeWire(W2()));
    expect(await r.stored(OTHER.playerId)).toBe(record(W2(), NOW + 5000));
    expect(await r.stored(ME.playerId)).toBe(record(merged, NOW + 5000));
    if (kind === "tigris") expect(r.profileKeys()).toEqual([`profiles/${ME.playerId}.json`, `profiles/${OTHER.playerId}.json`].sort());
  });

  it("chosen follows the newer updatedAt whichever upload arrives last; counters never go down", async () => {
    const r = await rig(kind);
    const played = { runs: 6, runsFinished: 6, warlordWins: 2, flawless: 1, matriarchWins: 1, mostBelts: 3, bestDay: 9 };
    const heroes = { won: ["furnace", "weaver", "foundry", "bastion"] };
    const rich = earnedWire({ ...played, duskWins: 100 }, heroes); // 100 dusk wins: CHAMPION'S GOLD
    const poor = earnedWire({ ...played, duskWins: 40 }, heroes); // 40: neither GOLD nor the RUNE CHAIN
    expect(rich.unlocked).toContain("style:carrier.gold");
    expect(poor.unlocked).not.toContain("style:carrier.gold");
    const newer = { ...rich, chosen: { ...rich.chosen, floor: "timber", carrier: "gold" }, updatedAt: NOW };
    const older = { ...poor, chosen: { ...poor.chosen, floor: "tread", carrier: "storm" }, updatedAt: NOW - 60_000 };
    expect((await putWire(r, newer)).status).toBe(200);
    const late = await putWire(r, older); // the older profile arrives last
    expect(late.status).toBe(200);
    expect(late.json).toMatchObject({ chosen: { floor: "timber", carrier: "gold" }, counters: { duskWins: 100 }, updatedAt: NOW });
  });

  it("the same body twice: 200 both times, the merged profile unchanged", async () => {
    const r = await rig(kind);
    const first = await putWire(r, W2());
    const again = await putWire(r, W2());
    expect([first.status, again.status]).toEqual([200, 200]);
    expect(again.text).toBe(first.text);
    expect(await r.stored(ME.playerId)).toBe(record(W2()));
  });

  it("a key can only write its own record: the body has no player id, and one that names another is refused", async () => {
    const r = await rig(kind);
    const named = JSON.stringify({ playerId: OTHER.playerId, ...JSON.parse(encodeWire(W1())) });
    const res = await putText(r, named, ME);
    expect(res.status).toBe(400);
    expect(res.json).toEqual({ error: "playerId: unknown field" });
    expect(await r.stored(OTHER.playerId)).toBeNull();
    expect(await r.stored(ME.playerId)).toBeNull();
    // and a good upload by ME touches only ME's record
    expect((await putWire(r, W1(), ME)).status).toBe(200);
    expect(await r.stored(OTHER.playerId)).toBeNull();
  });

  it("403 while uploads are closed, before the body is read: a signed body, an unsigned oversize body, nothing at all", async () => {
    const r = await rig(kind, { uploads: "closed" });
    expect((await send(r, "GET", "/v1/health")).json).toMatchObject({ uploads: "closed" });
    const signed = await putWire(r, W1());
    expect(signed).toMatchObject({ status: 403, json: { error: "uploads are not open yet" } });
    expect((await send(r, "PUT", "/v1/profile", " ".repeat(20_000))).status).toBe(403); // not a 401, not a 413
    expect((await send(r, "PUT", "/v1/profile")).status).toBe(403);
    expect(await r.stored(ME.playerId)).toBeNull();
  });

  it("401 for a missing or malformed signing header, before the body is read: an unsigned oversize body is a 401, not a 413", async () => {
    const r = await rig(kind);
    const body = encodeWire(W1());
    const h = await signedBy(ME, body);
    const key = h[KEY_HEADER], sig = h[SIG_HEADER];
    const cases: [string, Record<string, string>][] = [
      ["no headers", {}],
      ["x-bb-sig missing", { [KEY_HEADER]: key }],
      ["x-bb-key missing", { [SIG_HEADER]: sig }],
      ["x-bb-key not base64url", { [KEY_HEADER]: "not a key", [SIG_HEADER]: sig }],
      ["x-bb-key padded", { [KEY_HEADER]: `${key}=`, [SIG_HEADER]: sig }],
      ["x-bb-sig truncated", { [KEY_HEADER]: key, [SIG_HEADER]: sig.slice(0, 43) }],
    ];
    for (const [what, headers] of cases) {
      const res = await send(r, "PUT", "/v1/profile", body, headers);
      expect(res.status, what).toBe(401);
      expect(String(res.json?.error), what).toMatch(/^(unsigned upload: the x-bb-key and x-bb-sig headers are required|x-bb-key: |x-bb-sig: )/);
    }
    expect((await send(r, "PUT", "/v1/profile", " ".repeat(20_000), {})).status).toBe(401);
    expect(await r.stored(ME.playerId)).toBeNull();
  });

  it("413 over MAX_PROFILE_BYTES; a body of exactly that size is read (and then refused for what it is)", async () => {
    const r = await rig(kind);
    expect(MAX_PROFILE_BYTES).toBe(2048);
    const over = await putText(r, " ".repeat(MAX_PROFILE_BYTES + 1));
    expect(over.status).toBe(413);
    expect(over.json).toEqual({ error: `request body over ${MAX_PROFILE_BYTES} bytes` });
    const exact = await putText(r, " ".repeat(MAX_PROFILE_BYTES));
    expect(exact.status).toBe(400); // read, signed correctly, and not a profile
    expect((await putText(r, " ".repeat(20_000))).status).toBe(413);
    expect(await r.stored(ME.playerId)).toBeNull();
  });

  it("401 when the signature does not verify in the profile domain: a changed byte, another key's signature, a ghost-domain signature", async () => {
    const r = await rig(kind);
    const w = W1();
    const body = encodeWire(w);
    const headers = await signedBy(ME, body);
    const tampered = body.replace(`"updatedAt":${NOW - 1000}`, `"updatedAt":${NOW - 1001}`);
    expect(tampered).not.toBe(body);
    const t = await send(r, "PUT", "/v1/profile", tampered, headers);
    expect(t).toMatchObject({ status: 401, json: { error: "x-bb-sig: the signature does not match this body and key" } });
    const byOther = await signedBy(OTHER, body);
    expect((await send(r, "PUT", "/v1/profile", body, { ...headers, [SIG_HEADER]: byOther[SIG_HEADER] })).status).toBe(401);
    // cross-domain refusal 1: the same exact bytes, signed in the ghost domain, are not a profile upload
    const ghostSigned = await signedBy(ME, body, UPLOAD_PREFIX);
    const g = await send(r, "PUT", "/v1/profile", body, ghostSigned);
    expect(g).toMatchObject({ status: 401, json: { error: "x-bb-sig: the signature does not match this body and key" } });
    expect(await r.stored(ME.playerId)).toBeNull();
    // the control: signed in the profile domain, the same bytes are accepted
    expect((await send(r, "PUT", "/v1/profile", body, headers)).status).toBe(200);
  });

  it("400 for a body that is not UTF-8, has a byte order mark, is empty or is not exactly the canonical wire profile", async () => {
    const r = await rig(kind);
    const good = encodeWire(W1());
    const bom = "\uFEFF" + good;
    const obj = JSON.parse(good) as Record<string, unknown>;
    const cases: [string, string | Uint8Array<ArrayBuffer>, string][] = [
      ["not UTF-8", new Uint8Array([0x7b, 0xff, 0xfe, 0x7d]), "request body is not UTF-8"],
      ["byte order mark", bom, "profile: not JSON"],
      ["empty", "", "profile: not JSON"],
      ["not JSON", "{", "profile: not JSON"],
      ["an array", "[]", "profile: expected an object"],
      ["unknown field", JSON.stringify({ ...obj, seen: [] }), "seen: unknown field"],
      ["missing field", JSON.stringify({ ...obj, updatedAt: undefined }), "updatedAt: missing"],
      ["wrong type", JSON.stringify({ ...obj, counters: { ...(obj.counters as object), runs: "5" } }), "counters.runs: expected a non-negative integer"],
      ["negative", JSON.stringify({ ...obj, counters: { ...(obj.counters as object), runs: -1 } }), "counters.runs: expected a non-negative integer"],
      ["not an integer", JSON.stringify({ ...obj, counters: { ...(obj.counters as object), runs: 1.5 } }), "counters.runs: expected a non-negative integer"],
      ["unsorted set", JSON.stringify({ ...obj, heroesWon: ["weaver", "furnace"] }), "heroesWon: not sorted"],
      ["duplicate in a set", JSON.stringify({ ...obj, heroesWon: ["furnace", "furnace"] }), "heroesWon: duplicate entry"],
      ["spaces", JSON.stringify(obj, null, 1), "profile: not in the canonical form"],
      ["trailing newline", good + "\n", "profile: not in the canonical form"],
      ["another key order", JSON.stringify({ updatedAt: obj.updatedAt, ...obj }), "profile: not in the canonical form"],
    ];
    for (const [what, text, error] of cases) {
      const res = await putText(r, text);
      expect(res.status, what).toBe(400);
      expect(Object.keys(res.json ?? {}), what).toEqual(["error"]);
      expect(String(res.json?.error).startsWith(error), `${what}: ${String(res.json?.error)}`).toBe(true);
    }
    expect(await r.stored(ME.playerId)).toBeNull();
  });

  it("422 for a version this server cannot read, and for each plausibility cap, naming the field; nothing is stored", async () => {
    const r = await rig(kind);
    const w = W1();
    const cases: [string, WireProfile | string, string][] = [
      ["a newer v", JSON.stringify({ ...JSON.parse(encodeWire(w)), v: 2, anything: true }), "v: version 2 is newer than this server reads (1)"],
      ["bestDay over its ceiling", { ...w, counters: { ...w.counters, bestDay: 1000 } }, "counters.bestDay: 1000 is over the ceiling 999"],
      ["a counter over the million", { ...w, counters: { ...w.counters, duskWins: 1_000_001 } }, "counters.duskWins: 1000001 is over the ceiling 1000000"],
      ["runsFinished past runs", { ...w, counters: { ...w.counters, runs: 2, runsFinished: 3 } }, "counters.runsFinished: 3 is more than counters.runs (2)"],
      ["flawless past runs", { ...w, counters: { ...w.counters, runs: 1, runsFinished: 0, flawless: 2 } }, "counters.flawless: 2 is more than counters.runs (1)"],
      ["matriarchWins past warlordWins", { ...w, counters: { ...w.counters, warlordWins: 0, matriarchWins: 1 } }, "counters.matriarchWins: 1 is more than counters.warlordWins (0)"],
      ["a hero the game does not have", { ...w, heroesWon: ["nobody"] }, 'heroesWon: "nobody" is not a hero'],
      ["a style the catalogue does not have", { ...w, unlocked: ["style:floor.nope"] }, 'unlocked: "style:floor.nope" is not an unlockable style'],
      ["a style the counters do not earn", { ...w, unlocked: [...w.unlocked, "style:carrier.gold"].sort() }, 'unlocked: "style:carrier.gold" is not earned by these counters'],
      ["a pick that is locked", { ...w, chosen: { ...w.chosen, belt: "rune" } }, 'chosen.belt: "rune" is not unlocked'],
      ["a pick that is no style", { ...w, chosen: { ...w.chosen, panel: "gilt" } }, 'chosen.panel: "gilt" is not a style'],
      ["updatedAt a day and a bit ahead of the server", { ...w, updatedAt: NOW + 86_400_001 }, "updatedAt: not between 2026-01-01 and a day from now"],
      ["updatedAt before 2026", { ...w, updatedAt: Date.UTC(2025, 11, 31) }, "updatedAt: not between 2026-01-01 and a day from now"],
    ];
    for (const [what, input, error] of cases) {
      const res = typeof input === "string" ? await putText(r, input) : await putWire(r, input);
      expect(res.status, what).toBe(422);
      expect(res.json, what).toEqual({ error });
    }
    expect(await r.stored(ME.playerId)).toBeNull();
  });

  it("honest profiles under 1D's rules are accepted: a day past 10, more dusk wins than ten a run (RUN-1, ENDLESS)", async () => {
    const r = await rig(kind);
    const w = earnedWire({ runs: 1, runsFinished: 1, flawless: 1, duskWins: 80, bestDay: 25, warlordWins: 6, matriarchWins: 2, mostBelts: 8 }, { won: ["furnace", "weaver", "foundry"], finished: ["furnace"] }, { updatedAt: NOW + 60_000 });
    const res = await putWire(r, w);
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ counters: { bestDay: 25, duskWins: 80, runs: 1 } });
  });

  it("503 when storage is down; the next upload after it recovers is stored", async () => {
    const r = await rig(kind);
    r.breakWrites();
    const down = await putWire(r, W1());
    expect(down.status).toBe(503);
    expect(down.headers.get("retry-after")).toBe("5");
    expect(down.json).toEqual({ error: "ghost storage unavailable, try again shortly" });
    const lines = r.log.filter((l) => l.startsWith("storage error:"));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^storage error: profile write failed/);
    expect(lines[0]).not.toContain(ME.playerId); // op and status only: never the player id, a key or a path
    expect(lines[0]).not.toContain("profiles/");
    if (kind === "tigris") {
      expect((await putWire(r, W1())).status).toBe(200); // the faults are spent
      expect(await r.stored(ME.playerId)).toBe(record(W1()));
    }
  });

  it("a record that cannot be read is storage trouble, never 'none': 503, and nothing is written over it", async () => {
    const r = await rig(kind);
    r.breakReads(ME.playerId);
    const res = await putWire(r, W1());
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBe("5");
    const lines = r.log.filter((l) => l.startsWith("storage error:"));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^storage error: profile read failed/);
    expect(r.log.join("\n")).not.toContain(ME.playerId);
    if (kind === "tigris") expect(r.profileKeys()).toEqual([]); // the write was never tried
    expect(r.log.filter((l) => l.includes("profiles/") && l.includes(".json"))).toEqual([]);
  });

  it("a stored record that is not a record is treated as none (the upload replaces it); one from a newer version is never overwritten (503)", async () => {
    const r = await rig(kind);
    await r.seed(ME.playerId, '{"receivedAt":1,"profile":{"v":1}}');
    const healed = await putWire(r, W1());
    expect(healed.status).toBe(200);
    expect(healed.text).toBe(encodeWire(W1()));
    expect(await r.stored(ME.playerId)).toBe(record(W1()));
    await r.seed(OTHER.playerId, "garbage");
    expect((await putWire(r, W2(), OTHER)).status).toBe(200);
    // a record written by a server that reads v2: this server keeps it and says so
    const newer = JSON.stringify({ receivedAt: 1, profile: { ...JSON.parse(encodeWire(W1())), v: 2 } });
    const id3 = await testIdentity(2);
    await r.seed(id3.playerId, newer);
    const refused = await putWire(r, W2(), id3);
    expect(refused.status).toBe(503);
    expect(await r.stored(id3.playerId)).toBe(newer);
    expect(r.log.some((l) => l.includes("newer version than this server reads"))).toBe(true);
  });

  it("405 for other methods (GET, POST, DELETE, HEAD); the ghost routes keep their own methods", async () => {
    const r = await rig(kind);
    const body = encodeWire(W1());
    const signed = await signedBy(ME, body);
    for (const method of ["GET", "POST", "DELETE"]) {
      const res = await send(r, method, "/v1/profile", method === "GET" ? undefined : body, method === "GET" ? {} : signed);
      expect(res.status, method).toBe(405);
      expect(res.json, method).toEqual({ error: "use PUT" });
    }
    expect((await send(r, "HEAD", "/v1/profile")).status).toBe(405);
    expect((await send(r, "PUT", "/v1/ghosts", body, signed))).toMatchObject({ status: 405, json: { error: "use POST" } });
    expect((await send(r, "PUT", "/v1/health"))).toMatchObject({ status: 405, json: { error: "use GET" } });
    expect(await r.stored(ME.playerId)).toBeNull();
  });

  it("CORS: the preflight lists PUT and both signing headers for a configured origin; a PUT from one is allowed, from another is not", async () => {
    const r = await rig(kind);
    const pre = await fetch(`${r.base}/v1/profile`, {
      method: "OPTIONS",
      headers: { origin: SHORE, "access-control-request-method": "PUT", "access-control-request-headers": "content-type,x-bb-key,x-bb-sig" },
    });
    expect(pre.status).toBe(204);
    expect(pre.headers.get("access-control-allow-origin")).toBe(SHORE);
    expect(pre.headers.get("access-control-allow-methods")).toBe("GET, POST, PUT, OPTIONS");
    expect(pre.headers.get("access-control-allow-headers")).toBe("content-type, x-bb-key, x-bb-sig");
    const body = encodeWire(W1());
    const headers = await signedBy(ME, body);
    const ok = await send(r, "PUT", "/v1/profile", body, { ...headers, origin: SHORE });
    expect(ok.status).toBe(200);
    expect(ok.headers.get("access-control-allow-origin")).toBe(SHORE);
    const evil = await send(r, "PUT", "/v1/profile", body, { ...headers, origin: "http://evil.example" });
    expect(evil.headers.get("access-control-allow-origin")).toBeNull();
    const refusedPre = await fetch(`${r.base}/v1/profile`, { method: "OPTIONS", headers: { origin: "http://evil.example" } });
    expect(refusedPre.status).toBe(403);
  });

  it("the rate limit is unchanged: the same per-address budget as every route, 429 with retry-after past it", async () => {
    const r = await rig(kind, { rateLimit: { windowMs: 60_000, max: 4 } });
    expect((await send(r, "GET", "/v1/health")).status).toBe(200);
    expect((await send(r, "GET", "/v1/health")).status).toBe(200);
    expect((await send(r, "PUT", "/v1/profile", "{}", {})).status).toBe(401);
    expect((await putWire(r, W1())).status).toBe(200); // the 4th request in the window
    const limited = await putWire(r, W2());
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("60");
    expect(limited.json).toEqual({ error: "rate limit exceeded, slow down" });
    expect((await send(r, "GET", "/v1/health")).status).toBe(429); // one budget for all routes
    expect(await r.stored(ME.playerId)).toBe(record(W1()));
  });

  it("the request log stays as it was: time, method, path, status, duration; no player id, key, signature, address or body", async () => {
    const r = await rig(kind);
    const w = W1();
    await putWire(r, w);
    await putText(r, "{");
    await send(r, "PUT", "/v1/profile", "{}", {});
    const lines = r.log.filter((l) => l.includes("/v1/profile"));
    expect(lines).toHaveLength(3);
    const re = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z PUT \/v1\/profile (200|400|401) \d+ms$/;
    for (const l of lines) expect(l, l).toMatch(re);
    expect(lines.map((l) => l.split(" ")[3])).toEqual(["200", "400", "401"]);
    const all = r.log.join("\n");
    const h = await signedBy(ME, "x");
    for (const secret of [ME.playerId, h[KEY_HEADER], "127.0.0.1", "counters", "heroesWon", String(w.updatedAt)]) {
      expect(all, secret).not.toContain(secret);
    }
  });

  it("the ghost upload is untouched by the profile route: a ghost POST still answers 201, a profile-domain signature on it is a 401 (cross-domain refusal 2)", async () => {
    const r = await rig(kind);
    // BUMP-1D (LONG_RUN ships on): this build's rules are a long run's, whose upload states the dusks the run lost (server/app.ts
    // lossesProblem: 422 "losses: ..." without it): day 1's dusk comes after none. Was no losses
    const mine = ownedBy(upSnap({ lives: HEARTS_START, losses: 0 }), ME);
    const body = encodeSnapshot(mine);
    const wrong = await send(r, "POST", "/v1/ghosts", body, await signedBy(ME, body, PROFILE_PREFIX));
    expect(wrong).toMatchObject({ status: 401, json: { error: "x-bb-sig: the signature does not match this body and key" } });
    expect(r.app.store.size).toBe(0);
    const right = await send(r, "POST", "/v1/ghosts", body, await signedBy(ME, body, UPLOAD_PREFIX));
    expect(right.status).toBe(201);
    expect(r.app.store.size).toBe(1);
    expect(await r.stored(ME.playerId)).toBeNull(); // a ghost upload makes no profile
    expect((await putWire(r, W1())).status).toBe(200);
    expect(r.app.store.size).toBe(1); // and a profile upload makes no ghost
  });

  it("the default profile store sits beside the ghosts: the data directory's profiles/ (jsonl), the bucket's profiles/<playerId>.json (Tigris)", async () => {
    const r = await rig(kind);
    await putWire(r, W1());
    const store = profileStoreFor(r.app.store);
    expect(store).toBeInstanceOf(kind === "jsonl" ? FileProfileStore : TigrisProfileStore);
    expect((await store.get(ME.playerId))?.profile).toEqual(W1());
    expect((await store.get(OTHER.playerId))).toBeNull();
    await expect(store.get("../escape")).rejects.toThrow("not a player id");
    await expect(store.get("a/b")).rejects.toThrow("not a player id");
    await expect(store.put("", { profile: W1(), receivedAt: 1 })).rejects.toThrow("not a player id");
  });
});

describe("PUT /v1/profile on Tigris: the S3 client's own log lines", () => {
  it("its retry lines do not carry the player id: a refused read and a refused write show profiles/*", async () => {
    const r = await rig("tigris");
    fake.failNext(1, 503, "GET"); // refused once, then 404: no record yet
    fake.failNext(2, 503, "PUT"); // refused twice, then stored
    const res = await putWire(r, W1());
    expect(res.status).toBe(200);
    const s3 = r.log.filter((l) => l.startsWith("s3 "));
    expect(s3).toHaveLength(3);
    for (const l of s3) expect(l, l).toMatch(/^s3 (GET|PUT) profiles\/\*: HTTP 503[ A-Za-z]*; retry \d\/2 in \d+ ms$/);
    expect(r.log.join("\n")).not.toContain(ME.playerId);
    expect(await r.stored(ME.playerId)).toBe(record(W1()));
  });

  it("a ghost object's key is still shown whole (only profile objects are masked)", async () => {
    const r = await rig("tigris");
    const mine = ownedBy(upSnap({ lives: HEARTS_START, losses: 0 }), ME); // BUMP-1D: and the dusks lost before day 1's (none), as above
    const body = encodeSnapshot(mine);
    fake.failNext(1, 503, "PUT"); // the ghost's own write is refused once
    const res = await send(r, "POST", "/v1/ghosts", body, await signedBy(ME, body, UPLOAD_PREFIX));
    expect(res.status).toBe(201);
    const s3 = r.log.filter((l) => l.startsWith("s3 PUT ghosts/"));
    expect(s3).toHaveLength(1);
    expect(s3[0]).toMatch(/^s3 PUT ghosts\/bb-0\.13\.0\/d01\/player\/g[0-9a-f]+\.json: HTTP 503/); // BUMP-1F (label bb-0.12.0 -> bb-0.13.0, the object key's rules): was bb-0\.12\.0. BUMP-1E: the bump (was bb-0.11.0). BUMP-1D: the key holds this build's rules (was bb-0\.10\.0)
  });
});

// ---------------------------------------------------------------------------------------- stores and injected failures

describe("a store that fails", () => {
  const failing = (where: "get" | "put"): ProfileStore => ({
    async get() {
      if (where === "get") throw new StorageError("profile read failed (test)");
      return null;
    },
    async put() {
      throw new StorageError("profile write failed (test)");
    },
  });

  it("503 whether the read or the write fails; the rest of the server is unaffected", async () => {
    for (const where of ["get", "put"] as const) {
      const r = await rig("jsonl", { profileStore: failing(where) });
      const res = await putWire(r, W1());
      expect(res.status, where).toBe(503);
      expect(res.headers.get("retry-after")).toBe("5");
      expect((await send(r, "GET", "/v1/health")).status).toBe(200);
    }
  });

  it("an unexpected error is a 500 with no detail in the answer", async () => {
    const boom: ProfileStore = { get: async () => { throw new Error("disk exploded"); }, put: async () => {} };
    const r = await rig("jsonl", { profileStore: boom });
    const res = await putWire(r, W1());
    expect(res).toMatchObject({ status: 500, json: { error: "internal error" } });
  });

  it("the default for a ghost store this code does not know is in memory, and says so in the log; profileStoreFor reads the real ones", async () => {
    const lines: string[] = [];
    expect(profileStoreFor({} as GhostStore, (l) => lines.push(l))).toBeInstanceOf(MemoryProfileStore);
    expect(lines).toEqual(["profile store: this ghost store is neither the file nor the Tigris store; profiles are kept in memory only"]);
    expect(profileStoreFor({} as GhostStore)).toBeInstanceOf(MemoryProfileStore);
    const mem = new MemoryProfileStore();
    const rec: StoredProfile = { profile: W2(), receivedAt: 7 };
    await mem.put(ME.playerId, rec);
    expect(await mem.get(ME.playerId)).toEqual(rec);
    expect(await mem.get(OTHER.playerId)).toBeNull();
    await expect(mem.get("../x")).rejects.toThrow("not a player id");
  });

  it("a server given a profile store uses it instead of the default (and still never reads it for /v1/health)", async () => {
    const mem = new MemoryProfileStore();
    const r = await rig("jsonl", { profileStore: mem });
    expect((await putWire(r, W1())).status).toBe(200);
    expect(mem.records.get(ME.playerId)).toBe(record(W1()));
    expect(await r.stored(ME.playerId)).toBeNull(); // not in the data directory
  });
});
