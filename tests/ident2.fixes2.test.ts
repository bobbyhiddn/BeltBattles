// IDENT-2 (REQ-BFG-122) step 6, fix B of the final IDENT-1 re-check (VERIFY-IDENT1-FIX2 REPORT :63): FileLinkStore.list returned every *.json name in a directory,
// where TigrisLinkStore.list returns only the names its own KEY_PATTERN accepts. A stray identity/tombstones/not a key.json then made the JSON-lines
// store's first load fail with a plain Error (`get` refuses the name), so every identity-aware request was a 500 "internal error", not a 503. Now the file
// store lists exactly what it can read, as the Tigris store does. (The old pinned NOTE is tests/vident2.tombstones.test.ts "A3.", rewritten.)
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { JsonlAdmin } from "../server/ghostAdmin";
import { FileLinkStore, TigrisLinkStore } from "../server/linkStore";
import type { FakeS3 } from "../tools/fakeS3";
import { closeRigs, deleteMe, freshIdentity, openRig, postGhost, requestCode, uploadFor } from "./identRig";
import { s3For, startFake } from "./netStores";

const dirs: string[] = [];
let fake: FakeS3 | null = null;
let buckets = 0;
afterAll(async () => {
  await closeRigs();
  await fake?.close();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const tmp = (): string => {
  const d = mkdtempSync(join(tmpdir(), "bb-ident2-b-"));
  dirs.push(d);
  return d;
};

const PREFIXES: string[] = ["links/keys/", "links/steam/", "players/", "linkcodes/", "tombstones/"];
/** Names the key pattern accepts: 1 to 64 letters, digits, - or _, then .json. */
const VALID = ["abc.json", "A_b-9.json", `${"x".repeat(64)}.json`, "0.json", "_.json", "-.json"];
/** Names it refuses (all safe in an object key too): a space, a dot, a long id, no id, a .tmp (an interrupted write), no extension, another case, another extension. */
const STRAYS = ["not a key.json", "a.b.json", `${"x".repeat(65)}.json`, ".json", "abc.json.tmp", "abc", "A.JSON", "a.json.bak"];
const sorted = (xs: readonly string[]): string[] => [...xs].sort();

describe("B. FileLinkStore.list answers only the names its own key check accepts (as TigrisLinkStore.list does)", () => {
  it.each(PREFIXES)("%s: the strays are not listed, every valid name is, and every name listed can be read", async (prefix) => {
    const root = tmp();
    const store = new FileLinkStore(root);
    const dir = join(root, ...prefix.split("/").filter(Boolean));
    mkdirSync(dir, { recursive: true });
    for (const n of [...VALID, ...STRAYS]) writeFileSync(join(dir, n), "{}");
    const listed = await store.list(prefix);
    expect(sorted(listed)).toEqual(sorted(VALID.map((n) => `${prefix}${n}`)));
    for (const key of listed) expect(await store.get(key), `${key}: a listed name can be read (it was a plain Error for a stray)`).toBe("{}");
  });

  it("the same names and the same strays on Tigris (the fake S3): the two stores list the same keys", async () => {
    fake ??= await startFake();
    for (const prefix of PREFIXES) {
      const bucket = `bb-ident2-b-${++buckets}`;
      fake.createBucket(bucket);
      for (const n of [...VALID, ...STRAYS]) fake.putObject(bucket, `${prefix}${n}`, "{}");
      const tigris = await new TigrisLinkStore(s3For(fake, bucket)).list(prefix);
      const root = tmp();
      const dir = join(root, ...prefix.split("/").filter(Boolean));
      mkdirSync(dir, { recursive: true });
      for (const n of [...VALID, ...STRAYS]) writeFileSync(join(dir, n), "{}");
      expect(sorted(await new FileLinkStore(root).list(prefix)), prefix).toEqual(sorted(tigris));
    }
  });

  it("names that are only legal in a file system are refused too: non-ASCII, %, :, a backslash", async () => {
    const root = tmp();
    const dir = join(root, "tombstones");
    mkdirSync(dir, { recursive: true });
    for (const n of ["ü.json", "a%20b.json", "a:b.json", "a\\b.json", "ok.json"]) writeFileSync(join(dir, n), "{}");
    expect(await new FileLinkStore(root).list("tombstones/")).toEqual(["tombstones/ok.json"]);
  });

  it("a directory that does not exist lists nothing; a prefix the store does not keep is still refused", async () => {
    const store = new FileLinkStore(tmp());
    for (const prefix of PREFIXES) expect(await store.list(prefix)).toEqual([]);
    await expect(store.list("ghosts/")).rejects.toThrow("not a record prefix");
  });

  it("a JSON-lines server with a stray file in every identity directory: the first load succeeds (no 500), a real tombstone beside the strays applies, and a key with a link record is not disturbed", async () => {
    const rig = await openRig("jsonl", { rateLimit: { windowMs: 60_000, max: 1_000_000 } });
    const [dev, gone] = [await freshIdentity(), await freshIdentity()];
    expect((await deleteMe(rig, gone)).status, "a real tombstone, written by the server").toBe(200);
    for (const prefix of PREFIXES) {
      const dir = join(rig.dir, "identity", ...prefix.split("/").filter(Boolean));
      mkdirSync(dir, { recursive: true });
      for (const n of ["not a key.json", "x.json.tmp", `${"y".repeat(65)}.json`]) writeFileSync(join(dir, n), "{}");
    }
    await rig.restart();
    const up = await postGhost(rig, dev, uploadFor(dev, dev.playerId, { runId: "a" }));
    expect([up.status, up.json?.error], "the first load did not fail").toEqual([201, undefined]);
    expect((await postGhost(rig, gone, uploadFor(gone, gone.playerId, { runId: "b" }))).status, "the real tombstone applies").toBe(410);
    expect((await requestCode(rig, dev)).status, "an identity route on the same server").toBe(200);
    expect(rig.log.filter((l) => l.startsWith("error:")), "no unhandled error was logged").toEqual([]);
  });

  it("ghost-admin purge-tombstoned reads its tombstones through the same list: a stray file is ignored, a real name with a broken text is counted as skipped", async () => {
    const dir = tmp();
    const links = new FileLinkStore(join(dir, "identity"));
    await links.put("tombstones/P1.json", JSON.stringify({ at: 1, ids: ["P1", "K1"] }));
    await links.put("tombstones/junk.json", "{not json");
    writeFileSync(join(dir, "identity", "tombstones", "not a key.json"), "{}");
    const t = await new JsonlAdmin(dir).tombstoned();
    expect([sorted([...t.ids]), t.skipped], "(a stray name made this a plain Error before)").toEqual([["K1", "P1"], 1]);
  });
});
