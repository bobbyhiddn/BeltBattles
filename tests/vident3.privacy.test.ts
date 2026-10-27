// VERIFY-IDENT2 step 4 item j (REQ-BFG-122 clause 4): privacy and logs. Sentinel strings (distinctive entry ids, the players' own ids, the key
// and signature headers) go through every history route on both stores, with store faults on Tigris so the S3 client's retry and error lines
// are produced too, and then every log line (the server's request log and error lines, the S3 client's log) and every reply is searched for
// them. Also: what is in a stored entry (the object on each store, and the one a real device sends), an entry read of ANOTHER player's id
// against an unknown id (same status, body and headers), and the log templates in the history code.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { HISTORY_GET_PREFIX, HISTORY_PREFIX, KEY_HEADER, SIG_HEADER, type Identity } from "../src/net/identity";
import { HISTORY_END_SUFFIX, encodeEntry, type HistoryEntry } from "../src/net/historyWire";
import { TigrisHistoryStore, nameOf } from "../server/historyStore";
import { S3Client } from "../server/s3";
import { testIdentity } from "./netIdentity";
import { closeRigs, deleteMe, linkVia, send, signedBy, theFake } from "./identRig";
import {
  FINISHED, NOW, allHistory, entryFor, getEntry, getSigned, historyObjects, historyOf, historyRaw, listEntries, listed, openHistoryRig, putEntry, readObject, recordOf,
  type Kind, type Reply, type Rig,
} from "./ident2Rig";
import { setSession } from "../src/game/session";
import { foldRunEnd } from "../src/game/styleFolds";
import { historyIdle, resetHistorySync, syncHistory } from "../src/net/historySync";
import { LINK_KEY, encodeLink } from "../src/net/linkState";
import { HISTORY_KEY, markSent, resetHistoryWarning } from "../src/game/history";
import { memoryKeyStore } from "../src/net/identity";
import { deleteOnlineData } from "../src/net/linkClient";
import { device, mem, playedRun } from "./ident2Local";

let A: Identity, B: Identity, C: Identity;
beforeAll(async () => {
  [A, B, C] = await Promise.all([0, 1, 2].map((n) => testIdentity(n)));
});
afterAll(closeRigs);
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  setSession(null);
});

const KINDS: Kind[] = ["jsonl", "tigris"];
const SA = "SENTINEL-A-5f3c91"; // A's entry ids start with it
const SB = "SENTINEL-B-8d2147"; // B's
const nameOfEntry = (e: HistoryEntry): string => nameOf({ finishedAt: e.finishedAt, id: e.id });
const NAME_TS = (e: HistoryEntry): string => String(9_999_999_999_999 - e.finishedAt).padStart(13, "0");

/** The headers a client sent: the key and the signature, so a test can search the logs for them. */
async function headersOf(id: Identity, domain: string): Promise<{ key: string; sig: string }> {
  const h = await signedBy(id, "probe", domain as never);
  return { key: h[KEY_HEADER], sig: h[SIG_HEADER] };
}

/** What a reply is, for comparing two of them: status, text and every header but the clock. */
const sigOf = (r: Reply): string => JSON.stringify({ status: r.status, text: r.text, headers: [...r.headers].filter(([k]) => k !== "date").sort() });

interface Seen { who: string; what: string; reply: Reply }

