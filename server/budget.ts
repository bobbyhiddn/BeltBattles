// S3 (REQ-BFG-120; BRIEF-S3 goal 2; LAUNCH-0 REPORT 1.4 item 4, 1.8; S2-REPORT section 9): THE DECK CHECK HAS A COST, SO IT HAS A BUDGET.
//
// POST /v1/ghosts is the one route whose cost depends on who asks: a deck check is 3-10 ms warm, up to 1.8 s when a new road mix has to be
// built, 2-3.5 s for the first deep one after a start. The 120-requests-a-minute limiter is blind to that, and S2's queue is one FIFO of 16
// that one key or one IP could fill. CheckBudget sits in front of validator.validate (app.ts), after every cheap refusal (signature, decode,
// player id, rules, name, S1's endless day, the new-key limit), so a refusal costs about what a 401 costs and never enters the queue:
//
//   in flight   at most ONE deck check per key (waiting or running), and at most `ipInflight` (default 4: a quarter of S2's queue of 16) per
//               client address. A refused upload is a 429 with Retry-After.
//   budget      a token bucket of CHECK MILLISECONDS per key and per address. Full at first, refilled over time; a verdict charges the check's
//               own running time (the worker times validateUpload with performance.now(); the check is synchronous, so that is its CPU), and
//               the balance may go below zero (a check cannot be known to be dear until it is done). A balance at or below zero refuses the
//               next upload (429, Retry-After = the seconds until the balance is positive again). The debt is floored at one full bucket, so no
//               key or address waits longer than 2 x capacity / refill.
//
// An honest player uploads once a dusk (a warm check of 3-10 ms, now and then a few hundred ms to 1.8 s), so a key's whole run costs a few
// seconds of check time at most: the defaults (config.ts readLimitsConfig; REPORT S3 has the worst honest case and its margin) leave every
// honest player, and a carrier NAT of hundreds of them, far from a limit. One key flooding deep decks is held to its refill rate (5% of the
// one worker), one address to 10%; neither can fill the queue (one slot a key, `ipInflight` an address).
//
// Memory: the per-key and per-address balances are two BoundedMaps (keyMax and ipMax entries, about 100 bytes each; an evicted entry starts
// full again, which only makes the limit more lenient); the in-flight sets hold only requests that are in flight right now.
// Nothing here is logged or stored; addresses arrive already reduced to ipKey (ipLimits.ts).

import { BoundedMap } from "./ipLimits";

export interface BudgetConfig {
  /** A key's balance when full, ms of check time (BB_GHOST_CHECK_KEY_MS). */
  keyMs: number;
  /** What a key earns back, ms of check time per second (BB_GHOST_CHECK_KEY_REFILL). */
  keyRefill: number;
  /** An address's balance when full, ms (BB_GHOST_CHECK_IP_MS). */
  ipMs: number;
  /** What an address earns back, ms per second (BB_GHOST_CHECK_IP_REFILL). */
  ipRefill: number;
  /** Deck checks one address may have in flight at once (BB_GHOST_CHECK_IP_INFLIGHT). */
  ipInflight: number;
  /** Deck checks one key may have in flight at once (BB_GHOST_CHECK_KEY_INFLIGHT; default 1: an honest key has one upload at a time). */
  keyInflight?: number;
  /** Most keys / addresses whose balance is remembered at once (default 20,000 each). */
  mapMax?: number;
}

export type LimitName = "key-inflight" | "ip-inflight" | "key-budget" | "ip-budget";

/** Why an upload was refused, as app.ts answers it: 429, `message` as the one-line error, `retryAfterS` as Retry-After. */
export interface Refusal {
  limit: LimitName;
  retryAfterS: number;
  message: string;
}

/** Retry-After for a check slot that is busy. A check normally ends in milliseconds and is certainly over within S2's 10 s deadline. */
export const INFLIGHT_RETRY_S = 2;
/** No Retry-After is longer than this (an hour), whatever the debt. */
const MAX_RETRY_S = 3600;

interface Balance {
  ms: number;
  at: number;
}

/** The admitted upload: report the check's own time with charge() when it is known, and call release() when the request is done. */
export interface Ticket {
  charge(ms: number): void;
  release(): void;
}

export class CheckBudget {
  private readonly cfg: Required<BudgetConfig>;
  private readonly keyBal: BoundedMap<string, Balance>;
  private readonly ipBal: BoundedMap<string, Balance>;
  private readonly keysBusy = new Map<string, number>();
  private readonly ipBusy = new Map<string, number>();

