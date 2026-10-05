// NUM-2 (REQ-BFG-047, N1 sections 2.2 and 2.3): the scripted SPEED of every repeating action, and the whole rate % of every
// interval multiplier, in the rules data. Re-runnable on a new base (the release lane rebases this line onto newer tips): run
// it on an UNCONVERTED tree and it
//   1. reads every interval and interval multiplier of the rules tables below from the source (the TypeScript AST, no
//      evaluation beyond a literal or a quotient of two literals, as STEAM BREECH's 1 / 1.35),
//   2. records them in tests/fixtures/num2-base-intervals.json (BEFORE it converts anything),
//   3. writes, in place (the field's name and the number's text change, nothing else):
//      - SPEED, K = 30 (shots or slugs per 30 s): every turret's fireInterval and every factory's interval, at every star,
//        become `speed: roundHalfUp(30 / interval)`; the battle's interval is 30 / speed;
//      - the BELTS FACTORY track (a hero's signature factory: its levels 2-4, the only factories with a level 4) becomes
//        whole steps: level L = L1 + (L - 1) x roundHalfUp(25% x L1) (N1 2.2; TURRET SPEED's 20% is deck.ts's rule);
//      - every interval multiplier becomes a whole rate % (N1 2.3: "X% FASTER" means the speed goes up X%; the multiplier
//        is 100 / (100 + X)): mod.fireMul -> mod.fireRate (CALIBRATION, ESCAPEMENT), core.intervalMul -> core.fireRate
//        (ROTARY), factory.intervalMul -> factory.rate (MIMIC FORGE), core.steamPlated / steamBare (STEAM BREECH) and
//        core.start / core.floor -> core.start / core.top (GATLING's first and fastest spin), each X = roundHalfUp(100 / m - 100).
// A converted value must stay within 5% of its base rate (N1: worst 4%); a larger move STOPS the script with its name.
// Sentinel: content.ts's SCRAP CANNON has `fireInterval: 1.0` on every unconverted base; on a converted tree it refuses.
//   node scripts/num2-speed.mjs          convert (records the fixture first)
//   node scripts/num2-speed.mjs --check  dry run: print every conversion; write nothing
// tests/numbers.speed.test.ts checks the result against the fixture; tests/belts.numbers.test.ts the BELTS tracks;
// tests/numbers.percent.test.ts the rate %s.
import ts from "typescript";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE = "tests/fixtures/num2-base-intervals.json";
const CHECK = process.argv.includes("--check");
export const K = 30; // seconds: SPEED counts shots or slugs per 30 s
export const FACTORY_STEP = 25; // % of L1 a BELTS FACTORY level adds
const FILES = ["src/sim/content.ts", "src/sim/races/data.ts", "tools/wave3Defs.ts"];
const roundHalfUp = (x) => Math.floor(x + 0.5 + 1e-9); // src/sim/pct.ts's rule

/** field (its path's last two keys) -> what it becomes */
const RULES = {
  "turret.fireInterval": { to: "speed", kind: "speed" },
  "factory.interval": { to: "speed", kind: "speed" },
  "mod.fireMul": { to: "fireRate", kind: "rate" },
  "core.intervalMul": { to: "fireRate", kind: "rate" },
  "factory.intervalMul": { to: "rate", kind: "rate" },
  "core.steamPlated": { to: "steamPlated", kind: "rate" },
  "core.steamBare": { to: "steamBare", kind: "rate" },
  "core.start": { to: "start", kind: "rate" },
  "core.floor": { to: "top", kind: "rate" },
};

const sources = new Map();
function src(file) {
  if (!sources.has(file)) {
    const text = readFileSync(join(ROOT, file), "utf8");
    sources.set(file, { text, sf: ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true), edits: [] });
  }
  return sources.get(file);
}
const nameOf = (p) => (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name) || ts.isNumericLiteral(p.name) ? p.name.text : null);

/** A literal, a negated literal or a quotient / product of two: its value; anything else null. */
function value(e) {
  if (ts.isNumericLiteral(e)) return Number(e.text);
  if (ts.isPrefixUnaryExpression(e) && e.operator === ts.SyntaxKind.MinusToken) { const v = value(e.operand); return v === null ? null : -v; }
  if (ts.isParenthesizedExpression(e)) return value(e.expression);
  if (ts.isBinaryExpression(e)) {
    const a = value(e.left), b = value(e.right);
    if (a === null || b === null) return null;
    if (e.operatorToken.kind === ts.SyntaxKind.SlashToken) return a / b;
    if (e.operatorToken.kind === ts.SyntaxKind.AsteriskToken) return a * b;
  }
  return null;
}

/** The property path of node n: the variable's name, then each property key (array elements by index). */
function pathOf(n) {
  const keys = [];
  let c = n;
  while (c) {
    if (ts.isPropertyAssignment(c)) keys.unshift(nameOf(c));
    else if (ts.isArrayLiteralExpression(c.parent ?? {}) && ts.isObjectLiteralExpression(c)) keys.unshift(String(c.parent.elements.indexOf(c)));
    else if (ts.isVariableDeclaration(c)) { keys.unshift(c.name.getText()); break; }
    c = c.parent;
  }
  return keys.join(".");
}