describe.each(KINDS)("4j. sentinels through every history route, with store faults (%s)", (kind) => {
  it("no log line (request log, storage errors, the S3 client's retry and error lines) and no reply holds a player id, a key, a signature, an entry id, a time or an object name that is not its owner's", async () => {
    const rig = await openHistoryRig(kind);
    const s3lines: string[] = [];
    if (kind === "tigris") {
      const s3 = (historyOf(rig) as unknown as { s3: { log: (l: string) => void } }).s3;
      s3.log = (l: string) => s3lines.push(l);
    }
    const seen: Seen[] = [];
    const note = (who: string, what: string, reply: Reply): Reply => (seen.push({ who, what, reply }), reply);
    const eA1 = entryFor(`${SA}-1`, { finishedAt: FINISHED - 1000, dusks: [{ day: 1, outcome: "win", record: recordOf(3) }, { day: 2, outcome: "loss" }, { day: 3, outcome: "win" }] });
    const eA2 = entryFor(`${SA}-2`, { finishedAt: FINISHED - 2000 });
    const eA3 = entryFor(`${SA}-3`, { finishedAt: FINISHED - 3000 });
    const eA4 = entryFor(`${SA}-4`, { finishedAt: FINISHED - 4000 });
    const eB1 = entryFor(`${SB}-1`, { finishedAt: FINISHED - 5000 });
    expect((await linkVia(rig, A, C)).joined.status).toBe(200); // C is another key of A's player
    // ---- stores, repeats, conflicts, refusals
    expect(note("A", "put new", await putEntry(rig, A, eA1)).status).toBe(201);
    expect(note("A", "put new", await putEntry(rig, A, eA2)).status).toBe(201);
    expect(note("A", "put repeat", await putEntry(rig, A, eA1)).status).toBe(200);
    expect(note("A", "put conflict", await putEntry(rig, A, { ...eA1, hero: "weaver" })).status).toBe(409);
    expect(note("A", "put cap", await putEntry(rig, A, { ...eA3, wins: 50 })).status).toBe(422);
    expect(note("A", "put wrong domain", await putEntry(rig, A, eA3, NOW, HISTORY_GET_PREFIX)).status).toBe(401);
    expect(note("B", "put new", await putEntry(rig, B, eB1)).status).toBe(201);
    // ---- reads
    expect(note("A", "list", await listEntries(rig, A)).status).toBe(200);
    expect(note("A", "read own", await getEntry(rig, A, eA2.id)).status).toBe(200);
    expect(note("C", "read as A's other key", await getEntry(rig, C, eA2.id)).status).toBe(200);
    expect(note("B", "list", await listEntries(rig, B)).status).toBe(200);
    expect(note("B", "read A's id", await getEntry(rig, B, eA2.id)).status).toBe(404);
    expect(note("B", "read unknown", await getEntry(rig, B, `${SA}-unknown`)).status).toBe(404);
    expect(note("A", "read B's id", await getEntry(rig, A, eB1.id)).status).toBe(404);
    expect(note("A", "bad query", await getSigned(rig, A, `/v1/history?at=${NOW}&id=${eA2.id}&x=1`)).status).toBe(400);
    expect(note("A", "bad signature", await getSigned(rig, A, `/v1/history?at=${NOW}&id=${eA2.id}`, `/v1/history?at=${NOW}&id=other`)).status).toBe(401);
    expect(note("A", "stale at", await getEntry(rig, A, eA2.id, NOW - 3_600_000)).status).toBe(422);
    // ---- store faults (Tigris): the S3 client retries and fails with its own words
    if (kind === "tigris") {
      const f = theFake();
      f.failNext(1, 503, "PUT");
      expect(note("A", "put after one 503", await putEntry(rig, A, eA3)).status).toBe(201); // one retry line
      f.failNext(3, 503, "PUT");
      expect(note("A", "put while PUT is down", await putEntry(rig, A, eA4)).status).toBe(503);
      f.failNext(1, 503, "GET");
      expect(note("A", "read after one 503", await getEntry(rig, A, eA3.id)).status).toBe(200);
      f.failNext(3, 503, "GET");
      expect(note("A", "read while GET is down", await getEntry(rig, A, eA3.id)).status).toBe(503);
      f.failNext(3, 503, "LIST");
      expect(note("A", "list while LIST is down", await listEntries(rig, A)).status).toBe(503);
      f.clearFaults();
      expect(note("A", "put again", await putEntry(rig, A, eA4)).status).toBe(201);
      f.failNext(3, 503, "DELETE");
    }
    // ---- A's deletion (the history goes with it; on Tigris the first DELETEs fail, so the repeat finishes the job)
    let del = note("A", "delete", await deleteMe(rig, A));
    if (del.status !== 200) del = note("A", "delete again", await deleteMe(rig, A));
    if (del.status !== 200) del = note("A", "delete once more", await deleteMe(rig, A));
    if (kind === "tigris") theFake().clearFaults();
    expect(del.status).toBe(200);
    expect(note("A", "read after delete", await getEntry(rig, A, eA2.id)).status).toBe(410);
    expect(note("C", "read after delete", await getEntry(rig, C, eA2.id)).status).toBe(410);
    expect(note("B", "read A's old id after delete", await getEntry(rig, B, eA2.id)).status).toBe(404);
    expect(allHistory(rig).filter((k) => k.includes(A.playerId)), "A's history is gone").toEqual([]);

    // ---- search every log line
    const ha = await headersOf(A, HISTORY_PREFIX), hb = await headersOf(B, HISTORY_PREFIX), hc = await headersOf(C, HISTORY_PREFIX);
    const lines = [...rig.log.filter((l) => !l.startsWith("ghost store ")), ...s3lines];
    const text = lines.join("\n");
    console.log(`4j LOG ${kind}: ${rig.log.length} server lines, ${s3lines.length} S3 lines; storage errors: ${JSON.stringify(rig.log.filter((l) => l.startsWith("storage error")).slice(0, 4))}; S3: ${JSON.stringify(s3lines.slice(0, 3))}`);
    const secrets: [string, string][] = [
      ["A's player id", A.playerId], ["B's player id", B.playerId], ["C's player id", C.playerId], ["A's key", ha.key], ["B's key", hb.key], ["C's key", hc.key],
      ["A's signature", ha.sig.slice(0, 20)], ["the sentinel of A", SA], ["the sentinel of B", SB], ["an entry id", "SENTINEL"], ["the object time", NAME_TS(eA1)],
      ["finishedAt", String(FINISHED - 1000)], ["a json name", ".json"], ["a query", "at="], ["an id query", "id="], ["the path of an object", "history/" + A.playerId],
    ];
    for (const [what, s] of secrets) expect(text, `a log line holds ${what}`).not.toContain(s);
    expect(text, "history/ appears only masked, as history/*").not.toMatch(/history\/(?!\*)/);
    for (const l of rig.log.filter((x) => x.includes("/v1/"))) expect(l, l).toMatch(/^\S+ (GET|PUT|POST|DELETE) \/v1\/[a-z/]+ \d{3} \d+ms$/);
    if (kind === "tigris") {
      expect(s3lines.length, "the faults produced S3 retry lines").toBeGreaterThanOrEqual(2);
      expect(s3lines.filter((l) => l.includes("history/*")).length, "... of history objects, masked").toBeGreaterThanOrEqual(1);
      expect(rig.log.filter((l) => l.startsWith("storage error: history")).length).toBeGreaterThanOrEqual(2);
    }

    // ---- search every reply: nothing of another player's
    const repliesOf = (who: string): string => seen.filter((s) => s.who === who).map((s) => `${s.what} ${s.reply.status} ${s.reply.text} ${JSON.stringify([...s.reply.headers])}`).join("\n");
    const forB = repliesOf("B");
    for (const [what, s] of [["A's player id", A.playerId], ["A's key", ha.key], ["A's sentinel", SA], ["A's entry time", String(eA2.finishedAt)], ["A's object name", NAME_TS(eA2)]] as const) {
      expect(forB, `B's replies hold ${what}`).not.toContain(s);
    }
    const forA = repliesOf("A") + repliesOf("C");
    for (const [what, s] of [["B's player id", B.playerId], ["B's key", hb.key], ["B's sentinel", SB], ["B's entry time", String(eB1.finishedAt)]] as const) {
      expect(forA, `A's replies hold ${what}`).not.toContain(s);
    }
    // the replies' words are the server's fixed words: no reply of an error status carries an id or a name
    for (const s of seen.filter((x) => x.reply.status >= 400)) {
      expect(s.reply.text, `${s.who} ${s.what}`).not.toMatch(/SENTINEL|history\/|\.json|[A-Za-z0-9_-]{43}/);
    }
    // B's list holds B's entries and nothing else
    const bl = seen.find((s) => s.who === "B" && s.what === "list")!;
    expect(listed(bl.reply)).toEqual([{ id: eB1.id, finishedAt: eB1.finishedAt }]);
  });
});

