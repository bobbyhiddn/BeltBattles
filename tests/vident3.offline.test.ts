// VERIFY-IDENT2 step 4 item h (REQ-BFG-122 clause 4): never-linked devices, the offline build, and the import cycle linkClient <-> historySync.
// Nothing here uses a server: every network primitive the page could use is replaced by a trap, and each path a never-linked device can take
// (the folds of styleFolds.ts, the title's startup trigger, the link flows, the sync's own entry points) is walked with the trap in place.
// The static half reads the sources of the page (src/) with the TypeScript parser: the import graph from main.ts and from styleFolds.ts, the
// modules that hold a network primitive, and the load-time reads of the cycle's two modules. The built bundle's own numbers (module count,
// size, strings) are in the notes: a test cannot build.
import ts from "typescript";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { HISTORY_KEY, readHistory, unsentFor } from "../src/game/history";
import { PROFILE_KEY } from "../src/game/profile";
import { foldDuskResult, foldRunEnd } from "../src/game/styleFolds";
import { setSession } from "../src/game/session";
import { memoryKeyStore } from "../src/net/identity";
import {
  historyIdle, historyRunEnded, resetHistorySync, startupHistorySync, syncHistory, syncHistoryAfterLink,
} from "../src/net/historySync";
import { deleteOnlineData, linkSteam, redeemLinkCode, requestLinkCode, type LinkDeps } from "../src/net/linkClient";
import { LINK_KEY, encodeLink, readLink } from "../src/net/linkState";
import { resetHistoryWarning } from "../src/game/history";
import { continueEndless, device, mem, playedRun, type Device, type Mem } from "./ident2Local";
import { NOW } from "./profileupWire";

// ------------------------------------------------------------------------------------------------------------ the import graph

interface ImportRef {
  spec: string;
  typeOnly: boolean;
}

const sources = new Map<string, ts.SourceFile>();
function sourceOf(file: string): ts.SourceFile {
  let sf = sources.get(file);
  if (!sf) {
    sf = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
    sources.set(file, sf);
  }
  return sf;
}

function listTs(dir: string): string[] {
  const out: string[] = [];
  for (const n of readdirSync(dir)) {
    const p = `${dir}/${n}`;
    if (statSync(p).isDirectory()) out.push(...listTs(p));
    else if (n.endsWith(".ts") && !n.endsWith(".d.ts")) out.push(p);
  }
  return out.sort();
}

/** The imports (and re-exports) of a module; `typeOnly` ones are erased by the build and never run. */
function importsOf(file: string): ImportRef[] {
  const out: ImportRef[] = [];
  for (const st of sourceOf(file).statements) {
    if (ts.isImportDeclaration(st) && ts.isStringLiteral(st.moduleSpecifier)) {
      const c = st.importClause;
      let typeOnly = false;
      if (c) {
        if (c.isTypeOnly) typeOnly = true;
        else if (!c.name && c.namedBindings && ts.isNamedImports(c.namedBindings) && c.namedBindings.elements.length > 0 && c.namedBindings.elements.every((e) => e.isTypeOnly)) typeOnly = true;
      }
      out.push({ spec: st.moduleSpecifier.text, typeOnly });
    } else if (ts.isExportDeclaration(st) && st.moduleSpecifier && ts.isStringLiteral(st.moduleSpecifier)) {
      out.push({ spec: st.moduleSpecifier.text, typeOnly: st.isTypeOnly });
    }
  }
  return out;
}

function resolveImport(from: string, spec: string): string | null {
  if (!spec.startsWith(".")) return null;
  const base = join(dirname(from), spec).replace(/\\/g, "/"); // path.join normalizes the ../ segments
  for (const c of [`${base}.ts`, `${base}/index.ts`]) if (existsSync(c)) return c;
  return null;
}

const ALL = listTs("src");
const GRAPH = new Map<string, string[]>();
for (const f of ALL) {
  GRAPH.set(f, [...new Set(importsOf(f).filter((i) => !i.typeOnly).map((i) => resolveImport(f, i.spec)).filter((x): x is string => x !== null))]);
}

function reach(root: string): string[] {
  const seen = new Set<string>([root]);
  const stack = [root];
  while (stack.length) for (const n of GRAPH.get(stack.pop()!) ?? []) if (!seen.has(n)) (seen.add(n), stack.push(n));
  return [...seen].sort();
}