/** Is the item that holds this path a signature factory (a factory with a level 4: the BELTS FACTORY track)? */
function itemNode(n) {
  // the ItemDef: the object literal whose parent property sits directly in the table (ITEMS.<id>)
  let c = n, item = null;
  while (c && !ts.isVariableDeclaration(c)) {
    if (ts.isObjectLiteralExpression(c) && ts.isPropertyAssignment(c.parent) && ts.isObjectLiteralExpression(c.parent.parent)
      && ts.isVariableDeclaration(c.parent.parent.parent)) item = c;
    c = c.parent;
  }
  return item;
}
const prop = (o, k) => o && o.properties.find((p) => ts.isPropertyAssignment(p) && nameOf(p) === k)?.initializer;
const isSignature = (item) => {
  const lv = prop(item, "levels");
  return !!(lv && ts.isObjectLiteralExpression(lv) && prop(lv, "4") && prop(item, "factory"));
};

const rows = []; // { file, path, field, base, out, kind, to, node }
for (const file of FILES) {
  const s = src(file);
  const visit = (n) => {
    if (ts.isPropertyAssignment(n)) {
      const key = nameOf(n), parentKey = ts.isObjectLiteralExpression(n.parent) && ts.isPropertyAssignment(n.parent.parent) ? nameOf(n.parent.parent) : null;
      const inSlotList = ts.isObjectLiteralExpression(n.parent) && ts.isArrayLiteralExpression(n.parent.parent);
      // a hero's (or the dev pages') turret slot: { col0, width, connectors, kind, fireInterval, window, flight }
      const rule = RULES[`${parentKey}.${key}`] ?? (key === "fireInterval" && inSlotList ? RULES["turret.fireInterval"] : undefined);
      if (rule) {
        const v = value(n.initializer);
        const path = pathOf(n);
        if (v === null) throw new Error(`STOP: ${file} ${path}: not a literal (${n.initializer.getText()})`);
        rows.push({ file, path, key, base: v, kind: rule.kind, to: rule.to, node: n, item: itemNode(n) });
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(s.sf);
}

const sentinel = rows.find((r) => r.file === "src/sim/content.ts" && /^ITEMS\.scrapcannon\.turret\.fireInterval$/.test(r.path));
if (!sentinel) {
  console.error("num2-speed: no SCRAP CANNON fireInterval in content.ts: this tree is already converted (or the table moved). Nothing done.");
  process.exit(2);
}

// the conversions
const out = [];
for (const r of rows) {
  if (r.kind === "speed") {
    if (r.path.endsWith(".fireInterval") && r.base === 0) { r.out = 0; continue; } // an empty slot's placeholder (no turret)
    const lvl = /\.levels\.([234])\.factory\.interval$/.exec(r.path);
    if (lvl && isSignature(r.item)) {
      const l1 = rows.find((q) => q.item === r.item && /\.factory\.interval$/.test(q.path) && !q.path.includes(".levels."));
      const s1 = roundHalfUp(K / l1.base), L = Number(lvl[1]);
      r.out = s1 + (L - 1) * roundHalfUp((s1 * FACTORY_STEP) / 100);
      r.track = `L${L} = ${s1} + ${L - 1} x ${roundHalfUp((s1 * FACTORY_STEP) / 100)}`;
    } else r.out = roundHalfUp(K / r.base);
    r.move = r.out / (K / r.base) - 1; // the rate's change
  } else {
    r.out = roundHalfUp(100 / r.base - 100);
    r.move = (100 + r.out) / (100 / r.base) - 1;
  }
  out.push(r);
}
const bad = out.filter((r) => Math.abs(r.move ?? 0) > 0.05);
for (const r of out) console.log(`${r.file} ${r.path}: ${r.base} -> ${r.to} ${r.out}${r.track ? ` (${r.track})` : ""}  rate ${r.move >= 0 ? "+" : ""}${(100 * (r.move ?? 0)).toFixed(2)}%`);
console.log(`num2-speed: ${out.filter((r) => r.kind === "speed").length} speeds, ${out.filter((r) => r.kind === "rate").length} rate %s; worst move ${(100 * Math.max(...out.map((r) => Math.abs(r.move ?? 0)))).toFixed(2)}%`);
if (bad.length) {
  for (const r of bad) console.error(`STOP: ${r.path} moves ${(100 * r.move).toFixed(1)}% (over 5%): ask cap`);
  process.exit(3);
}
if (CHECK) process.exit(0);

// 1. the record, first
const fixture = {
  note: "NUM-2 (REQ-BFG-047): the base's intervals and interval multipliers, recorded by scripts/num2-speed.mjs before it converted them. K = 30; speed = roundHalfUp(30 / interval); a signature factory's levels 2-4 = L1 + (L - 1) x roundHalfUp(25% x L1); a multiplier m -> rate % roundHalfUp(100 / m - 100).",
  K, FACTORY_STEP,
  rows: out.map((r) => ({ file: r.file, path: r.path, field: r.key, to: r.to, kind: r.kind, base: r.base, value: r.out, ...(r.track ? { track: true } : {}) })),
};
writeFileSync(join(ROOT, FIXTURE), JSON.stringify(fixture, null, 1) + "\n");

// 2. the edits, from the end of each file
for (const r of out) {
  const s = src(r.file), n = r.node;
  s.edits.push({ start: n.name.getStart(s.sf), end: n.name.getEnd(), text: r.to });
  s.edits.push({ start: n.initializer.getStart(s.sf), end: n.initializer.getEnd(), text: String(r.out) });
}
for (const [file, s] of sources) {
  if (!s.edits.length) continue;
  let text = s.text;
  for (const e of s.edits.sort((a, b) => b.start - a.start)) text = text.slice(0, e.start) + e.text + text.slice(e.end);
  writeFileSync(join(ROOT, file), text);
}
console.log(`num2-speed: wrote ${FIXTURE} and ${[...sources.values()].filter((s) => s.edits.length).length} files`);
