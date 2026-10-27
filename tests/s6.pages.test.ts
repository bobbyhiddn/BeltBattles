// S6 (REQ-BFG-119) Goal 1: the privacy policy and the support page (server/pages/privacy.html and support.html). Static and in process, no network.
//  - both parse (tests/s6Html.ts: balanced tags, one <title>, one <h1>, the section ids), carry no script, no event handler, no external resource and no
//    link but beltbattles.fly.dev pages, mailto: and #anchors;
//  - dark (the game's #050b12), 16 px text, a phone's viewport, a max width of 40em, every text colour at 4.5:1 or more against every background;
//  - exactly two placeholders, [[SUPPORT_EMAIL]] and [[DEVELOPER_NAME]], in the places they belong. The pages are checked in both states: as committed
//    (the placeholders) and after the operator has run scripts/s6/contact.mjs (an address and a name in their places), so this file stays green then;
//  - every claim the page makes that a number or a string of the code can prove is held to it: the deletion steps are linkCards.ts's own words, every
//    request the page names is one src/net makes and every one src/net makes is on the page, the data kinds are PrivacyInfo.xcprivacy's three, the
//    listing's ghost sentence is on the page, the limits (10 minutes, 8 characters, 5 tries, 200 runs, 50, 300, 2 KB, an hour) are the code's.
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { WORDS } from "../src/screens/linkCards";
import { OFFLINE_LINE } from "../src/game/session";
import { IDENTITY_DB } from "../src/net/identity";
import { NAME_MAX, NAME_MIN } from "../src/net/names";
import { POOL_MAX } from "../src/game/ghosts";
import { HISTORY_LOCAL_MAX, HISTORY_PLAYER_MAX } from "../src/net/historyWire";
import { HISTORY_SYNC_INTERVAL_MS } from "../src/net/historySync";
import { SYNC_INTERVAL_MS } from "../src/net/profileSync";
import { MAX_PROFILE_BYTES } from "../src/net/profileWire";
import { CODE_LENGTH, CODE_TTL_MS } from "../server/links";
import { REDEEM_FAILS } from "../server/linkRoutes";
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
      expect(`${y}-${mo}-${d}` >= "2026-10-27", `${name}: not before this work`).toBe(true);
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
    // the steps are an ordered list, in the order the game shows them
    const at = [WORDS.deleteRow, WORDS.goes, `Tap ${WORDS.delete}.`, WORDS.deleted].map((s) => del.indexOf(s));
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(at.every((i) => i >= 0)).toBe(true);
    // the title's OPTIONS card shows DELETE MY ONLINE DATA
    expect(read("src/screens/linkCards.ts")).toContain(`deleteRow: "DELETE MY ONLINE DATA"`);
  });

  it("the support page's linking steps and refusals are the link card's words; the offline line is the title's", () => {
    for (const w of [WORDS.linkRow, WORDS.showCode, WORDS.enterCode, WORDS.linked, WORDS.codeRefused, WORDS.linkedAlready, WORDS.newCode, WORDS.deleteRow]) expect(sup, w).toContain(w);
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
    expect(text).toContain(`Your newest ${HISTORY_PLAYER_MAX} runs`);
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
    expect(text).toContain("We do not use your data for advertising or profiling, and we do not sell it.");
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
