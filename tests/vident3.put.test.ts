// VERIFY-IDENT2 (REQ-BFG-122 clause 4), step 4a: THE PUT (server/historyRoutes.ts putHistory, src/net/historyWire.ts), attacked beyond tests/ident2.server.test.ts.
// Each test names what it tried. A passing test pins what was OBSERVED; a "FINDING" test pins a defect's current behaviour and says in a comment what the
// expected behaviour is; a "NOTE" is worth knowing. Both stores (the JSON-lines directory and Tigris on the in-process fake S3) where the store matters.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  DELETE_PREFIX, HISTORY_GET_PREFIX, HISTORY_PREFIX, KEY_HEADER, LINK_CODE_PREFIX, LINK_REDEEM_PREFIX, LINK_STEAM_PREFIX, PROFILE_GET_PREFIX, PROFILE_PREFIX, SIG_HEADER,
  UPLOAD_PREFIX, type Identity, type SignDomain,
} from "../src/net/identity";
import { readHistory } from "../src/game/history";
import { resetHistorySync, syncHistory } from "../src/net/historySync";
import { writeLink } from "../src/net/linkState";
import { HISTORY_AHEAD_MS, HISTORY_BODY_MAX_BYTES, HISTORY_EARLIEST_AT, HISTORY_END_SUFFIX, HISTORY_ENTRY_MAX_BYTES, byteLength, encodeEntry, type HistoryEntry } from "../src/net/historyWire";
import { atProblem, fieldsOf } from "../server/linkRoutes";
import { nameOf } from "../server/historyStore";
import { MemoryLinkStore, type LinkStore } from "../server/linkStore";
import { StorageError } from "../server/store";
import type { BattleRecord } from "../src/sim/battle";
import { RULES_VERSION } from "../src/sim/content";
import { testIdentity } from "./netIdentity";
import { closeRigs, deleteMe, fakeSteam, linkVia, send, signedBy } from "./identRig";
import { device } from "./ident2Local";
import {
  FINISHED, NOW, OPEN, allHistory, bodyOfEntry, entryFor, getEntry, getSigned, historyObjects, listEntries, listedIds, openHistoryRig, putBody, putEntry, readObject, recordOf,
  removeObject, type Kind, type Rig,
} from "./ident2Rig";

let A: Identity, B: Identity;
beforeAll(async () => {
  [A, B] = await Promise.all([0, 1].map((n) => testIdentity(n)));
});
afterAll(closeRigs);

const KINDS: Kind[] = ["jsonl", "tigris"];
const enc = (s: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(s);
const cat = (...parts: Uint8Array<ArrayBuffer>[]): Uint8Array<ArrayBuffer> => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};
const nameOfEntry = (e: HistoryEntry): string => nameOf({ finishedAt: e.finishedAt, id: e.id });
let counter = 0;
/** A run id that was not used in this file before (64 characters at most). */
const uid = (tag: string): string => `${tag}-${String(++counter).padStart(3, "0")}`;

/** An entry whose first dusk carries a foreign-rules record with one free field `extra`: the canonical text can then hold ANY json text in that place. */
const REC = (extra: unknown, seed = 5): BattleRecord => ({ rules: "bb-0.1.0", seed, builds: [{}, {}], extra }) as unknown as BattleRecord;
const entryWith = (runId: string, extra: unknown, over: Partial<HistoryEntry> = {}): HistoryEntry =>
  entryFor(runId, { dusks: [{ day: 1, outcome: "win", record: REC(extra) }, { day: 2, outcome: "loss" }, { day: 3, outcome: "win" }], ...over });
/** The canonical body with `rawJson` (any text) where the free field is. */
const bodyExtra = (runId: string, rawJson: string): string => bodyOfEntry(entryWith(runId, "@@"), NOW).replace('"@@"', () => rawJson);
/** The canonical body with the bytes `bytes` where the free field's text is (inside its quotes). */
const bodyBytes = (runId: string, bytes: number[]): Uint8Array<ArrayBuffer> => {
  const text = bodyOfEntry(entryWith(runId, "@@"), NOW);
  const i = text.indexOf("@@");
  return cat(enc(text.slice(0, i)), new Uint8Array(bytes), enc(text.slice(i + 2)));
};
/** The entry's own text inside a body {"at":..,"entry":<this>}. */
const entryText = (body: string): string => body.slice(body.indexOf('"entry":') + '"entry":'.length, body.length - 1);

type Row = [label: string, body: string | Uint8Array<ArrayBuffer>, status: number, words: string];

/** Send every row (one PUT each, signed by `who` in the history domain), compare each with the expected status and words, and return the mismatches (an empty list is a pass). */
async function runRows(rig: Rig, who: Identity, rows: Row[]): Promise<string[]> {
  const bad: string[] = [];
  for (const [label, body, status, words] of rows) {
    const r = await putBody(rig, who, body);
    const error = String(r.json?.error ?? "");
    if (r.status !== status || !error.includes(words)) bad.push(`${label}: wanted ${status} "${words}", got ${r.status} ${r.status === 201 || r.status === 200 ? r.text : error}`);
  }
  return bad;
}

const deepArray = (d: number): string => "[".repeat(d) + "]".repeat(d);
const deepObject = (d: number): string => '{"a":'.repeat(d) + "1" + "}".repeat(d);

// ------------------------------------------------------------------------------------------------------- 4a: the canonical form

