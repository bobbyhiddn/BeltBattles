/// <reference path="./raw.d.ts" />
// S6 (REQ-BFG-119): the privacy policy and the support page, served by this server beside the game page (app.ts):
//   GET|HEAD /privacy, /privacy.html   server/pages/privacy.html
//   GET|HEAD /support, /support.html   server/pages/support.html
// Both stores want a privacy policy and a support page at a public https address (Apple App Store Review Guideline 5.1.1(i) and the Support
// URL field; Google Play's User Data policy), and the only web host we run is this server. The two files are hand-written static HTML and
// carry exactly two placeholders, [[SUPPORT_EMAIL]] and [[DEVELOPER_NAME]], until the operator supplies the details
// (`node scripts/s6/contact.mjs --email <address> --name <text>` fills them, in the pages and in store/listing/*.md).
//
// Vite's `?raw` import puts the files' text into the server bundle at build time, so they ship inside server/dist: the Docker image holds
// only server/dist and deploy/public/index.html, and nothing about the deploy changes (Dockerfile, .dockerignore, fly.toml).
//
// A page that still holds a `[[...]]` placeholder is NOT served: app.ts answers 404 with a short plain-text reason, and the start logs one line
// naming the page. So a deploy before the contact details arrive publishes nothing wrong. No setting controls this.

import privacySource from "./pages/privacy.html?raw";
import supportSource from "./pages/support.html?raw";
import { sha256Hex } from "./sigv4";

/** A `[[NAME]]`: the form of both placeholders and of any other one. */
const PLACEHOLDER = /\[\[[^\]\r\n]*\]\]/g;

/** The placeholders `text` holds, each once, in order of appearance. */
export function placeholdersIn(text: string): string[] {
  return [...new Set(text.match(PLACEHOLDER) ?? [])];
}

/** The reason a withheld page's 404 gives (plain text). */
export const WITHHELD_TEXT = "This page is not published yet.\n";

/** One static page: what app.ts's sendPage needs (file, body, etag), and the placeholders that keep it from being served. */
export interface InfoPage {
  name: "privacy" | "support";
  /** The page's file in the repository (for the log line). */
  file: string;
  body: Uint8Array;
  etag: string;
  /** The `[[...]]` placeholders the text still holds. Empty: the page is served. */
  placeholders: string[];
}

/** The four paths and the page each serves. */
export const INFO_ROUTES: Readonly<Record<string, InfoPage["name"]>> = {
  "/privacy": "privacy",
  "/privacy.html": "privacy",
  "/support": "support",
  "/support.html": "support",
};

export interface InfoSources {
  privacy: string;
  support: string;
}

export interface InfoPages {
  /** The page a request path stands for (one of the four in INFO_ROUTES), or undefined for any other path. */
  forPath(pathname: string): InfoPage | undefined;
  /** The start-up log lines: one for each page, naming it and saying whether it is served or withheld (and why). */
  logLines(): string[];
}

function makePage(name: InfoPage["name"], text: string): InfoPage {
  const body = new TextEncoder().encode(text);
  return { name, file: `server/pages/${name}.html`, body, etag: `"${sha256Hex(body).slice(0, 32)}"`, placeholders: placeholdersIn(text) };
}

/** The pages of `sources` (default: the two files in the bundle). Tests hand in their own text. */
export function infoPages(sources: InfoSources = { privacy: privacySource, support: supportSource }): InfoPages {
  const pages = { privacy: makePage("privacy", sources.privacy), support: makePage("support", sources.support) };
  return {
    forPath: (pathname) => {
      const name = Object.hasOwn(INFO_ROUTES, pathname) ? INFO_ROUTES[pathname] : undefined;
      return name ? pages[name] : undefined;
    },
    logLines: () => (["privacy", "support"] as const).map((name) => {
      const p = pages[name];
      const where = `/${name} and /${name}.html`;
      return p.placeholders.length === 0
        ? `serving ${p.file} (${p.body.length} bytes) at ${where}`
        : `NOT serving ${p.file}: it still holds ${p.placeholders.join(", ")}, so ${where} answer 404 until node scripts/s6/contact.mjs fills them`;
    }),
  };
}