/** Strongly connected components with more than one module (the import cycles), by Tarjan. */
function cycles(): string[][] {
  let index = 0;
  const idx = new Map<string, number>(), low = new Map<string, number>(), on = new Set<string>(), stack: string[] = [], out: string[][] = [];
  const visit = (v: string): void => {
    idx.set(v, index);
    low.set(v, index);
    index++;
    stack.push(v);
    on.add(v);
    for (const w of GRAPH.get(v) ?? []) {
      if (!idx.has(w)) {
        visit(w);
        low.set(v, Math.min(low.get(v)!, low.get(w)!));
      } else if (on.has(w)) low.set(v, Math.min(low.get(v)!, idx.get(w)!));
    }
    if (low.get(v) === idx.get(v)) {
      const comp: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        on.delete(w);
        comp.push(w);
      } while (w !== v);
      if (comp.length > 1) out.push(comp.sort());
    }
  };
  for (const v of ALL) if (!idx.has(v)) visit(v);
  return out.sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

const isFunctionLike = (n: ts.Node): boolean =>
  ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n) || ts.isMethodDeclaration(n) || ts.isConstructorDeclaration(n) ||
  ts.isGetAccessorDeclaration(n) || ts.isSetAccessorDeclaration(n);

/** The names this module binds from `target` by value (import { a, b as c } from target): the local names. */
function boundFrom(file: string, target: string): string[] {
  const names: string[] = [];
  for (const st of sourceOf(file).statements) {
    if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier) || resolveImport(file, st.moduleSpecifier.text) !== target) continue;
    const c = st.importClause;
    if (!c || c.isTypeOnly) continue;
    if (c.name) names.push(c.name.text);
    if (c.namedBindings && ts.isNamedImports(c.namedBindings)) for (const e of c.namedBindings.elements) if (!e.isTypeOnly) names.push(e.name.text);
    if (c.namedBindings && ts.isNamespaceImport(c.namedBindings)) names.push(c.namedBindings.name.text);
  }
  return names;
}

/** Every use of `name` in the module that is evaluated when the module LOADS (not inside any function body). The import itself is not a use. */
function loadTimeUses(file: string, name: string): string[] {
  const out: string[] = [];
  const visit = (n: ts.Node): void => {
    if (ts.isImportDeclaration(n)) return;
    if (ts.isIdentifier(n) && n.text === name) {
      let p: ts.Node | undefined = n.parent;
      let deferred = false;
      while (p) {
        if (isFunctionLike(p)) {
          deferred = true;
          break;
        }
        p = p.parent;
      }
      // a property name (`x.name`, `{ name: 1 }`) is no use of the binding
      const parent = n.parent;
      const isPropName = (ts.isPropertyAccessExpression(parent) && parent.name === n) || (ts.isPropertyAssignment(parent) && parent.name === n) || (ts.isPropertySignature(parent) && parent.name === n);
      if (!deferred && !isPropName) out.push(sourceOf(file).getLineAndCharacterOfPosition(n.getStart()).line + 1 + ": " + n.parent.getText().slice(0, 80));
    }
    ts.forEachChild(n, visit);
  };
  visit(sourceOf(file));
  return out;
}

/** The calls of the page that can start a request, by module: fetch( as a global call, XMLHttpRequest, sendBeacon, WebSocket, EventSource, new Image,
 *  new Worker, importScripts, and a dynamic import(). */
function networkPrimitives(file: string): string[] {
  const found: string[] = [];
  const visit = (n: ts.Node): void => {
    if (ts.isCallExpression(n)) {
      const c = n.expression;
      if (ts.isIdentifier(c) && (c.text === "fetch" || c.text === "importScripts")) found.push(`${c.text}()`);
      if (ts.isPropertyAccessExpression(c) && (c.name.text === "sendBeacon" || c.name.text === "fetch")) found.push(`.${c.name.text}()`);
      if (c.kind === ts.SyntaxKind.ImportKeyword) found.push("import()");
    }
    if (ts.isNewExpression(n) && ts.isIdentifier(n.expression) && ["XMLHttpRequest", "WebSocket", "EventSource", "Image", "Worker", "SharedWorker", "Request"].includes(n.expression.text)) found.push(`new ${n.expression.text}`);
    if (ts.isIdentifier(n) && n.text === "XMLHttpRequest" && !(n.parent && ts.isNewExpression(n.parent))) found.push("XMLHttpRequest");
    ts.forEachChild(n, visit);
  };
  visit(sourceOf(file));
  return found;
}

