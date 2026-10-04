// NUM-1 (REQ-BFG-047, N1 section 2.1): the scripted x10 of every DAMAGE-FAMILY value in the rules data. Re-runnable on a
// new base (the release lane rebases this line onto newer tips): run it on an UNSCALED tree and it
//   1. reads every numeric literal of the rules tables below from the source (the TypeScript AST, no evaluation),
//   2. classifies each by its field (RULES: "x10" = damage family, "same" = counts, gold, tiles, %, ratios, time),
//      and STOPS on a numeric field it can't classify (a new field on a new base: add it to RULES first),
//   3. records the base values in tests/fixtures/num1-base-values.json (BEFORE it scales anything),
//   4. writes value x 10 into the source, in place (only the number's text changes: no reformatting).
// Damage family (N1 2.1): damage, flat bonuses, slug bases, hull, plating amounts / thresholds / the cap, burn per second,
// HEAT per second, FRAY per stack, repairs, shields, spall and blasts. A x10 result must be whole: N1's two exceptions
// round half up (ROUNDED below); any other non-whole result stops the script with its name (ask cap).
// Sentinel: FRAY_BONUS is 0.2 on every unscaled base and 2 after the script; on a scaled tree the script refuses to run.
//   node scripts/num1-scale.mjs          scale (records the fixture first)
//   node scripts/num1-scale.mjs --check  dry run: print the counts and the non-whole values; write nothing
// tests/numbers.scale.test.ts checks the result: every x10 value is 10x its recorded base (ROUNDED: the rounded one) and
// every other value is its recorded base; every numeric field in these tables is in the fixture.
import ts from "typescript";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE = "tests/fixtures/num1-base-values.json";
const CHECK = process.argv.includes("--check");

/** N1 2.1 (a): the only two damage-family values not whole at x10, rounded half up. */
export const ROUNDED = {
  "ITEMS.counterweight.levels.3.gate.perTile.each": 18, // 1.75 -> 17.5 -> 18 (+2.9%)
  "WAVE3_ITEMS.anvil.levels.3.core.anvilFlat": 88, // 8.75 -> 87.5 -> 88 (+0.6%)
  "P1_WAVE3_ITEMS.anvil.levels.3.core.anvilFlat": 88, // tools/wave3Defs.ts: the dev pages' copy of the same value
};