  /** `clock`: ms, default Date.now (tests pass their own, so a refill can be waited for without waiting). */
  constructor(cfg: BudgetConfig, private readonly clock: () => number = Date.now) {
    this.cfg = { mapMax: 20_000, keyInflight: 1, ...cfg };
    this.keyBal = new BoundedMap(this.cfg.mapMax);
    this.ipBal = new BoundedMap(this.cfg.mapMax);
  }

  /** The balance of `id` at `now`: refilled, capped at its capacity. A new id starts full. */
  private balance(map: BoundedMap<string, Balance>, id: string, now: number, cap: number, refill: number): Balance {
    let b = map.get(id);
    if (!b) {
      b = { ms: cap, at: now };
      map.set(id, b);
      return b;
    }
    map.touch(id); // least recently used out first: a key that is in use is never the one a flood of new keys evicts
    if (now > b.at) {
      b.ms = Math.min(cap, b.ms + ((now - b.at) / 1000) * refill);
      b.at = now;
    }
    return b;
  }

  /** Seconds until a balance of `ms` (at or below zero) is positive again at `refill` ms a second. */
  private waitS(ms: number, refill: number): number {
    return Math.min(MAX_RETRY_S, Math.max(1, Math.floor(-ms / refill) + 1));
  }

  /** Admit one deck check from address `ip` by key `key`, or say why not. An admitted check holds a place until release(). */
  admit(ip: string, key: string): Ticket | Refusal {
    const c = this.cfg;
    const now = this.clock();
    if ((this.keysBusy.get(key) ?? 0) >= c.keyInflight) {
      return { limit: "key-inflight", retryAfterS: INFLIGHT_RETRY_S, message: `deck check limit: this key already has a deck check in flight (${c.keyInflight} at a time), try again shortly` };
    }
    if ((this.ipBusy.get(ip) ?? 0) >= c.ipInflight) {
      return { limit: "ip-inflight", retryAfterS: INFLIGHT_RETRY_S, message: `deck check limit: this address already has ${c.ipInflight} deck checks in flight, try again shortly` };
    }
    const kb = this.balance(this.keyBal, key, now, c.keyMs, c.keyRefill);
    if (kb.ms <= 0) {
      const s = this.waitS(kb.ms, c.keyRefill);
      return { limit: "key-budget", retryAfterS: s, message: `deck check limit: this key has used its check time, try again in ${s} s` };
    }
    const ib = this.balance(this.ipBal, ip, now, c.ipMs, c.ipRefill);
    if (ib.ms <= 0) {
      const s = this.waitS(ib.ms, c.ipRefill);
      return { limit: "ip-budget", retryAfterS: s, message: `deck check limit: this address has used its check time, try again in ${s} s` };
    }
    this.keysBusy.set(key, (this.keysBusy.get(key) ?? 0) + 1);
    this.ipBusy.set(ip, (this.ipBusy.get(ip) ?? 0) + 1);
    let released = false;
    return {
      charge: (ms) => {
        const cost = Number.isFinite(ms) && ms > 0 ? ms : 0;
        const at = this.clock();
        for (const [map, id, cap, refill] of [[this.keyBal, key, c.keyMs, c.keyRefill], [this.ipBal, ip, c.ipMs, c.ipRefill]] as const) {
          const b = this.balance(map, id, at, cap, refill);
          b.ms = Math.max(-cap, b.ms - cost);
        }
      },
      release: () => {
        if (released) return;
        released = true;
        const k = (this.keysBusy.get(key) ?? 1) - 1;
        if (k <= 0) this.keysBusy.delete(key);
        else this.keysBusy.set(key, k);
        const n = (this.ipBusy.get(ip) ?? 1) - 1;
        if (n <= 0) this.ipBusy.delete(ip);
        else this.ipBusy.set(ip, n);
      },
    };
  }

  /** What is tracked right now (tests, health): balances remembered and checks in flight. */
  get tracked(): { keys: number; ips: number; inflightKeys: number; inflightIps: number; evictions: number } {
    return { keys: this.keyBal.size, ips: this.ipBal.size, inflightKeys: this.keysBusy.size, inflightIps: this.ipBusy.size, evictions: this.keyBal.evictions + this.ipBal.evictions };
  }
}

export function isRefusal(x: Ticket | Refusal): x is Refusal {
  return (x as Refusal).limit !== undefined;
}