describe.each(KINDS)("4j. an entry read of ANOTHER player's id answers exactly as an unknown id does (%s)", (kind) => {
  it("same status, same body, same headers (the clock aside) whether the id exists for someone else, exists for nobody, is the reader's own spelling in another case, or is 64 characters long", async () => {
    const rig = await openHistoryRig(kind);
    const eA = entryFor(`${SA}-1`, { finishedAt: FINISHED - 1000 });
    const eB = entryFor(`${SB}-1`, { finishedAt: FINISHED - 2000 });
    expect((await putEntry(rig, A, eA)).status).toBe(201);
    expect((await putEntry(rig, B, eB)).status).toBe(201);
    const longId = "L".repeat(64);
    expect((await putEntry(rig, A, entryFor(longId, { finishedAt: FINISHED - 3000 }))).status).toBe(201);
    // B reads: A's id, an id nobody has, A's id in another case, A's 64-character id, an id that is B's own (control)
    const other = await getEntry(rig, B, eA.id);
    const unknown = await getEntry(rig, B, `${SA}-0000000`); // same length, nobody's
    const swapped = await getEntry(rig, B, eA.id.toLowerCase());
    const otherLong = await getEntry(rig, B, longId);
    const unknownLong = await getEntry(rig, B, "M".repeat(64));
    const own = await getEntry(rig, B, eB.id);
    expect(other.status).toBe(404);
    expect(sigOf(other)).toBe(sigOf(unknown));
    expect(sigOf(swapped)).toBe(sigOf(unknown));
    expect(sigOf(otherLong)).toBe(sigOf(unknownLong));
    expect(other.json).toEqual({ error: "no such entry" });
    expect(own.status).toBe(200);
    // a player with NO history at all reads the same way
    const nobody = await testIdentity(3);
    expect(sigOf(await getEntry(rig, nobody, eA.id))).toBe(sigOf(unknown));
    // writing is no probe either: B storing A's id (while A holds it) is a plain 201 under B's own prefix, not the 200 or 409 that would say A holds it
    const again = entryFor(eA.id, { finishedAt: FINISHED - 7000 });
    expect((await putEntry(rig, B, again)).status).toBe(201);
    expect(historyObjects(rig, B.playerId)).toContain(nameOfEntry(again));
    expect((await putEntry(rig, B, again)).status).toBe(200); // B's own repeat
    expect((await putEntry(rig, B, { ...again, hero: "weaver" })).status).toBe(409); // B's own conflict, about B's own entry
    // the owner's other key reads it (control), and the owner after a DELETE gets 410 while the stranger still gets the same 404
    expect((await linkVia(rig, A, C)).joined.status).toBe(200);
    expect((await getEntry(rig, C, eA.id)).status).toBe(200);
    expect((await deleteMe(rig, A)).status).toBe(200);
    expect(sigOf(await getEntry(rig, B, `${SA}-0000000`))).toBe(sigOf(unknown));
    expect((await getEntry(rig, A, eA.id)).status).toBe(410);
  });
});

