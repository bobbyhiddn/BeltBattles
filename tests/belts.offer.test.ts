// bb-0.8.3 (REQ-BFG-042, job BELTS D9): a hero's own signature factory in its own caravan. The shared roll stays
// hero-blind and is drawn exactly as before; the signature card is decided afterwards on its own stream
// (hashSeed(seed, "signature", day, rerolls)), from SIGNATURE_OFFER.day on SIGNATURE_OFFER.chance of the rolls, never
// while the run holds its factory at ★3 only. It takes an empty slot, else replaces a shared card that isn't the
// familiar. No shared pool sees it (no merchant, ItemDef price 0). Bought, it merges like any copy (MERGE ★2; from ★2 a
// copy waits beside it). The starting copy was free: a deck's or a run's value counts the bought copies only
// (stars.ts partsValue). validate.ts and the server accept the hero's own at ★1-3, and a ★2 beside a waiting ★1, from
// the caravan's first day, and still refuse another hero's.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashSeed, Rng } from "../src/core/rng";
import { HEROES, ITEMS, MERCHANTS, OFFERS, SIGNATURE_OFFER, buyableModules, itemsSoldBy, type HeroId, type MerchantId } from "../src/sim/content";
import type { Build } from "../src/sim/deck";
import { copyValue, isSignatureFactory, partsValue, SIGNATURE_FACTORIES, signatureOf, starsOf, valueOf } from "../src/sim/stars";
import { buildCost, validateBuild, validateUpload } from "../src/net/validate";
import { deckCost } from "../src/sim/rivals";
import { heroStartBuild, PLAYABLE_HEROES } from "../src/sim/heroBuilds";
import { buyOffer, newRun, rollShop, sellInventory, shopBadge, storePlaced, type Run } from "../src/game/run";
import { gainModule } from "../src/game/fuse";
import { choicesFor, makeEvent } from "../src/game/events";
import { EVENT_IDS, UPGRADE, salvagePool, smugglerPool, swapPart } from "../src/game/eventDefs";
import { drawWares } from "../src/game/wares";
import { RIVAL_IDS, rivalBuild, rivalDays } from "../src/sim/rivals";
import { hardParts, topParts } from "../src/game/road";
import { RARITIES } from "../src/sim/content";
import { ghostId, SNAPSHOT_VERSION, type GhostSnapshot } from "../src/net/snapshot";
import type { GhostServer } from "../server/app";
import type { Identity } from "../src/net/identity";
import { storeBackends } from "./netStores";
import { ownedBy, signedHeaders, testIdentity } from "./netIdentity";
import { sharedWagons } from "./belts.shared";

const HEROES6 = Object.keys(HEROES) as HeroId[];

/** A run of `hero` at `day` (gold enough to buy), its shop rolled with `rerolls`. */
function at(hero: HeroId, seed: number, day: number, rerolls = 0): Run {
  const run = newRun(hero, seed, `offer-${hero}-${seed}`);
  run.day = day;
  run.gold = 99;
  run.shop = { wagons: [], rerolls, discount: 0, free: 0 };
  rollShop(run);
  return run;
}
const cards = (run: Run): { def: string; price: number; wagon: number; slot: number }[] =>
  run.shop.wagons.flatMap((w, wagon) => w.offers.map((o, slot) => ({ def: o.def, price: o.price, wagon, slot })));
const sigCards = (run: Run) => cards(run).filter((c) => isSignatureFactory(c.def));
/** The roll as it was before bb-0.8.3 D9: the same run with the signature offer switched off. */
function withoutOffer<T>(fn: () => T): T {
  const o = SIGNATURE_OFFER as { chance: number }, was = o.chance;
  o.chance = 0;
  try { return fn(); } finally { o.chance = was; }
}