describe.each(KINDS)("4a. the canonical form: the body is exactly the bytes encodeEntry makes (%s)", (kind) => {
  it("4a. text framing and UTF-8: a BOM, a NUL, trailing or leading white space, bytes that are not UTF-8 anywhere in the body are 400 and nothing is written", async () => {
    const rig = await openHistoryRig(kind);
    const b0 = (id: string): string => bodyOfEntry(entryFor(id), NOW);
    const rows: Row[] = [
      ["a BOM before the body", cat(new Uint8Array([0xef, 0xbb, 0xbf]), enc(b0(uid("f")))), 400, "not JSON"],
      ["a trailing newline", `${b0(uid("f"))}\n`, 400, "not in the canonical form"],
      ["a leading space", ` ${b0(uid("f"))}`, 400, "not in the canonical form"],
      ["a tab after the first comma", b0(uid("f")).replace(',"entry"', ',\t"entry"'), 400, "not in the canonical form"],
      ["a CRLF in the middle", b0(uid("f")).replace(',"entry"', ',\r\n"entry"'), 400, "not in the canonical form"],
      ["an empty body", "", 400, "not JSON"],
      ["a NUL byte before the closing brace", `${b0(uid("f")).slice(0, -1)}\u0000}`, 400, "not JSON"],
      ["a bare null", "null", 400, "expected an object"],
      ["a bare number", "7", 400, "expected an object"],
      ["a bare string", '"x"', 400, "expected an object"],
      ["a stray continuation byte (0x80) inside a record text", bodyBytes(uid("u"), [0x80]), 400, "not UTF-8"],
      ["a truncated 3-byte sequence (E2 82) inside a record text", bodyBytes(uid("u"), [0xe2, 0x82]), 400, "not UTF-8"],
      ["a CESU-8 encoded surrogate (ED A0 80)", bodyBytes(uid("u"), [0xed, 0xa0, 0x80]), 400, "not UTF-8"],
      ["an overlong slash (C0 AF)", bodyBytes(uid("u"), [0xc0, 0xaf]), 400, "not UTF-8"],
      ["a code point past U+10FFFF (F4 90 80 80)", bodyBytes(uid("u"), [0xf4, 0x90, 0x80, 0x80]), 400, "not UTF-8"],
      ["the byte 0xFF", bodyBytes(uid("u"), [0xff]), 400, "not UTF-8"],
      ["a UTF-16 body", (() => {
        const t = b0(uid("f"));
        const out = new Uint8Array(t.length * 2);
        for (let i = 0; i < t.length; i++) out[i * 2] = t.charCodeAt(i);
        return out;
      })(), 400, ""],
    ];
    const bad = await runRows(rig, A, rows);
    expect(bad, bad.join("\n")).toEqual([]);
    expect(allHistory(rig), "nothing was written").toEqual([]);
    // the same entry in its canonical form is the only text that passes
    const ok = bodyOfEntry(entryFor("framing-ok"), NOW);
    expect((await putBody(rig, A, ok)).status).toBe(201);
  });

  it("4a. characters: raw characters are canonical, their escapes are not (e-acute, an emoji, U+2028, a slash, a quote, a control character, a lone surrogate); each canonical one is stored byte for byte", async () => {
    const rig = await openHistoryRig(kind);
    const R = (label: string, raw: string, status: number, words = ""): Row => [label, bodyExtra(uid("x"), raw), status, words];
    const canon = "not in the canonical form";
    const rows: Row[] = [
      R("a raw e-acute", '"é"', 201), R("e-acute as \\u00e9", '"\\u00e9"', 400, canon),
      R("a raw emoji", '"😀"', 201), R("the emoji as a surrogate pair escape", '"\\ud83d\\ude00"', 400, canon),
      R("a raw U+2028", `"${String.fromCharCode(0x2028)}"`, 201), R("U+2028 as an escape", '"\\u2028"', 400, canon),
      R("a raw slash", '"a/b"', 201), R("an escaped slash", '"a\\/b"', 400, canon),
      R("the newline escape \\n", '"a\\nb"', 201), R("a newline as \\u000a", '"a\\u000ab"', 400, canon),
      R("the quote escape \\\"", '"\\""', 201), R("a quote as \\u0022", '"\\u0022"', 400, canon),
      R("a control character as a lower case escape \\u001f", '"\\u001f"', 201), R("a control character as an upper case escape \\u001F", '"\\u001F"', 400, canon),
      R("a lone surrogate as a lower case escape \\ud800", '"\\ud800"', 201), R("a lone surrogate as an upper case escape \\uD800", '"\\uD800"', 400, canon),
      R("a raw control character inside a string", '"a\u0001b"', 400, "not JSON"), R("a raw newline inside a string", '"a\nb"', 400, "not JSON"),
      R("a raw tab inside a string", '"a\tb"', 400, "not JSON"),
    ];
    const bad = await runRows(rig, A, rows);
    expect(bad, bad.join("\n")).toEqual([]);
    const sent = rows.filter((r) => r[2] === 201).map((r) => entryText(r[1] as string));
    const stored = historyObjects(rig, A.playerId).map((n) => readObject(rig, A.playerId, n));
    expect(stored.sort(), "what is stored is the text that was sent, byte for byte").toEqual(sent.sort());
    // the stored lone surrogate and control character come back as they went in
    for (const n of historyObjects(rig, A.playerId)) {
      const text = readObject(rig, A.playerId, n)!;
      const id = (JSON.parse(text) as HistoryEntry).id;
      expect((await getEntry(rig, A, id)).text, id).toBe(`{"entry":${text}}`);
    }
  });

  it("4a. numbers: 1e2, 1E2, 1.0, -0, +1, 01, .5, NaN, 1e999 are 400 wherever a number is written; the canonical 1e+21, 1.5 and 100 are not; a fraction where an integer is due is 400", async () => {
    const rig = await openHistoryRig(kind);
    const R = (label: string, raw: string, status: number, words = ""): Row => [label, bodyExtra(uid("n"), raw), status, words];
    const canon = "not in the canonical form";
    const rows: Row[] = [
      R("100 (a record's free number)", "100", 201), R("1.5", "1.5", 201), R("-1", "-1", 201), R("0", "0", 201), R("1e+21, the form JSON.stringify writes", "1e+21", 201), R("1.5e-7, the form JSON.stringify writes", "1.5e-7", 201),
      R("1e2", "1e2", 400, canon), R("1E2", "1E2", 400, canon), R("1.0", "1.0", 400, canon), R("-0", "-0", 400, canon), R("0.0", "0.0", 400, canon), R("1.50", "1.50", 400, canon),
      R("1e21 (no plus)", "1e21", 400, canon), R("0.1e1", "0.1e1", 400, canon), R("a 20 digit integer", "12345678901234567890", 400, canon), R("1e999 (Infinity)", "1e999", 400, canon),
      R("+1", "+1", 400, "not JSON"), R("01", "01", 400, "not JSON"), R(".5", ".5", 400, "not JSON"), R("1.", "1.", 400, "not JSON"), R("NaN", "NaN", 400, "not JSON"), R("Infinity", "Infinity", 400, "not JSON"),
      R("0x10", "0x10", 400, "not JSON"),
    ];
    const text = (id: string, over: Partial<HistoryEntry> = {}): string => bodyOfEntry(entryFor(id, over), NOW);
    const swap = (label: string, from: string, to: string, status: number, words: string, over: Partial<HistoryEntry> = {}): Row => {
      const id = uid("i");
      const t = text(id, over);
      if (!t.includes(from)) throw new Error(`${label}: the body has no ${from}`);
      return [label, t.replace(from, to), status, words];
    };
    rows.push(
      swap("at written 1790000000000.0", `"at":${NOW},`, `"at":${NOW}.0,`, 400, canon),
      swap("at written 1.79e12", `"at":${NOW},`, '"at":1.79e12,', 400, canon),
      swap("at written -0", `"at":${NOW},`, '"at":-0,', 400, canon),
      swap("at with a leading zero", `"at":${NOW},`, `"at":0${NOW},`, 400, "not JSON"),
      swap("at a fraction (canonical text, not an integer)", `"at":${NOW},`, `"at":${NOW}.5,`, 422, "at: expected the client's time"),
      swap("at 2^53 (not a safe integer, canonical text)", `"at":${NOW},`, '"at":9007199254740992,', 422, "at: expected the client's time"),
      swap("wins written -0", '"wins":0,', '"wins":-0,', 400, canon, { wins: 0, dusks: [{ day: 1, outcome: "loss" }] }),
      swap("wins written 2.0", '"wins":2,', '"wins":2.0,', 400, canon),
      swap("wins written 2e0", '"wins":2,', '"wins":2e0,', 400, canon),
      swap("wins written 2E0", '"wins":2,', '"wins":2E0,', 400, canon),
      swap("wins written 0.2e1", '"wins":2,', '"wins":0.2e1,', 400, canon),
      swap("days a fraction (2.5)", '"days":3,', '"days":2.5,', 400, "entry.days: expected a non-negative integer"),
      swap("days written 3.0", '"days":3,', '"days":3.0,', 400, canon),
      swap("lives a fraction (3.5)", '"lives":4,', '"lives":3.5,', 400, "entry.lives: expected a non-negative integer"),
      swap("lives negative", '"lives":4,', '"lives":-4,', 400, "entry.lives: expected a non-negative integer"),
      swap("finishedAt a fraction", `"finishedAt":${FINISHED},`, `"finishedAt":${FINISHED}.5,`, 400, "entry.finishedAt: expected a non-negative integer"),
      swap("finishedAt written with .0", `"finishedAt":${FINISHED},`, `"finishedAt":${FINISHED}.0,`, 400, canon),
      swap("finishedAt written 1.789999940e12", `"finishedAt":${FINISHED},`, '"finishedAt":1.78999994e12,', 400, canon),
      swap("a dusk day written 1.0", '{"day":1,', '{"day":1.0,', 400, canon),
      swap("a dusk day a fraction", '{"day":1,', '{"day":0.5,', 400, "entry.dusks[0].day: expected a non-negative integer"),
      swap("a dusk day -0", '{"day":1,', '{"day":-0,', 400, canon),
    );
    const seeded = bodyOfEntry(entryWith(uid("n"), "x"), NOW);
    rows.push(
      ["a record seed written 5.0", seeded.replace('"seed":5,', '"seed":5.0,'), 400, canon],
      ["a record seed written 5e0", seeded.replace('"seed":5,', '"seed":5e0,'), 400, canon],
      ["a record seed -0", seeded.replace('"seed":5,', '"seed":-0,'), 400, canon],
    );
    const bad = await runRows(rig, A, rows);
    expect(bad, bad.join("\n")).toEqual([]);
    expect(historyObjects(rig, A.playerId)).toHaveLength(rows.filter((r) => r[2] === 201).length);
  });

  it("4a. duplicate keys and key order: a key twice, anywhere, is 400; the fields of the entry and of a dusk are in the fixed order; a record keeps its sender's key order (a NOTE: the order inside a record is not fixed)", async () => {
    const rig = await openHistoryRig(kind);
    const id = (): string => uid("d");
    const t = (runId: string): string => bodyOfEntry(entryFor(runId), NOW);
    const canon = "not in the canonical form";
    const withRec = (runId: string): string => bodyOfEntry(entryWith(runId, 1), NOW);
    const rows: Row[] = [
      ["the entry's wins twice", t(id()).replace('"wins":2,', '"wins":2,"wins":2,'), 400, canon],
      ["the entry's id twice", t(id()).replace('"entry":{', '"entry":{"id":"zz",'), 400, canon],
      ["a dusk's day twice", t(id()).replace('{"day":1,', '{"day":1,"day":1,'), 400, canon],
      ["a record's seed twice", withRec(id()).replace('"seed":5,', '"seed":5,"seed":5,'), 400, canon],
      ["the entry twice", t(id()).replace(',"entry":', ',"entry":{},"entry":'), 400, canon],
      ["a dusk's fields swapped (outcome before day)", t(id()).replace('{"day":1,"outcome":"win"}', '{"outcome":"win","day":1}'), 400, canon],
      ["a dusk's record before its outcome", withRec(id()).replace('{"day":1,"outcome":"win","record":{"rules":"bb-0.1.0","seed":5,"builds":[{},{}],"extra":1}}', '{"day":1,"record":{"rules":"bb-0.1.0","seed":5,"builds":[{},{}],"extra":1},"outcome":"win"}'), 400, canon],
      ["a key written with an escape (\\u0069 for the i of wins)", t(id()).replace('"wins":2,', '"w\\u0069ns":2,'), 400, canon],
      ["the entry's key id written with an escape", t(id()).replace('"id":', '"\\u0069d":'), 400, canon],
      ["the top level keys swapped", `{"entry":${entryText(t(id()))},"at":${NOW}}`, 400, "in that order"],
      ["a __proto__ key in the entry", t(id()).replace('"entry":{', '"entry":{"__proto__":{},'), 400, "entry.__proto__: unknown field"],
      ["a __proto__ key in a dusk", t(id()).replace('{"day":1,"outcome":"win"}', '{"day":1,"outcome":"win","__proto__":1}'), 400, "entry.dusks[0].__proto__: unknown field"],
      ["a __proto__ key at the top", t(id()).replace(`{"at":${NOW},`, `{"__proto__":1,"at":${NOW},`), 400, "expected exactly at, entry"],
      ["a constructor key in the entry", t(id()).replace('"entry":{', '"entry":{"constructor":1,'), 400, "entry.constructor: unknown field"],
    ];
    const bad = await runRows(rig, A, rows);
    expect(bad, bad.join("\n")).toEqual([]);
    expect(allHistory(rig)).toEqual([]);
    // integer-like keys: JavaScript writes them first, ascending, so a sender that wrote {"b":1,"2":2,"1":3} is not canonical
    const nums = await runRows(rig, A, [
      ["integer-like keys not in the order JavaScript writes them", bodyExtra(id(), '{"b":1,"2":2,"1":3}'), 400, canon],
      ["integer-like keys in the order JavaScript writes them", bodyExtra(id(), '{"1":3,"2":2,"b":1}'), 201, ""],
    ]);
    expect(nums, nums.join("\n")).toEqual([]);
    // NOTE: the record's own key order is the sender's: two bodies that hold the same record in two key orders are two different entries for one id
    const one = entryWith("order-1", 1);
    const reordered = bodyOfEntry(one, NOW).replace('"rules":"bb-0.1.0","seed":5,"builds":[{},{}],"extra":1', '"extra":1,"builds":[{},{}],"seed":5,"rules":"bb-0.1.0"');
    expect(reordered).not.toBe(bodyOfEntry(one, NOW));
    expect((await putEntry(rig, A, one)).status).toBe(201);
    const second = await putBody(rig, A, reordered);
    expect([second.status, second.json], "the same record in another key order is the same content but other bytes: 409, not 200").toEqual([409, { error: "a different entry is stored under this id" }]);
    // a record key called __proto__ is an ordinary own key: kept byte for byte, and Object.prototype is untouched
    const proto = bodyExtra(id(), '{"__proto__":{"polluted":true}}');
    expect((await putBody(rig, A, proto)).status).toBe(201);
    expect(({} as Record<string, unknown>).polluted, "no prototype pollution").toBeUndefined();
    const stored = historyObjects(rig, A.playerId).map((n) => readObject(rig, A.playerId, n)!).filter((x) => x.includes("__proto__"));
    expect(stored).toEqual([entryText(proto)]);
  });
});

