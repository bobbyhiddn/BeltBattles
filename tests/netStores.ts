// Store fixtures for the server tests: the JSON-lines store in a temp directory and the Tigris
// store on the in-process fake S3 (tools/fakeS3.ts). Not a test file itself.

import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createGhostServer, type GhostServer, type ServerOptions } from "../server/app";
import { S3Client, type S3Options } from "../server/s3";
import { TigrisStore, type TigrisStoreOptions } from "../server/tigrisStore";
import { FakeS3, type FakeS3Options } from "../tools/fakeS3";

/** Credentials of the fake only: not real, never used anywhere else. */
export const FAKE_CREDS = { accessKeyId: "AKIDFAKES3TESTONLY", secretAccessKey: "fake-secret-for-the-local-fake-s3" };

export async function startFake(opts: Partial<FakeS3Options> = {}): Promise<FakeS3> {
  const fake = new FakeS3({ ...FAKE_CREDS, buckets: ["bb-test"], ...opts });
  await fake.listen(0);
  return fake;
}

export function s3For(fake: FakeS3, bucket = "bb-test", over: Partial<S3Options> = {}): S3Client {
  return new S3Client({
    endpoint: fake.endpoint, region: fake.region, bucket, ...FAKE_CREDS,
    addressing: "path", timeoutMs: 2000, backoffMs: 1, ...over,
  });
}

export function tigrisFor(fake: FakeS3, bucket = "bb-test", opts: TigrisStoreOptions = {}, s3: Partial<S3Options> = {}): TigrisStore {
  return new TigrisStore(s3For(fake, bucket, s3), opts);
}

export interface StoreBackend {
  name: "jsonl" | "tigris";
  setup(): Promise<void>;
  teardown(): Promise<void>;
  /** A server over this backend's storage (fresh: over new, empty storage instead). */
  server(opts: Omit<ServerOptions, "store" | "dataDir">, fresh?: boolean): GhostServer;
  /** Player records durably stored: ghosts.jsonl lines, or objects under a player/ prefix. */
  storedRecords(): number;
}

export function jsonlBackend(): StoreBackend {
  const dirs: string[] = [];
  let dir = "";
  return {
    name: "jsonl",
    async setup() {
      dir = mkdtempSync(join(tmpdir(), "bb-ghosts-"));
      dirs.push(dir);
    },
    async teardown() {
      for (const d of dirs) rmSync(d, { recursive: true, force: true });
    },
    server(opts, fresh = false) {
      let d = dir;
      if (fresh) dirs.push((d = mkdtempSync(join(tmpdir(), "bb-ghosts-rl-"))));
      return createGhostServer({ ...opts, dataDir: d });
    },
    storedRecords() {
      const f = join(dir, "ghosts.jsonl");
      return existsSync(f) ? readFileSync(f, "utf8").trim().split("\n").filter(Boolean).length : 0;
    },
  };
}

export function tigrisBackend(): StoreBackend {
  let fake: FakeS3;
  let n = 0;
  return {
    name: "tigris",
    async setup() {
      fake = await startFake();
    },
    async teardown() {
      await fake.close();
    },
    server(opts, fresh = false) {
      let bucket = "bb-test";
      if (fresh) fake.createBucket((bucket = `bb-fresh-${++n}`));
      return createGhostServer({ ...opts, store: tigrisFor(fake, bucket) });
    },
    storedRecords() {
      return fake.keys("bb-test", "ghosts/").filter((k) => k.includes("/player/")).length;
    },
  };
}

export function storeBackends(): StoreBackend[] {
  return [jsonlBackend(), tigrisBackend()];
}