describe.each(KINDS)("4j. what is stored (%s)", (kind) => {
  it("the object is the entry's canonical text and nothing else: exactly the twelve fields, no id of a player, no key, no signature, no address, no `at`; its NAME holds the player, the time and the entry id", async () => {
    const rig = await openHistoryRig(kind);
    const e = entryFor(`${SA}-1`, {
      dusks: [{ day: 1, outcome: "win", record: recordOf(5) }, { day: 2, outcome: "loss", record: recordOf(6) }, { day: 3, outcome: "win" }],
    });
    expect((await putEntry(rig, A, e)).status).toBe(201);
    const name = nameOfEntry(e);
    expect(historyRaw(rig, A.playerId), "no stray file next to it (no temp file, no request body)").toEqual([name]);
    const text = readObject(rig, A.playerId, name)!;
    expect(text).toBe(encodeEntry(e));
    const obj = JSON.parse(text) as Record<string, unknown>;
    expect(Object.keys(obj)).toEqual(["id", "runId", "kind", "rules", "hero", "outcome", "wins", "days", "lives", "hearts", "finishedAt", "dusks"]);
    const ha = await headersOf(A, HISTORY_PREFIX);
    for (const s of [A.playerId, ha.key, ha.sig.slice(0, 20), "127.0.0.1", "x-bb-", '"at"', "playerId", "publicKey", '"name"', "address", "email", "token"]) {
      expect(text, `the stored entry holds ${s}`).not.toContain(s);
    }
    // every key name anywhere in the record is a build or a record field; no key is named like a person, a device or an address
    const keys = new Set<string>();
    const walk = (v: unknown): void => {
      if (Array.isArray(v)) v.forEach(walk);
      else if (typeof v === "object" && v !== null) for (const [k, x] of Object.entries(v)) (keys.add(k), walk(x));
    };
    walk(obj);
    console.log(`4j FIELDS ${kind}: ${JSON.stringify([...keys].sort())}`);
    for (const k of keys) expect(k, `a field named ${k}`).not.toMatch(/^(player|playerid|name|key|publickey|addr|address|ip|mail|email|user|username|device|token|sig|signature|secret|account|steam|steamid)$/i);
    // every string value in a record is a short plain word (a part, a hero, a rule): nothing a person typed
    const strings: string[] = [];
    const walkS = (v: unknown): void => {
      if (typeof v === "string") strings.push(v);
      else if (Array.isArray(v)) v.forEach(walkS);
      else if (typeof v === "object" && v !== null) Object.values(v).forEach(walkS);
    };
    walkS((obj.dusks as { record?: unknown }[]).map((d) => d.record));
    expect(strings.length).toBeGreaterThan(5);
    for (const s of strings) expect(s, `a string in a record: ${s}`).toMatch(/^[a-z0-9_.:-]{1,40}$/i);
    // the NAME of the object: <13-digit time>-<entry id>.json under history/<player>/ (Tigris: the key; jsonl: the path)
    expect(name).toBe(`${NAME_TS(e)}-${e.id}.json`);
    if (kind === "tigris") expect(allHistory(rig)).toEqual([`history/${A.playerId}/${name}`]);
    // run provenance of each stored field (the privacy-policy lines are checked against this table in the notes)
    const provenance: Record<string, string> = {
      id: "run", runId: "run: seed + device clock at the run's start + counter", kind: "run", rules: "app version", hero: "player's choice", outcome: "run",
      wins: "run", days: "run", lives: "run", hearts: "run", finishedAt: "device clock at the run's end", dusks: "run (+ both decks of each online battle)",
    };
    expect(Object.keys(obj)).toEqual(Object.keys(provenance));
  });

  it("the entry a REAL device sends (a played run with battle records, a link record for its own key, the real client over HTTP) is stored without the device's id or key", async () => {
    const rig = await openHistoryRig(kind);
    const ls = mem();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(FINISHED);
    vi.stubGlobal("localStorage", ls);
    resetHistoryWarning();
    resetHistorySync();
    const d = await device(0, ls);
    const own = d.id.keyId ?? d.id.playerId;
    ls.setItem(LINK_KEY, encodeLink({ v: 1, player: own, key: own, at: NOW }));
    const run = playedRun({ pattern: "WWLWWWDWWW", end: "complete", runId: `${SA}-real`, records: true });
    foldRunEnd(run);
    const r = await syncHistory(rig.base, d.id, { store: ls, now: () => NOW }, { download: false });
    await historyIdle();
    expect(r).toMatchObject({ status: "ok", sent: 1 });
    const names = historyObjects(rig, d.id.playerId);
    expect(names).toHaveLength(1);
    const text = readObject(rig, d.id.playerId, names[0])!;
    const h = await headersOf(d.id, HISTORY_PREFIX);
    for (const s of [d.id.playerId, own, h.key, "127.0.0.1"]) expect(text).not.toContain(s);
    expect(text).toContain(`"id":"${SA}-real"`); // the run's own id is there, as designed
    const obj = JSON.parse(text) as { dusks: { record?: unknown }[] };
    expect(obj.dusks.some((x) => x.record !== undefined)).toBe(true);
    expect(JSON.stringify(obj)).not.toMatch(/"(playerId|publicKey|name|key|sig|address)"/);
    expect(Object.keys(obj as object)).toHaveLength(12);
    // and the ENDLESS suffix is the only decoration an id ever gets
    expect(HISTORY_END_SUFFIX).toBe("_endless");
  });
});