// ----------------------------------------------------------------------------------------------------------------- 4a: signatures

describe.each(KINDS)("4a. signatures: each of the other eight domains, and the read domain, over the same bytes (%s)", (kind) => {
  const OTHERS: [string, SignDomain][] = [
    ["the ghost upload (bb-ghost-upload-1)", UPLOAD_PREFIX], ["the profile upload (bb-profile-1)", PROFILE_PREFIX], ["the profile read (bb-profile-get-1)", PROFILE_GET_PREFIX],
    ["the link code (bb-link-code-1)", LINK_CODE_PREFIX], ["the link redeem (bb-link-redeem-1)", LINK_REDEEM_PREFIX], ["the Steam link (bb-link-steam-1)", LINK_STEAM_PREFIX],
    ["the delete (bb-delete-1)", DELETE_PREFIX], ["the history read (bb-history-get-1)", HISTORY_GET_PREFIX],
  ];
  it("4a. all eight other domains' signatures of the PUT body are 401 with the one signature message, and the history domain's passes; nothing is written by the refusals", async () => {
    const rig = await openHistoryRig(kind);
    const body = bodyOfEntry(entryFor("sig-1"), NOW);
    expect(OTHERS).toHaveLength(8);
    for (const [what, domain] of OTHERS) {
      const r = await putBody(rig, A, body, domain);
      expect([r.status, String(r.json?.error)], `signed in ${what}`).toEqual([401, "x-bb-sig: the signature does not match this body and key"]);
    }
    expect(allHistory(rig)).toEqual([]);
    expect((await putBody(rig, A, body, HISTORY_PREFIX)).status).toBe(201);
    // the identical request again, byte for byte (a replay of the signed PUT): no nonce, so it is the idempotent 200 and nothing else
    const headers = await signedBy(A, body, HISTORY_PREFIX);
    const again = await send(rig, "PUT", "/v1/history", body, headers);
    expect([again.status, again.json]).toEqual([200, { id: "sig-1" }]);
  });

  it("4a. the read: a signature of each of the other eight domains (and the PUT's) over the list text and over the entry text is 401; only bb-history-get-1 passes", async () => {
    const rig = await openHistoryRig(kind);
    expect((await putEntry(rig, A, entryFor("sig-2"))).status).toBe(201);
    const list = `/v1/history?at=${NOW}`, one = `/v1/history?at=${NOW}&id=sig-2`;
    for (const [what, domain] of [...OTHERS.filter(([, d]) => d !== HISTORY_GET_PREFIX), ["the history PUT (bb-history-1)", HISTORY_PREFIX] as [string, SignDomain]]) {
      for (const url of [list, one]) {
        const r = await getSigned(rig, A, url, url, domain);
        expect([r.status, String(r.json?.error)], `${what} over ${url.includes("&id=") ? "the entry" : "the list"} text`).toEqual([401, "x-bb-sig: the signature does not match this body and key"]);
      }
    }
    expect((await getSigned(rig, A, list)).status).toBe(200);
    expect((await getSigned(rig, A, one)).status).toBe(200);
    // the PUT's own signature, sent as the headers of a GET over the same path: it signs the body, not the query
    const putHeaders = await signedBy(A, bodyOfEntry(entryFor("sig-3"), NOW), HISTORY_PREFIX);
    expect((await send(rig, "GET", list, undefined, putHeaders)).status).toBe(401);
  });

  it("4a. a replayed PUT is bound by its `at`: the same signed bytes are 200 inside the 10 minute window and 422 outside it, whoever sends them", async () => {
    const rig = await openHistoryRig(kind);
    const body = bodyOfEntry(entryFor("sig-4"), NOW);
    const headers = await signedBy(A, body, HISTORY_PREFIX);
    expect((await send(rig, "PUT", "/v1/history", body, headers)).status).toBe(201);
    rig.clock.now = NOW + HISTORY_AHEAD_MS;
    expect((await send(rig, "PUT", "/v1/history", body, headers)).status, "exactly 10 minutes later").toBe(200);
    rig.clock.now = NOW + HISTORY_AHEAD_MS + 1;
    const late = await send(rig, "PUT", "/v1/history", body, headers);
    expect([late.status, String(late.json?.error)], "10 minutes and a millisecond later").toEqual([422, expect.stringContaining("at: more than 10 minutes")]);
    expect(historyObjects(rig, A.playerId)).toHaveLength(1);
  });
});