describe("D9: the hero's own factory, in its own caravan only, on its own stream", () => {
  it("offered only in its own hero's caravan, from day 3, on 1 roll in 3 (its own stream decides), at its price; deterministic for a seed", () => {
    let rolls = 0, shown = 0;
    for (const hero of HEROES6) for (let seed = 1; seed <= 60; seed++) for (let day = 1; day <= 10; day++) for (const rerolls of [0, 1, 2]) {
      const run = at(hero, seed, day, rerolls), sig = sigCards(run);
      const drawn = new Rng(hashSeed(run.seed, "signature", day, rerolls)).chance(SIGNATURE_OFFER.chance);
      expect(sig.length, `${hero} s${seed} d${day} r${rerolls}`).toBe(day >= SIGNATURE_OFFER.day && drawn ? 1 : 0);
      for (const c of sig) {
        expect(c.def).toBe(signatureOf(hero)); // its own, never another hero's
        expect(c.price).toBe(SIGNATURE_OFFER.price[c.def]);
      }
      expect(JSON.stringify(at(hero, seed, day, rerolls).shop)).toBe(JSON.stringify(run.shop)); // deterministic
      if (day >= SIGNATURE_OFFER.day) { rolls++; shown += sig.length; }
    }
    expect(Object.values(SIGNATURE_OFFER.price)).toEqual(Object.values(SIGNATURE_OFFER.price).map(() => 11)); // the start
    expect([SIGNATURE_OFFER.day, SIGNATURE_OFFER.chance]).toEqual([3, 1 / 3]);
    expect(Math.abs(shown / rolls - 1 / 3), `${shown} of ${rolls} rolls`).toBeLessThan(0.03);
  });

  it("the shared roll is drawn exactly as before: the card takes an empty slot, or replaces one shared card that isn't the familiar", () => {
    let replaced = 0, empty = 0;
    for (const hero of PLAYABLE_HEROES) for (let seed = 1; seed <= 80; seed++) for (let day = 3; day <= 10; day++) {
      const now = at(hero, seed, day), before = withoutOffer(() => at(hero, seed, day));
      const a = cards(now), b = cards(before), sig = sigCards(now);
      expect(sigCards(before)).toEqual([]);
      if (!sig.length) { expect(a).toEqual(b); continue; }
      if (b.length < OFFERS) {
        // an empty slot: every shared card as before, and the signature card at the end of the last wagon
        expect(a.filter((c) => !isSignatureFactory(c.def))).toEqual(b);
        expect(sig[0].wagon).toBe(now.shop.wagons.length - 1);
        empty++;
      } else {
        // a full caravan: exactly one card differs, and it wasn't the familiar (a card the shared roll's familiar step wrote)
        const diff = a.filter((c, i) => c.def !== b[i].def);
        expect(diff.map((c) => c.def), `${hero} s${seed} d${day}`).toEqual([signatureOf(hero)]);
        replaced++;
      }
    }
    expect(replaced).toBeGreaterThan(0);
    expect(empty + replaced).toBeGreaterThan(100);
  });

  it("the shared offers are identical for all six heroes; the signature card stands in the same slot, and differs only by hero", () => {
    for (let seed = 1; seed <= 60; seed++) for (let day = 1; day <= 10; day++) for (const rerolls of [0, 1]) {
      const runs = HEROES6.map((h) => at(h, seed, day, rerolls));
      const shared = runs.map((r) => JSON.stringify(sharedWagons(r.shop.wagons)));
      for (const s of shared) expect(s, `s${seed} d${day} r${rerolls}`).toBe(shared[0]);
      const where = runs.map((r) => sigCards(r).map((c) => [c.wagon, c.slot, c.price]));
      for (const [i, r] of runs.entries()) {
        expect(where[i]).toEqual(where[0]);
        for (const c of sigCards(r)) expect(c.def).toBe(signatureOf(r.hero));
      }
    }
  });

  it("never in a shared pool: no merchant's stock, the familiar, SALVAGE, the SMUGGLER, the TRADER's SWAP, the per-run wares, a road grant or a warlord's prize", () => {
    expect([...SIGNATURE_FACTORIES].sort()).toEqual(["clockworks", "crucible", "kiln", "loom", "sump", "wardworks"]);
    for (const def of SIGNATURE_FACTORIES) {
      expect([ITEMS[def].merchant, ITEMS[def].price], def).toEqual([undefined, 0]);
      for (const m of Object.keys(MERCHANTS) as MerchantId[]) expect(itemsSoldBy(m).map((d) => d.id), `${m} ${def}`).not.toContain(def);
    }
    const pools = [buyableModules().map((d) => d.id), salvagePool(), smugglerPool("BURN"), smugglerPool("SHOCK"), ...RARITIES.map((r) => UPGRADE[r])].flat();
    expect(pools.filter((d) => isSignatureFactory(d))).toEqual([]);
    for (const def of Object.keys(ITEMS)) for (let k = 0; k < 64; k++) expect(isSignatureFactory(swapPart(def, (k + 0.5) / 64) ?? ""), def).toBe(false);
    for (let seed = 1; seed <= 40; seed++) expect(Object.keys(drawWares(seed)).filter((d) => isSignatureFactory(d))).toEqual([]);
    // road grants: every event's choices on a run holding a waiting copy in cargo (the trader never takes it either)
    for (const hero of PLAYABLE_HEROES) for (let seed = 1; seed <= 12; seed++) for (const day of [3, 6, 9]) for (const id of EVENT_IDS) {
      const run = at(hero, seed, day);
      gainModule(run, signatureOf(hero)); // ★2
      gainModule(run, signatureOf(hero)); // a ★1 waiting in cargo
      run.event = makeEvent(seed, day, id);
      run.stage = "event";
      for (const c of choicesFor(run)) {
        for (const g of [...c.gain, ...c.cost]) if (g.k === "item") expect(isSignatureFactory(g.def), `${hero} ${id} ${c.label}`).toBe(false);
      }
    }
    // a warlord's prize: its deck's priciest parts, never its signature factory
    for (const id of RIVAL_IDS) for (const d of rivalDays(id)) {
      const deck = rivalBuild(id, d);
      expect(topParts(deck, Infinity).filter((p) => isSignatureFactory(p)), `${id} d${d}`).toEqual([]);
      expect(hardParts(id, deck, d).filter((p) => isSignatureFactory(p)), `${id} d${d}`).toEqual([]);
    }
  });
});