// Field rules for a piece's spec (an ItemDef's gate / factory / mod / core / turret / supply, at ★1 or in levels.N),
// by path with array indices as "*". N1's tools/scheme.ts RULES, damage family = "x10", everything else "same".
const X = "x10", S = "same";
const SPEC = {
  // rigs (GateEffect)
  "gate.flat": X, "gate.perPriorGate": X, "gate.lockedFlat": X, "gate.siftFlat": X, "gate.pulse.flat": X, "gate.repair": X,
  "gate.heat": X, "gate.keg.flat": X, "gate.quench.flat": X, "gate.quench.perBurn": X, "gate.perStalled.each": X,
  "gate.perStalled.max": X, "gate.perTile.each": X, "gate.perTile.max": X, "gate.plate": X, "gate.plated.min": X,
  "gate.plated.flat": X, "gate.gauge.flat": X, "gate.gauge.matched": X, "gate.pincer.flat": X, "gate.pincer.each": X,
  "gate.latch.flat": X, "gate.breaker.flat": X, "gate.breaker.floor": X,
  "gate.burn": S, "gate.speed": S, "gate.split.copies": S, "gate.split.mult": S, "gate.priorCap": S, "gate.shockTime": S,
  // SIFTER's siftClean is flat damage when it removes nothing (Battle.applyHit, deck.ts walkRoute add it to flat): N1's
  // scheme.ts listed it as a count, the one correction to N1's table
  "gate.siftClean": X,
  "gate.jump": S, "gate.guard": S, "gate.toll": S, "gate.sift": S, "gate.pulse.speed": S,
  "gate.pulse.on": S, "gate.pulse.period": S, "gate.sort.every": S, "gate.sort.copies": S, "gate.poison": S,
  "gate.overclockCooldown": S, "gate.keg.fuse": S, "gate.keg.burn": S, "gate.burnPerRide.seconds": S,
  "gate.burnPerRide.max": S, "gate.quench.stacks": S, "gate.staticTime": S, "gate.fray": S, "gate.frayCap": S,
  "gate.pincer.max": S, "gate.brace.mul": S, "gate.brace.plated": S, "gate.latch.hold": S, "gate.stoke": S,
  // factories (FactorySpec)
  "factory.base": X, "factory.scrapFlat": X, "factory.round.blast": X, "factory.plate.amount": X,
  "factory.interval": S, "factory.lead": S, "factory.pour": S, "factory.batch": S, "factory.cycle.*.burn": S,
  "factory.cycle.*.shockTime": S, "factory.cycle.*.jump": S, "factory.commission": S, "factory.hotStart": S,
  "factory.intervalMul": S, "factory.round.seconds": S, "factory.round.spread": S, "factory.round.mul": S,
  "factory.round.delay": S, "factory.round.stall": S, "factory.plate.every": S,
  // turret gear (ModSpec)
  "mod.longRideFlat": X, "mod.spall.every": X, "mod.spall.add": X, "mod.spall.max": X, "mod.seam.pair": X, "mod.seam.lone": X,
  "mod.fireMul": S, "mod.longRideMin": S, "mod.perShot": S, "mod.window": S, "mod.windowTime": S, "mod.store": S,
  "mod.intakeGuard": S, "mod.finisher": S, "mod.intercept": S, "mod.rerolls": S, "mod.factoryWeight": S, "mod.pairBonus": S,
  // turret cores (CoreSpec; CORE_ABSOLUTE's damage numbers; perPlate is a ratio of two damage-family numbers, addBurn a count)
  "core.perQueued": X, "core.flatPerBurn": X, "core.volleyFlat": X, "core.perSecond": X, "core.anvilFlat": X,
  "core.perPlate": S, "core.addBurn": S, "core.pellets": S, "core.share": S, "core.windowTime": S, "core.intervalMul": S,
  "core.maxCount": S, "core.start": S, "core.step": S, "core.floor": S, "core.gap": S, "core.hullMul": S, "core.burnTime": S,
  "core.flightMul": S, "core.reloadMul": S, "core.splash": S, "core.rip": S, "core.reach": S, "core.arcs": S, "core.stall": S,
  "core.maxSeconds": S, "core.mult": S, "core.hold": S, "core.columns": S, "core.steamPlated": S, "core.steamBare": S,
  // turrets, supplies, the ItemDef itself
  "turret.fireInterval": S, "turret.window": S, "turret.flight": S, "supply.hull": X, "supply.belt": S, "price": S, "size": S,
};
const AMMO_RULES = { base: X, rideScale: X, fray: S, fixedSpeed: S };
const HERO_RULES = { hull: X, belt: S, "turrets.*.col0": S, "turrets.*.width": S, "turrets.*.connectors.*": S,
  "turrets.*.fireInterval": S, "turrets.*.window": S, "turrets.*.flight": S };