// --------------------------------------------------------------------------------------------------------------- 4a: the id relation

describe.each(KINDS)("4a. the id relation: id = runId, or runId + _endless for kind endless only (%s)", (kind) => {
  it("4a. each way to get it wrong is 422 naming the field; the ids at 64 characters pass and 65 do not; an id that ends another is another id", async () => {
    const rig = await openHistoryRig(kind);
    const SUF = HISTORY_END_SUFFIX;
    const cases: [string, Partial<HistoryEntry>, number, string][] = [
      ["a run with its runId plus the suffix as id", { runId: "r1", id: `r1${SUF}` }, 422, "entry.id"],
      ["a run whose runId is the suffix alone", { runId: SUF, id: SUF }, 422, "entry.runId"],
      ["an endless with the bare runId as id", { kind: "endless", outcome: "over", runId: "r2", id: "r2" }, 422, "entry.id"],
      ["an endless with the suffix twice", { kind: "endless", outcome: "over", runId: "r3", id: `r3${SUF}${SUF}` }, 422, "entry.id"],
      ["an endless of another run's id", { kind: "endless", outcome: "over", runId: "r4", id: `r5${SUF}` }, 422, "entry.id"],
      ["a run with an id that only ends like its runId", { runId: "abc", id: "x-abc" }, 422, "entry.id"],
      ["a run with an id that its runId ends", { runId: "x-abc", id: "abc" }, 422, "entry.id"],
      ["an endless entry, well formed", { kind: "endless", outcome: "over", runId: "r6", id: `r6${SUF}` }, 201, ""],
      ["the run of the same runId", { runId: "r6", id: "r6" }, 201, ""],
      ["a runId of 64 characters", { runId: "a".repeat(64), id: "a".repeat(64) }, 201, ""],
      ["a runId of 65 characters", { runId: "a".repeat(65), id: "a".repeat(65) }, 422, "entry.runId"],
      ["an endless whose id is 64 characters (runId 56)", { kind: "endless", outcome: "over", runId: "b".repeat(56), id: `${"b".repeat(56)}${SUF}` }, 201, ""],
      ["an endless whose id is 65 characters (runId 57)", { kind: "endless", outcome: "over", runId: "b".repeat(57), id: `${"b".repeat(57)}${SUF}` }, 422, "entry.id"],
      ["a one character id '-'", { runId: "-", id: "-" }, 201, ""],
      ["a one character id '_'", { runId: "_", id: "_" }, 201, ""],
      ["an id of 13 digits", { runId: "1234567890123", id: "1234567890123" }, 201, ""],
      ["an id that looks like an object name", { runId: "0000000000001-x", id: "0000000000001-x" }, 201, ""],
      ["abc", { runId: "abc", id: "abc" }, 201, ""],
      ["x-abc", { runId: "x-abc", id: "x-abc" }, 201, ""],
      ["b", { runId: "b", id: "b" }, 201, ""],
      ["a-b", { runId: "a-b", id: "a-b" }, 201, ""],
      ["Abc (another case)", { runId: "Abc", id: "Abc" }, 201, ""],
      ["abc_ (the suffix's first character)", { runId: "abc_", id: "abc_" }, 201, ""],
    ];
    const bad: string[] = [];
    for (const [what, over, status, words] of cases) {
      const r = await putEntry(rig, A, entryFor("zz", over));
      const error = String(r.json?.error ?? "");
      if (r.status !== status || !error.includes(words)) bad.push(`${what}: wanted ${status} "${words}", got ${r.status} ${error || r.text}`);
    }
    expect(bad, bad.join("\n")).toEqual([]);
    // each stored id reads back as itself, and the pairs that end each other are four separate entries
    const ids = listedIds(await listEntries(rig, A));
    for (const id of ["abc", "x-abc", "b", "a-b", "Abc", "abc_", "r6", `r6${SUF}`]) {
      expect(ids, id).toContain(id);
      const got = await getEntry(rig, A, id);
      expect([got.status, ((got.json?.entry ?? {}) as { id?: string }).id], `the entry read of ${id}`).toEqual([200, id]);
    }
    for (const [mine, other] of [["abc", "x-abc"], ["b", "a-b"]] as const) {
      expect((await putEntry(rig, A, entryFor(mine, { hero: "weaver" }))).status, `a different ${mine} is a conflict with ${mine} only`).toBe(409);
      expect((await putEntry(rig, A, entryFor(other))).status, `${other} again`).toBe(200);
    }
  });

  it("4a. NOTE: an endless entry whose runId already ends in _endless is stored (decode and caps do not refuse it); the device never makes one (runIdOk), and it collides with nothing", async () => {
    const rig = await openHistoryRig(kind);
    const odd = entryFor("x_endless", { kind: "endless", outcome: "over", id: `x_endless${HISTORY_END_SUFFIX}` });
    const r = await putEntry(rig, A, odd);
    expect([r.status, r.json]).toEqual([201, { id: `x_endless${HISTORY_END_SUFFIX}` }]);
    // the run of runId "x_endless" is refused, the endless entry of runId "x" has the id "x_endless" and is another entry
    expect((await putEntry(rig, A, entryFor("x_endless"))).status).toBe(422);
    const plain = entryFor("x", { kind: "endless", outcome: "over", id: `x${HISTORY_END_SUFFIX}` });
    expect((await putEntry(rig, A, plain)).status).toBe(201);
    expect(listedIds(await listEntries(rig, A)).sort()).toEqual(["x_endless", "x_endless_endless"].sort());
  });
});

// ------------------------------------------------------------------------------------------------------------ 4a: caps at the bound

