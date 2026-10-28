// S6 (REQ-BFG-119) Goal 1: the privacy policy and the support page (server/pages/privacy.html and support.html). Static and in process, no network.
//  - both parse (tests/s6Html.ts: balanced tags, one <title>, one <h1>, the section ids), carry no script, no event handler, no external resource and no
//    link but beltbattles.fly.dev pages, mailto: and #anchors;
//  - dark (the game's #050b12), 16 px text, a phone's viewport, a max width of 40em, every text colour at 4.5:1 or more against every background;
//  - exactly two placeholders, [[SUPPORT_EMAIL]] and [[DEVELOPER_NAME]], in the places they belong. The pages are checked in both states: as committed
//    (the placeholders) and after the operator has run scripts/s6/contact.mjs (an address and a name in their places), so this file stays green then;
//  - every claim the page makes that a number or a string of the code can prove is held to it: the deletion steps are linkCards.ts's own words, every
//    request the page names is one src/net makes and every one src/net makes is on the page, the data kinds are PrivacyInfo.xcprivacy's three, the
//    listing's ghost sentence is on the page, the limits (10 minutes, 8 characters, 5 tries, 200 runs, 50, 300, 2 KB, an hour) are the code's.
// S6D (REQ-BFG-119) Goal 5, the last describe block: the pages say what the operator's retention decisions made real (server/retention.ts, the ghost-admin
//    commands prune-ghosts, prune-idle, weekly, delete-player and find-player, and the MY PLAYER ID row), and nothing more:
//  - every number of time on either page (180 days, 24 months, 730 days, 14 days, a weekly clean-up) is a constant of server/retention.ts, and no other
//    number of days or months is on a page; every command the pages rely on is in ghostAdmin's COMMANDS; the MY PLAYER ID words are linkCards.ts's WORDS;
//  - "within 14 days" is twice the schedule, on purpose: Fly.io's docs promise no day for a scheduled Machine. https://docs.fly.io/machines/flyctl/fly-machine-run
//    (read 2026-10-28) calls the schedule a "fuzzy hourly, daily, weekly, or monthly cycle", the Machine started "again once per (approximate) hour, day,
//    week, or month", and says a stopped Machine whose host lacks the resources "when its scheduled time comes" gets an error back;
//    https://docs.fly.io/blueprints/task-scheduling (read 2026-10-28) calls scheduled Machines "Not for precise timing". So a weekly run can be late or
//    fail, and the page promises 14 days, not 7;
//  - decisions 4 and 5 of the operator are NOT made, so the pages hold no "same or equal protection" sentence, no safeguard for the transfer to the United
//    States and no Article 27 note, and no sentence was added to #who-sees or #transfers.
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { WORDS } from "../src/screens/linkCards";
import { OFFLINE_LINE } from "../src/game/session";
import { IDENTITY_DB } from "../src/net/identity";
import { NAME_MAX, NAME_MIN } from "../src/net/names";
import { POOL_MAX } from "../src/game/ghosts";
import { HISTORY_LOCAL_MAX, HISTORY_PLAYER_MAX } from "../src/net/historyWire";
import { HISTORY_SYNC_INTERVAL_MS, HISTORY_UPLOADS_PER_TRIGGER } from "../src/net/historySync";
import { SYNC_INTERVAL_MS } from "../src/net/profileSync";
import { COUNTER_KEYS, MAX_PROFILE_BYTES } from "../src/net/profileWire";
import { CODE_LENGTH, CODE_TTL_MS } from "../server/links";
import { REDEEM_FAILS } from "../server/linkRoutes";
import { CLEANUP_PROMISE_DAYS, GHOST_RETENTION_DAYS, IDLE_RETENTION_DAYS, IDLE_RETENTION_MONTHS, WEEKLY_CLEANUP_DAYS } from "../server/retention";
import { PLAYER_CODE_GROUP, PLAYER_CODE_SYMBOLS, playerCode } from "../src/net/playerCode";
import { contrast, hexIn, hexToRgb, luminance, parseCss, parseHtml, type Parsed } from "./s6Html";

const ROOT = new URL("..", import.meta.url).pathname;
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");

const SRC = { privacy: read("server/pages/privacy.html"), support: read("server/pages/support.html") } as const;
const PAGES = [["privacy", SRC.privacy], ["support", SRC.support]] as const;
const parsed = { privacy: parseHtml(SRC.privacy), support: parseHtml(SRC.support) } as const;

const SITE = "https://beltbattles.fly.dev";
/** A support address in its place: the placeholder as committed, or an address once contact.mjs has run. */
const EMAIL = String.raw`(?:\[\[SUPPORT_EMAIL\]\]|[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)`;
const hasEmail = (text: string): boolean => text.includes("[[SUPPORT_EMAIL]]") || /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/.test(text);
const SECTIONS =["who", "device", "sent", "why", "who-sees", "kept", "delete", "rights", "backups", "children", "security", "transfers", "changes"];
const SUPPORT_SECTIONS = ["contact", "linking", "lost", "offline", "delete-data", "privacy"];

const idsOf = (p: Parsed): string[] => p.tags.filter((t) => t.attrs.id !== undefined).map((t) => t.attrs.id);
const sectionIds = (p: Parsed): string[] => p.tags.filter((t) => t.name === "section").map((t) => t.attrs.id);
/** The text of each <code> element, tags removed. */
const codes = (src: string): string[] => [...src.matchAll(/<code>([^<]*)<\/code>/g)].map((m) => m[1]);
/** The text of a section (from its opening tag to the next section's), tags removed. */
function sectionText(src: string, id: string): string {
  const i = src.indexOf(`<section id="${id}">`);
  if (i < 0) throw new Error(`no section ${id}`);
  const end = src.indexOf("</section>", i);
  return parseHtml(src.slice(i, end + "</section>".length)).text;
}

