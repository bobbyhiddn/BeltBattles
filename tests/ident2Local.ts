// IDENT-2 (REQ-BFG-122 clause 4): fixtures for the run history tests that need a played run or a device. Not a test file itself.
import { loadIdentity, type Identity, type KeyStore } from "../src/net/identity";
import { RULES_VERSION, type HeroId } from "../src/sim/content";
import { standInPool } from "../src/sim/standInPool";
import { battleRecordFor } from "../src/net/replay";
import { battleSeed, newRun, type DayResult, type Run } from "../src/game/run";
import type { HistoryEntry } from "../src/net/historyWire";
import { testKeyStore } from "./netIdentity";
import { NOW } from "./profileupWire";

export type Mem = Storage & { keys(): string[]; sets: number; log: string[] };

/** A localStorage stand-in that counts its writes (`log`: the key of every setItem, in order). `full`: every write throws what a full storage throws. */
export function mem(over: { full?: boolean } = {}): Mem {
  const m = new Map<string, string>();
  const s: Mem = {
    get length() { return m.size; }, clear: () => m.clear(), key: (i: number) => [...m.keys()][i] ?? null,
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => {
      s.sets++;
      s.log.push(k);
      if (over.full) throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
      m.set(k, String(v));
    },
    removeItem: (k: string) => void m.delete(k), keys: () => [...m.keys()].sort(), sets: 0, log: [],
  };
  return s;
}

export interface PlayedOpts {
  hero?: HeroId;
  runId?: string;
  seed?: number;
  /** One letter a dusk of the run: W win, L loss, D draw. Default a 10-day run's ten wins. */
  pattern?: string;
  /** Battle records on the dusks (online play); default true. */
  records?: boolean;
  /** How the run ends: default "complete" (a 10-day run's last dusk); null: still in progress (ABANDON). */
  end?: "won" | "complete" | "lost" | null;
  hearts?: boolean;
  /** The run took CONTINUE ENDLESS: its endless dusks follow (W/L/D), and `end` says why endless ended (null: still playing). */
  endless?: { pattern: string; end?: "hearts" | "cap" | "lastDay" | null };
}

let counter = 0;

function dusk(run: Run, hero: HeroId, outcome: "win" | "loss" | "draw", records: boolean): DayResult {
  const other: HeroId = hero === "furnace" ? "weaver" : "furnace";
  const d = Math.min(Math.max(run.day, 1), 10);
  const res = { day: run.day, outcome, income: 0, time: 30, foe: "?", ghost: true, player: {}, enemy: {} } as unknown as DayResult;
  if (records) {
    res.record = battleRecordFor(standInPool(hero, d)[0].build, standInPool(other, d)[0].build, battleSeed(run));
    res.hulls = [10, 0];
  }
  return res;
}

/** CONTINUE ENDLESS (day.ts startEndless) and the endless dusks that follow: the same run goes on from the next dawn with three hearts. */
export function continueEndless(run: Run, endless: { pattern: string; end?: "hearts" | "cap" | "lastDay" | null }, records = true): Run {
  run.over = null;
  run.endlessRun = { victoryDay: run.day, wins: 0, losses: 0, draws: 0 };
  run.lives = 3;
  for (const ch of endless.pattern) {
    run.day++;
    const out = ch === "W" ? "win" : ch === "L" ? "loss" : "draw";
    const res = dusk(run, run.hero, out, records);
    res.endless = true;
    run.history.push(res);
    if (out === "win") run.endlessRun.wins++;
    else if (out === "loss") {
      run.endlessRun.losses++;
      run.lives = Math.max(0, run.lives - 1); // an endless loss costs one heart (day.ts finishEndlessDay)
    } else run.endlessRun.draws++;
  }
  if (endless.end) {
    run.endlessRun.end = endless.end;
    run.over = "won";
  }
  return run;
}

/** A run at the moment a test folds it: its dusks in run.history (with records unless `records: false`), its wins, hearts and over. */
export function playedRun(o: PlayedOpts = {}): Run {
  const hero = o.hero ?? "furnace";
  const run = newRun(hero, o.seed ?? 7 + counter, o.runId ?? `r${++counter}-test-${counter}`);
  if (o.hearts) {
    run.hearts = true;
    run.lives = 10;
  }
  const pattern = o.pattern ?? "WWWWWWWWWW";
  for (let i = 0; i < pattern.length; i++) {
    run.day = i + 1;
    const out = pattern[i] === "W" ? "win" : pattern[i] === "L" ? "loss" : "draw";
    run.history.push(dusk(run, hero, out, o.records !== false));
    if (out === "win") run.wins++;
    if (out === "loss") {
      run.losses++;
      run.lives = Math.max(0, run.lives - 1);
    }
  }
  run.over = o.end === undefined ? "complete" : o.end;
  if (o.endless) continueEndless(run, o.endless, o.records !== false);
  return run;
}

/** A valid entry for the wire (kind "run", two wins in three dusks) finished an hour before the rigs' fixed clock (NOW); `over` changes any field. */
export function entryOf(runId: string, over: Partial<HistoryEntry> = {}, finishedAt = NOW - 3_600_000): HistoryEntry {
  return {
    id: runId, runId, kind: "run", rules: RULES_VERSION, hero: "furnace", outcome: "won", wins: 2, days: 3, lives: 4, hearts: false, finishedAt,
    dusks: [{ day: 1, outcome: "win" }, { day: 2, outcome: "loss" }, { day: 3, outcome: "win" }], ...over,
  };
}

/** A device: its own fixed test key, its own local storage. */
export interface Device {
  id: Identity;
  store: Mem;
  keys: KeyStore;
}

export async function device(n: number, store: Mem = mem()): Promise<Device> {
  const keys = await testKeyStore(n);
  const id = await loadIdentity(keys, undefined, { mirror: null, links: store });
  if (!id) throw new Error("no identity");
  return { id, store, keys };
}
