// M3 (REQ-BFG-119) Goal 4: the store listing text (store/listing/play.md and apple.md, en-US). Checks:
//  - every limit as the stores count it: Google Play's name 30, short description 80 and full description 4,000 characters; the App Store's name
//    30, subtitle 30, promotional text 170, description 4,000 and What's New 4,000 characters, and its keywords at 100 BYTES, comma-separated
//    with no space after a comma, none a word of the name;
//  - the words and phrases the operator ruled out, case-insensitively: a price or "free", the web version and any address, another store, platform
//    or device brand (no Android or Google in the App Store text, no iPhone, iOS or Apple in the Play text, no Steam or itch.io), anything not built
//    (accounts, chat, live multiplayer, leaderboards, hero unlocks), every privacy claim but "no ads and no in-app purchases", and any day cap
//    ("10 days", "wins per run"): a run is won at 10 wins and there is NO day limit;
//  - that every number and name in the text is the game's own: the rules card's win, hearts and ENDLESS lines, the four heroes, the piece, rune and
//    captain counts, the battlefields and the keywords, read from the code (never tools/samplePool: nothing here runs a sample).
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { HEROES, RULES_VERSION, buyableModules } from "../src/sim/content";
import { PLAYABLE_HEROES } from "../src/sim/heroBuilds";
import { RUNES } from "../src/sim/runes";
import { RIVALS, RIVAL_IDS } from "../src/sim/rivals";
import { WIN_GOAL } from "../src/sim/longRun";
import { HEARTS_START } from "../src/sim/hearts";
import { ENDLESS_LIVES } from "../src/sim/endless";
import { FUSE_MAX } from "../src/sim/stars";
import { SCENE_NAME } from "../src/render/scenery";
import { PLAYER_WORD } from "../src/render/font";
import { helpLines } from "../src/screens/title";

const ROOT = new URL("..", import.meta.url).pathname;
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");