describe("S6 Goal 1: the two pages are well-formed static HTML", () => {
  for (const [name, src] of PAGES) {
    const p = parsed[name];
    it(`${name}: parses with balanced tags, one <title>, one <h1>, a language, a charset and a phone's viewport`, () => {
      expect(p.errors).toEqual([]);
      expect(src.startsWith("<!doctype html>")).toBe(true);
      expect(p.tags.filter((t) => t.name === "title")).toHaveLength(1);
      expect(p.tags.filter((t) => t.name === "h1")).toHaveLength(1);
      expect(p.tags.filter((t) => t.name === "html")[0].attrs.lang).toBe("en");
      expect(p.tags.filter((t) => t.name === "meta" && t.attrs.charset?.toLowerCase() === "utf-8")).toHaveLength(1);
      expect(p.tags.filter((t) => t.name === "meta" && t.attrs.name === "viewport").map((t) => t.attrs.content)).toEqual(["width=device-width, initial-scale=1"]);
      expect(p.styles).toHaveLength(1); // inline <style> only
      const title = /<title>([^<]+)<\/title>/.exec(src)?.[1] ?? "";
      const h1 = /<h1>([^<]+)<\/h1>/.exec(src)?.[1] ?? "";
      expect(title.length).toBeGreaterThan(5);
      expect(h1.length).toBeGreaterThan(5);
    });

    it(`${name}: no script, no event handler, no external stylesheet, font, image, frame or media, and no link but beltbattles.fly.dev, mailto: and #anchors`, () => {
      expect(src.toLowerCase()).not.toContain("<script");
      const banned = new Set(["script", "iframe", "frame", "frameset", "object", "embed", "applet", "img", "picture", "source", "audio", "video", "track", "link", "base", "form", "input", "svg", "canvas"]);
      expect(p.tags.filter((t) => banned.has(t.name)).map((t) => t.name)).toEqual([]);
      for (const t of p.tags) {
        expect(Object.keys(t.attrs).filter((a) => a.startsWith("on")), `<${t.name}> has an event handler`).toEqual([]);
        expect(t.attrs.src, `<${t.name}> has a src`).toBeUndefined();
        expect(t.attrs.srcset, `<${t.name}> has a srcset`).toBeUndefined();
        expect(t.attrs.style, `<${t.name}> has an inline style`).toBeUndefined();
      }
      const css = p.styles.join("\n");
      expect(css).not.toMatch(/@import|@font-face|url\(|expression\(|javascript:/i);
      const hrefs = p.tags.filter((t) => t.name === "a").map((t) => t.attrs.href);
      expect(hrefs.length).toBeGreaterThan(3);
      for (const h of hrefs) {
        expect(h === undefined ? "none" : new RegExp(`^(#[a-z][a-z0-9-]*|mailto:${EMAIL}|https://beltbattles\\.fly\\.dev(/(privacy|support)?(#[a-z][a-z0-9-]*)?)?)$`).test(h) ? "ok" : h).toBe("ok");
      }
      for (const t of p.tags.filter((x) => x.name !== "a")) expect(t.attrs.href, `<${t.name}> has an href`).toBeUndefined();
      // no other address anywhere, in the text either
      for (const u of src.matchAll(/\bhttps?:\/\/[^\s"'<>)]+/g)) expect(u[0].startsWith(SITE), u[0]).toBe(true);
    });
  }

  it("the privacy page's title and h1 say Privacy Policy; the support page's say Support; each has a 'Last updated' line with a real date", () => {
    expect(/<title>([^<]+)<\/title>/.exec(SRC.privacy)?.[1]).toBe("BeltBattles Privacy Policy");
    expect(/<h1>([^<]+)<\/h1>/.exec(SRC.privacy)?.[1]).toBe("BeltBattles Privacy Policy");
    expect(/<title>([^<]+)<\/title>/.exec(SRC.support)?.[1]).toBe("BeltBattles Support");
    expect(/<h1>([^<]+)<\/h1>/.exec(SRC.support)?.[1]).toBe("BeltBattles Support");
    for (const [name, src] of PAGES) {
      const m = /Last updated: <time datetime="(\d{4})-(\d\d)-(\d\d)">(\d{1,2}) ([A-Z][a-z]+) (\d{4})<\/time>/.exec(src);
      expect(m, `${name}: the Last updated line`).not.toBeNull();
      const [, y, mo, d, day, month, year] = m!;
      const named = new Date(`${month} ${day}, ${year} 00:00:00 UTC`);
      expect(Number.isNaN(named.getTime()), `${name}: ${day} ${month} ${year}`).toBe(false);
      expect(`${y}-${mo}-${d}`, `${name}: the words and the datetime agree`).toBe(named.toISOString().slice(0, 10));
      expect(`${y}-${mo}-${d}` >= "2026-10-28", `${name}: not before the S6D change (28 October 2026)`).toBe(true);
    }
  });

  it("the sections have their ids, once each, in order, each with an h2; every #anchor on a page points at an id on it", () => {
    expect(sectionIds(parsed.privacy)).toEqual(SECTIONS);
    expect(sectionIds(parsed.support)).toEqual(SUPPORT_SECTIONS);
    for (const [name, src] of PAGES) {
      const ids = idsOf(parsed[name]);
      expect(new Set(ids).size, `${name}: an id twice`).toBe(ids.length);
      for (const id of name === "privacy" ? SECTIONS : SUPPORT_SECTIONS) {
        expect(src, `${name}: #${id}`).toMatch(new RegExp(`<section id="${id}">\\s*<h2>`));
      }
      for (const a of parsed[name].tags.filter((t) => t.name === "a" && t.attrs.href?.startsWith("#"))) {
        expect(ids, `${name}: ${a.attrs.href}`).toContain(a.attrs.href.slice(1));
      }
    }
    // the table of contents lists every section of the privacy page, in order
    const toc = parsed.privacy.tags.filter((t) => t.name === "a" && t.attrs.href?.startsWith("#")).map((t) => t.attrs.href.slice(1));
    expect(toc).toEqual(SECTIONS);
  });
});

describe("S6 Goal 1: dark, readable on a phone, and every text colour at 4.5:1 or more", () => {
  for (const [name, src] of PAGES) {
    const rules = parseCss(parsed[name].styles.join("\n"));
    const decl = (sel: string, prop: string): string | undefined => rules.find((r) => r.selector === sel)?.decls[prop];

    it(`${name}: the game's #050b12 behind everything, a max width of 40em, text of 16 px or more, no smaller size anywhere`, () => {
      expect(decl("html", "background")).toBe("#050b12");
      expect(decl("body", "background")).toBe("#050b12");
      expect(luminance(hexToRgb("#050b12")!)).toBeLessThan(0.01);
      expect(decl("body", "max-width")).toBe("40em");
      expect(decl("body", "font")).toMatch(/^16px\//);
      for (const r of rules) {
        for (const prop of ["font", "font-size"]) {
          const v = r.decls[prop];
          const sz = v === undefined ? null : /(?:^|\s)(\d+(?:\.\d+)?)(px|rem|em)\b/.exec(v);
          if (!sz) continue;
          const px = Number(sz[1]) * (sz[2] === "px" ? 1 : 16);
          expect(px, `${r.selector} { ${prop}: ${v} }`).toBeGreaterThanOrEqual(16);
        }
      }
      expect(src).toContain('<meta name="viewport" content="width=device-width, initial-scale=1">');
    });

    it(`${name}: every text colour against every background of the page is at least 4.5:1 (WCAG AA); the lowest is printed`, () => {
      const fg = new Map<string, string>(); // colour -> where
      const bg = new Map<string, string>();
      for (const r of rules) {
        for (const prop of ["color"]) {
          const v = r.decls[prop];
          if (v === undefined) continue;
          expect(hexToRgb(v), `${r.selector} ${prop}: ${v}`).not.toBeNull();
          fg.set(v.toLowerCase(), r.selector);
        }
        for (const prop of ["background", "background-color"]) {
          const v = r.decls[prop];
          if (v === undefined) continue;
          expect(hexToRgb(v), `${r.selector} ${prop}: ${v}`).not.toBeNull();
          bg.set(v.toLowerCase(), r.selector);
        }
      }
      expect(fg.size).toBeGreaterThanOrEqual(4);
      expect(bg.has("#050b12")).toBe(true);
      let lowest = 21, where = "";
      for (const [f, fs] of fg) {
        for (const [b, bs] of bg) {
          const c = contrast(hexToRgb(f)!, hexToRgb(b)!);
          if (c < lowest) {
            lowest = c;
            where = `${fs} ${f} on ${bs} ${b}`;
          }
          expect(c, `${fs} ${f} on ${bs} ${b}`).toBeGreaterThanOrEqual(4.5);
        }
      }
      console.log(`s6 ${name}: lowest contrast ${lowest.toFixed(2)}:1 (${where}) over ${fg.size} text colours and ${bg.size} backgrounds`);
      // the link colours are among them
      expect(hexIn(decl("a", "color"))).not.toBeNull();
      expect(hexIn(decl("a:visited", "color"))).not.toBeNull();
    });
  }

  it("the contrast function is right (white on black 21, a known pair)", () => {
    expect(contrast([255, 255, 255], [0, 0, 0])).toBeCloseTo(21, 5);
    expect(contrast(hexToRgb("#777")!, hexToRgb("#fff")!)).toBeCloseTo(4.48, 1); // the classic AA failure
  });
});

describe("S6 Goal 1: exactly two placeholders, where they belong (or, once contact.mjs has run, an address and a name there)", () => {
  const template = (src: string): boolean => /\[\[/.test(src);

  it("[[SUPPORT_EMAIL]] and [[DEVELOPER_NAME]] are the only [[...]] on either page; both are on both pages as committed, none once filled", () => {
    for (const [name, src] of PAGES) {
      const all = src.match(/\[\[/g) ?? [];
      const found = [...src.matchAll(/\[\[[^\]\r\n]*\]\]/g)].map((m) => m[0]);
      expect(found.length, `${name}: a [[ that is not a placeholder`).toBe(all.length);
      if (template(src)) expect(new Set(found), name).toEqual(new Set(["[[SUPPORT_EMAIL]]", "[[DEVELOPER_NAME]]"]));
      else expect(found, `${name}: filled`).toEqual([]);
    }
    expect(template(SRC.privacy), "the two pages are filled together or not at all").toBe(template(SRC.support));
  });

  it("the privacy page: the publisher in #who with the email, the email also in #delete, #rights, #children and #transfers, nowhere else; every mailto: is one address", () => {
    expect(sectionText(SRC.privacy, "who")).toMatch(new RegExp(`^1\\. Who is responsible and how to reach us BeltBattles is published by (\\[\\[DEVELOPER_NAME\\]\\]|[^<>&"]+?)\\. We decide`));
    expect(hasEmail(sectionText(SRC.privacy, "who"))).toBe(true);
    for (const id of ["delete", "rights", "children", "transfers"]) expect(hasEmail(sectionText(SRC.privacy, id)), id).toBe(true);
    for (const id of SECTIONS.filter((s) => !["who", "delete", "rights", "children", "transfers"].includes(s))) expect(sectionText(SRC.privacy, id), id).not.toMatch(/\[\[|@/);
    if (template(SRC.privacy)) expect(SRC.privacy.match(/\[\[DEVELOPER_NAME\]\]/g)).toHaveLength(1);
    for (const [name] of PAGES) {
      const mails = parsed[name].tags.filter((t) => t.name === "a" && t.attrs.href?.startsWith("mailto:")).map((t) => t.attrs.href);
      expect(mails.length).toBeGreaterThan(0);
      expect(new Set(mails).size, `${name}: one address`).toBe(1);
      expect(mails[0]).toMatch(new RegExp(`^mailto:${EMAIL}$`));
    }
    // the visible address is the one in the link
    const shown = parsed.privacy.tags.filter((t) => t.name === "a" && t.attrs.href?.startsWith("mailto:")).map((t) => t.attrs.href.slice("mailto:".length));
    for (const a of shown) expect(SRC.privacy).toContain(`">${a}</a>`);
  });

  it("the support page: the email and the publisher in #contact, nowhere else", () => {
    expect(hasEmail(sectionText(SRC.support, "contact"))).toBe(true);
    expect(sectionText(SRC.support, "contact")).toMatch(/ BeltBattles is published by (\[\[DEVELOPER_NAME\]\]|[^<>&"]+?)\. Please say which device/);
    for (const id of SUPPORT_SECTIONS.filter((s) => s !== "contact")) expect(sectionText(SRC.support, id), id).not.toMatch(/\[\[|@/);
  });
});

describe("S6 Goal 1: the deletion steps and the support answers use the game's own words", () => {
  const del = sectionText(SRC.privacy, "delete");
  const sup = parsed.support.text;

  it("#delete: OPTIONS, DELETE MY ONLINE DATA, the card's two lines, DELETE and CANCEL, and the done line are linkCards.ts's strings", () => {
    expect(read("src/screens/title.ts")).toContain('"OPTIONS"');
    expect(del).toContain("tap OPTIONS");
    expect(del).toContain(`Tap ${WORDS.deleteRow}.`);
    expect(del).toContain(WORDS.goes);
    expect(del).toContain(WORDS.stays);
    expect(del).toContain(`Tap ${WORDS.delete}.`);
    expect(del).toContain(`(${WORDS.cancel} leaves everything as it was.)`);
    expect(del).toContain(WORDS.deleted);
    expect(del).toContain(WORDS.noAnswer); // what the card says without a connection
    expect(del).toContain(WORDS.clock); // and with a clock that is wrong (a signed request carries it; the server holds it to 10 minutes)
    // the steps are an ordered list, in the order the game shows them
    const at = [WORDS.deleteRow, WORDS.goes, `Tap ${WORDS.delete}.`, WORDS.deleted].map((s) => del.indexOf(s));
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(at.every((i) => i >= 0)).toBe(true);
    // the title's OPTIONS card shows DELETE MY ONLINE DATA
    expect(read("src/screens/linkCards.ts")).toContain(`deleteRow: "DELETE MY ONLINE DATA"`);
  });

  it("the support page's linking steps and refusals are the link card's words; the offline line is the title's", () => {
    for (const w of [WORDS.linkRow, WORDS.showCode, WORDS.enterCode, WORDS.linked, WORDS.codeRefused, WORDS.linkedAlready, WORDS.newCode, WORDS.deleteRow, WORDS.clock, WORDS.tooMany, WORDS.noAnswer, WORDS.playerDeleted]) expect(sup, w).toContain(w);
    expect(sup).toContain(OFFLINE_LINE);
    expect(sup).toContain("XXXX-XXXX");
    const hrefs = parsed.support.tags.filter((t) => t.name === "a").map((t) => t.attrs.href);
    expect(hrefs).toEqual(expect.arrayContaining([`${SITE}/privacy#delete`, `${SITE}/privacy`]));
    expect(hrefs.some((h) => h.startsWith("mailto:"))).toBe(true);
  });
});

describe("S6 Goal 1: every request the page names is one the game makes, and every one it makes is on the page", () => {
  /** [method, path, the file that makes it, a pattern in that file that pins the method and the path] */
  const REQUESTS: [string, string, string, RegExp][] = [
    ["GET", "/v1/ghosts/match", "src/net/ghostClient.ts", /\/v1\/ghosts\/match\?[\s\S]*\{ method: "GET"/],
    ["POST", "/v1/ghosts", "src/net/ghostClient.ts", /endpoint\(baseUrl, "\/v1\/ghosts"\)[\s\S]*method: "POST"/],
    ["PUT", "/v1/profile", "src/net/profileClient.ts", /\/v1\/profile", \{\s*method: "PUT"/],
    ["GET", "/v1/profile", "src/net/profileClient.ts", /\/v1\/profile\?\$\{query\}`, \{\s*method: "GET"/],
    ["POST", "/v1/link/code", "src/net/linkClient.ts", /call\(baseUrl, "POST", "\/v1\/link\/code"/],
    ["POST", "/v1/link/redeem", "src/net/linkClient.ts", /call\(baseUrl, "POST", "\/v1\/link\/redeem"/],
    ["POST", "/v1/link/steam", "src/net/linkClient.ts", /call\(baseUrl, "POST", "\/v1\/link\/steam"/],
    ["DELETE", "/v1/player", "src/net/linkClient.ts", /call\(baseUrl, "DELETE", "\/v1\/player"/],
    ["PUT", "/v1/history", "src/net/historyClient.ts", /go\(baseUrl, "\/v1\/history", \{ method: "PUT"/],
    ["GET", "/v1/history", "src/net/historyClient.ts", /read\(baseUrl, id, `\/v1\/history\?at=\$\{nowMs\(deps\)\}`/],
  ];

  /** Every .ts file under src/, with its text. */
  function sources(dir: string): [string, string][] {
    const out: [string, string][] = [];
    for (const e of readdirSync(join(ROOT, dir))) {
      const rel = `${dir}/${e}`;
      if (/\.ts$/.test(e)) out.push([rel, read(rel)]);
      else if (!e.includes(".")) out.push(...sources(rel));
    }
    return out;
  }

  it("the page names exactly these requests, as <code> 'METHOD /path'", () => {
    const named = codes(SRC.privacy).filter((c) => /^(GET|POST|PUT|DELETE) \/v1\//.test(c));
    expect(named.sort()).toEqual(REQUESTS.map(([m, p]) => `${m} ${p}`).sort());
    expect(new Set(named).size).toBe(named.length);
  });

  it("each one is made in the file that is named, with that method; the paths in src/ are exactly the page's paths (both ways); nothing else in src/ fetches", () => {
    for (const [m, p, file, pattern] of REQUESTS) expect(read(file), `${m} ${p} in ${file}`).toMatch(pattern);
    const paths = new Set<string>();
    const fetchers: string[] = [];
    for (const [rel, text] of sources("src")) {
      for (const lit of text.matchAll(/["'`](\/v1\/[A-Za-z0-9/_-]+)/g)) paths.add(lit[1]);
      if (/\bfetch\(/.test(text) || /XMLHttpRequest|sendBeacon|new WebSocket|new EventSource/.test(text)) fetchers.push(rel);
    }
    // src/ has no comment-free way to ask "does this string reach a request", so the comments are part of the scan: they name the same routes
    expect([...paths].sort()).toEqual([...new Set(REQUESTS.map(([, p]) => p))].sort());
    expect(fetchers.sort()).toEqual(["src/net/ghostClient.ts", "src/net/historyClient.ts", "src/net/linkClient.ts", "src/net/profileClient.ts"]);
  });

  it("the page names the one host, https://beltbattles.fly.dev, and says the game sends nowhere else", () => {
    const sent = sectionText(SRC.privacy, "sent");
    expect(sent).toContain(`The game sends data only to ${SITE}, over HTTPS, and nowhere else.`);
    expect(read("capacitor.config.json")).not.toMatch(/allowNavigation|"server"/); // a navigation to another host leaves the app (the PRIVACY row relies on it)
  });
});

describe("S6 Goal 1: what the page says is the code's numbers and strings", () => {
  const text = parsed.privacy.text;

  it("the name rules, the link code, the limits, the history caps, the profile's size and the sync interval are the code's", () => {
    expect(text).toContain(`${NAME_MIN} to ${NAME_MAX} letters, digits, spaces or hyphens`);
    expect(CODE_TTL_MS).toBe(10 * 60_000);
    expect(text).toContain("A code works for 10 minutes.");
    expect(text).toContain(`A link code has ${CODE_LENGTH} characters, works once and for ${CODE_TTL_MS / 60_000} minutes`);
    expect(text).toContain(`After ${REDEEM_FAILS.max} wrong tries from one address in ${REDEEM_FAILS.windowMs / 60_000} minutes`);
    expect(text).toContain(`Your newest ${HISTORY_PLAYER_MAX} entries (a run, and the ENDLESS part of a run, are one entry each)`);
    expect(text).toContain(`a list of your latest finished runs (up to ${HISTORY_LOCAL_MAX})`);
    expect(text).toContain(`a pool of your own recent builds (up to ${POOL_MAX})`);
    expect(text).toContain(`It is at most ${MAX_PROFILE_BYTES / 1024} KB.`);
    expect(SYNC_INTERVAL_MS).toBe(3_600_000);
    expect(HISTORY_SYNC_INTERVAL_MS).toBe(3_600_000);
    expect(text).toContain("at most once an hour");
    expect(text).toContain("over ten minutes for wrong link codes");
  });

  it("the key: ECDSA P-256, the player ID a SHA-256 hash of the public key, IndexedDB 'beltbattles-identity', UserDefaults and SharedPreferences, not the Keychain", () => {
    const id = read("src/net/identity.ts");
    expect(id).toMatch(/namedCurve: "P-256"/);
    expect(IDENTITY_DB).toBe("beltbattles-identity");
    expect(id).toContain('"SHA-256"');
    expect(read("src/net/identityMirror.ts")).toContain("UserDefaults on iOS and SharedPreferences on Android");
    expect(text).toContain("ECDSA P-256");
    expect(text).toContain("SHA-256 hash of the public key");
    expect(text).toContain("database beltbattles-identity");
    expect(text).toContain("UserDefaults on iPhone, SharedPreferences on Android");
    expect(text).toContain("not the Keychain or the Keystore");
  });

  it("the page's claims about the server match the code: no IP in the request log, Fly.io region iad, Tigris, Steam off until configured", () => {
    const app = read("server/app.ts");
    expect(app).toMatch(/log\(`\$\{new Date\(\)\.toISOString\(\)\} \$\{req\.method\} \$\{url\.pathname\} \$\{res\.statusCode\} \$\{Date\.now\(\) - t0\}ms`\)/);
    expect(read("fly.toml")).toMatch(/primary_region = "iad"/);
    expect(read("fly.toml")).toMatch(/BB_GHOST_STORE = "tigris"/);
    expect(read("server/linkRoutes.ts")).toContain("steam linking is not configured");
    expect(text).toContain("Ashburn, Virginia");
    expect(text).toContain("Fly.io region iad");
    expect(sectionText(SRC.privacy, "kept")).toContain("The time, method, path, status and duration of each request");
  });

  it("the listing's sentence about ghosts is on the page", () => {
    for (const f of ["store/listing/play.md", "store/listing/apple.md"]) {
      const sentence = /your own builds become ghosts for other players to meet/i.exec(read(f))?.[0];
      expect(sentence, f).toBeDefined();
      expect(text.toLowerCase(), f).toContain(sentence!.toLowerCase());
    }
  });

  it("the data kinds are PrivacyInfo.xcprivacy's three, linked, not for tracking, for the app's function; the page names each, and says no ads, analytics or tracking", () => {
    const plist = read("ios/App/App/PrivacyInfo.xcprivacy");
    const kinds = [...plist.matchAll(/<string>(NSPrivacyCollectedDataType[A-Za-z]+)<\/string>/g)].map((m) => m[1]).filter((k) => !k.includes("Purpose"));
    expect(kinds).toEqual(["NSPrivacyCollectedDataTypeUserID", "NSPrivacyCollectedDataTypeName", "NSPrivacyCollectedDataTypeGameplayContent"]);
    expect(plist.match(/NSPrivacyCollectedDataTypeLinked<\/key>\s*<true\/>/g)).toHaveLength(3);
    expect(plist.match(/NSPrivacyCollectedDataTypeTracking<\/key>\s*<false\/>/g)).toHaveLength(3);
    expect(plist.match(/NSPrivacyCollectedDataTypePurposeAppFunctionality/g)).toHaveLength(3);
    expect(plist).toMatch(/NSPrivacyTracking<\/key>\s*<false\/>/);
    // User ID: the player ID; Name: the name you chose; Gameplay Content: the build, the profile and the runs
    expect(text).toContain("your player ID");
    expect(text).toContain("the name you chose");
    expect(text).toContain("Your build, as a ghost");
    expect(text).toContain("Your profile");
    expect(text).toContain("Your run history");
    expect(text).toContain("no advertising and no analytics");
    expect(text).toContain("The game has no advertising, analytics or tracking code, and no code from other companies that collects data.");
    expect(text).toContain("We do not use your data for advertising, for tracking you across other apps and sites, or to sell it.");
  });

  it("the Android app allows Auto Backup (the page says a restored phone may come back as the same player), and asks only for the network", () => {
    const manifest = read("android/app/src/main/AndroidManifest.xml");
    expect(manifest).toContain('android:allowBackup="true"');
    expect(manifest).not.toMatch(/dataExtractionRules|fullBackupContent/);
    expect([...manifest.matchAll(/<uses-permission android:name="([^"]+)"/g)].map((m) => m[1])).toEqual(["android.permission.INTERNET"]);
    expect(sectionText(SRC.privacy, "backups")).toContain("the app allows Android's Auto Backup");
  });

  it("children: 13 and over, no age asked, a name of 2 to 10 characters that is not the real name", () => {
    const kids = sectionText(SRC.privacy, "children");
    expect(kids).toContain("aged 13 and over");
    expect(kids).toContain("asks for no age and no contact detail");
    expect(kids).toContain("please do not use your real name");
  });
});

describe("S6 Goal 1: what the independent review found is on the pages, each held to the code", () => {
  const text = parsed.privacy.text;
  const sup = parsed.support.text;
  const app = read("server/app.ts");
  const matchRoute = app.slice(app.indexOf('case "/v1/ghosts/match": {'), app.indexOf('case "/":'));
  const optionsRows = [...read("src/screens/linkCards.ts").matchAll(/\{ id: "(opt-[a-z]+)", label: WORDS\./g)].map((m) => m[1]);

  it("the opponent search needs no key and no sign-in, so anyone who asks the server gets the ghosts, with the name and the player ID", () => {
    expect(text).toContain("Other players, and anyone who asks the server.");
    expect(text).toContain("The opponent search needs no key and no sign-in, so a program other than the game can also ask for ghosts, and it gets what a player's game gets.");
    expect(matchRoute.length).toBeGreaterThan(500);
    expect(matchRoute).not.toMatch(/verifyUpload|KEY_HEADER|SIG_HEADER|uploadHeaderError/);
    expect(matchRoute).toContain("servedSnapshot(hit.snapshot)"); // the whole snapshot, less the run seed
    expect(read("src/net/ghostClient.ts")).toMatch(/\{ method: "GET", headers: \{ accept: "application\/json" \} \}/); // the client signs nothing for it either
    expect(text).toContain("the web address of an opponent search contains your player ID");
  });

  it("the key is made when the game starts, offline too: startOnline runs at boot with a server URL, and the identity is loaded at once, before any request", () => {
    expect(text).toContain("The first time the game starts, even with no connection, it makes a key pair on your device");
    expect(read("src/main.ts")).toContain("if (serverUrl) startOnline(serverUrl);");
    const online = read("src/game/online.ts");
    expect(online).toContain("identity: () => loadIdentity(indexedDbKeyStore()),");
    expect(online).toContain("deps.identity().then((id) => (this.identity = id), () => (this.identity = null));"); // in the constructor
  });

  it("offline: only the ghost fetch, the deck upload and the profile upload check the device's connection; the apps have no switch; on the web ?server=off plays without a server", () => {
    expect(text).toContain("while your device reports that it has no connection, the game does not look for ghosts and does not upload builds or progress");
    expect(text).toContain("The apps have no setting that turns online play off; to play without sending anything, use your device's airplane mode.");
    expect(text).toContain("adding ?server=off to the address does the same for that visit");
    const online = read("src/game/online.ts");
    expect(online.match(/this\.deps\.offline\?\.\(\)/g)).toHaveLength(3); // tick (the fetch), submitDusk (the upload), sendProfile
    expect(online).toContain('q.trim().toLowerCase() === "off"');
    // no switch in the OPTIONS card: its buttons are DONE, REDUCED MOTION, SOUND, FULLSCREEN, NAME and the extra rows (tests/m1.options.test.ts pins them)
    const hudButtons = [...read("src/ui/hud.ts").matchAll(/button\(ui, g, "(opt-[a-z]+)"/g)].map((m) => m[1]);
    expect(hudButtons).toEqual(["opt-rm", "opt-snd", "opt-fs", "opt-name"]);
    expect(optionsRows).toEqual(["opt-link", "opt-id", "opt-delete", "opt-privacy"]); // S6D: MY PLAYER ID, below LINK A DEVICE and above DELETE MY ONLINE DATA
    expect(parsed.support.text).toContain("While your device reports no connection, the game does not look for ghosts and does not upload builds or progress.");
  });

  it("the run history's first send is the runs the device already holds, ten at a time, up to the device's 50", () => {
    expect(HISTORY_UPLOADS_PER_TRIGGER).toBe(10);
    expect(text).toContain(`the device sends the runs it already holds (up to ${HISTORY_LOCAL_MAX}, ten at a time) and each new run`);
    expect(read("src/net/historySync.ts")).toContain("its entries not yet sent to its player, newest first, at most HISTORY_UPLOADS_PER_TRIGGER (10) a trigger");
  });

  it("the profile's counters are the wire's eight, named as the fold counts them: runs ended, runs won or completed; the personal best stays on the device", () => {
    const list = /counters \(([^)]+)\)/.exec(text)?.[1].split(", ") ?? [];
    expect(list).toHaveLength(COUNTER_KEYS.length);
    expect(list).toEqual(["runs ended", "runs won or completed", "flawless runs", "dusk wins", "best day", "warlord wins", "matriarch wins", "most belts"]);
    expect([...COUNTER_KEYS]).toEqual(["runs", "runsFinished", "flawless", "duskWins", "bestDay", "warlordWins", "matriarchWins", "mostBelts"]);
    const prof = read("src/game/profile.ts");
    const end = prof.slice(prof.indexOf("export function foldEnd"), prof.indexOf("/** ENDLESS-1 (REQ-BFG-059, 3.5): the personal best. A run that played endless"));
    expect(end).toContain("p.counters.runs++;"); // at a run's end, not its start
    expect(end).toMatch(/if \(r\.over === "complete" \|\| r\.over === "won"\) \{[^}]*runsFinished\+\+/);
    expect(prof).toContain("/** Heroes with a dusk win; heroes that finished a run. */");
    expect(text).toContain("the heroes you have won a fight with and the heroes you have finished a run with");
    expect(text).toContain("Your personal best stays on your device.");
    expect(prof).toContain("the wire form\n   *  (net/profileWire.ts) has exactly the 8 counters and does not carry it");
  });

  it("a ghost also carries the rules version, the LAST CHANCE choice, the first-run flag and the victory day; a history entry the rules version and the run ID", () => {
    const snap = read("src/net/snapshot.ts");
    for (const f of ["rules: string;", "lastChance?: TakenLastChance;", "firstRun?: true;", "victoryDay?: number;", "endlessWins?: number;", "endlessLives?: number;", "losses?: number;", "road?: RoadEntry[];", "seed?: number;"]) expect(snap, f).toContain(f);
    expect(text).toContain("your hero, the rules version, the day");
    expect(text).toContain("your LAST CHANCE choice, whether it is your first run, and your ENDLESS wins, hearts and victory day");
    const wire = read("src/net/historyWire.ts");
    expect(wire).toMatch(/\brules\b/);
    expect(wire).toMatch(/\brunId\b/);
    expect(text).toContain("A run holds the hero, the rules version, a random run ID, the outcome");
    expect(read("server/store.ts")).toContain("return JSON.stringify({ id, at, snapshot });"); // the server's own time of receipt, stored with the ghost
    expect(read("server/profileStore.ts")).toContain("receivedAt: number;"); // and with the profile
    expect(text).toContain("The server adds the time it received the ghost.");
  });

  it("deletion does not reach the copies other players hold: their saved run keeps the foe's name, player ID and run ID, and a fight record both builds", () => {
    expect(text).toContain("Players who already met your ghost keep what their game saved");
    expect(read("src/game/day.ts")).toContain("record: { wins: g.wins, lives: g.lives, runId: g.runId, playerId: g.playerId, createdAt: g.createdAt, ...named(g)");
    expect(text).toContain("Deleting your data does not reach those copies.");
  });

  it("after a deletion the live session keeps its identity until a restart (the delete drops the stored key, not the session's), so the next game is a new player", () => {
    const link = read("src/net/linkClient.ts");
    const drop = link.slice(link.indexOf("async function dropLocalIdentity"), link.indexOf("/** DELETE MY ONLINE DATA: the server forgets the player"));
    expect(drop).not.toMatch(/onlineSession|online\(\)|identity\s*=/);
    expect(read("src/game/online.ts")).toContain("identity: Identity | null | undefined = undefined;");
    expect(text).toContain("After you restart the game, your next online game sends your name, builds and progress again, under a new player ID.");
  });

  it("a link code lets a device join your player; IP addresses stay in memory until the server restarts (pruned only past 10,000); the name list refuses some words", () => {
    expect(text).toContain("A link code that you make lets one device join your player for 10 minutes, so show a code only to a device of your own.");
    expect(read("server/links.ts")).toContain("redeem(signer: string, typed: string)");
    expect(app).toContain("if (this.hits.size > 10_000) {");
    expect(text).toContain("until the server restarts. Never in storage or in the log.");
    expect(read("src/net/names.ts")).toContain("export function blockedName");
    expect(text).toContain("(the game refuses a short list of offensive words)");
  });

  it("the support page: lost progress is said as it is (history only after a code), the refusal lines are the card's, and an offensive name can be reported", () => {
    expect(sup).toContain("Your online profile lives on the server under your player ID, and so does your run history once you have shown or entered a link code.");
    expect(sup).toContain("To report an offensive name, write to us with the name and the tag you saw next to it (like ANNA#4F).");
    expect(sup).toContain("your device's clock is more than 10 minutes off");
    expect(read("server/links.ts")).toContain("export const AT_WINDOW_MS = 10 * 60_000;");
    expect(read("src/screens/battle.ts")).toContain("`VS ${foeTitle(this.foe)}`"); // the foe's NAME#TAG is what the dusk intro shows (day.ts foeTitle)
    expect(read("src/game/day.ts")).toContain("export function foeTitle");
  });
});

describe("S6D Goal 5: the pages say what the operator's retention decisions made real (server/retention.ts, ghost-admin, MY PLAYER ID), and nothing more", () => {
  const text = parsed.privacy.text;
  const sup = parsed.support.text;
  const kept = sectionText(SRC.privacy, "kept");
  const del = sectionText(SRC.privacy, "delete");
  const rights = sectionText(SRC.privacy, "rights");
  const g = `${GHOST_RETENTION_DAYS} days`;
  const idle = `${IDLE_RETENTION_MONTHS} months (${IDLE_RETENTION_DAYS} days)`;
  /** The second cell of a row of the #kept table, tags removed. */
  const row = (label: string): string => {
    const m = new RegExp(`<tr><td>${label.replace(/[()]/g, "\\$&")}</td><td>([\\s\\S]*?)</td></tr>`).exec(SRC.privacy);
    if (!m) throw new Error(`no row "${label}" in the table of #kept`);
    return parseHtml(m[1]).text;
  };

  it("the periods are the operator's, in one file: ghosts 180 days, a player 24 months counted as 730 days, a weekly clean-up, 14 days promised (twice the schedule)", () => {
    expect(GHOST_RETENTION_DAYS).toBe(180);
    expect(IDLE_RETENTION_MONTHS).toBe(24);
    expect(IDLE_RETENTION_DAYS).toBe(730);
    expect(WEEKLY_CLEANUP_DAYS).toBe(7);
    expect(CLEANUP_PROMISE_DAYS).toBe(14);
    expect(IDLE_RETENTION_DAYS).toBe(2 * 365); // 24 months, counted as two years of 365 days
    expect(Math.abs(IDLE_RETENTION_DAYS - (IDLE_RETENTION_MONTHS * 365.25) / 12)).toBeLessThan(2); // within a day or two of 24 calendar months
    expect(CLEANUP_PROMISE_DAYS).toBeGreaterThanOrEqual(2 * WEEKLY_CLEANUP_DAYS); // a weekly run can be late or fail: never a promise shorter than two runs
  });

  it("#kept: the opening line and the rows for ghosts, profile, links and run history carry exactly those numbers; the weekly clean-up does the deleting", () => {
    expect(kept).toContain(`The server keeps your online data until you delete it, with two time limits: it deletes your ghosts ${g} after it received them, and it deletes the rest of your online data after ${idle} without play.`);
    expect(kept).toContain("A clean-up that runs once a week does the deleting, and it also removes the stored ghosts of players who deleted their online data.");
    expect(kept).toContain(`The clean-up can run late or fail, so we promise only that a deletion that is due is done within ${CLEANUP_PROMISE_DAYS} days.`);
    expect(kept).not.toContain("nothing is deleted just because time has passed"); // the S6 opening line, now false
    expect(row("Ghosts (your builds, with your name)")).toContain(`${g} after the server received them, or sooner if you delete your online data (section 7). They stop being served at once when you delete your online data. The weekly clean-up removes the stored copies.`);
    expect(row("Profile")).toContain(`Until you delete your online data, or until ${idle} pass without play. The weekly clean-up then deletes it as if you had deleted it yourself (section 7): your next online game starts a new player, and the progress on your device stays.`);
    expect(row("Links between devices, Steam link")).toContain(`Until you delete your online data, or until ${idle} pass without play, in the same way as the profile.`);
    expect(row("Run history")).toContain(`Your newest ${HISTORY_PLAYER_MAX} entries (a run, and the ENDLESS part of a run, are one entry each), until you delete your online data, or until ${idle} pass without play, in the same way as the profile. When a newer entry arrives beyond ${HISTORY_PLAYER_MAX}, the oldest is dropped.`);
    // the link code, deletion record, request log and IP rows are as they were: none takes a period from the retention decisions
    for (const label of ["Link code", "Deletion record", "Request log", "IP addresses"]) expect(row(label), label).not.toMatch(/\b(180|730|14)\b|24 months|weekly|clean-up/);
    expect(row("Link code")).toContain("A code works for 10 minutes.");
    expect(row("Deletion record")).toContain("It has no end date.");
    expect(row("Request log")).toContain("The game sets no period for these lines.");
    expect(row("IP addresses")).toContain("until the server restarts. Never in storage or in the log.");
    // the "In short" list at the top says it too
    expect(SRC.privacy).toContain(`<li>The server deletes your ghosts ${g} after it received them, and the rest of your online data after ${IDLE_RETENTION_MONTHS} months without play.</li>`);
  });

  it("#kept: what 'without play' means is what the server stores with a time - a ghost's receipt time, the profile's receivedAt, a run's finishedAt, the link and player records' at", () => {
    expect(kept).toContain(`Without play means that for ${idle} the server has seen none of these from you or from a device linked to you: a ghost or a profile it received, a run in your run history, or a link (linking a device or a Steam account, or showing a link code). Playing without a connection sends nothing, so it does not count.`);
    expect(read("server/store.ts")).toContain("return JSON.stringify({ id, at, snapshot });"); // a ghost: the server's own time of receipt
    expect(read("server/profileStore.ts")).toContain("receivedAt: number;"); // a profile: when the last upload arrived
    expect(read("server/historyStore.ts")).toMatch(/export interface HistoryName \{\s*finishedAt: number;/); // a run: the object name holds its finishedAt
    const links = read("server/links.ts");
    expect(links).toMatch(/export interface KeyLink \{\s*player: string;\s*at: number;/); // a linked device: when it was linked
    expect(links).toMatch(/export interface PlayerRecord \{[\s\S]*?\n  at: number;/); // the player record: its last change
    expect(links).toContain("await this.putPlayer(player, { ...rec, code: hash, at: this.now() });"); // showing a link code writes it (issueCode)
    expect(links).toContain("await this.putKeyLink(signer, { player, at: this.now() });"); // linking a device writes it (join)
    expect(links).toContain("await this.store.put(steamKey(steamId), JSON.stringify({ player: mine, at: this.now() }));"); // and linking a Steam account (linkSteam)
  });

  it("#delete: the weekly clean-up removes the stored ghosts, within 14 days; a player who cannot use the game quotes the ID MY PLAYER ID shows, and we find the player and delete it the way the game does", () => {
    expect(del).toContain("The weekly clean-up removes the stored copies of the ghosts of every player who deleted their online data.");
    expect(del).toContain(`It can run late or fail, so we promise only that it does this within ${CLEANUP_PROMISE_DAYS} days after you delete your online data.`);
    expect(del).toContain("Until it has run, those ghosts are stored but never served.");
    expect(del).not.toContain("A clean-up that the developer runs"); // the S6 sentence, now false
    expect(del).toContain(`and quote your player ID. The game shows it: tap OPTIONS, then ${WORDS.idRow}.`);
    expect(del).toContain("Note it while you still have the device. If you did not note it, tell us the name you used in the game, the hero and roughly when you played.");
    expect(del.indexOf("The game shows it: tap OPTIONS")).toBeGreaterThan(del.indexOf("and quote your player ID.")); // in this order: quote the ID, where the game shows it, note it, else the name
    expect(del).toContain("We find the player and delete its online data the way the game does, its stored ghosts included.");
    expect(del).toContain("Anyone who met your ghost can learn your player ID, so we may ask you questions to be sure the request is yours. We answer within one month (section 8).");
    expect(del).not.toContain("We will look for the ghosts and records"); // the S6 sentence, now replaced
    expect(hasEmail(del)).toBe(true);
    // "the way the game does": DELETE /v1/player calls Links.deletePlayer, which is what the admin's delete-player calls too (server/pruneAdmin.ts, tests/s6d.*)
    expect(read("server/linkRoutes.ts")).toContain("await r.links.deletePlayer(o.signer);");
    // "anyone who met your ghost can learn your player ID": the opponent search serves the whole snapshot, and a snapshot holds the player ID
    expect(read("server/app.ts")).toContain("servedSnapshot(hit.snapshot)");
    expect(read("src/net/snapshot.ts")).toContain('playerId: str(o.playerId, "snapshot.playerId", ID_PATTERN)');
  });

  it("#rights: OPTIONS shows the player ID; the page's example of the code is the code's own shape (16 symbols, four groups of four)", () => {
    expect(rights).toContain(`There is no account, so we can find your data only from your player ID or from the name you used. The game shows your player ID: tap OPTIONS, then ${WORDS.idRow}. Note it while you still have the device.`);
    const shape = Array.from({ length: PLAYER_CODE_SYMBOLS / PLAYER_CODE_GROUP }, () => "X".repeat(PLAYER_CODE_GROUP)).join("-");
    expect(shape).toBe("XXXX-XXXX-XXXX-XXXX");
    expect(del).toContain(`It is a code like ${shape}, shown with the name and tag other players see you under. The row is greyed out while the game has no online session, as ${WORDS.deleteRow} is.`);
    const cards = read("src/screens/linkCards.ts"); // the row is off exactly when DELETE MY ONLINE DATA is: the same availability flag
    expect(cards).toContain('{ id: "opt-id", label: WORDS.idRow, disabled: !a.on,');
    expect(cards).toContain('{ id: "opt-delete", label: WORDS.deleteRow, disabled: !a.on,');
    expect(playerCode("A".repeat(43))).toMatch(/^[0-9A-Z]{4}(?:-[0-9A-Z]{4}){3}$/);
    // the card says what other players see (NAME#TAG), as the page says it shows "the name and tag other players see you under"
    expect(Object.values(WORDS).some((w) => w.includes("OTHER PLAYERS SEE YOU AS"))).toBe(true);
  });

  it("MY PLAYER ID is the game's own words: WORDS.idRow is the OPTIONS row below LINK A DEVICE, and both pages say OPTIONS, then MY PLAYER ID", () => {
    expect(WORDS.idRow).toBe("MY PLAYER ID");
    expect(read("src/screens/linkCards.ts")).toContain('{ id: "opt-id", label: WORDS.idRow,');
    for (const [name, t] of [["privacy", text], ["support", sup]] as const) expect(t, name).toContain(`OPTIONS, then ${WORDS.idRow}`);
  });

  it("support: the lost-device and delete answers name MY PLAYER ID and say what we do with it; the address stays in #contact only", () => {
    const lost = sectionText(SRC.support, "lost");
    const dd = sectionText(SRC.support, "delete-data");
    expect(lost).toContain(`write to us and quote your player ID, which OPTIONS, then ${WORDS.idRow} showed on the old device (the privacy policy, section 7, has the rest). Note it while you still have the device. If you did not note it, tell us the name you used, the hero and roughly when you played.`);
    expect(dd).toContain(`If you can no longer use the game, write to us and quote your player ID: OPTIONS, then ${WORDS.idRow} shows it, so note it while you still have the device. If you do not have it, tell us the name you used, the hero and roughly when you played.`);
    expect(dd).toContain("We find the player and delete its online data the way the game does, its stored ghosts included, and we may ask you questions to be sure it is yours.");
    expect(dd).toContain("The steps and what is removed are in the privacy policy, section 7.");
    expect(lost + dd).not.toMatch(/@|\[\[/);
  });

  it("every ghost-admin command the pages rely on exists: prune-ghosts (180 days), prune-idle (24 months), weekly (the clean-up), purge-tombstoned (a deleted player's ghosts), find-player and delete-player (a lost device)", async () => {
    const { COMMANDS } = await import("../server/ghostAdmin");
    const commands = COMMANDS as readonly string[];
    const reliesOn: [string, string][] = [
      [`${g} after the server received them`, "prune-ghosts"],
      [`${idle} without play`, "prune-idle"],
      ["A clean-up that runs once a week does the deleting", "weekly"],
      ["removes the stored copies of the ghosts of every player who deleted their online data", "purge-tombstoned"],
      ["We find the player", "find-player"],
      ["delete its online data the way the game does, its stored ghosts included", "delete-player"],
    ];
    for (const [phrase, command] of reliesOn) {
      expect(text, phrase).toContain(phrase);
      expect(commands, `"${phrase}" relies on ghost-admin ${command}`).toContain(command);
    }
    expect(sup).toContain("We find the player and delete its online data the way the game does");
    for (const command of ["delete-player", "find-player", "prune-ghosts", "prune-idle", "weekly"]) expect(commands, command).toContain(command);
  });

  it("no other number of days or months is on either page; the clean-up's rhythm is the constant's (once a week = 7 days) and no other", () => {
    const known = new Set([g, `${IDLE_RETENTION_MONTHS} months`, `${IDLE_RETENTION_DAYS} days`, `${CLEANUP_PROMISE_DAYS} days`]);
    for (const [name, t] of [["privacy", text], ["support", sup]] as const) {
      for (const m of t.matchAll(/\b(\d+) (?:days?|months?)\b/g)) expect(known.has(m[0]), `${name}: "${m[0]}" is no constant of server/retention.ts`).toBe(true);
    }
    for (const k of known) expect(text, k).toContain(k);
    expect(WEEKLY_CLEANUP_DAYS).toBe(7);
    expect(text).toContain("once a week");
    expect(text).toContain("The weekly clean-up");
    expect(text).not.toMatch(/\b(daily|monthly|every day|every month)\b/i);
    expect(sup).not.toMatch(/\b(weekly|once a week)\b/i); // the support page promises no period
  });

  it("#children keeps '13 and over'; decisions 4 and 5 are not made: no 'same or equal protection' sentence, no safeguard for the transfer, no Article 27 note, nothing new in #who-sees or #transfers", () => {
    expect(sectionText(SRC.privacy, "children")).toContain("BeltBattles is for people aged 13 and over and is not aimed at children.");
    for (const [name, t] of [["privacy", text], ["support", sup]] as const) {
      expect(t.toLowerCase(), name).not.toMatch(/equal protection|same protection|same or equal|standard contractual|contractual clauses|adequacy|article 27|eu representative|uk representative|binding corporate|data processing (agreement|addendum)|privacy shield|data privacy framework|safeguard/);
    }
    expect(sectionText(SRC.privacy, "who-sees")).toContain("Our hosting providers process the data for us. Fly.io runs the server, and Tigris, the object storage that Fly.io offers, holds the stored data. They also keep their own technical records of connections, under their own policies.");
    expect(sectionText(SRC.privacy, "who-sees")).not.toMatch(/protection|safeguard|agreement|clauses/i);
    const transfers = sectionText(SRC.privacy, "transfers").replace(new RegExp(EMAIL, "g"), "EMAIL");
    expect(transfers).toBe(
      "12. Where the data is processed The server runs on Fly.io in Ashburn, Virginia, in the United States (Fly.io region iad). The data is stored in Tigris. We did not restrict where Tigris places objects, so by its default (a global bucket) objects are stored close to where they are written and copies can be made in other regions when they are read. If you live outside the United States, your data is therefore sent to the United States and may be copied to other countries. For questions about this, write to EMAIL.",
    );
  });
});

describe("S6 Goal 1: the checker catches what it is for", () => {
  const errs = (s: string): string[] => parseHtml(s).errors;
  it("balanced tags, quoted attributes, no stray < or >, no self-closing non-void element; void elements need no end tag", () => {
    expect(errs("<p>a <b>b</b></p>")).toEqual([]);
    expect(errs('<meta charset="utf-8"><br><p>x</p>')).toEqual([]);
    expect(errs("<p><b>a</p></b>").length).toBeGreaterThan(0); // crossed
    expect(errs("<p>a")).toEqual(["<p> is never closed"]);
    expect(errs("</p>")).toEqual(["</p> at 0 closes nothing"]);
    expect(errs("<a href=x>y</a>").some((e) => /not quoted/.test(e))).toBe(true);
    expect(errs("<p>a < b</p>").some((e) => /stray/.test(e))).toBe(true);
    expect(errs("<p>a > b</p>").some((e) => /stray/.test(e))).toBe(true);
    expect(errs("<div/>").some((e) => /self-closing/.test(e))).toBe(true);
    expect(errs("<style>p { color: red }")).toEqual(["<style> is never closed"]);
  });
  it("it sees the script, the image and the event handler a page must not have, and reads <style> as text", () => {
    const p = parseHtml('<script src="x.js"></script><img src="a.png" alt=""><p onclick="f()">t</p><style>p > q { color: #fff; }</style>');
    expect(p.errors).toEqual([]);
    expect(p.tags.map((t) => t.name)).toEqual(["script", "img", "p", "style"]);
    expect(p.tags[0].attrs.src).toBe("x.js");
    expect(Object.keys(p.tags[2].attrs)).toEqual(["onclick"]);
    expect(p.styles).toEqual(["p > q { color: #fff; }"]);
    expect(p.text).toBe("t");
  });
  it("the css reader finds colours and sizes; a low-contrast pair would fail", () => {
    const rules = parseCss("body { color: #777; background: #fff; font: 14px/1.5 serif }\n/* c */ a { color: #8fd3ff }");
    expect(rules).toEqual([{ selector: "body", decls: { color: "#777", background: "#fff", font: "14px/1.5 serif" } }, { selector: "a", decls: { color: "#8fd3ff" } }]);
    expect(contrast(hexToRgb("#777")!, hexToRgb("#fff")!)).toBeLessThan(4.5);
    expect(hexToRgb("blue")).toBeNull();
    expect(hexIn("1px solid #243649")).toBe("#243649");
  });
});