const NEW_AT_IDENT2 = ["src/game/history.ts", "src/net/historyClient.ts", "src/net/historySync.ts", "src/net/historyWire.ts"];

describe("4h. the import graph: what the offline page bundles, and what reaches a network primitive", () => {
  it("styleFolds.ts (in every build) now reaches historySync -> historyClient (the only new module with a fetch) and, through the cycle, linkClient; the four IDENT-2 modules are all in the page", () => {
    const fromFolds = reach("src/game/styleFolds.ts");
    const fromMain = reach("src/main.ts");
    console.log(`H-GRAPH modules from main.ts: ${fromMain.length}; from styleFolds.ts: ${fromFolds.length}`);
    console.log(`H-GRAPH from styleFolds.ts, the net/ modules: ${fromFolds.filter((f) => f.startsWith("src/net/")).join(", ")}`);
    for (const m of NEW_AT_IDENT2) expect(fromFolds, m).toContain(m);
    expect(fromFolds).toContain("src/net/linkClient.ts"); // via historySync -> linkClient (forgetDeletedPlayer)
    for (const m of NEW_AT_IDENT2) expect(fromMain, m).toContain(m);
    // before IDENT-2 the folds reached the network through online() only: session.ts imports no value at all
    expect(importsOf("src/game/session.ts").filter((i) => !i.typeOnly)).toEqual([]);
    // the page graph is the bundle: vite reported 217 modules transformed at ident2 (213 at ident1-done: the four above are the difference). The
    // static graph from main.ts counts 209 value-import modules (vite also counts modules it loads for their types and its own helpers)
    expect(fromMain.length).toBeGreaterThan(200);
    expect(fromMain.length).toBeLessThan(230);
  });

  it("the modules of the page that can start a request: global fetch( only in the four clients (ghost, profile, link, history), no XMLHttpRequest, sendBeacon, WebSocket, EventSource, Image, Worker or import()", () => {
    const table: Record<string, string[]> = {};
    for (const m of reach("src/main.ts")) {
      const p = networkPrimitives(m);
      if (p.length) table[m] = [...new Set(p)];
    }
    console.log(`H-NET primitives in the page: ${JSON.stringify(table)}`);
    const withFetch = Object.keys(table).filter((m) => table[m].includes("fetch()")).sort();
    expect(withFetch).toEqual(["src/net/ghostClient.ts", "src/net/historyClient.ts", "src/net/linkClient.ts", "src/net/profileClient.ts"]);
    const others = Object.entries(table).flatMap(([m, ps]) => ps.filter((p) => p !== "fetch()").map((p) => `${m}: ${p}`));
    expect(others, "no other way out of the page").toEqual([]);
    // ... and in the new client the global fetch is only the DEFAULT of an injected one (deps.fetch ?? ...): a call site with no injected fetch is a bug.
    // (The three older clients are listed, not judged: ghostClient calls fetch(url, { ...init, signal }) from its own helper.)
    for (const m of withFetch) {
      const calls: ts.CallExpression[] = [];
      const visit = (n: ts.Node): void => {
        if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === "fetch") calls.push(n);
        ts.forEachChild(n, visit);
      };
      visit(sourceOf(m));
      expect(calls.length, m).toBeGreaterThan(0);
      const viaDefault = calls.map((c) => {
        for (let p: ts.Node | undefined = c.parent; p && !ts.isSourceFile(p); p = p.parent) {
          if (ts.isBinaryExpression(p) && p.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken && /fetch$/.test(p.left.getText())) return true;
        }
        return false;
      });
      console.log(`H-FETCH ${m}: ${calls.map((c, i) => `${c.getText().slice(0, 48)} [default of an injected fetch: ${viaDefault[i]}]`).join(" | ")}`);
      if (m === "src/net/historyClient.ts") expect(viaDefault).toEqual([true]);
    }
  });

  it("the import cycles among the value imports of src/: the new one is exactly linkClient <-> historySync (two modules; nothing else joins it); the five others are older and none holds a history module", () => {
    const cs = cycles();
    console.log(`H-CYCLES ${cs.length}: ${JSON.stringify(cs)}`);
    const mine = cs.filter((c) => c.includes("src/net/historySync.ts"));
    expect(mine).toEqual([["src/net/historySync.ts", "src/net/linkClient.ts"]]);
    const others = cs.filter((c) => !c.includes("src/net/historySync.ts"));
    expect(others).toHaveLength(5); // (the same five at ident1-done: measured with the same analysis on that tree, see the notes)
    for (const c of others) for (const m of c) expect(m, "an older cycle that now holds an IDENT-2 module").not.toMatch(/history|linkClient|styleFolds|linkState/);
  });
});

