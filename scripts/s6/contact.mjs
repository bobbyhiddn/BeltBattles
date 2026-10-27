#!/usr/bin/env node
// S6 (REQ-BFG-119) Goal 4: the two contact details the operator still owes (LAUNCH-0 row O5), in the places that need them.
//
// The privacy page, the support page and the store listings carry two placeholders until the operator supplies the details:
//   [[SUPPORT_EMAIL]]     the address players and the stores' reviewers write to
//   [[DEVELOPER_NAME]]    the name the game is published under
// The server withholds a page that still holds a [[placeholder]] (server/pages.ts: 404 until it is filled), so a deploy before the details
// arrive publishes nothing wrong. This script lists what is left and fills it, in four files:
//   server/pages/privacy.html  server/pages/support.html  store/listing/apple.md  store/listing/play.md
//
//   node scripts/s6/contact.mjs --check
//       Prints every placeholder left, one line each, as file:line: [[NAME]]. Exit 1 if any is left, 0 if none, 2 if a file cannot be read.
//       M5 and the release lane run it before submitting a store form or deploying.
//   node scripts/s6/contact.mjs --email <address> --name <text>
//       Fills both placeholders in all four files. Refuses (exit 2, nothing written) an address that is not shaped like one, a name that is empty
//       or has a < > & " or a line break in it, and a run with no placeholder left to fill. Never writes a file unless every file can be written.
//   --root <dir>   works on <dir> instead of the repository this script sits in (the tests run it on a temp copy).
//
// No dependency: node's own modules only. Run it once, with the real details, then commit the four files.

import { readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const FILES = ["server/pages/privacy.html", "server/pages/support.html", "store/listing/apple.md", "store/listing/play.md"];
const EMAIL_TOKEN = "[[SUPPORT_EMAIL]]";
const NAME_TOKEN = "[[DEVELOPER_NAME]]";
const ANY_TOKEN = /\[\[[^\]\r\n]*\]\]/g;
/** An address as the pages and the stores take it: letters, digits and . _ % + - before the @, then a domain with a dot. No quotes, no angle brackets, no &. */
const EMAIL_SHAPE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/;
const NAME_MAX = 120;
/** Control characters, and the two Unicode line separators (U+2028, U+2029): a name is one line. */
const NOT_ONE_LINE = new RegExp("[\\x00-\\x1f\\x7f" + String.fromCharCode(0x2028, 0x2029) + "]");

const USAGE = [
  "usage: node scripts/s6/contact.mjs --check [--root <dir>]",
  "       node scripts/s6/contact.mjs --email <address> --name <text> [--root <dir>]",
].join("\n");

class Refusal extends Error {}

function parseArgs(argv) {
  const out = { check: false, email: undefined, name: undefined, root: undefined };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--check") out.check = true;
    else if (a === "--email" || a === "--name" || a === "--root") {
      const v = argv[++i];
      if (v === undefined || v.startsWith("--")) throw new Refusal(`${a} needs a value\n${USAGE}`);
      out[a.slice(2)] = v;
    } else throw new Refusal(`unknown argument ${JSON.stringify(a)}\n${USAGE}`);
  }
  if (out.check && (out.email !== undefined || out.name !== undefined)) throw new Refusal(`--check takes no --email or --name\n${USAGE}`);
  if (!out.check && (out.email === undefined || out.name === undefined)) throw new Refusal(`give --check, or both --email and --name\n${USAGE}`);
  return out;
}

function checkEmail(email) {
  if (email.length > 254 || !EMAIL_SHAPE.test(email)) throw new Refusal(`not an email address: ${JSON.stringify(email)}`);
}

function checkName(name) {
  if (name.trim() === "") throw new Refusal("the name is empty");
  if (name.length > NAME_MAX) throw new Refusal(`the name is over ${NAME_MAX} characters`);
  if (/[<>&"]/.test(name)) throw new Refusal(`the name must not hold < > & or " : ${JSON.stringify(name)}`);
  if (NOT_ONE_LINE.test(name)) throw new Refusal("the name must be one line, without control characters");
}

function readFiles(root) {
  return FILES.map((rel) => {
    try {
      return { rel, path: join(root, rel), text: readFileSync(join(root, rel), "utf8") };
    } catch (e) {
      throw new Refusal(`cannot read ${rel} under ${root}: ${e && e.code ? e.code : e}`);
    }
  });
}

/** Every placeholder in a text as { line, token }, in order. */
function placeholders(text) {
  const out = [];
  text.split("\n").forEach((ln, i) => {
    for (const m of ln.matchAll(ANY_TOKEN)) out.push({ line: i + 1, token: m[0] });
  });
  return out;
}

function main(argv) {
  const args = parseArgs(argv);
  const root = resolve(args.root ?? join(dirname(fileURLToPath(import.meta.url)), "..", ".."));
  const files = readFiles(root);

  if (args.check) {
    let n = 0;
    for (const f of files) {
      for (const p of placeholders(f.text)) {
        console.log(`${f.rel}:${p.line}: ${p.token}`);
        n++;
      }
    }
    if (n > 0) {
      console.log(`${n} placeholder${n === 1 ? "" : "s"} left. Fill them: node scripts/s6/contact.mjs --email <address> --name <text>`);
      return 1;
    }
    console.log(`no placeholder left in ${FILES.length} files`);
    return 0;
  }

  checkEmail(args.email);
  checkName(args.name);
  const open = files.filter((f) => f.text.includes(EMAIL_TOKEN) || f.text.includes(NAME_TOKEN));
  if (open.length === 0) throw new Refusal("nothing to fill: no [[SUPPORT_EMAIL]] or [[DEVELOPER_NAME]] is left in the four files");
  // split/join, not replace: the address and the name go in as they are, whatever characters ($&, $1) they hold
  const filled = open.map((f) => ({ ...f, next: f.text.split(EMAIL_TOKEN).join(args.email).split(NAME_TOKEN).join(args.name.trim()) }));
  // write each file beside itself first, then move them into place, so a file that cannot be written leaves none of them changed
  const tmp = filled.map((f) => ({ ...f, tmp: `${f.path}.contact-${process.pid}.tmp` }));
  try {
    for (const f of tmp) writeFileSync(f.tmp, f.next);
  } catch (e) {
    for (const f of tmp) {
      try {
        unlinkSync(f.tmp);
      } catch {
        /* it was never written */
      }
    }
    throw new Refusal(`cannot write: ${e && e.message ? e.message : e}`);
  }
  for (const f of tmp) renameSync(f.tmp, f.path);
  for (const f of tmp) console.log(`filled ${f.rel}`);
  const left = tmp.flatMap((f) => placeholders(f.next).map((p) => `${f.rel}:${p.line}: ${p.token}`));
  if (left.length > 0) {
    console.log(`other placeholders are still there:\n${left.join("\n")}`);
    return 1;
  }
  return 0;
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (e) {
  if (!(e instanceof Refusal)) throw e;
  console.error(e.message);
  process.exitCode = 2;
}