describe.each(KINDS)("4a. every cap at its bound and one past (%s)", (kind) => {
  const rows = (n: number, outcome: "win" | "loss" = "loss"): HistoryEntry["dusks"] => Array.from({ length: n }, (_, i) => ({ day: i + 1, outcome }));
  const padded = (runId: string, bytes: number, unit: string, over: Partial<HistoryEntry> = {}): HistoryEntry => {
    const mk = (pad: string): HistoryEntry =>
      entryFor(runId, { wins: 1, days: 1, dusks: [{ day: 1, outcome: "win", record: { rules: "bb-0.1.0", seed: 1, builds: [{ pad }, {}] } as unknown as BattleRecord }], ...over });
    const want = bytes - byteLength(encodeEntry(mk("")));
    const unitBytes = byteLength(JSON.stringify(unit).slice(1, -1)); // its bytes in the canonical text (a quote is 2, a control character 6)
    const n = Math.floor(want / unitBytes);
    const e = mk(unit.repeat(n) + "x".repeat(want - n * unitBytes));
    expect(byteLength(encodeEntry(e)), `padded ${bytes}`).toBe(bytes);
    return e;
  };

  it("4a. wins, days, dusks and lives at 99 pass and at 100 are 422 naming the field", async () => {
    const rig = await openHistoryRig(kind);
    const cases: [string, Partial<HistoryEntry>, number, string][] = [
      ["99 wins in 99 dusk rows", { wins: 99, days: 99, dusks: rows(99, "win") }, 201, ""],
      ["100 wins", { wins: 100, days: 99, dusks: rows(99, "win") }, 422, "entry.wins: 100 is over the ceiling 99"],
      ["99 days", { days: 99 }, 201, ""],
      ["100 days", { days: 100 }, 422, "entry.days: 100 is not in 1..99"],
      ["99 lives", { lives: 99 }, 201, ""],
      ["100 lives", { lives: 100 }, 422, "entry.lives: 100 is over the ceiling 99"],
      ["99 dusk rows", { wins: 0, days: 99, dusks: rows(99) }, 201, ""],
      ["100 dusk rows", { wins: 0, days: 99, dusks: rows(100) }, 422, "entry.dusks: 100 rows is over the ceiling 99"],
      ["days 1 (the lowest)", { days: 1, wins: 0, dusks: [] }, 201, ""],
      ["days 0", { days: 0, wins: 0, dusks: [] }, 422, "entry.days: 0 is not in 1..99"],
      ["no lives left", { lives: 0 }, 201, ""],
    ];
    const bad: string[] = [];
    for (const [what, over, status, words] of cases) {
      const r = await putEntry(rig, A, entryFor(uid("cap"), over));
      const error = String(r.json?.error ?? "");
      if (r.status !== status || !error.includes(words)) bad.push(`${what}: wanted ${status} "${words}", got ${r.status} ${error || r.text}`);
    }
    expect(bad, bad.join("\n")).toEqual([]);
  });

  it("4a. the entry is counted in BYTES of its canonical text: 16,000 passes and 16,001 does not, whatever the characters (2, 3 and 4 byte characters, quotes that are escaped, control characters written as 6 bytes)", async () => {
    const rig = await openHistoryRig(kind);
    const bad: string[] = [];
    for (const [what, unit] of [["ASCII", "x"], ["2 byte (e-acute)", "é"], ["3 byte (euro)", "€"], ["4 byte (emoji)", "😀"], ["a quote, 2 bytes escaped", '"'], ["a control character, 6 bytes escaped", "\u0001"]] as const) {
      const at = padded(uid("b"), HISTORY_ENTRY_MAX_BYTES, unit);
      const over = padded(uid("b"), HISTORY_ENTRY_MAX_BYTES + 1, unit);
      expect(encodeEntry(at).length <= HISTORY_ENTRY_MAX_BYTES, `${what}: the entry has fewer characters than bytes or as many`).toBe(true);
      const a = await putEntry(rig, A, at);
      if (a.status !== 201) bad.push(`${what} at 16000: ${a.status} ${a.text}`);
      const b = await putEntry(rig, A, over);
      if (b.status !== 422 || b.json?.error !== "entry: 16001 bytes is over 16000") bad.push(`${what} at 16001: ${b.status} ${b.text}`);
    }
    expect(bad, bad.join("\n")).toEqual([]);
    expect(historyObjects(rig, A.playerId)).toHaveLength(6);
    // the body bound: the same 16,384 bytes written with 1 and with 2 byte characters; one byte more is 413, however few characters that is
    const head = `{"at":${NOW},"entry":`;
    const junk = (bytes: number, unit: string): Uint8Array<ArrayBuffer> => {
      const fixed = byteLength(head) + 1;
      const n = Math.floor((bytes - fixed) / byteLength(unit));
      const text = `${head}${unit.repeat(n)}${"x".repeat(bytes - fixed - n * byteLength(unit))}}`;
      expect(byteLength(text)).toBe(bytes);
      return enc(text);
    };
    for (const unit of ["x", "é", "€", "😀"]) {
      const atLimit = await putBody(rig, A, junk(HISTORY_BODY_MAX_BYTES, unit));
      expect([atLimit.status, unit], "read, and not an entry").toEqual([400, unit]);
      const past = await putBody(rig, A, junk(HISTORY_BODY_MAX_BYTES + 1, unit));
      expect([past.status, past.json, unit], "one byte past").toEqual([413, { error: "request body over 16384 bytes" }, unit]);
    }
  });

  it("4a. the body bound without a Content-Length (a chunked body): 16,384 bytes are read, one more is 413", async () => {
    const rig = await openHistoryRig(kind);
    const head = `{"at":${NOW},"entry":`;
    const sendChunked = async (bytes: number): Promise<number> => {
      const text = `${head}${"x".repeat(bytes - byteLength(head) - 1)}}`;
      const body = enc(text);
      expect(body.length).toBe(bytes);
      const stream = new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(body.slice(0, 5000));
          c.enqueue(body.slice(5000));
          c.close();
        },
      });
      const headers = await signedBy(A, body, HISTORY_PREFIX);
      const res = await fetch(`${rig.base}/v1/history`, { method: "PUT", headers, body: stream, duplex: "half" } as unknown as RequestInit);
      await res.text();
      return res.status;
    };
    expect(await sendChunked(HISTORY_BODY_MAX_BYTES)).toBe(400);
    expect(await sendChunked(HISTORY_BODY_MAX_BYTES + 1)).toBe(413);
  });

  it("4a. finishedAt: 2026-01-01 exactly passes and 1 ms before does not; the server's clock + 10 minutes exactly passes and 1 ms past does not, and the bound moves with the SERVER's clock", async () => {
    const rig = await openHistoryRig(kind);
    const put = (runId: string, finishedAt: number) => putEntry(rig, A, entryFor(runId, { finishedAt }));
    const word = "entry.finishedAt: not between 2026-01-01 and the server's clock";
    expect(HISTORY_EARLIEST_AT).toBe(Date.UTC(2026, 0, 1));
    expect((await put("fa-1", HISTORY_EARLIEST_AT)).status).toBe(201);
    const before = await put("fa-2", HISTORY_EARLIEST_AT - 1);
    expect([before.status, before.json]).toEqual([422, { error: word }]);
    expect((await put("fa-3", NOW + HISTORY_AHEAD_MS)).status).toBe(201);
    const past = await put("fa-4", NOW + HISTORY_AHEAD_MS + 1);
    expect([past.status, past.json]).toEqual([422, { error: word }]);
    rig.clock.now = NOW + 1; // the server's clock moves 1 ms: the same finishedAt is inside the bound now
    expect((await put("fa-4", NOW + HISTORY_AHEAD_MS + 1)).status).toBe(201);
    rig.clock.now = NOW - 1; // and back 1 ms: the very first one that passed would not pass for a new id
    expect((await put("fa-5", NOW + HISTORY_AHEAD_MS)).status).toBe(422);
    // the oldest and the newest finishing time sort to the ends of the list
    rig.clock.now = NOW;
    expect(listedIds(await listEntries(rig, A))).toEqual(["fa-4", "fa-3", "fa-1"]);
    expect(historyObjects(rig, A.playerId)).toEqual([nameOfEntry(entryFor("fa-4", { finishedAt: NOW + HISTORY_AHEAD_MS + 1 })), nameOfEntry(entryFor("fa-3", { finishedAt: NOW + HISTORY_AHEAD_MS })), nameOfEntry(entryFor("fa-1", { finishedAt: HISTORY_EARLIEST_AT }))].sort());
  });
});

// ---------------------------------------------------------------------------------------------------------------------- 4a: records