describe("4h. the cycle is load-order safe: neither module reads the other's exports while it loads", () => {
  it("every use of linkClient's export in historySync, and of historySync's in linkClient, is inside a function body (a hoisted function, run later)", () => {
    const hs = "src/net/historySync.ts", lc = "src/net/linkClient.ts";
    const fromLc = boundFrom(hs, lc);
    const fromHs = boundFrom(lc, hs);
    expect(fromLc, "what historySync takes from linkClient").toEqual(["forgetDeletedPlayer"]);
    expect(fromHs, "what linkClient takes from historySync").toEqual(["syncHistoryAfterLink"]);
    for (const n of fromLc) expect(loadTimeUses(hs, n), `${hs} uses ${n} at load`).toEqual([]);
    for (const n of fromHs) expect(loadTimeUses(lc, n), `${lc} uses ${n} at load`).toEqual([]);
    // and both are used at all (the check is not vacuous)
    const uses = (file: string, name: string): number => {
      let k = 0;
      const visit = (n: ts.Node): void => {
        if (ts.isIdentifier(n) && n.text === name && !ts.isImportSpecifier(n.parent)) k++;
        ts.forEachChild(n, visit);
      };
      visit(sourceOf(file));
      return k;
    };
    expect(uses(hs, "forgetDeletedPlayer")).toBeGreaterThan(0);
    expect(uses(lc, "syncHistoryAfterLink")).toBeGreaterThan(0);
  });

  it("the declarations they import are function declarations (hoisted: callable before their module body has run), and the two modules' own load-time statements call nothing imported", () => {
    const hs = "src/net/historySync.ts", lc = "src/net/linkClient.ts";
    const isFnDecl = (file: string, name: string): boolean => sourceOf(file).statements.some((s) => ts.isFunctionDeclaration(s) && s.name?.text === name);
    expect(isFnDecl(lc, "forgetDeletedPlayer")).toBe(true);
    expect(isFnDecl(hs, "syncHistoryAfterLink")).toBe(true);
    // the top-level statements of the two modules: imports, declarations, and initialisers; none is a bare call, and no initialiser calls an imported function
    for (const file of [hs, lc]) {
      const imported = new Set<string>();
      for (const st of sourceOf(file).statements) {
        if (ts.isImportDeclaration(st) && st.importClause && !st.importClause.isTypeOnly) {
          if (st.importClause.name) imported.add(st.importClause.name.text);
          const nb = st.importClause.namedBindings;
          if (nb && ts.isNamedImports(nb)) for (const e of nb.elements) if (!e.isTypeOnly) imported.add(e.name.text);
        }
      }
      for (const st of sourceOf(file).statements) {
        expect(ts.isExpressionStatement(st), `${file}: a bare statement at load: ${st.getText().slice(0, 60)}`).toBe(false);
      }
      for (const name of imported) expect(loadTimeUses(file, name), `${file} uses the import ${name} at load`).toEqual([]);
    }
  });

  it("also in the other loading order: each of the two modules can be loaded FIRST, in a fresh registry, and the other half then works (vite-node loads it mid-way through the first)", async () => {
    for (const first of ["../src/net/linkClient", "../src/net/historySync"] as const) {
      vi.resetModules();
      const a = (await import(/* @vite-ignore */ first)) as Record<string, unknown>;
      const second = first === "../src/net/linkClient" ? "../src/net/historySync" : "../src/net/linkClient";
      const b = (await import(/* @vite-ignore */ second)) as Record<string, unknown>;
      expect(typeof (first === "../src/net/linkClient" ? a.forgetDeletedPlayer : b.forgetDeletedPlayer), first).toBe("function");
      expect(typeof (first === "../src/net/linkClient" ? b.syncHistoryAfterLink : a.syncHistoryAfterLink), first).toBe("function");
      expect(typeof (first === "../src/net/linkClient" ? a.requestLinkCode : b.requestLinkCode), first).toBe("function");
      expect(typeof (first === "../src/net/linkClient" ? b.startupHistorySync : a.startupHistorySync), first).toBe("function");
    }
  });
});

