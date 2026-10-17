// HITMARK-1E (REQ-BFG-100, C7; BRIEF-HITMARK1E step 2) design aid, not shipped: the variants of a drawing, up to K flipped pixels
// away, that clear the distance rules every font icon is held to (tests/icons.test.ts: at least TEXT px from every letter and
// digit, PUNCT from every punctuation glyph, ICON from every other icon; 5x7: 6 / 4 / 4, 3x5: 3 / 2 / 2), best margin first.
// ICON.CRACK itself is not a neighbour (it is the glyph being drawn). With no K it prints only the target's own numbers.
// Build: npx vite build --ssr scripts/hitmark1e/near.ts --outDir <W>/tmp/hitmark1e-near --emptyOutDir --logLevel warn
// Run:   node <W>/tmp/hitmark1e-near/near.js "<rows joined with |>" [K flips, default 0] [top N, default 12]
import { ICON, faceChars, glyphRows, type FontId } from "../../src/render/font";

const target = (process.argv[2] ?? "").split("|");
const K = Number(process.argv[3] ?? 0), TOP = Number(process.argv[4] ?? 12);
const font: FontId = target[0].length === 5 ? "5" : "3";
const RULE = font === "5" ? { text: 6, punct: 4, icon: 4 } : { text: 3, punct: 2, icon: 2 };

function dist(a: string[], b: string[]): number {
  if (a[0].length < b[0].length) [a, b] = [b, a];
  const wa = a[0].length, wb = b[0].length;
  let best = Infinity;
  for (let off = 0; off <= wa - wb; off++) {
    let d = 0;
    for (let y = 0; y < a.length; y++) {
      const pb = ".".repeat(off) + b[y] + ".".repeat(wa - wb - off);
      for (let x = 0; x < wa; x++) if (a[y][x] !== pb[x]) d++;
    }
    best = Math.min(best, d);
  }
  return best;
}

const NAMES: Record<string, string> = {};
for (const [k, v] of Object.entries(ICON)) NAMES[v] = k;
NAMES[ICON.POISON] = "POISON";
const others = faceChars(font).filter((ch) => ch !== " " && ch !== ICON.CRACK).map((ch) => ({ ch, name: NAMES[ch] ?? ch, rows: glyphRows(ch, font)! }));
const isIcon = (ch: string): boolean => ch.charCodeAt(0) >= 0xe000 || ch === "♥" || ch === "★";

/** The target's numbers: the smallest slack over the rules (negative: it fails), and the nearest glyph that sets it. */
function judge(rows: string[]): { slack: number; why: string; nearest: string } {
  let slack = Infinity, why = "", near = Infinity, nearName = "";
  for (const o of others) {
    const d = dist(rows, o.rows);
    const need = /^[A-Z0-9]$/.test(o.ch) ? RULE.text : isIcon(o.ch) ? RULE.icon : RULE.punct;
    if (d - need < slack) { slack = d - need; why = `${o.name} ${d} (needs ${need})`; }
    if (d < near) { near = d; nearName = `${o.name} ${d}`; }
  }
  return { slack, why, nearest: nearName };
}

const t = judge(target);
console.log(`${font === "5" ? "5x7" : "3x5"} [${target.join("|")}] ink ${target.join("").replace(/[^#]/g, "").length}: slack ${t.slack} (tightest ${t.why}); nearest ${t.nearest}`);
if (K > 0) {
  const w = target[0].length, h = target.length, n = w * h;
  const flat = target.join("").split("");
  const out: { s: string; flips: number; slack: number; why: string }[] = [];
  const rec = (start: number, left: number, cur: string[], flips: number): void => {
    const rows: string[] = [];
    for (let y = 0; y < h; y++) rows.push(cur.slice(y * w, (y + 1) * w).join(""));
    if (flips > 0 && rows.some((r) => r.includes("#"))) {
      const j = judge(rows);
      if (j.slack >= 0) out.push({ s: rows.join("|"), flips, slack: j.slack, why: j.why });
    }
    if (left === 0) return;
    for (let i = start; i < n; i++) {
      cur[i] = cur[i] === "#" ? "." : "#";
      rec(i + 1, left - 1, cur, flips + 1);
      cur[i] = cur[i] === "#" ? "." : "#";
    }
  };
  rec(0, K, flat, 0);
  out.sort((a, b) => b.slack - a.slack || a.flips - b.flips);
  console.log(`${out.length} variants within ${K} flips clear every rule; best ${TOP}:`);
  for (const o of out.slice(0, TOP)) console.log(`  [${o.s}] flips ${o.flips}, slack ${o.slack} (tightest ${o.why})`);
}