describe.each(KINDS)("4a. records (%s)", (kind) => {
  it("4a. a record of the server's own rules that fails checkRecord is 422 naming ITS dusk (the first bad one), wherever it is; near-miss rules texts are another rules version and are kept as they are", async () => {
    const rig = await openHistoryRig(kind);
    const good = recordOf(7);
    const bad1 = { ...good, wins: [1] } as unknown as BattleRecord;
    const mk = (recs: (BattleRecord | undefined)[]): HistoryEntry =>
      entryFor(uid("rc"), { wins: 0, days: recs.length, dusks: recs.map((record, i) => ({ day: i + 1, outcome: "loss" as const, ...(record ? { record } : {}) })) });
    const cases: [string, HistoryEntry, number, string][] = [
      ["a bad record at the first dusk", mk([bad1, undefined, undefined]), 422, "entry.dusks[0].record"],
      ["a bad record at the last dusk", mk([good, undefined, bad1]), 422, "entry.dusks[2].record"],
      ["two bad records: the first is named", mk([undefined, bad1, bad1]), 422, "entry.dusks[1].record"],
      ["good records at every dusk", mk([good, recordOf(8), recordOf(9)]), 201, ""],
      ["a bad record under the rules text in capitals (another version)", mk([{ ...bad1, rules: RULES_VERSION.toUpperCase() } as unknown as BattleRecord]), 201, ""],
      ["a bad record under the server's rules text and one more character", mk([{ ...bad1, rules: `${RULES_VERSION}x` } as unknown as BattleRecord]), 201, ""],
      ["a bad record under an older rules text", mk([{ ...bad1, rules: "bb-0.9.9" } as unknown as BattleRecord]), 201, ""],
      ["a good record with fields the server's check does not know (kept as it is)", mk([{ ...good, junk: [1, 2, { z: null }] } as unknown as BattleRecord]), 201, ""],
      ["a record with the server's rules and builds that are two empty objects", mk([{ rules: RULES_VERSION, seed: 1, builds: [{}, {}] } as unknown as BattleRecord]), 422, "entry.dusks[0].record"],
      ["a record whose seed is 0", mk([{ ...good, seed: 0 }]), 201, ""],
      ["a record whose seed is 2^32-1", mk([{ ...good, seed: 4_294_967_295 }]), 201, ""],
    ];
    const bad: string[] = [];
    for (const [what, e, status, words] of cases) {
      const r = await putEntry(rig, A, e);
      const error = String(r.json?.error ?? "");
      if (r.status !== status || !error.includes(words)) bad.push(`${what}: wanted ${status} "${words}", got ${r.status} ${error || r.text}`);
    }
    expect(bad, bad.join("\n")).toEqual([]);
    // what is kept is byte for byte what was sent
    const kept = (await Promise.all(historyObjects(rig, A.playerId).map((n) => readObject(rig, A.playerId, n)!))).filter((t) => t.includes('"junk"'));
    expect(kept).toHaveLength(1);
    expect(kept[0]).toContain('"junk":[1,2,{"z":null}]');
  });

  it("4a. a record that is only a shape (a foreign rules text) may be as odd as it likes: 99 of them, a thousand keys, strings of any characters; only the 16,000 bytes bound it", async () => {
    const rig = await openHistoryRig(kind);
    const tiny = (n: number): BattleRecord => ({ rules: "bb-0.1.0", seed: n, builds: [{}, {}] }) as unknown as BattleRecord;
    const e = entryFor(uid("sh"), { wins: 0, days: 99, dusks: Array.from({ length: 99 }, (_, i) => ({ day: i + 1, outcome: "loss" as const, record: tiny(i) })) });
    const r = await putEntry(rig, A, e);
    expect([r.status, byteLength(encodeEntry(e)) < HISTORY_ENTRY_MAX_BYTES], r.text).toEqual([201, true]);
    const keys: Record<string, number> = {};
    for (let i = 0; i < 600; i++) keys[`k${i}`] = i;
    expect((await putEntry(rig, A, entryWith(uid("sh"), keys))).status).toBe(201);
  });
});

// ------------------------------------------------------------------------------------------------------------ 4a: nesting

describe.each(KINDS)("4a. a body nested deep (%s)", (kind) => {
  it("4a. deep arrays and objects at every place of the body: never a 5xx, never a stack in the log; where the PUT is taken, the entry reads back (no entry that is stored and cannot be served)", async () => {
    const rig = await openHistoryRig(kind);
    const seen: string[] = [];
    const bad: string[] = [];
    const note = (label: string, status: number): void => {
      seen.push(`${label}=${status}`);
      if (status >= 500) bad.push(`${label}: ${status}`);
    };
    // in the free field of a record, the one place a valid entry can hold anything (the text is written by hand: this process must not stringify it)
    const free: [string, string][] = [];
    for (const d of [100, 1000, 2500, 4000, 6000, 7000, 8000, 8100]) free.push([`arrays ${d}`, deepArray(d)]);
    for (const d of [100, 1000, 2000, 2500]) free.push([`objects ${d}`, deepObject(d)]);
    for (const [label, text] of free) {
      const id = uid("nd");
      const r = await putBody(rig, A, bodyExtra(id, text));
      note(label, r.status);
      if (r.status === 201) {
        const back = await getEntry(rig, A, id);
        if (back.status !== 200) bad.push(`${label}: stored (201) but the entry read is ${back.status}`);
      }
    }
    // in other places: `at`, a number field, an unknown field, a dusk, a build
    const full = (id: string): string => bodyOfEntry(entryFor(id), NOW);
    const places: [string, string][] = [
      ["in at", `{"at":${deepArray(6000)},"entry":${entryText(full(uid("nd")))}}`],
      ["in wins", full(uid("nd")).replace('"wins":2,', `"wins":${deepArray(6000)},`)],
      ["in an unknown entry field", full(uid("nd")).replace('"entry":{', `"entry":{"zz":${deepArray(6000)},`)],
      ["in dusks", full(uid("nd")).replace('"dusks":[', `"dusks":[${deepArray(6000)},`)],
      ["in a dusk's day", full(uid("nd")).replace('{"day":1,', `{"day":${deepArray(6000)},`)],
      ["as the whole entry", `{"at":${NOW},"entry":${deepArray(7000)}}`],
      ["as the whole body", deepArray(8000)],
      ["as the whole body (objects)", deepObject(2700)],
    ];
    for (const [label, body] of places) {
      const r = await putBody(rig, A, body);
      note(label, r.status);
      if (r.status !== 400 && r.status !== 422) bad.push(`${label}: ${r.status} (wanted 400)`);
    }
    console.log(`VIDENT3 4a deep nesting on ${kind}: ${seen.join(", ")}`);
    expect(bad, bad.join("\n")).toEqual([]);
    expect(rig.log.filter((l) => l.startsWith("error:")), "no stack in the log").toEqual([]);
    expect(rig.log.filter((l) => l.includes(" 500 ")), "no 500 line").toEqual([]);
    expect((await putEntry(rig, A, entryFor(uid("nd-after")))).status, "an honest PUT after them").toBe(201);
  });

  it("FINDING: a record nested a little under the PUT's own depth limit is stored (201) and then every read of that entry is a 500 with a RangeError stack in the log; the list names it, the DELETE removes it", async () => {
    // EXPECTED: an entry the PUT takes (201) is an entry the entry read can serve. The PUT's limit is the JSON.stringify depth inside fieldsOf (the
    // body is re-written to prove it canonical); the entry read does the same stringify of the stored value a few stack frames deeper (send), so for
    // the depths between the two limits the PUT says yes and the read throws a RangeError (app.ts `finish`: 500 "internal error", a stack in the log).
    // Only a hand-made entry gets there (the device's own entries are nowhere near: a record is a few levels deep); a device of the player can poison
    // the player's own history that way. The fix would be a depth bound in the decode, or a catch in getHistory.
    const rig = await openHistoryRig(kind);
    const put = async (d: number): Promise<{ status: number; id: string }> => {
      const id = uid("bi");
      const r = await putBody(rig, A, bodyExtra(id, deepArray(d)));
      return { status: r.status, id };
    };
    const reads = async (d: number): Promise<boolean> => {
      const { status, id } = await put(d);
      expect(status, `depth ${d} must be taken for the read probe`).toBe(201);
      return (await getEntry(rig, A, id)).status === 200;
    };
    // the deepest nesting the PUT takes
    let lo = 1, hi = 8100; // 1 is taken; 8100 is over the body bound (413)
    expect((await put(lo)).status).toBe(201);
    expect((await put(hi)).status).toBe(413);
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2);
      const r = await put(mid);
      expect([201, 400, 413], `depth ${mid}`).toContain(r.status);
      if (r.status === 201) lo = mid;
      else hi = mid;
    }
    const putMax = lo;
    // the deepest nesting whose stored entry the read serves (every depth up to it is served, none above it)
    let rlo = 1, rhi = putMax;
    expect(await reads(rlo)).toBe(true);
    const windowOpen = !(await reads(rhi));
    if (windowOpen) {
      while (rhi - rlo > 1) {
        const mid = Math.floor((rlo + rhi) / 2);
        if (await reads(mid)) rlo = mid;
        else rhi = mid;
      }
    } else rlo = putMax;
    console.log(`VIDENT3 4a (${kind}) the PUT takes a record nested ${putMax} deep (arrays); the entry read serves up to ${rlo}${windowOpen ? `; ${putMax - rlo} depths are stored and answer 500` : "; no gap"}`);
    expect(windowOpen, "the gap exists on this Node (its stack decides the numbers)").toBe(true);
    expect(putMax - rlo, "and it is narrow: the read's limit is only a few frames under the PUT's").toBeLessThan(100);
    // the poisoned entry: stored, listed, 500 on every read, removed by the DELETE
    const id = uid("bi");
    expect((await putBody(rig, A, bodyExtra(id, deepArray(putMax)))).status).toBe(201);
    const before = rig.log.filter((l) => l.startsWith("error:")).length;
    for (let i = 0; i < 2; i++) {
      const back = await getEntry(rig, A, id);
      expect([back.status, back.json], `read ${i + 1}`).toEqual([500, { error: "internal error" }]);
    }
    expect(rig.log.filter((l) => l.startsWith("error: RangeError")).length, "each failed read puts a RangeError stack into the log").toBe(before + 2);
    expect(listedIds(await listEntries(rig, A))).toContain(id);
    expect((await putBody(rig, A, bodyExtra(id, deepArray(putMax)))).status, "the same entry again is 200: it is known").toBe(200);
    expect((await putEntry(rig, A, entryFor(uid("bi-ok")))).status, "an honest entry beside it is fine").toBe(201);
    expect((await deleteMe(rig, A)).status).toBe(200);
    expect(allHistory(rig), "the DELETE lists names only, so it removes the poisoned entry too").toEqual([]);
  });
});