describe("D9: buying it", () => {
  /** A FURNACE run on a day its caravan shows the KILN card. */
  function offered(min = 3): { run: Run; wagon: number; slot: number } {
    for (let seed = 1; ; seed++) for (let day = min; day <= 10; day++) {
      const run = at("furnace", seed, day), c = sigCards(run)[0];
      if (c) return { run, wagon: c.wagon, slot: c.slot };
    }
  }

  it("the card carries the MERGE badge; bought, it merges ★1 -> ★2 in place; the discount applies; from ★2 a copy waits beside it (badge WAIT)", () => {
    const { run, wagon, slot } = offered();
    const kiln = run.build.items.find((p) => p.def === "kiln")!;
    expect(shopBadge(run, "kiln")).toEqual({ kind: "merge", toStars: 2 });
    const gold = run.gold, r = buyOffer(run, wagon, slot);
    expect([r.ok, run.gold, r.gain?.stars, r.gain?.survivor]).toEqual([true, gold - 11, 2, kiln.uid]);
    expect(run.build.items.filter((p) => p.def === "kiln").map((p) => starsOf(p))).toEqual([2]);
    // ★2 owned, no ★1: the next copy waits beside it
    expect(shopBadge(run, "kiln")).toEqual({ kind: "wait" });
    const w = gainModule(run, "kiln");
    expect([w.steps.length, w.where]).toEqual([0, "cargo"]);
    expect(shopBadge(run, "kiln")).toEqual({ kind: "merge", toStars: 3 }); // ★1 + ★1 -> ★2, ★2 + ★2 -> ★3
    // the caravan's discount applies to it as to any offer
    const d = offered(4);
    d.run.shop.discount = 2;
    d.run.shop.rerolls = 0;
    rollShop(d.run);
    for (const c of sigCards(d.run)) expect(c.price).toBe(9);
  });

  it("it isn't offered while the run holds its factory at ★3 only (no dead offers); a ★2 beside a waiting ★1 still gets it", () => {
    let held3 = 0, held21 = 0;
    for (let seed = 1; seed <= 60; seed++) for (let day = 3; day <= 10; day++) for (const rerolls of [0, 1, 2]) {
      const drawn = new Rng(hashSeed(seed, "signature", day, rerolls)).chance(SIGNATURE_OFFER.chance);
      const three = newRun("furnace", seed, "x");
      three.build.items.find((p) => p.def === "kiln")!.stars = 3;
      three.day = day;
      three.shop = { wagons: [], rerolls, discount: 0, free: 0 };
      rollShop(three);
      expect(sigCards(three)).toEqual([]);
      if (drawn) held3++;
      const two = newRun("furnace", seed, "y");
      two.build.items.find((p) => p.def === "kiln")!.stars = 2;
      two.inventory.push({ uid: 777, def: "kiln" });
      two.day = day;
      two.shop = { wagons: [], rerolls, discount: 0, free: 0 };
      rollShop(two);
      expect(sigCards(two).length).toBe(drawn ? 1 : 0);
      if (drawn) held21++;
    }
    expect([held3 > 0, held21 > 0]).toEqual([true, true]);
  });

  it("no copy sells or stows; the trader takes none", () => {
    const run = newRun("furnace", 9, "keep");
    gainModule(run, "kiln");
    const wait = gainModule(run, "kiln");
    const kiln = run.build.items.find((p) => p.def === "kiln")!;
    expect([storePlaced(run, kiln.uid), sellInventory(run, wait.uid)]).toEqual([false, 0]);
    expect(run.inventory.map((i) => i.uid)).toEqual([wait.uid]);
  });
});