describe("4h. the title's startup trigger", () => {
  it("syncOnce calls startupHistorySync once, only after the session is active and has an identity, and is called from update() only", () => {
    const sf = sourceOf("src/screens/title.ts");
    let method: ts.MethodDeclaration | null = null;
    const visit = (n: ts.Node): void => {
      if (ts.isMethodDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === "syncOnce") method = n;
      ts.forEachChild(n, visit);
    };
    visit(sf);
    expect(method).not.toBeNull();
    const body = (method as unknown as ts.MethodDeclaration).body!.getText();
    const guard = body.indexOf("if (!s || !s.active || !s.identity) return;");
    const done = body.indexOf("startupSync.done = true");
    const call = body.indexOf("startupHistorySync(s.url, s.identity)");
    expect(guard).toBeGreaterThan(-1);
    expect(done).toBeGreaterThan(guard);
    expect(call).toBeGreaterThan(done);
    expect(body.match(/startupHistorySync\(/g)).toHaveLength(1);
    expect(body).toContain("onlineSession()"); // the session of the page: null offline
    const text = readFileSync("src/screens/title.ts", "utf8");
    expect(text.match(/\bstartupHistorySync\(/g)).toHaveLength(1);
    expect(text.match(/this\.syncOnce\(\)/g)).toHaveLength(1);
    // the only other importers of the history entry points are the folds, the link client and the sync itself
    const importers = ALL.filter((f) => importsOf(f).some((i) => /historySync$/.test(i.spec))).sort();
    expect(importers).toEqual(["src/game/styleFolds.ts", "src/net/linkClient.ts", "src/screens/title.ts"]);
    const clientImporters = ALL.filter((f) => importsOf(f).some((i) => /historyClient$/.test(i.spec))).sort();
    expect(clientImporters).toEqual(["src/net/historySync.ts"]);
  });
});

// ------------------------------------------------------------------------------------------------------ a never-linked device, walked

let ls: Mem;
let calls: string[];
let fetchSpy: ReturnType<typeof vi.fn>;
let beaconSpy: ReturnType<typeof vi.fn>;

/** Every way a page can start a request, replaced by something that writes its use into `calls`. */
function trapNetwork(answer: (url: string, method: string) => { status: number; body: string } = () => ({ status: 500, body: "" })): void {
  calls = [];
  fetchSpy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push(`${method} ${String(input)}`);
    const a = answer(String(input), method);
    return new Response(a.body, { status: a.status });
  });
  beaconSpy = vi.fn((u: string) => {
    calls.push(`sendBeacon ${u}`);
    return true;
  });
  vi.stubGlobal("fetch", fetchSpy);
  vi.stubGlobal("XMLHttpRequest", class { constructor() { calls.push("new XMLHttpRequest"); } });
  vi.stubGlobal("WebSocket", class { constructor(u: string) { calls.push(`new WebSocket ${u}`); } });
  vi.stubGlobal("EventSource", class { constructor(u: string) { calls.push(`new EventSource ${u}`); } });
  vi.stubGlobal("Image", class { set src(v: string) { calls.push(`Image.src ${v}`); } });
  vi.stubGlobal("navigator", { sendBeacon: beaconSpy });
}

beforeEach(() => {
  ls = mem();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  vi.stubGlobal("localStorage", ls);
  resetHistoryWarning();
  resetHistorySync();
  trapNetwork();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  setSession(null);
});

const URL0 = "http://127.0.0.1:9";
const lastRow = (r: ReturnType<typeof playedRun>) => r.history[r.history.length - 1];
const writtenKeys = (): string[] => [...new Set(ls.log)].sort();

/** The runs a device finishes in every way the game has (records off: the sim is not the subject), through the two folds that write the history. */
function playEveryEnd(tag: string): void {
  const done = playedRun({ pattern: "WWWWWWWWWW", end: "complete", runId: `${tag}-c-1`, records: false });
  foldDuskResult(done, lastRow(done)); // the dusk that ends it
  foldRunEnd(done); // the summary
  const lost = playedRun({ pattern: "WLLLLLLLLL", end: "lost", runId: `${tag}-l-1`, records: false });
  foldRunEnd(lost);
  const abandoned = playedRun({ pattern: "WL", end: null, runId: `${tag}-a-1`, records: false });
  foldRunEnd(abandoned);
  const day1 = playedRun({ pattern: "", end: null, runId: `${tag}-d-1`, records: false });
  foldRunEnd(day1);
  const endless = playedRun({ pattern: "WWWWWWWWWW", end: "won", runId: `${tag}-e-1`, records: false });
  foldDuskResult(endless, lastRow(endless)); // the 10th win
  continueEndless(endless, { pattern: "WWL", end: "hearts" }, false);
  foldDuskResult(endless, lastRow(endless)); // ENDLESS OVER
  foldRunEnd(endless);
  const endlessAbandoned = playedRun({ pattern: "WWWWWWWWWW", end: "won", runId: `${tag}-f-1`, records: false });
  foldDuskResult(endlessAbandoned, lastRow(endlessAbandoned));
  continueEndless(endlessAbandoned, { pattern: "W", end: null }, false);
  foldRunEnd(endlessAbandoned); // ABANDON in endless
}