describe.each(KINDS)("4a. what the poisoned entry does to a second device (%s)", (kind) => {
  beforeEach(() => resetHistorySync());

  it("FINDING (the consequence of the one above): the second device's sync stops at the entry that answers 500, so every OLDER entry of the player never reaches it, the sync is never stamped, and each page load tries again", async () => {
    // EXPECTED: one unreadable entry does not hide the rest of the player's history (historySync.ts doSync :155-165 breaks the download loop at the first
    // non-404 failure: a 500 is "stop" and keeps the entry in the newest-10-missing list for ever). Only a hand-made entry gets there (see above).
    const rig = await openHistoryRig(kind);
    expect((await linkVia(rig, A, B)).joined.status).toBe(200);
    const newest = entryFor("d-new", { finishedAt: FINISHED });
    const oldest = entryFor("d-old", { finishedAt: FINISHED - 2_000 });
    expect((await putEntry(rig, A, newest)).status).toBe(201);
    expect((await putEntry(rig, A, oldest)).status).toBe(201);
    // the poisoned entry in between: the deepest nesting the PUT takes (bisection), and it must be one the read cannot serve
    let lo = 1, hi = 8100;
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2);
      const r = await putBody(rig, A, bodyExtra(uid("pz"), deepArray(mid)));
      if (r.status === 201) lo = mid;
      else hi = mid;
    }
    const poison = uid("pz");
    const poisonBody = bodyExtra(poison, deepArray(lo)).replace(`"finishedAt":${FINISHED},`, `"finishedAt":${FINISHED - 1_000},`);
    expect((await putBody(rig, A, poisonBody)).status).toBe(201);
    expect((await getEntry(rig, A, poison)).status, "the deepest taken entry is the unreadable one").toBe(500);
    // every probe entry the bisection stored stays in the list: remove them so that only the three matter
    for (const n of historyObjects(rig, A.playerId)) {
      const id = n.replace(/^\d{13}-/, "").replace(/\.json$/, "");
      if (id.startsWith("pz-") && id !== poison) removeObject(rig, A.playerId, n);
    }
    expect(listedIds(await listEntries(rig, A))).toEqual(["d-new", poison, "d-old"]);
    // the second device: linked to the player, nothing local
    const dev = await device(1);
    writeLink({ v: 1, player: A.playerId, key: dev.id.keyId!, at: NOW }, dev.store);
    const deps = { now: () => rig.clock.now, store: dev.store, mirror: null, timeoutMs: 4000 };
    const first = await syncHistory(rig.base, dev.id, deps);
    expect(first, "the newest came, the sync stopped at the poison").toMatchObject({ status: "failed", received: 1 });
    expect(readHistory(dev.store).state.entries.map((e) => e.entry.id)).toEqual(["d-new"]);
    expect(readHistory(dev.store).state.syncedAt, "the sync is not stamped, so the next page load tries at once").toBeUndefined();
    for (let i = 0; i < 3; i++) {
      resetHistorySync();
      expect(await syncHistory(rig.base, dev.id, deps), `sync ${i + 2}`).toMatchObject({ status: "failed", received: 0 });
    }
    expect(readHistory(dev.store).state.entries.map((e) => e.entry.id), "the older entry never came").toEqual(["d-new"]);
    expect(rig.log.filter((l) => l.startsWith("error: RangeError")).length, "and each try puts a stack into the server's log").toBeGreaterThanOrEqual(5);
    // once the poisoned object is gone (the cap drops it, or the operator does) the rest flows
    const name = historyObjects(rig, A.playerId).find((n) => n.endsWith(`-${poison}.json`))!;
    removeObject(rig, A.playerId, name);
    resetHistorySync();
    expect(await syncHistory(rig.base, dev.id, deps)).toMatchObject({ status: "ok", received: 1 });
    expect(readHistory(dev.store).state.entries.map((e) => e.entry.id)).toEqual(["d-new", "d-old"]);
  });
});

describe.each(KINDS)("4a. the HTTP surface of the route (%s)", (kind) => {
  it("4a. only the exact path /v1/history is the route: a trailing slash, another case or a prefix is 404; the query of a PUT is ignored; HEAD is 405; the answers carry no-store", async () => {
    const rig = await openHistoryRig(kind);
    const body = bodyOfEntry(entryFor(uid("h")), NOW);
    const headers = await signedBy(A, body, HISTORY_PREFIX);
    for (const path of ["/v1/history/", "/V1/history", "/v1/History", "/v1/history.json", "/v1/histor", "//v1/history"]) {
      const r = await send(rig, "PUT", path, body, headers);
      expect([r.status, path], path).toEqual([404, path]);
    }
    expect(allHistory(rig)).toEqual([]);
    const withQuery = await send(rig, "PUT", `/v1/history?at=${NOW}&id=whatever&x=1`, body, headers);
    expect([withQuery.status, withQuery.json], "a query on a PUT is not part of anything").toEqual([201, { id: JSON.parse(entryText(body)).id }]);
    const list = `/v1/history/?at=${NOW}`;
    expect((await getSigned(rig, A, list)).status, "a trailing slash on the read").toBe(404);
    const head = await send(rig, "HEAD", "/v1/history", undefined, headers);
    expect(head.status).toBe(405);
    expect((await listEntries(rig, A)).headers.get("cache-control")).toBe("no-store");
  });
});

describe.each(KINDS)("4a. fieldsOf and atProblem are IDENT-1's, shared, and unchanged (%s)", (kind) => {
  it("4a. fieldsOf answers the IDENT-1 way for the shapes the history route relies on, and a deep body makes IDENT-1's own routes answer the way they did", async () => {
    expect(fieldsOf('{"at":1}', ["at"])).toEqual({ at: 1 });
    expect(fieldsOf('{"at": 1}', ["at"])).toBe("body: not in the canonical form (compact JSON, fixed field order)");
    expect(fieldsOf('{"b":1,"at":1}', ["at"])).toBe("body: expected exactly at, in that order");
    expect(fieldsOf('{"at":1,"at":2}', ["at"])).toBe("body: not in the canonical form (compact JSON, fixed field order)");
    expect(fieldsOf('{"at":-0}', ["at"])).toBe("body: not in the canonical form (compact JSON, fixed field order)");
    expect(fieldsOf("[1]", ["at"])).toBe("body: expected an object");
    expect(fieldsOf("{", ["at"])).toBe("body: not JSON");
    expect(atProblem(NOW, NOW)).toBeNull();
    expect(atProblem(NOW + HISTORY_AHEAD_MS, NOW)).toBeNull();
    expect(atProblem(NOW + HISTORY_AHEAD_MS + 1, NOW)).toBe("at: more than 10 minutes from the server's clock");
    expect(atProblem(-1, NOW)).toBe("at: expected the client's time in milliseconds");
    expect(atProblem(1.5, NOW)).toBe("at: expected the client's time in milliseconds");
    // fieldsOf itself throws a RangeError on a body nested deeper than the stack takes (JSON.stringify): the history route catches it; IDENT-1's routes call it bare
    let thrown = "";
    try {
      fieldsOf(`{"at":${deepArray(8000)}}`, ["at"]);
    } catch (e) {
      thrown = e instanceof Error ? e.name : String(e);
    }
    console.log(`VIDENT3 4a fieldsOf on a body nested 8000 deep: ${thrown === "" ? "returned a value" : `threw ${thrown}`}`);
    expect(["", "RangeError"]).toContain(thrown);
    // IDENT-1's widest body is the Steam link's (8192 bytes): about 4000 levels of nesting fit. What the route answers (pre-existing: fieldsOf is unchanged since ident1-done)
    const rig = await openHistoryRig(kind, { steam: fakeSteam({}) });
    const depth = 4000;
    const body = `{"at":${NOW},"ticket":${deepArray(depth)},"identity":"x","appid":480}`;
    expect(byteLength(body)).toBeLessThanOrEqual(8192);
    const r = await send(rig, "POST", "/v1/link/steam", body, await signedBy(A, body, LINK_STEAM_PREFIX));
    console.log(`VIDENT3 4a /v1/link/steam with a ticket nested ${depth} deep: ${r.status} ${r.text.slice(0, 80)}; error log lines: ${rig.log.filter((l) => l.startsWith("error:")).length}`);
    expect([400, 500], "pre-existing at ident1-done: fieldsOf is shared and unchanged").toContain(r.status);
  });
});