describe("4j. the log templates of the history code", () => {
  it("no `log(` call in the history routes, the history store, the S3 client or the deletion path interpolates anything but a count or an error's own message", () => {
    const files = ["server/historyRoutes.ts", "server/historyStore.ts", "server/s3.ts", "server/links.ts", "server/app.ts"];
    const found: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      for (const m of src.matchAll(/(?:^|[^A-Za-z])(?:log|this\.log|r\.log|opts\.log)\(\s*(`[^`]*`)/g)) {
        const exprs = [...m[1].matchAll(/\$\{([^}]*)\}/g)].map((x) => x[1].trim());
        if (exprs.length) found.push(`${f}: ${m[1].slice(0, 110)} -> ${JSON.stringify(exprs)}`);
      }
    }
    console.log(`4j TEMPLATES\n${found.join("\n")}`);
    // the interpolations that exist, as expressions: none names a player, a key, an entry or an object (the request log's url.pathname is the path
    // without its query; the start-up line's store.file is the data file's name)
    for (const line of found) {
      const exprs = JSON.parse(line.slice(line.lastIndexOf("-> ") + 3)) as string[];
      for (const x of exprs.filter((y) => !/pathname|store\.file/.test(y))) expect(x, line).not.toMatch(/player|playerId|signer|\bkey\b|entryId|\.id\b|\bid\b|name|path|prefix|url/i);
    }
    // the history code itself logs only fixed words
    const routes = readFileSync("server/historyRoutes.ts", "utf8").match(/\blog\(([^)]*)\)/g) ?? [];
    expect(routes).toEqual(['log("history store: skipping an unreadable entry")']);
  });
});

beforeEach(() => {
  vi.useRealTimers();
});

describe("4j. what the device keeps after DELETE MY ONLINE DATA", () => {
  it("NOTE: the local history key keeps the deleted player's id in each entry's sentTo (the entries themselves hold none); the link record and the key are dropped, the history stays", async () => {
    const ls = mem();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(FINISHED);
    vi.stubGlobal("localStorage", ls);
    resetHistoryWarning();
    const d = await device(0, ls);
    const own = d.id.keyId ?? d.id.playerId;
    ls.setItem(LINK_KEY, encodeLink({ v: 1, player: own, key: own, at: NOW }));
    foldRunEnd(playedRun({ pattern: "WL", end: "lost", runId: `${SA}-del`, records: false }));
    markSent([`${SA}-del`], own, ls);
    expect(ls.getItem(HISTORY_KEY)).toContain(`"sentTo":"${own}"`);
    const deps = { fetch: (async () => new Response("{}", { status: 200 })) as unknown as typeof fetch, store: ls, mirror: null, keyStore: memoryKeyStore() };
    expect((await deleteOnlineData("http://127.0.0.1:9", d.id, deps)).ok).toBe(true);
    expect(ls.getItem(LINK_KEY), "the link record is dropped").toBeNull();
    const text = ls.getItem(HISTORY_KEY)!;
    expect(text, "the local history stays (local progress), with the old player's id in sentTo").toContain(`"sentTo":"${own}"`);
    const entries = (JSON.parse(text) as { entries: { entry: Record<string, unknown>; sentTo?: string }[] }).entries;
    expect(entries).toHaveLength(1);
    expect(JSON.stringify(entries[0].entry), "the entry itself holds no id of the player").not.toContain(own);
    expect(entries[0].sentTo).toBe(own);
  });
});

describe("4j. the S3 client's own error text for a broken LIST page", () => {
  it("NOTE: a LIST page that is truncated without a continuation token makes the raw client throw a message holding the player's prefix (s3.ts listAll, unmasked); the history store wraps it, so no history path logs it", async () => {
    const page = '<?xml version="1.0"?><ListBucketResult><IsTruncated>true</IsTruncated><Contents><Key>history/x/0000000000001-a.json</Key><Size>1</Size></Contents></ListBucketResult>';
    const s3 = new S3Client({
      endpoint: "http://127.0.0.1:9", region: "us-east-1", bucket: "bb-trunc-1", accessKeyId: "k", secretAccessKey: "s", addressing: "path", retries: 0,
      fetch: (async () => new Response(page, { status: 200 })) as unknown as typeof fetch,
    });
    let raw = "";
    await s3.listAll(`history/${A.playerId}/`).catch((e: Error) => (raw = e.message));
    console.log(`4j RAW S3 listAll error text: ${raw}`);
    expect(raw).toContain("truncated page without a new continuation token");
    let wrapped = "";
    await new TigrisHistoryStore(s3).list(A.playerId).catch((e: Error) => (wrapped = e.message));
    expect(wrapped).toMatch(/^history list failed/);
    expect(wrapped).not.toContain(A.playerId);
    expect(wrapped).not.toContain("history/");
  });
});