describe.each<[string, boolean]>([["offline: the page has no session", false], ["online: the page has a session with an identity (so every sync entry point could run)", true]])("4h. a never-linked device, %s", (_name, withSession) => {
  let d: Device;
  beforeEach(async () => {
    d = await device(0, ls);
    if (withSession) setSession({ url: URL0, active: true, failed: false, identity: d.id, tick() {}, settle() {}, submitDusk() {}, countRun() {}, profileChanged() {} } as never);
  });

  it("every run end the game has (dusk, summary, loss, ABANDON on day 3 and on day 1, CONTINUE ENDLESS over and abandoned) writes the history and makes no request of any kind", async () => {
    playEveryEnd("nl");
    await historyIdle();
    expect(calls, "no fetch, XMLHttpRequest, WebSocket, EventSource, Image or sendBeacon").toEqual([]);
    const ids = readHistory(ls).state.entries.map((e) => e.entry.id).sort();
    expect(ids).toEqual(["nl-a-1", "nl-c-1", "nl-d-1", "nl-e-1", "nl-e-1_endless", "nl-f-1", "nl-f-1_endless", "nl-l-1"]);
    // the store keeps all of it for the day the device links; nothing is marked sent
    expect(unsentFor(d.id.playerId, ls).map((e) => e.id).sort()).toEqual(ids);
    expect(JSON.parse(ls.getItem(HISTORY_KEY)!).entries.every((x: { sentTo?: string; down?: boolean }) => x.sentTo === undefined && x.down === undefined)).toBe(true);
    // the one new storage key is the history's: the profile's was written before IDENT-2, and no link record, mirror or counter appears
    expect(writtenKeys()).toEqual([HISTORY_KEY, PROFILE_KEY].sort());
    expect(ls.getItem(LINK_KEY)).toBeNull();
  });

  it("the sync's own entry points do nothing at all for it: startup (default and injected storage), syncHistory with and without download, the after-link trigger, and the run-end trigger", async () => {
    playEveryEnd("nl2");
    const before = ls.getItem(HISTORY_KEY);
    const writes = ls.sets;
    const deps = { fetch: fetchSpy as unknown as typeof fetch, store: ls, now: () => NOW + 5 * 3_600_000 };
    expect((await startupHistorySync(URL0, d.id)).status).toBe("skipped");
    expect((await startupHistorySync(URL0, d.id, deps)).status).toBe("skipped");
    expect(await syncHistory(URL0, d.id, deps)).toEqual({ status: "skipped", sent: 0, refused: 0, received: 0 });
    expect((await syncHistory(URL0, d.id, deps, { download: false })).status).toBe("skipped");
    expect((await syncHistory(URL0, d.id, { fetch: fetchSpy as unknown as typeof fetch })).status).toBe("skipped"); // default storage
    syncHistoryAfterLink(URL0, d.id, deps);
    historyRunEnded(playedRun({ pattern: "WL", end: "lost", runId: "nl2-extra-1", records: false }));
    await historyIdle();
    expect(calls).toEqual([]);
    // not even the hourly stamp or a mark is written
    expect(ls.sets - writes, "only the one new run's entry was written").toBe(1);
    expect(ls.getItem(HISTORY_KEY)).not.toBe(before);
    expect(JSON.parse(ls.getItem(HISTORY_KEY)!).syncedAt).toBeUndefined();
    expect(writtenKeys()).toEqual([HISTORY_KEY, PROFILE_KEY].sort());
  });

  it("a link record that is not this key's, one that does not parse, one of another version, and no storage at all, each leave the sync silent", async () => {
    playEveryEnd("nl3");
    const keyId = d.id.keyId ?? d.id.playerId;
    const otherKey = keyId.startsWith("A") ? `B${keyId.slice(1)}` : `A${keyId.slice(1)}`;
    const records = [
      encodeLink({ v: 1, player: otherKey, key: otherKey, at: NOW }), // another key's record
      encodeLink({ v: 1, player: "P1", key: otherKey, at: NOW, readAt: NOW }),
      "{not json", `{"v":2,"player":"${keyId}","key":"${keyId}","at":1}`, `{"v":1,"player":"has space","key":"${keyId}","at":1}`,
      `{"v":1,"player":"${keyId}","key":"${keyId}"}`, "[]", "null", `{"v":1,"player":"${keyId}","key":"${keyId}","at":-1}`,
    ];
    for (const rec of records) {
      ls.setItem(LINK_KEY, rec);
      // the first two parse (they are another key's records); every other value is no record at all
      if (records.indexOf(rec) < 2) expect(readLink(ls)?.key, rec).toBe(otherKey);
      else expect(readLink(ls), rec).toBeNull();
      expect((await syncHistory(URL0, d.id, { fetch: fetchSpy as unknown as typeof fetch, store: ls })).status, rec).toBe("skipped");
      expect((await startupHistorySync(URL0, d.id, { fetch: fetchSpy as unknown as typeof fetch, store: ls, now: () => NOW + 9e9 })).status, rec).toBe("skipped");
      historyRunEnded(playedRun({ pattern: "W", end: "lost", runId: `nl3-${records.indexOf(rec)}-1`, records: false }));
    }
    await historyIdle();
    expect(calls).toEqual([]);
    // no localStorage at all (a page that refuses it): the run end and the sync entry points still do nothing and throw nothing
    vi.stubGlobal("localStorage", undefined);
    expect(() => playEveryEnd("nl3x")).not.toThrow();
    expect((await syncHistory(URL0, d.id, { fetch: fetchSpy as unknown as typeof fetch })).status).toBe("skipped");
    expect((await startupHistorySync(URL0, d.id, { fetch: fetchSpy as unknown as typeof fetch })).status).toBe("skipped");
    await historyIdle();
    expect(calls).toEqual([]);
  });

  it("CONTRAST (the traps work, and the link record is the whole gate): the same device with a record for its own key sends the new entry, once, however many folds see it", async () => {
    const keyId = d.id.keyId ?? d.id.playerId;
    ls.setItem(LINK_KEY, encodeLink({ v: 1, player: keyId, key: keyId, at: NOW }));
    const run = playedRun({ pattern: "WWWWWWWWWW", end: "complete", runId: "ln-1-1", records: false });
    foldDuskResult(run, lastRow(run));
    foldRunEnd(run);
    foldRunEnd(run);
    await historyIdle();
    // offline there is no session to send with; online the one entry goes up in one PUT (the trap answers 500: kept for the next trigger)
    expect(calls).toEqual(withSession ? [`PUT ${URL0}/v1/history`] : []);
    expect(readHistory(ls).state.entries.map((e) => e.entry.id)).toEqual(["ln-1-1"]);
  });
});