// ------------------------------------------------------------------------------------------------------------- 4a: the order of the checks

/** A LinkStore over memory whose list fails on demand: the tombstones cannot be read. */
function flaky(): { store: LinkStore; fail: { list: number } } {
  const inner = new MemoryLinkStore();
  const fail = { list: 0 };
  const store: LinkStore = {
    get: (k) => inner.get(k), put: (k, t) => inner.put(k, t), delete: (k) => inner.delete(k),
    list: async (p) => {
      if (fail.list > 0) {
        fail.list--;
        throw new StorageError("identity list failed: HTTP 503");
      }
      return inner.list(p);
    },
  };
  return { store, fail };
}

describe.each(KINDS)("4a. the order of the checks when two things are wrong at once (%s)", (kind) => {
  const hundredRows = (): HistoryEntry["dusks"] => Array.from({ length: 100 }, (_, i) => ({ day: i + 1, outcome: "loss" as const }));

  it("4a. wrong signature + oversize body is 413 (the body is read before the signature is checked); closed uploads beat both; no signature beats the size", async () => {
    const rig = await openHistoryRig(kind);
    const big = enc(`{"at":${NOW},"entry":${"x".repeat(HISTORY_BODY_MAX_BYTES)}}`);
    const good = await signedBy(A, big, HISTORY_PREFIX);
    const wrongSig = { ...good, [SIG_HEADER]: (await signedBy(B, big, HISTORY_PREFIX))[SIG_HEADER] };
    const a = await send(rig, "PUT", "/v1/history", big, wrongSig);
    expect([a.status, a.json], "NOTE: a well formed but wrong signature on an oversize body is 413, not 401 (IDENT-1's order: opened reads the body, then verifies)").toEqual([413, { error: "request body over 16384 bytes" }]);
    expect((await send(rig, "PUT", "/v1/history", big, { "content-type": "application/json" })).status, "no headers at all: 401 first").toBe(401);
    expect((await send(rig, "PUT", "/v1/history", big, { ...good, [KEY_HEADER]: "AAAA" })).status, "a malformed key: 401 first").toBe(401);
    await rig.restart({ ...OPEN, uploads: "closed" });
    expect((await send(rig, "PUT", "/v1/history", big, wrongSig)).status, "closed: 403 before everything").toBe(403);
  });

  it("4a. NOTE: a dusk list over 99 rows is a 422 from the DECODE, so it beats a stale `at`, an unloaded tombstone set (503) and a deleted player (410); every other cap comes after them", async () => {
    const tooMany = (): HistoryEntry => entryFor(uid("or"), { dusks: hundredRows(), days: 99, wins: 0 });
    const overWins = (): HistoryEntry => entryFor(uid("or"), { wins: 100 });
    const rig = await openHistoryRig(kind);
    // a stale `at`: the 100 rows win (their message), the other caps lose
    const stale = NOW + HISTORY_AHEAD_MS + 5;
    const a = await putEntry(rig, A, tooMany(), stale);
    expect([a.status, String(a.json?.error)]).toEqual([422, "entry.dusks: 100 rows is over the ceiling 99"]);
    const b = await putEntry(rig, A, overWins(), stale);
    expect([b.status, String(b.json?.error)]).toEqual([422, "at: more than 10 minutes from the server's clock"]);
    // the tombstones cannot be read
    const f = flaky();
    const rig2 = await openHistoryRig(kind, { linkStore: f.store });
    f.fail.list = 3;
    const c = await putEntry(rig2, A, tooMany());
    expect([c.status, String(c.json?.error)], "tombstones unreadable + 100 rows").toEqual([422, "entry.dusks: 100 rows is over the ceiling 99"]);
    const d = await putEntry(rig2, A, overWins());
    expect([d.status, d.json?.error], "tombstones unreadable + wins 100: the 503 comes first").toEqual([503, "ghost storage unavailable, try again shortly"]);
    f.fail.list = 1;
    const stale2 = await putEntry(rig2, A, overWins(), NOW + HISTORY_AHEAD_MS + 5);
    expect([stale2.status, String(stale2.json?.error)], "a stale `at` is refused before the tombstones are asked for").toEqual([422, "at: more than 10 minutes from the server's clock"]);
    expect(f.fail.list, "and the failing LIST was not even asked").toBe(1);
    f.fail.list = 0;
    // a deleted player
    const rig4 = await openHistoryRig(kind);
    expect((await putEntry(rig4, A, entryFor(uid("or")))).status).toBe(201);
    expect((await deleteMe(rig4, A)).status).toBe(200);
    const e = await putEntry(rig4, A, tooMany());
    expect([e.status, String(e.json?.error)], "deleted + 100 rows: NOTE the 422 comes before the 410").toEqual([422, "entry.dusks: 100 rows is over the ceiling 99"]);
    const g = await putEntry(rig4, A, overWins());
    expect([g.status, g.json?.error], "deleted + wins 100: the 410 comes first").toEqual([410, "this player was deleted"]);
    expect(allHistory(rig4)).toEqual([]);
  });

  it("4a. a known id with a cap-breaking entry is the cap's 422, not the 409; a bad record is after the caps; two caps broken at once name the first one checked", async () => {
    const rig = await openHistoryRig(kind);
    expect((await putEntry(rig, A, entryFor("known-1"))).status).toBe(201);
    const r = await putEntry(rig, A, entryFor("known-1", { finishedAt: HISTORY_EARLIEST_AT - 1 }));
    expect([r.status, String(r.json?.error)]).toEqual([422, "entry.finishedAt: not between 2026-01-01 and the server's clock"]);
    const bad = { ...recordOf(7), wins: [1] } as unknown as BattleRecord;
    const both = await putEntry(rig, A, entryFor(uid("or"), { wins: 100, dusks: [{ day: 1, outcome: "win", record: bad }] }));
    expect([both.status, String(both.json?.error)], "the cap before the record").toEqual([422, "entry.wins: 100 is over the ceiling 99"]);
    const order = await putEntry(rig, A, entryFor(uid("or"), { kind: "weekly" as never, hero: "NOPE", wins: 100, days: 0 }));
    expect([order.status, String(order.json?.error)], "kind is checked before hero, wins and days").toEqual([422, expect.stringContaining("entry.kind")]);
    const hero = await putEntry(rig, A, entryFor(uid("or"), { hero: "NOPE", wins: 100, days: 0 }));
    expect([hero.status, String(hero.json?.error)], "hero is checked before wins and days").toEqual([422, expect.stringContaining("entry.hero")]);
    expect(historyObjects(rig, A.playerId)).toHaveLength(1);
    expect(readObject(rig, A.playerId, nameOfEntry(entryFor("known-1")))).toBe(encodeEntry(entryFor("known-1")));
  });
});
