// HITMARK-1E (REQ-BFG-100, C7; BRIEF-HITMARK1E step 5) off-identity tool, not shipped: every glyph in font.ts's two tables, each key
// at each size, one line each: the face, the key (a character, or U+XXXX for a private-use icon), its name where it has one, its
// bitmap rows and the first 16 hex of the rows' sha256. Rows are sorted by face then key. Run at the base (a temp git worktree at
// 6645b6184db1) and at the tip, then diff: only ICON.CRACK's two lines (5x7 and 3x5) may differ. It imports only what the base has,
// so it builds at the base too (it is copied in there; nothing of the tip's is needed).
// Build: npx vite build --ssr scripts/hitmark1e/sigs.ts --outDir <W>/tmp/hitmark1e-sigs-<tag> --emptyOutDir --logLevel warn
// Run:   node <W>/tmp/hitmark1e-sigs-<tag>/sigs.js <out file>
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { ICON, faceChars, glyphRows, type FontId } from "../../src/render/font";

const OUT = process.argv[2] ?? "glyph-sigs.txt";
const h = (s: string): string => createHash("sha256").update(s).digest("hex").slice(0, 16);

const NAMES: Record<number, string> = {};
for (const [k, v] of Object.entries(ICON)) NAMES[v.charCodeAt(0)] = k;
NAMES[ICON.POISON.charCodeAt(0)] = "POISON";
NAMES[ICON.CRACK.charCodeAt(0)] = "CRACK";

const lines: string[] = [];
for (const font of ["5", "3"] as FontId[]) {
  const keys = faceChars(font).sort((a, b) => (a.codePointAt(0)! - b.codePointAt(0)!));
  for (const ch of keys) {
    const rows = glyphRows(ch, font)!.join("|"), cp = ch.codePointAt(0)!;
    const key = cp >= 0xe000 && cp < 0xf900 ? `U+${cp.toString(16).toUpperCase()}` : `'${ch}' U+${cp.toString(16).toUpperCase().padStart(4, "0")}`;
    lines.push(`${font === "5" ? "5x7" : "3x5"} ${key}${NAMES[cp] ? ` ${NAMES[cp]}` : ""} ${rows} ${h(rows)}`);
  }
}
writeFileSync(OUT, lines.join("\n") + "\n");
const per = (f: string): number => lines.filter((l) => l.startsWith(f)).length;
console.log(`${OUT}: ${lines.length} glyph rows (5x7 ${per("5x7")}, 3x5 ${per("3x5")})`);