describe("4h. the link flows of a never-linked device make exactly the request the player asked for, and a refusal leaves no record and starts no history request", () => {
  let d: Device;
  beforeEach(async () => {
    d = await device(1, ls);
    playEveryEnd("lf"); // 8 entries waiting
  });
  const deps = (): LinkDeps => ({ fetch: fetchSpy as unknown as typeof fetch, store: ls, mirror: null, now: () => NOW, timeoutMs: 2000, keyStore: memoryKeyStore() });

  it("SHOW MY CODE refused (403, 409, 429, 500, a proxy page, a network error, a 200 without a code): one request, no link record, no history request", async () => {
    const answers: { status: number; body: string }[] = [
      { status: 403, body: '{"error":"no"}' }, { status: 409, body: '{"error":"x"}' }, { status: 429, body: '{"error":"slow down"}' }, { status: 500, body: "" },
      { status: 502, body: "<html>bad gateway</html>" }, { status: 200, body: "{}" }, { status: 200, body: '{"code":5,"expiresAt":"x"}' },
    ];
    for (const a of answers) {
      trapNetwork(() => a);
      const r = await requestLinkCode(URL0, d.id, deps());
      await historyIdle();
      expect(r.ok, JSON.stringify(a)).toBe(false);
      expect(calls, JSON.stringify(a)).toEqual([`POST ${URL0}/v1/link/code`]);
      expect(ls.getItem(LINK_KEY), JSON.stringify(a)).toBeNull();
    }
    trapNetwork();
    fetchSpy.mockImplementation(async () => { calls.push("POST (network error)"); throw new TypeError("fetch failed"); });
    expect((await requestLinkCode(URL0, d.id, deps())).ok).toBe(false);
    await historyIdle();
    expect(calls).toEqual(["POST (network error)"]);
    expect(ls.getItem(LINK_KEY)).toBeNull();
    expect(writtenKeys().includes(LINK_KEY)).toBe(false);
  });

  it("ENTER A CODE refused (403, 409, 410, 429, 500, a 200 naming no player): one request, no link record, no history request", async () => {
    const answers: { status: number; body: string }[] = [
      { status: 403, body: '{"error":"that code did not work"}' }, { status: 409, body: '{"error":"x"}' }, { status: 410, body: '{"error":"x"}' }, { status: 429, body: "" },
      { status: 500, body: "" }, { status: 200, body: "{}" }, { status: 200, body: '{"player":"has a space"}' }, { status: 200, body: '{"player":7}' },
    ];
    for (const a of answers) {
      trapNetwork(() => a);
      const r = await redeemLinkCode(URL0, d.id, "ABCD-EFGH", deps());
      await historyIdle();
      expect(r.ok, JSON.stringify(a)).toBe(false);
      expect(calls, JSON.stringify(a)).toEqual([`POST ${URL0}/v1/link/redeem`]);
      expect(ls.getItem(LINK_KEY), JSON.stringify(a)).toBeNull();
    }
  });

  it("a Steam link refused (501, 403) and DELETE MY ONLINE DATA on a device that never linked: one request each, and no history request", async () => {
    trapNetwork(() => ({ status: 501, body: '{"error":"steam linking is off"}' }));
    expect((await linkSteam(URL0, d.id, "abcdef", "bb", 480, deps())).ok).toBe(false);
    trapNetwork(() => ({ status: 403, body: '{"error":"no"}' }));
    expect((await linkSteam(URL0, d.id, "abcdef", "bb", 480, deps())).ok).toBe(false);
    await historyIdle();
    expect(calls).toEqual([`POST ${URL0}/v1/link/steam`]);
    trapNetwork(() => ({ status: 200, body: "{}" }));
    expect((await deleteOnlineData(URL0, d.id, deps())).ok).toBe(true);
    await historyIdle();
    expect(calls).toEqual([`DELETE ${URL0}/v1/player`]);
    expect(ls.getItem(LINK_KEY)).toBeNull();
  });

  it("CONTRAST: SHOW MY CODE that works makes the device linked to its own key, and only then does its history go up (the code request, then a PUT of the newest entry)", async () => {
    trapNetwork((url, method) => (method === "POST" && url.endsWith("/v1/link/code") ? { status: 200, body: JSON.stringify({ code: "ABCD-EFGH", expiresAt: NOW + 600_000 }) } : { status: 500, body: "" }));
    const r = await requestLinkCode(URL0, d.id, deps());
    await historyIdle();
    expect(r.ok).toBe(true);
    const keyId = d.id.keyId ?? d.id.playerId;
    expect(readLink(ls)).toMatchObject({ player: keyId, key: keyId });
    expect(calls).toEqual([`POST ${URL0}/v1/link/code`, `PUT ${URL0}/v1/history`]);
  });
});

describe("4h. the writes of a never-linked device, byte for byte", () => {
  it("the history key is the only key the history adds, its value is the documented shape, and the profile fold's own writes are the same keys as before IDENT-2", async () => {
    await device(2, ls);
    const run = playedRun({ pattern: "WWWWWWWWWW", end: "complete", runId: "w-1-1", records: false });
    foldDuskResult(run, lastRow(run));
    expect(writtenKeys()).toEqual([HISTORY_KEY, PROFILE_KEY].sort());
    const stored = JSON.parse(ls.getItem(HISTORY_KEY)!) as Record<string, unknown>;
    expect(Object.keys(stored)).toEqual(["v", "entries"]); // no syncedAt, no sentTo, no down: the sync never touched it
    // the text holds no key id and no player id: none of this device's identifiers
    const d = await device(2, ls);
    expect(ls.getItem(HISTORY_KEY)).not.toContain(d.id.playerId);
    expect(ls.getItem(HISTORY_KEY)).not.toContain(d.id.keyId ?? "no-key-id");
    expect(calls).toEqual([]);
  });
});
