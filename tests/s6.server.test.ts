// S6 (REQ-BFG-119) Goal 2: the server serves the privacy policy and the support page. In process, no network beyond 127.0.0.1:
//  - GET and HEAD /privacy, /privacy.html, /support and /support.html: 200, text/html; charset=utf-8, an ETag (304 on a match), the game page's own
//    caching and security headers; other methods 405; whether or not a game page is served (BB_GHOST_STATIC);
//  - a page that still holds a [[placeholder]] is not served: 404, plain text, no ETag, one start-up log line naming the page (the pages as committed
//    hold both placeholders, so the first block runs against the real files; the second against copies with an address and a name in their places);
//  - the pages travel inside the server bundle (`?raw`), so the Docker context and the deploy files stay as they are.
// The server is made in process (createGhostServer over a temp directory), as the other server tests do; server/pages.ts's infoPages is the one seam:
// a test hands it other text through vi.mock, the way production hands it the two files.
import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createGhostServer, type GhostServer } from "../server/app";
import { INFO_ROUTES, placeholdersIn, WITHHELD_TEXT } from "../server/pages";

const state = vi.hoisted(() => ({ sources: undefined as { privacy: string; support: string } | undefined }));
vi.mock("../server/pages", async (importOriginal) => {
  const real = await importOriginal<typeof import("../server/pages")>();
  return { ...real, infoPages: () => real.infoPages(state.sources) };
});

const ROOT = new URL("..", import.meta.url).pathname;
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");
const FILES = { privacy: read("server/pages/privacy.html"), support: read("server/pages/support.html") };
const fill = (t: string): string => t.replaceAll("[[SUPPORT_EMAIL]]", "help@example.org").replaceAll("[[DEVELOPER_NAME]]", "Example Games");
const FILLED = { privacy: fill(FILES.privacy), support: fill(FILES.support) };
const PATHS = ["/privacy", "/privacy.html", "/support", "/support.html"] as const;
const bytes = (t: string): number => new TextEncoder().encode(t).length;
const REQUEST_LINE = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z (GET|HEAD|POST) \/\S* \d{3} \d+ms$/;

const toClose: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  state.sources = undefined;
  while (toClose.length) await toClose.pop()!();
});

async function boot(sources?: { privacy: string; support: string }, withGamePage = false): Promise<{ app: GhostServer; base: string; logs: string[]; gameHtml: string }> {
  state.sources = sources;
  const dir = mkdtempSync(join(tmpdir(), "bb-s6-"));
  const gameHtml = "<!doctype html><title>BeltBattles</title><p>the game</p>\n";
  if (withGamePage) writeFileSync(join(dir, "index.html"), gameHtml);
  const logs: string[] = [];
  const app = createGhostServer({ dataDir: dir, log: (l) => logs.push(l), ...(withGamePage ? { staticDir: dir } : {}) });
  const port = await app.listen(0);
  toClose.push(async () => {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });
  return { app, base: `http://127.0.0.1:${port}`, logs, gameHtml };
}

describe("S6 Goal 2: the pages as committed hold both placeholders, so they are withheld", () => {
  it("the committed pages hold exactly the two placeholders (so this block tests the real files) -- or none, once contact.mjs has filled them", () => {
    const a = placeholdersIn(FILES.privacy), b = placeholdersIn(FILES.support);
    expect([...a].sort()).toEqual([...b].sort());
    expect(a.length === 0 || (a.length === 2 && a.includes("[[SUPPORT_EMAIL]]") && a.includes("[[DEVELOPER_NAME]]"))).toBe(true);
  });

  const committedFilled = placeholdersIn(FILES.privacy).length === 0;
  it.skipIf(committedFilled)("GET, HEAD and POST on the four paths: 404, plain text, nothing cached, no ETag, a short reason; no game page needed", async () => {
    const { base, logs } = await boot();
    for (const p of PATHS) {
      for (const method of ["GET", "HEAD", "POST"]) {
        const r = await fetch(base + p, { method, ...(method === "POST" ? { body: "x" } : {}) });
        expect(r.status, `${method} ${p}`).toBe(404);
        expect(r.headers.get("content-type")).toBe("text/plain; charset=utf-8");
        expect(r.headers.get("cache-control")).toBe("no-store");
        expect(r.headers.get("x-content-type-options")).toBe("nosniff");
        expect(r.headers.get("etag")).toBeNull();
        expect(await r.text(), `${method} ${p}`).toBe(method === "GET" || method === "POST" ? WITHHELD_TEXT : "");
      }
    }
    expect(WITHHELD_TEXT).toBe("This page is not published yet.\n");
    const lines = logs.filter((l) => REQUEST_LINE.test(l));
    expect(lines).toHaveLength(12);
    expect(lines.every((l) => / 404 \d+ms$/.test(l))).toBe(true);
  });

  it.skipIf(committedFilled)("the start logs one line for each page, naming it and the placeholders it holds, and says how to fix it", async () => {
    const { logs } = await boot();
    const mine = logs.filter((l) => l.includes("server/pages/"));
    // in the order they appear on each page: the privacy page names the publisher first, the support page the address
    expect(placeholdersIn(FILES.privacy)).toEqual(["[[DEVELOPER_NAME]]", "[[SUPPORT_EMAIL]]"]);
    expect(placeholdersIn(FILES.support)).toEqual(["[[SUPPORT_EMAIL]]", "[[DEVELOPER_NAME]]"]);
    expect(mine).toEqual([
      "NOT serving server/pages/privacy.html: it still holds [[DEVELOPER_NAME]], [[SUPPORT_EMAIL]], so /privacy and /privacy.html answer 404 until node scripts/s6/contact.mjs fills them",
      "NOT serving server/pages/support.html: it still holds [[SUPPORT_EMAIL]], [[DEVELOPER_NAME]], so /support and /support.html answer 404 until node scripts/s6/contact.mjs fills them",
    ]);
  });
});