describe("D9: the free starting copy is worth nothing; bought copies count", () => {
  it("partsValue: the starting KILN 0; a ★2 (one bought) 11; a ★3 (three bought) 33, not 44; a ★2 beside a waiting ★1 22; other parts as valueOf", () => {
    const k = (stars: number) => ({ def: "kiln", ...(stars > 1 ? { stars } : {}) });
    expect([partsValue([k(1)], "furnace"), partsValue([k(2)], "furnace"), partsValue([k(3)], "furnace"), partsValue([k(2), k(1)], "furnace")]).toEqual([0, 11, 33, 22]);
    expect(partsValue([k(1), { def: "temper" }, { def: "press", stars: 2 }], "furnace")).toBe(valueOf("temper") + valueOf("press", 2));
    expect([copyValue("kiln", 1), copyValue("kiln", 2), copyValue("kiln", 3), copyValue("press", 2)]).toEqual([11, 22, 44, valueOf("press", 2)]);
    expect(valueOf("kiln", 3)).toBe(0); // the ItemDef keeps price 0: price-ranked lists never see it
  });

  it("every value sum reads it: validate.ts buildCost (the upload budget), rivals.ts deckCost, and a starting deck costs as before", () => {
    for (const hero of PLAYABLE_HEROES) {
      const start = heroStartBuild(hero, 1), sig = signatureOf(hero);
      const base = buildCost(start).items;
      expect(base, hero).toBe(start.items.filter((p) => p.def !== sig).reduce((n, p) => n + valueOf(p.def, starsOf(p)), 0));
      for (const stars of [2, 3]) {
        const b: Build = JSON.parse(JSON.stringify(start));
        b.items.find((p) => p.def === sig)!.stars = stars;
        expect(buildCost(b).items - base, `${hero} ★${stars}`).toBe(11 * (2 ** (stars - 1) - 1));
        expect(deckCost(b).total, `${hero} ★${stars}`).toBe(buildCost(b).total);
      }
    }
  });
});