/** The fields of a listing file: each `## Heading (note)` section's text (trimmed), keyed by the heading without its note. */
function fields(rel: string): { title: string; order: string[]; text: Record<string, string>; notes: Record<string, string> } {
  const src = read(rel);
  const title = /^# (.+)$/m.exec(src)?.[1] ?? "";
  const text: Record<string, string> = {}, notes: Record<string, string> = {}, order: string[] = [];
  const parts = src.split(/^## /m).slice(1);
  for (const p of parts) {
    const nl = p.indexOf("\n");
    const heading = p.slice(0, nl).trim();
    const m = /^(.*?)\s*\((.*)\)$/.exec(heading);
    const stem = m ? m[1] : heading;
    order.push(stem);
    text[stem] = p.slice(nl + 1).trim();
    notes[stem] = m ? m[2] : "";
  }
  return { title, order, text, notes };
}

const play = fields("store/listing/play.md");
const apple = fields("store/listing/apple.md");

/** characters as a store counts them: one per code point (a line break counts one) */
const chars = (s: string): number => Array.from(s).length;
const bytes = (s: string): number => Buffer.byteLength(s, "utf8");

const PLAY_LIMITS: Record<string, number> = { "App name": 30, "Short description": 80, "Full description": 4000, "Release notes for version 1": 500 };
const APPLE_LIMITS: Record<string, number> = { Name: 30, Subtitle: 30, "Promotional text": 170, Description: 4000, "What's New in version 1": 4000 };

/** every field that is store text (not a suggestion or a note) */
const playText = Object.keys(PLAY_LIMITS).map((k) => [`play ${k}`, play.text[k]] as const);
const appleText = [...Object.keys(APPLE_LIMITS), "Keywords"].map((k) => [`apple ${k}`, apple.text[k]] as const);

describe("M3 Goal 4: the listing files' fields and limits", () => {
  it("each file has its fields, in order, and each heading states the limit the store gives", () => {
    expect(play.order).toEqual(["App name", "Short description", "Full description", "Release notes for version 1", "Category"]);
    expect(apple.order).toEqual(["Name", "Subtitle", "Promotional text", "Description", "Keywords", "What's New in version 1", "Note on What's New", "Categories"]);
    for (const [k, n] of Object.entries(PLAY_LIMITS)) expect(play.notes[k], `play ${k}`).toBe(`max ${n.toLocaleString("en-US")} characters`);
    for (const [k, n] of Object.entries(APPLE_LIMITS)) expect(apple.notes[k], `apple ${k}`).toBe(`max ${n.toLocaleString("en-US")} characters`);
    expect(apple.notes.Keywords).toBe("max 100 bytes, comma-separated, no space after a comma");
    expect(play.title).toMatch(/^Google Play listing/);
    expect(apple.title).toMatch(/^App Store listing/);
  });

  it("Google Play: name 30, short description 80, full description 4,000, release notes 500 characters (full-width and half-width count alike)", () => {
    for (const [k, n] of Object.entries(PLAY_LIMITS)) {
      const t = play.text[k];
      expect(t, `play ${k} is there`).toBeTruthy();
      expect(chars(t), `play ${k}: ${chars(t)} of ${n} characters`).toBeLessThanOrEqual(n);
      expect(t.length, `play ${k}: UTF-16 units`).toBeLessThanOrEqual(n);
    }
    expect(play.text["App name"]).toBe("BeltBattles");
  });

  it("App Store: name 30, subtitle 30, promotional text 170, description 4,000, What's New 4,000 characters; keywords 100 bytes", () => {
    for (const [k, n] of Object.entries(APPLE_LIMITS)) {
      const t = apple.text[k];
      expect(t, `apple ${k} is there`).toBeTruthy();
      expect(chars(t), `apple ${k}: ${chars(t)} of ${n} characters`).toBeLessThanOrEqual(n);
      expect(t.length, `apple ${k}: UTF-16 units`).toBeLessThanOrEqual(n);
    }
    expect(apple.text.Name).toBe("BeltBattles");
    expect(chars(apple.text.Name), "the name is at least two characters").toBeGreaterThanOrEqual(2);
    expect(bytes(apple.text.Keywords), `keywords: ${bytes(apple.text.Keywords)} of 100 bytes`).toBeLessThanOrEqual(100);
  });

  it("the keywords are comma-separated with no space anywhere, each over two characters, none repeated, none a word of the name or the subtitle's, none another's name", () => {
    const kw = apple.text.Keywords;
    expect(kw).toMatch(/^[a-z0-9]+(,[a-z0-9]+)*$/);
    const list = kw.split(",");
    expect(list.length).toBeGreaterThanOrEqual(8);
    expect(new Set(list).size, "no keyword twice").toBe(list.length);
    const subtitleWords = apple.text.Subtitle.toLowerCase().split(/\W+/);
    for (const w of list) {
      expect(w.length, w).toBeGreaterThan(2);
      expect("beltbattles".includes(w) || w.includes("belt") || w.includes("battle"), `${w} is part of the name`).toBe(false);
      expect(subtitleWords.includes(w), `${w} is already in the subtitle, which the store searches too`).toBe(false);
    }
  });
});

// ------------------------------------------------------------------ what must not be said

/** What the filters leave alone: the one privacy-adjacent sentence the operator allows (both halves are true of the code: checked below), and
 *  the ENDLESS card's own words "personal best" (which contain a word the store-policy filter refuses). */
const ALLOWED = /no ads and no in-app purchases|personal best/gi;

const BANNED_BOTH: [string, RegExp][] = [
  ["a price or the word free", /\bfree\b|\bprice[ds]?\b|\bpaid\b|\bcosts? \$|\$\s?\d|\busd\b|\bcents?\b|\b0[.,]99\b|\bdollars?\b|\bpay\b|\bbuy now\b|\bsale\b|\bdiscount|\bpremium\b|\bsubscri/i],
  ["the web version or an address", /\bweb\b|\bwebsite\b|\bbrowser\b|\burl\b|https?:|www\.|\.com\b|\.dev\b|\.io\b|fly\.dev|\bonline version\b|\bwebsite\b/i],
  ["another store, platform or device brand", /\bsteam\b|itch\.?io|\bitch\b|\bepic games\b|\bwindows\b|\bmac ?os\b|\bmacintosh\b|\blinux\b|\bxbox\b|\bplaystation\b|\bnintendo\b|\bswitch\b|\bchromebook\b|\bsamsung\b|\bkindle\b|\bamazon\b|\btestflight\b|\bitunes\b|\bipad\b|\bipados\b|\bapple watch\b/i],
  ["anything not built", /\bunlock|\baccounts?\b|\bsign[- ]?(in|up)\b|\blog ?in\b|\bchat\b|\bmultiplayer\b|\bleaderboards?\b|\bfriends?\b|\bco-?op\b|\btournament|\bseason pass\b|\bbattle pass\b|\bloot ?box|\bclans?\b|\branked\b|\bladder\b|\bachievements?\b|\bcloud saves?\b/i],
  ["a privacy claim", /\bprivacy\b|\bprivate\b|\banonymous|\bsecure|\bsecurity\b|\bencrypt|\bpersonal (data|information)\b|\bdata\b|\btracking\b|\btrack(s|ed)? you\b|\bcollect|\bgdpr\b|\bcoppa\b|\bno ads\b(?! and no in-app purchases)/i],
  ["a day cap", /\b(10|ten)[- ](days?|day)\b|\bwins per run\b|\bwins a run\b|\bper run\b|\bsurvive\b|\b(a|the|one) days? (limit|cap)\b|\bday cap\b|\bwithin \d+ days\b|\bafter \d+ days\b|\bonly \d+ days\b/i],
  ["a store-policy trap (ranking, awards, calls to action, review asks)", /\bbest\b|#\s?1\b|\bnumber (one|1)\b|\btop[- ]rated\b|\baward|\blimited time\b|\bdownload\b|\binstall\b|\brate us\b|\bfive[- ]star\b|\b5[- ]star\b|\bnew update\b|\bhot\b|\bviral\b/i],
  ["an audience claim", /\bkids?\b|\bchildren\b|\bfamily\b|\ball ages\b|\bsafe for\b|\bfor everyone\b/i],
];
const BANNED_APPLE: [string, RegExp][] = [["a Google or Android name", /\bandroid\b|\bgoogle\b|\bplay store\b|\bplay console\b|\bgoogle play\b|\bpixel (phone|\d)/i]];
const BANNED_PLAY: [string, RegExp][] = [["an Apple name", /\bios\b|\biphone\b|\bapple\b|\bapp store\b|\bitunes\b|\bipad\b|\bmacos\b|\bapple arcade\b/i]];

describe("M3 Goal 4: nothing the operator ruled out is said", () => {
  it("no price, web address, other store or brand, unbuilt feature, privacy claim, day cap or store-policy trap, in any field of either store", () => {
    for (const [where, text] of [...playText, ...appleText]) {
      const t = text.replace(ALLOWED, "");
      for (const [what, re] of BANNED_BOTH) {
        const m = re.exec(t);
        expect(m ? `${m[0]} (${what})` : null, `${where}`).toBeNull();
      }
    }
  });

  it("no Android or Google in the App Store text, and no iPhone, iOS or Apple in the Google Play text", () => {
    for (const [where, text] of appleText) for (const [what, re] of BANNED_APPLE) expect(re.exec(text)?.[0] ?? null, `${where}: ${what}`).toBeNull();
    for (const [where, text] of playText) for (const [what, re] of BANNED_PLAY) expect(re.exec(text)?.[0] ?? null, `${where}: ${what}`).toBeNull();
  });

  it("the filters catch what they are for (a sample of each)", () => {
    const hit = (t: string, i: number): boolean => BANNED_BOTH[i][1].test(t);
    expect(hit("Free to play", 0)).toBe(true);
    expect(hit("Only $0.99", 0)).toBe(true);
    expect(hit("Play it on the web at beltbattles.fly.dev", 1)).toBe(true);
    expect(hit("Also on Steam and itch.io", 2)).toBe(true);
    expect(hit("Unlock heroes and climb the leaderboard with friends", 3)).toBe(true);
    expect(hit("We never collect your data", 4)).toBe(true);
    expect(hit("Survive 10 days", 5)).toBe(true);
    expect(hit("Win 10 wins per run", 5)).toBe(true);
    expect(hit("The best strategy game. Download now", 6)).toBe(true);
    expect(hit("There is a day limit", 5)).toBe(true);
    expect(hit("A run is won at 10 wins. There is no day limit: the days go on while you still have hearts.", 5)).toBe(false);
    expect(hit("No ads and no in-app purchases.".replace(ALLOWED, ""), 4)).toBe(false);
    expect(hit("Your personal best is kept.".replace(ALLOWED, ""), 6)).toBe(false);
    expect(BANNED_APPLE[0][1].test("Also for Android")).toBe(true);
    expect(BANNED_PLAY[0][1].test("Also for iPhone")).toBe(true);
  });

  it("only game words are in capitals: no run of four capitalised words, no emoji, only ASCII and the bullet", () => {
    for (const [where, text] of [...playText, ...appleText]) {
      expect(/(\b[A-Z]{2,}\b[ ,.]+){4,}/.test(text.replace(/FURNACE, WEAVER, FOUNDRY and BASTION/g, "x").replace(/BURN, STUN, POISON, SHIELD, WARD, PAIR and FRAY/g, "y")), `${where}: shouting`).toBe(false);
      for (const ch of text) expect(ch === "\n" || (ch >= " " && ch <= "~") || ch === "•", `${where}: the character U+${ch.codePointAt(0)!.toString(16)}`).toBe(true);
    }
    for (const w of [play.text["App name"], apple.text.Name, apple.text.Subtitle, apple.text.Keywords]) expect(/^[\x20-\x7e]+$/.test(w)).toBe(true);
  });
});

// ------------------------------------------------------------------ what must be said, and is true

const DESCRIPTIONS = [["play", play.text["Full description"]], ["apple", apple.text.Description]] as const;

describe("M3 Goal 4: the operator's rules are in the text, and every claim is true of the code", () => {
  it("a run is won at 10 wins; there is NO day limit; the days go on while hearts last; ENDLESS: 3 fresh hearts, a score, a personal best; and the short texts say 10 wins", () => {
    for (const [where, d] of DESCRIPTIONS) {
      expect(d, where).toContain(`A run is won at ${WIN_GOAL} wins.`);
      expect(d, where).toContain("There is no day limit: the days go on while you still have hearts.");
      expect(d, where).toContain(`You start with ${HEARTS_START} hearts, and a run is lost when your last heart is gone.`);
      expect(d, where).toContain(`After a won run you can keep going. Your build carries on with ${ENDLESS_LIVES} fresh hearts, your score is your endless wins, and your personal best is kept on your device.`);
      expect(d, where).toContain("ENDLESS");
    }
    expect(apple.text["Promotional text"]).toContain(`A run is won at ${WIN_GOAL} wins, then play on in ENDLESS for a score and a personal best.`);
    for (const k of ["Release notes for version 1"]) expect(play.text[k]).toContain(`A run is won at ${WIN_GOAL} wins`);
    expect(apple.text["What's New in version 1"]).toContain(`A run is won at ${WIN_GOAL} wins`);
    // the game says the same in its own rules card (HOW TO PLAY): the listing and the card cannot drift apart
    const card = helpLines().join(" ");
    expect(card).toContain(`THE RUN IS WON AT ${WIN_GOAL} WINS`);
    expect(card).toContain("THERE IS NO DAY LIMIT");
    expect(card).toContain(`YOU HAVE ${HEARTS_START} HEARTS`);
    expect(card).toContain(`${ENDLESS_LIVES} FRESH HEARTS`);
    expect(card).toContain("YOUR SCORE IS YOUR ENDLESS WINS");
    expect(card).toContain("ANOTHER CAPTAIN'S SAVED CRUISER");
  });

  it("the four heroes, in the game's order, are the playable ones, with their own factions and what each does (the hero cards' own words)", () => {
    expect([...PLAYABLE_HEROES]).toEqual(["furnace", "weaver", "foundry", "bastion"]);
    for (const [where, d] of DESCRIPTIONS) expect(d, where).toContain("Four are open from the start: FURNACE, WEAVER, FOUNDRY and BASTION.");
    expect(PLAYABLE_HEROES.map((id) => [HEROES[id].name, HEROES[id].factionName])).toEqual([["FURNACE", "ORC WARBAND"], ["WEAVER", "ELVEN SKYWRIGHTS"], ["FOUNDRY", "HUMAN GUILDS"], ["BASTION", "DWARVEN HOLDS"]]);
    const blurb = (id: "furnace" | "weaver" | "foundry" | "bastion"): string => HEROES[id].blurb.join(" ");
    expect(blurb("furnace")).toContain("HEAT UP ON LONG BELTS");
    expect(blurb("weaver")).toContain("FEEDS THREE LIGHT TURRETS");
    expect(blurb("weaver")).toContain("HIT FRAYS THE HULL");
    expect(HEROES.weaver.turrets.length).toBe(3);
    expect(blurb("foundry")).toContain("TWIN BLANKS");
    expect(blurb("foundry")).toContain("FUSE INTO ALLOY SLUGS");
    expect(blurb("bastion")).toContain("BULWARK SLUGS PLATE THE HULL");
    for (const [where, d] of DESCRIPTIONS) {
      expect(d, where).toContain("FURNACE, an orc warband, cooks its slugs hotter on long belts.");
      expect(d, where).toContain("WEAVER, elven skywrights, feeds three light turrets from a loom, and every hit frays the hull.");
      expect(d, where).toContain("FOUNDRY, human guilds, fuses twin blanks into alloy slugs.");
      expect(d, where).toContain("BASTION, dwarven holds, plates its hull as bulwark slugs reach the chamber.");
    }
  });

  it("the counts are the game's: more than 100 pieces (turrets, factories, rigs, cores, gear), more than 60 runes, 19 named rival captains with elites and a boss, eight battlefields, three stars at most", () => {
    const kinds = new Set(buyableModules().map((d) => d.kind));
    expect(buyableModules().length, "pieces in the shops").toBeGreaterThan(100);
    for (const k of ["turret", "factory", "gate", "core", "mod"]) expect(kinds.has(k as never), `a ${k} is for sale`).toBe(true);
    expect(Object.keys(RUNES).length, "runes").toBeGreaterThan(60);
    expect(RIVAL_IDS.length, "rival captains").toBe(19);
    expect(RIVAL_IDS.some((id) => RIVALS[id].rank === "elite") && RIVAL_IDS.some((id) => RIVALS[id].rank === "boss")).toBe(true);
    expect(Object.keys(SCENE_NAME).length, "battlefields").toBe(8);
    expect(FUSE_MAX).toBe(3);
    for (const [where, d] of DESCRIPTIONS) {
      expect(d, where).toContain("More than 100 pieces to buy: turrets, factories, rigs, cores and gear.");
      expect(d, where).toContain("More than 60 runes: upgrades that stay with you for the whole run.");
      expect(d, where).toContain("19 named rival captains, from everyday foes to elites and a boss.");
      expect(d, where).toContain("Eight battlefields: ");
      for (const name of Object.values(SCENE_NAME)) expect(d.toLowerCase(), `${where}: ${name}`).toContain(name.toLowerCase());
      expect(d, where).toContain("up to three stars");
    }
  });

  it("the keywords named are the game's own words (its glossary's player words), and the speeds, the rig turn and the roads are in the rules card", () => {
    const words = new Set(Object.values(PLAYER_WORD));
    for (const [where, d] of DESCRIPTIONS) {
      const line = /Keywords to build around: ([A-Z, and]+)\./.exec(d)?.[1] ?? "";
      const named = line.split(/, | and /).filter(Boolean);
      expect(named, where).toEqual(["BURN", "STUN", "POISON", "SHIELD", "WARD", "PAIR", "FRAY"]);
      for (const w of named) expect(words.has(w), `${where}: ${w} is a keyword the game names`).toBe(true);
      expect(d, where).toContain("Watch each fight at 0.5x, 1x, 2x or 4x speed, or skip to the result.");
    }
    const card = helpLines().join(" ");
    expect(card).toContain("0.5X-4X, SKIP");
    expect(card).toContain("TAP TO TURN");
    expect(card).toContain("TAP A CARD TO READ IT");
    expect(card).toContain("MERGE THEM INTO ★2 (TWO ★2 MERGE INTO ★3)");
    expect(card).toContain("FACTORIES MAKE SLUGS FOR THE TURRET THEIR BELT REACHES, RIGS CHANGE THEM ON THE BELT, TURRETS FIRE THEM");
    expect(card).toContain("DRAG A BELT INTO ANOTHER");
  });

  it("'no ads and no in-app purchases' is true of the code: no ad or billing library, only the INTERNET permission, no forced orientation; and the rules version the text was checked against is bb-0.12.0", () => {
    const pkg = JSON.parse(read("package.json")) as { dependencies: Record<string, string>; devDependencies: Record<string, string> };
    const deps = [...Object.keys(pkg.dependencies), ...Object.keys(pkg.devDependencies)];
    expect(deps.filter((d) => /(^|[-/@])ads?([-/]|$)|admob|adsense|billing|purchase|iap|revenuecat|unity-ads|applovin|ironsource|firebase|analytics|sentry/i.test(d))).toEqual([]);
    expect(deps.filter((d) => !d.startsWith("@capacitor/"))).toEqual(["playwright-core", "typescript", "vite", "vitest"]);
    const manifest = read("android/app/src/main/AndroidManifest.xml");
    expect([...manifest.matchAll(/<uses-permission android:name="([^"]+)"/g)].map((m) => m[1])).toEqual(["android.permission.INTERNET"]);
    expect(manifest).not.toMatch(/BILLING|AD_ID|screenOrientation/);
    expect(read("capacitor.config.json")).not.toMatch(/purchase|billing|admob/i);
    expect(RULES_VERSION).toBe("bb-0.12.0");
    for (const [where, d] of DESCRIPTIONS) expect(d, where).toContain("No ads and no in-app purchases.");
  });

  it("the online part is asynchronous and offline play uses stand-in captains: ghosts are saved builds, nobody faces anyone in real time, no live play is claimed", () => {
    for (const [where, d] of DESCRIPTIONS) {
      expect(d, where).toContain("Online play is asynchronous.");
      expect(d, where).toContain("At each dusk you meet a ghost, another player's saved build, and your own builds become ghosts for other players to meet.");
      expect(d, where).toContain("Nobody faces anyone in real time.");
      expect(d, where).toContain("Without a connection the game plays against stand-in captains");
      expect(d, where).toContain("When none fits, a rival captain stands in, so the game also plays fully offline.");
      expect(d.toLowerCase(), where).not.toMatch(/\blive\b/);
    }
    // the game's own offline line names the same thing
    expect(read("src/game/session.ts")).toContain("PLAYING AGAINST STAND-INS");
  });
});