// The tables: file, exported name, how its entries are read. "items": Record<id, ItemDef>; "ammo"; "heroes"; "const": a
// number; "fields": an object of numbers with per-field rules; "runes": RUNE_LIST's r(id, ..., kind, n, text) calls.
const TABLES = [
  { file: "src/sim/content.ts", name: "FRAY_BONUS", kind: "const", rule: X }, // FRAY per stack (0.2 -> 2): the sentinel
  { file: "src/sim/content.ts", name: "ITEMS", kind: "items" },
  { file: "src/sim/content.ts", name: "WAVE3_ITEMS", kind: "items" },
  { file: "src/sim/content.ts", name: "AMMO", kind: "ammo" },
  { file: "src/sim/content.ts", name: "HEROES", kind: "heroes" },
  { file: "src/sim/races/data.ts", name: "RACE_ITEMS", kind: "items" },
  { file: "src/sim/races/data.ts", name: "RACE_AMMO", kind: "ammo" },
  { file: "src/sim/races/data.ts", name: "RACE_HEROES", kind: "heroes" },
  // METRONOME's pendulum curve: floor and swing are damage; the peak and the spread are seconds of ride
  { file: "src/sim/races/data.ts", name: "PENDULUM", kind: "fields", rules: { floor: X, swing: X, peak: S, spread: S } },
  { file: "src/sim/races/bastion.ts", name: "PLATE_PER_SLUG", kind: "const", rule: X }, // plating per bulwark slug
  { file: "src/sim/races/bastion.ts", name: "PLATE_CAP", kind: "const", rule: X }, // the plating cap
  // SIPHON's echo: the flat damage it copies at most; BURN and FRAY are stack counts
  { file: "src/sim/races/siphon.ts", name: "ECHO_CAP", kind: "fields", rules: { flat: X, burn: S, fray: S } },
  { file: "src/sim/runes.ts", name: "RUNE_LIST", kind: "runes" }, // x10 where the amount's unit is dmg, hull or plate
  // the road (src/game): hull is hullBonus's unit. The road events' hull costs and gains ({ k: "hull", n }), SABOTAGE's hull
  // loss, the snapshot's hullBonus bounds (the client's mirror of src/net/snapshot.ts) and the server's HULL TOO WEAK floor
  // (src/net/roadCap.ts's mirror of events.ts blockReason)
  { file: "src/game/eventDefs.ts", name: "EVENTS", kind: "hulldeltas" },
  { file: "src/game/road.ts", name: "SABOTAGE_HULL", kind: "const", rule: X },
  { file: "src/game/ghostSnapshot.ts", name: "HULL_BONUS_MIN", kind: "const", rule: X },
  { file: "src/game/ghostSnapshot.ts", name: "HULL_BONUS_MAX", kind: "const", rule: X },
  { file: "src/net/roadCap.ts", name: "HULL_FLOOR", kind: "const", rule: X },
  // the par player's rating (deckRating.ts): damage-equivalents in damage units, so its choices (relative ratings) stay
  // the same at x10. EQ.perStalled multiplies a scaled damage (perStalled.each): a ratio. MEAN_PLATE: plating held.
  { file: "src/sim/deckRating.ts", name: "EQ", kind: "fields",
    rules: { poison: X, fray: X, shock: X, static: X, perStalled: S, overclock: X, toll: X, sift: X } },
  { file: "src/sim/deckRating.ts", name: "ROUND_EQ", kind: "fields", rules: { sabot: X, frost: X, drag: X, limpet: X } },
  { file: "src/sim/deckRating.ts", name: "MEAN_PLATE", kind: "fields", rules: { bastion: X, furnace: X, weaver: X, foundry: X } },
  { file: "src/sim/deckRating.ts", name: "MEAN_PLATE_OTHER", kind: "const", rule: X },
  // the captains' synergy swaps (harness/synergy.ts): one ARMOR PACK's hull, written as a number
  { file: "src/sim/harness/synergy.ts", name: "PLATE", kind: "const", rule: X },
  // the dev pages' copy of the wave-3 pieces (tests/wave3Art.test.ts checks it equals WAVE3_ITEMS)
  { file: "tools/wave3Defs.ts", name: "P1_WAVE3_ITEMS", kind: "items" },
];
const RUNE_X = new Set(["dmg", "hull", "plate"]);

const fail = (msg) => { console.error(`num1-scale: STOP: ${msg}`); process.exit(1); };
const keyText = (n) => (ts.isIdentifier(n) || ts.isStringLiteral(n) || ts.isNumericLiteral(n) ? n.text : null);
/** A numeric literal (or -literal): its value and text span; else null. */
function num(n) {
  if (ts.isNumericLiteral(n)) return { v: Number(n.text), text: n.text, node: n };
  if (ts.isPrefixUnaryExpression(n) && n.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(n.operand))
    return { v: -Number(n.operand.text), text: "-" + n.operand.text, node: n };
  return null;
}
const unwrap = (n) => { while (n && (ts.isAsExpression(n) || ts.isSatisfiesExpression?.(n) || ts.isParenthesizedExpression(n))) n = n.expression; return n; };

/** Every numeric leaf under object/array literal `n`: { path: string[], lit } (spreads and calls are skipped). */
function leaves(n, path, out) {
  n = unwrap(n);
  const lit = num(n);
  if (lit) { out.push({ path, lit }); return out; }
  if (ts.isObjectLiteralExpression(n)) {
    for (const p of n.properties) {
      if (ts.isPropertyAssignment(p)) {
        const k = keyText(p.name);
        if (k === null) fail(`a computed key at ${path.join(".")}`);
        leaves(p.initializer, [...path, k], out);
      } else if (ts.isShorthandPropertyAssignment(p)) out.push({ path: [...path, p.name.text], ref: true });
    }
  } else if (ts.isArrayLiteralExpression(n)) n.elements.forEach((e, i) => leaves(e, [...path, String(i)], out));
  else if (ts.isIdentifier(n) || ts.isPropertyAccessExpression(n) || ts.isBinaryExpression(n) || ts.isCallExpression(n))
    out.push({ path, ref: true, text: n.getText() }); // not a literal: fine for a "same" field, a STOP for a x10 one
  return out;
}