describe("S6 Goal 2: the pages with an address and a name are served", () => {
  it("GET: 200, text/html; charset=utf-8, the file's bytes, a 32-hex ETag, and the game page's own caching and security headers", async () => {
    const { base, logs } = await boot(FILLED);
    for (const p of PATHS) {
      const name = p.startsWith("/privacy") ? "privacy" : "support";
      const r = await fetch(base + p);
      expect(r.status, p).toBe(200);
      expect(r.headers.get("content-type")).toBe("text/html; charset=utf-8");
      expect(r.headers.get("cache-control")).toBe("no-cache");
      expect(r.headers.get("x-content-type-options")).toBe("nosniff");
      expect(r.headers.get("referrer-policy")).toBe("no-referrer");
      expect(r.headers.get("content-security-policy")).toBeNull(); // the game page has none either (tests/server-prod.test.ts)
      expect(r.headers.get("etag")).toMatch(/^"[0-9a-f]{32}"$/);
      expect(r.headers.get("content-length")).toBe(String(bytes(FILLED[name])));
      expect(await r.text(), p).toBe(FILLED[name]);
    }
    // /privacy and /privacy.html are one page (one ETag); the support page is another
    const tag = async (p: string): Promise<string> => (await fetch(base + p)).headers.get("etag")!;
    expect(await tag("/privacy")).toBe(await tag("/privacy.html"));
    expect(await tag("/support")).toBe(await tag("/support.html"));
    expect(await tag("/privacy")).not.toBe(await tag("/support"));
    expect(logs.filter((l) => l.includes("server/pages/"))).toEqual([
      `serving server/pages/privacy.html (${bytes(FILLED.privacy)} bytes) at /privacy and /privacy.html`,
      `serving server/pages/support.html (${bytes(FILLED.support)} bytes) at /support and /support.html`,
    ]);
    const requestLines = logs.filter((x) => /^\d{4}-\d\d-\d\dT/.test(x));
    expect(requestLines.length).toBeGreaterThan(8);
    for (const l of requestLines) expect(l).toMatch(REQUEST_LINE); // time, method, path, status, duration; no address
  });

  it("HEAD: the same headers and the length, no body; If-None-Match with the ETag: 304; other methods: 405", async () => {
    const { base } = await boot(FILLED);
    for (const p of PATHS) {
      const get = await fetch(base + p);
      const head = await fetch(base + p, { method: "HEAD" });
      expect(head.status, p).toBe(200);
      for (const h of ["content-type", "cache-control", "x-content-type-options", "referrer-policy", "etag", "content-length"]) expect(head.headers.get(h), `${p} ${h}`).toBe(get.headers.get(h));
      expect(await head.text()).toBe("");
      const etag = get.headers.get("etag")!;
      const again = await fetch(base + p, { headers: { "if-none-match": etag } });
      expect(again.status).toBe(304);
      expect(again.headers.get("etag")).toBe(etag);
      expect(await again.text()).toBe("");
      expect((await fetch(base + p, { headers: { "if-none-match": `W/${etag}, "other"` } })).status).toBe(304);
      expect((await fetch(base + p, { headers: { "if-none-match": '"0000"' } })).status).toBe(200);
      for (const method of ["POST", "PUT", "DELETE"]) {
        const r = await fetch(base + p, { method, ...(method === "DELETE" ? {} : { body: "x" }) });
        expect(r.status, `${method} ${p}`).toBe(405);
        expect(await r.json()).toEqual({ error: "use GET or HEAD" });
      }
    }
  });

  it("with a game page the headers of /privacy are the headers of /; without one, / stays 404 and the pages are served all the same", async () => {
    const withGame = await boot(FILLED, true);
    const game = await fetch(`${withGame.base}/`);
    const page = await fetch(`${withGame.base}/privacy`);
    expect(game.status).toBe(200);
    expect(await game.text()).toBe(withGame.gameHtml);
    for (const h of ["content-type", "cache-control", "x-content-type-options", "referrer-policy", "vary", "content-security-policy"]) expect(page.headers.get(h), h).toBe(game.headers.get(h));
    expect(withGame.logs.some((l) => l.startsWith("serving the game page "))).toBe(true);
    const bare = await boot(FILLED, false);
    expect((await fetch(`${bare.base}/`)).status).toBe(404);
    expect((await fetch(`${bare.base}/index.html`)).status).toBe(404);
    expect((await fetch(`${bare.base}/privacy`)).status).toBe(200);
    expect((await fetch(`${bare.base}/support.html`)).status).toBe(200);
    expect((await fetch(`${bare.base}/v1/health`)).status).toBe(200);
  });

  it("a page is withheld on its own: one filled, the other still holding a placeholder (or any other [[name]])", async () => {
    const half = await boot({ privacy: FILLED.privacy, support: FILES.support.includes("[[") ? FILES.support : FILLED.support.replace("Example Games", "[[DEVELOPER_NAME]]") });
    expect((await fetch(`${half.base}/privacy`)).status).toBe(200);
    expect((await fetch(`${half.base}/support`)).status).toBe(404);
    expect((await fetch(`${half.base}/support.html`, { method: "HEAD" })).status).toBe(404);
    expect(half.logs.filter((l) => l.startsWith("NOT serving "))).toHaveLength(1);
    const other = await boot({ privacy: FILLED.privacy.replace("Example Games", "[[SOMETHING_ELSE]]"), support: FILLED.support });
    expect((await fetch(`${other.base}/privacy`)).status).toBe(404);
    expect((await fetch(`${other.base}/support`)).status).toBe(200);
    expect(other.logs.find((l) => l.startsWith("NOT serving "))).toContain("[[SOMETHING_ELSE]]");
  });

  it("the other paths are unchanged: near misses are the usual JSON 404, and the API still answers", async () => {
    const { base } = await boot(FILLED);
    for (const p of ["/privacy/", "/Privacy", "/privacy.htm", "/support.html/", "/privacypolicy", "/privacy/index.html", "/legal", "/v1/privacy", "/support/x"]) {
      const r = await fetch(base + p);
      expect(r.status, p).toBe(404);
      expect(r.headers.get("content-type")).toBe("application/json; charset=utf-8");
      expect(await r.json()).toEqual({ error: "not found" });
    }
    expect(await (await fetch(`${base}/v1/health`)).json()).toMatchObject({ ok: true });
    expect(Object.keys(INFO_ROUTES).sort()).toEqual([...PATHS].sort());
  });
});

describe("S6 Goal 2: the pages ship inside the server bundle, and the deploy needs nothing", () => {
  it("pages.ts imports the two files with ?raw and reads no file at run time; the Docker context is still server/dist and the staged game page", () => {
    const pages = read("server/pages.ts");
    expect(pages).toContain('import privacySource from "./pages/privacy.html?raw";');
    expect(pages).toContain('import supportSource from "./pages/support.html?raw";');
    expect(pages).not.toMatch(/node:fs|readFileSync|process\.env/);
    expect(read(".dockerignore").split("\n").filter((l) => l && !l.startsWith("#"))).toEqual(["*", "!server/dist", "!deploy/public/index.html"]);
    expect(read("Dockerfile").split("\n").filter((l) => l.startsWith("COPY"))).toEqual(["COPY server/dist/ ./dist/", "COPY deploy/public/index.html ./public/index.html"]);
    expect(read("server/raw.d.ts")).toContain('declare module "*.html?raw"');
    expect(read("fly.toml")).not.toMatch(/privacy|support/i);
    // the vite config of the server bundle is as it was: the ?raw import needs no plugin
    expect(read("vite.server.config.ts")).not.toMatch(/plugins|html/);
  });
});
