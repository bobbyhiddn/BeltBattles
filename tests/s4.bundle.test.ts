// S4: ghost-ops as it ships. `npm run build:server` writes server/dist/ghost-ops.mjs (vite.server.config.ts's new input); this test builds the same bundle into a temp directory (as
// tests/s2.bundle.test.ts does) and runs it as a CHILD PROCESS, the way the nightly job and the operator run it: --help with an empty environment, the exit codes 0, 1 and 2, a snapshot,
// verify and restore across two buckets on the in-process fake S3, and check-health against a local server. Nothing leaves 127.0.0.1.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { build } from "vite";
import { spawn } from "node:child_process";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createGhostServer, type GhostServer } from "../server/app";
import { COMMANDS } from "../server/ops";
import { JsonlStore } from "../server/store";
import type { FakeS3 } from "../tools/fakeS3";
import { FAKE_CREDS, startFake } from "./netStores";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
let dist: string;
let work: string;
let fake: FakeS3;
const A = "bb-bundle-a", B = "bb-bundle-b";

beforeAll(async () => {
  work = await mkdtemp(join(tmpdir(), "bb-s4-bundle-"));
  dist = join(work, "dist");
  await build({ configFile: join(ROOT, "vite.server.config.ts"), root: ROOT, logLevel: "warn", build: { outDir: dist, emptyOutDir: true } });
  fake = await startFake({ buckets: [A, B], pageSize: 4 });
  for (let i = 0; i < 9; i++) fake.putObject(A, `ghosts/bb-0.12.0/d0${(i % 3) + 1}/player/g${i}.json`, JSON.stringify({ id: `g${i}` }));
  fake.putObject(A, "profiles/bundle-player-0001.json", '{"counters":{"runs":1}}');
  fake.putObject(A, "tombstones/bundle-deleted-0001.json", '{"at":1}');
}, 300_000);
afterAll(async () => {
  await fake?.close();
  if (work) await rm(work, { recursive: true, force: true });
});

function envFor(bucket: string): Record<string, string> {
  return {
    BB_GHOST_STORE: "tigris", AWS_ACCESS_KEY_ID: FAKE_CREDS.accessKeyId, AWS_SECRET_ACCESS_KEY: FAKE_CREDS.secretAccessKey, AWS_ENDPOINT_URL_S3: fake.endpoint,
    BUCKET_NAME: bucket, BB_GHOST_S3_ADDRESSING: "path",
  };
}
/** Run the bundle as a child process: its exit code and everything it printed. */
function ghostOps(args: string[], env: Record<string, string>): Promise<{ code: number; out: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(dist, "ghost-ops.mjs"), ...args], { env });
    let out = "";
    const take = (c: Uint8Array) => { out += new TextDecoder().decode(c); };
    child.stdout?.on("data", take);
    child.stderr?.on("data", take);
    child.on("error", reject);
    child.on("exit", (code) => resolve({ code: code ?? -1, out }));
  });
}

describe("S4 the built ghost-ops.mjs", () => {
  it("is built beside ghost-server.mjs and ghost-admin.mjs", async () => {
    const files = await readdir(dist);
    for (const f of ["ghost-ops.mjs", "ghost-server.mjs", "ghost-admin.mjs", "validate-worker.mjs"]) expect(files, f).toContain(f);
  });

  it("--help exits 0 with an EMPTY environment and lists every command; no command, an unknown command and a missing option are exit 2", async () => {
    const h = await ghostOps(["--help"], {});
    expect(h.code, h.out).toBe(0);
    for (const c of COMMANDS) expect(h.out).toContain(c);
    for (const argv of [[], ["frobnicate"], ["snapshot"], ["verify"]]) {
      const r = await ghostOps(argv, {});
      expect(r.code, argv.join(" ")).toBe(2);
      expect(r.out).toContain("usage: ghost-ops");
    }
    const noStore = await ghostOps(["snapshot", "--out", join(work, "none")], {});
    expect(noStore.code).toBe(2);
    expect(noStore.out).toContain("BB_GHOST_STORE=tigris");
  });

  it("snapshot, verify --exact and restore through the bundle: exit 0, 0, 0; a second restore into the same bucket is exit 2; an extra object fails verify --exact (exit 1); no secret is printed", async () => {
    const out = join(work, "snaps");
    const s = await ghostOps(["snapshot", "--out", out], envFor(A));
    expect(s.code, s.out).toBe(0);
    const dir = join(out, (await readdir(out))[0]);
    const v = await ghostOps(["verify", dir, "--exact"], envFor(A));
    expect(v.code, v.out).toBe(0);
    const dry = await ghostOps(["restore", dir], envFor(B));
    expect(dry.code, dry.out).toBe(0);
    expect(fake.keys(B)).toEqual([]);
    const r = await ghostOps(["restore", dir, "--apply"], envFor(B));
    expect(r.code, r.out).toBe(0);
    expect(fake.keys(B)).toEqual(fake.keys(A));
    const again = await ghostOps(["restore", dir, "--apply"], envFor(B));
    expect(again.code, again.out).toBe(2);
    const forced = await ghostOps(["restore", dir, "--apply", "--force"], envFor(B));
    expect(forced.code, forced.out).toBe(0);
    expect(forced.out).toContain("already identical, skipped");
    const ok = await ghostOps(["verify", dir, "--exact"], envFor(B));
    expect(ok.code, ok.out).toBe(0);
    fake.putObject(B, "ghosts/bb-0.12.0/d01/player/extra.json", "{}");
    const exact = await ghostOps(["verify", dir, "--exact"], envFor(B));
    expect(exact.code).toBe(1);
    for (const t of [s.out, v.out, dry.out, r.out, again.out, forced.out, exact.out]) {
      expect(t).not.toContain(FAKE_CREDS.accessKeyId);
      expect(t).not.toContain(FAKE_CREDS.secretAccessKey);
      expect(t).not.toMatch(/AWS4-HMAC|Signature=/);
      expect(t).not.toContain("bundle-player-0001");
    }
  });

  it("check-health through the bundle: OK and exit 0 against a quiet local server, exit 1 when nothing answers", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "bb-s4-bundle-data-"));
    const app: GhostServer = createGhostServer({ store: new JsonlStore(dataDir), uploads: "closed", log: () => {} });
    try {
      const url = `http://127.0.0.1:${await app.listen(0)}`;
      const ok = await ghostOps(["check-health", url], {});
      expect(ok.code, ok.out).toBe(0);
      expect(ok.out).toMatch(/^OK 127\.0\.0\.1:\d+: no alerts/);
      await app.close();
      const dead = await ghostOps(["check-health", url, "--timeout", "2"], {});
      expect(dead.code).toBe(1);
      expect(dead.out).toContain("not reachable");
    } finally {
      await app.close();
      await rm(dataDir, { recursive: true, force: true });
    }
  });
});