function ruleFor(table, path) {
  const star = (p) => p.map((s) => (/^\d+$/.test(s) ? "*" : s)).join(".");
  if (table.kind === "items") {
    let rest = path.slice(1); // drop the id
    if (rest[0] === "levels") rest = rest.slice(2); // levels.N.<spec>...
    if (rest[0] === "perk" || rest[0] === "pending") return rest[0] === "perk" ? S : null;
    return SPEC[star(rest)] ?? null;
  }
  if (table.kind === "ammo") return AMMO_RULES[star(path.slice(1))] ?? null;
  if (table.kind === "heroes") return HERO_RULES[star(path.slice(1))] ?? null;
  if (table.kind === "fields") return table.rules[star(path)] ?? null;
  return null;
}

/** Scale `v` by 10, exactly (the literal's decimal text, no float noise). */
function times10(text) {
  const neg = text.startsWith("-"), t = neg ? text.slice(1) : text;
  if (/[eExX_]/.test(t)) fail(`an unusual numeric literal ${text}`);
  const [i, f = ""] = t.split(".");
  const digits = (i + (f[0] ?? "0")).replace(/^0+(?=\d)/, ""), frac = f.slice(1);
  const out = frac ? `${digits}.${frac}` : digits;
  return { v: (neg ? -1 : 1) * Number(out), text: (neg && out !== "0" ? "-" : "") + out };
}

const rows = [], edits = new Map(); // file -> [{start, end, text}]
const sources = new Map();
function src(file) {
  if (!sources.has(file)) {
    const text = readFileSync(join(ROOT, file), "utf8");
    sources.set(file, { text, sf: ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true) });
  }
  return sources.get(file);
}
function exported(file, name) {
  const { sf } = src(file);
  for (const st of sf.statements) {
    if (!ts.isVariableStatement(st)) continue;
    for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name) && d.name.text === name) return unwrap(d.initializer);
  }
  fail(`${file}: no top-level const ${name}`);
}
function record(table, path, lit, rule) {
  const id = [table.name, ...path].join(".");
  if (rule === S) { rows.push({ file: table.file, id, rule, base: lit.v, now: lit.v }); return; }
  let s = times10(lit.text), now = s.v;
  if (!Number.isInteger(now)) {
    if (!(id in ROUNDED)) fail(`${id} = ${lit.text} is not whole at x10 (${s.text}): ask cap (N1 lists only ${Object.keys(ROUNDED).join(", ")})`);
    now = ROUNDED[id];
    if (now !== Math.floor(s.v + 0.5)) fail(`${id}: ROUNDED says ${now}, half up of ${s.text} is ${Math.floor(s.v + 0.5)}`);
    s = { v: now, text: String(now) };
  }
  rows.push({ file: table.file, id, rule, base: lit.v, now, ...(id in ROUNDED ? { rounded: true } : {}) });
  const list = edits.get(table.file) ?? [];
  list.push({ start: lit.node.getStart(), end: lit.node.getEnd(), text: s.text });
  edits.set(table.file, list);
}

// the sentinel: an unscaled base holds FRAY_BONUS = 0.2
const fray = num(exported("src/sim/content.ts", "FRAY_BONUS"));
if (!fray) fail("FRAY_BONUS is not a numeric literal");
if (fray.v !== 0.2) fail(`FRAY_BONUS is ${fray.text}, not 0.2: this tree is already scaled (or changed); run the script on an unscaled base`);