describe("D9: validate.ts takes the hero's own at ★1-3 and a ★2 beside a waiting ★1, and refuses another hero's", () => {
  const deck = (hero: HeroId, stars: number[]): Build => {
    const b = heroStartBuild(hero, 1), sig = signatureOf(hero);
    const own = b.items.find((p) => p.def === sig)!;
    if (stars[0] > 1) own.stars = stars[0];
    // a waiting copy placed beside it: on the deck's top-left corner, beltless
    stars.slice(1).forEach((s, i) => b.items.push({ uid: 600 + i, def: sig, x: 0, y: 8, ...(s > 1 ? { stars: s } : {}) }));
    return b;
  };
  const check = (b: Build, day: number) => [validateBuild(b, day), validateUpload(b, day)];

  it("strict and player mode: ★1-3 and ★2 + ★1 pass once affordable (★2 from day 3); any bought copy before day 3 and a third copy are refused; another hero's is refused", () => {
    for (const hero of PLAYABLE_HEROES) {
      // a ★2 is one bought copy (11 gold, within day 3's budget); a ★2 + ★1 two and a ★3 three (the budget's to judge)
      for (const [own, day] of [[[1], 3], [[2], 3], [[1], 10], [[2], 10], [[2, 1], 10], [[3], 10]] as [number[], number][]) {
        for (const v of check(deck(hero, own), day)) expect(v.errors, `${hero} ★${own.join("+★")} d${day}`).toEqual([]);
      }
      const three = check(deck(hero, [3]), 3)[0];
      expect(three.errors.some((e) => e.startsWith("budget:")), `${hero} ★3 d3: ${three.errors}`).toBe(true); // 33 gold
      for (const own of [[2], [3], [2, 1]]) for (const v of check(deck(hero, own), 1)) {
        expect(v.errors.some((e) => /the caravan offers .* copies from day 3/.test(e)), `${hero} ★${own.join("+★")} d1: ${v.errors}`).toBe(true);
      }
      for (const own of [[3, 1], [2, 2], [1, 1], [3, 3]]) for (const v of check(deck(hero, own), 10)) {
        expect(v.ok, `${hero} ★${own.join("+★")}`).toBe(false);
      }
      const other = PLAYABLE_HEROES.find((h) => h !== hero)!, foreign = heroStartBuild(hero, 1);
      foreign.items.push({ uid: 600, def: signatureOf(other), x: 0, y: 8 });
      for (const v of check(foreign, 5)) expect(v.errors.join(" | ")).toMatch(/is another hero's signature factory/);
    }
  });
});

describe.each(storeBackends())("D9: the server takes the hero's own copies and refuses another hero's, on the $name store", (backend) => {
  let app: GhostServer, base: string, me: Identity;
  beforeAll(async () => {
    await backend.setup();
    app = backend.server({ uploads: "open", log: () => {}, matchSalt: () => 0, rateLimit: { windowMs: 60_000, max: 10_000 } });
    base = `http://127.0.0.1:${await app.listen(0)}`;
    me = await testIdentity(3);
  }, 60_000);
  afterAll(async () => {
    await app.close();
    await backend.teardown();
  });
  const snap = (hero: HeroId, day: number, build: Build): GhostSnapshot =>
    ({ v: SNAPSHOT_VERSION, rules: "bb-0.8.0", hero, day, wins: 0, lives: 5, build, runId: `d9-${hero}-${day}`, playerId: `p-${hero}`, createdAt: 1_790_000_000_000 });
  const post = async (s: GhostSnapshot) => {
    const body = JSON.stringify(ownedBy(s, me));
    const r = await fetch(`${base}/v1/ghosts`, { method: "POST", headers: await signedHeaders(me, body), body });
    return { status: r.status, body: (await r.json()) as { id?: string; error?: string } };
  };

  it("a ★2 and a ★2 beside a waiting ★1 get 201 on day 5; a ★3 on day 1 and another hero's signature are refused", async () => {
    for (const hero of PLAYABLE_HEROES) {
      const sig = signatureOf(hero);
      const two = heroStartBuild(hero, 1);
      two.items.find((p) => p.def === sig)!.stars = 2;
      const ok = await post(snap(hero, 5, two));
      expect(ok.status, `${hero} ★2: ${ok.body.error}`).toBe(201);
      expect(ok.body.id).toBe(ghostId(ownedBy(snap(hero, 5, two), me)));
      const waiting: Build = JSON.parse(JSON.stringify(two));
      waiting.items.push({ uid: 600, def: sig, x: 0, y: 8 });
      expect((await post(snap(hero, 5, waiting))).status, `${hero} ★2 + ★1`).toBe(201);
      const three = heroStartBuild(hero, 1);
      three.items.find((p) => p.def === sig)!.stars = 3;
      const early = await post(snap(hero, 1, three));
      expect([early.status, early.body.error], `${hero} ★3 d1`).toEqual([422, "deck failed validation"]);
      expect(validateUpload(three, 1).errors.join(" | ")).toMatch(/the caravan offers .* copies from day 3/);
      const foreign = heroStartBuild(hero, 1);
      foreign.items.push({ uid: 600, def: signatureOf(PLAYABLE_HEROES.find((h) => h !== hero)!), x: 0, y: 8 });
      const no = await post(snap(hero, 5, foreign));
      expect([no.status, no.body.error], `${hero} foreign`).toEqual([early.status, early.body.error]); // refused, as the ★3 on day 1
      expect(validateUpload(foreign, 5).errors.join(" | ")).toMatch(/another hero's signature factory/); // the reason the server read
    }
  });
});