for (const table of TABLES) {
  const init = exported(table.file, table.name);
  if (table.kind === "const") {
    const lit = num(init);
    if (!lit) fail(`${table.name} is not a numeric literal`);
    record(table, [], lit, table.rule);
    continue;
  }
  if (table.kind === "runes") {
    if (!ts.isArrayLiteralExpression(init)) fail("RUNE_LIST is not an array literal");
    const units = exported(table.file, "KIND_UNIT"); // each rune kind's unit (runes.ts KIND_UNIT)
    if (!ts.isObjectLiteralExpression(units)) fail("KIND_UNIT is not an object literal");
    const unitOf = {};
    for (const p of units.properties) if (ts.isPropertyAssignment(p) && ts.isStringLiteral(p.initializer)) unitOf[keyText(p.name)] = p.initializer.text;
    for (const e of init.elements) {
      if (!ts.isCallExpression(e) || e.arguments.length < 7) fail(`RUNE_LIST: an entry that is not r(...): ${e.getText().slice(0, 60)}`);
      const id = keyText(e.arguments[0]), kind = keyText(e.arguments[4]), lit = num(e.arguments[5]);
      const unit = unitOf[kind];
      if (!id || !kind || !lit || !unit) fail(`RUNE_LIST: can't read ${e.getText().slice(0, 60)}`);
      record(table, [id, "amount", "n"], lit, RUNE_X.has(unit) ? X : S);
    }
    continue;
  }
  if (table.kind === "hulldeltas") { // every { k: "hull", n } under EVENTS: EVENTS.<event>.<choice label>.<cost|gain>
    const visit = (n, event, label, side) => {
      if (ts.isObjectLiteralExpression(n)) {
        const props = Object.fromEntries(n.properties.filter(ts.isPropertyAssignment).map((p) => [keyText(p.name), p.initializer]));
        if (props.k && ts.isStringLiteral(props.k) && props.k.text === "hull") {
          const lit = props.n && num(props.n);
          if (!lit || !event || !label || !side) fail(`EVENTS: a hull delta I can't place (${n.getText()})`);
          record(table, [event, label, side, "hull"], lit, X);
          return;
        }
        if (props.label && ts.isStringLiteral(props.label)) label = props.label.text;
        if (props.id && ts.isStringLiteral(props.id) && !event) event = props.id.text;
      }
      if (ts.isPropertyAssignment(n) && ["cost", "gain"].includes(keyText(n.name))) side = keyText(n.name);
      ts.forEachChild(n, (c) => visit(c, event, label, side));
    };
    init.properties.forEach((p) => visit(p, null, null, null));
    continue;
  }
  if (!ts.isObjectLiteralExpression(init)) fail(`${table.name} is not an object literal`);
  for (const leaf of leaves(init, [], [])) {
    const rule = ruleFor(table, leaf.path);
    if (leaf.ref) {
      // a damage-family field may name another scaled value (RACE_AMMO.pendulum.base = PENDULUM.floor): it follows it
      if (rule === X && TABLES.some((t) => (t.kind === "fields" || t.kind === "const") && leaf.text?.startsWith(t.name + "."))) continue;
      if (rule === X) fail(`${table.name}.${leaf.path.join(".")} is a damage-family field but not a literal (${leaf.text ?? "shorthand"})`);
      continue;
    }
    if (!rule) fail(`${table.name}.${leaf.path.join(".")} = ${leaf.lit.text}: a numeric field with no rule (classify it in SPEC)`);
    record(table, leaf.path, leaf.lit, rule);
  }
}

const x10 = rows.filter((r) => r.rule === X), same = rows.filter((r) => r.rule === S);
console.log(`num1-scale: ${rows.length} values: ${x10.length} x10 (${x10.filter((r) => r.rounded).length} rounded half up), ${same.length} unchanged`);
for (const [file, list] of edits) console.log(`  ${file}: ${list.length} edits`);
if (process.argv.includes("--list")) for (const r of x10) console.log(`  x10 ${r.id} ${r.base} -> ${r.now}${r.rounded ? " (half up)" : ""}`);
if (CHECK) process.exit(0);

// 1. the base values, before anything is scaled
const fixture = {
  note: "NUM-1 (REQ-BFG-047): the base's values, recorded by scripts/num1-scale.mjs before it scaled them. rule x10: now = 10 x base (rounded: half up); same: now = base. tests/numbers.scale.test.ts checks the live values against `now`.",
  sentinel: { FRAY_BONUS: 0.2 },
  rounded: ROUNDED,
  // the field rules, so the checker can tell a new damage-family field (it must be in `values`) from a computed or
  // helper-built unchanged one (a turret helper's price, STEAM BREECH's 1 / 1.35: not literals, never scaled)
  rules: { spec: SPEC, ammo: AMMO_RULES, heroes: HERO_RULES },
  values: rows,
};
writeFileSync(join(ROOT, FIXTURE), JSON.stringify(fixture, null, 1) + "\n");
// 2. the x10, in place, last edit first
for (const [file, list] of edits) {
  let text = src(file).text;
  for (const e of [...list].sort((a, b) => b.start - a.start)) text = text.slice(0, e.start) + e.text + text.slice(e.end);
  writeFileSync(join(ROOT, file), text);
}
console.log(`num1-scale: wrote ${FIXTURE} and scaled ${edits.size} files`);
