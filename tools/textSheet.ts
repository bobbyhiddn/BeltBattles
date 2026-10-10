// SUS-B (REQ-BFG-069, REQ-BFG-070): THE TEXT SHEET, regenerated. Every piece's player text at each star, as the faces and
// the kept texts hold it (src/ui/faces.ts, abilityText.ts, glossary.ts, chips.ts, screens/build/levels.ts): the stat rows,
// the ability lines (a brass label in [brackets] is not drawn: the label is the line's first words), the interim clause and
// caveats, the shop chip and card line, the ⓘ view's LEVELS (the current star's value [marked]) and KEYWORDS (what a tap
// on each word shows); for a piece without a face, its kept sentences. Then the glossary, the runes and the captains. The
// sustain pieces (WARD BELL, MEND PRESS, MENDING LOOM) are shown with the switch on (withSustain), as they ship since
// release X (FLIP-X2). Icons print as [NAME]; ♥ and ★ as themselves. Display only; it writes one markdown file. TXT-096
// (REQ-BFG-046; REVIEW-Y7B2 section 7): the title names the game's VERSION and RULES_VERSION (was "FLIP-X2 on x2").
//   npx vite build --ssr tools/textSheet.ts --outDir tools/dist/textsheet --emptyOutDir --logLevel warn
//   node tools/dist/textsheet/textSheet.js <out.md>
import { writeFileSync } from "node:fs";
import { HEROES, ITEMS, RULES_VERSION, SUSTAIN_IDS, buyableModules, withSustain, type ItemDef } from "../src/sim/content";
import { fusible } from "../src/sim/stars";
import { ICON, ICON_BASE, ICON_COLOUR, KEYWORDS, icons } from "../src/render/font";
import { faceLines, hasFace } from "../src/ui/faces";
import { abilityText, cardText } from "../src/ui/abilityText";
import { GLOSSARY, RUNE_REMINDER, TAP_NOTES, glossaryText } from "../src/ui/glossary";
import { shopChip } from "../src/ui/chips";
import { levelLines, levelText } from "../src/screens/build/levels";
import { DORMANT_RUNES, RUNE_LIST, SUSTAIN_RUNE_LIST, isSustainRune } from "../src/sim/runes"; // FLIP-X2: the dormant runes marked
import { DORMANT_ITEMS } from "../src/sim/races/data"; // FLIP-X2: SIFTER, listed and marked
import { runeLine, runeReminder, RUNE_TEXT } from "../src/ui/runeText";
import { RIVALS, RIVAL_IDS } from "../src/sim/rivals";
import { VERSION } from "../src/version"; // TXT-096: the title's version
import { plainRigsRules, setPlainRigs } from "../src/sim/plainRigs"; // PLAIN-1 (REQ-BFG-084): --plain-rigs

const NAME_OF = new Map<string, string>(Object.entries(ICON).map(([k, v]) => [v as string, k]));
/** Markup or glyphs as plain text: each private-use icon as [NAME]. */
const plain = (s: string): string => [...icons(s)].map((ch) => (ch.charCodeAt(0) >= ICON_BASE && NAME_OF.has(ch) ? `[${NAME_OF.get(ch)}]` : ch)).join("");
const TRIGGERS = ["HIT", "SHOT", "LOAD", "EVERY"];
const SUSTAIN_TOUCHED = new Set(["riveter", "shieldwall", ...SUSTAIN_IDS]);

function piece(d: ItemDef, out: string[]): void {
  const o = d.kind === "core" ? { k: 1 } : d.id === "mimic" ? { hero: "furnace" as const } : {};
  const stars = fusible(d.id) ? [1, 2, 3] : [1];
  out.push(`### ${d.name} (${d.id}; ${d.kind}, ${d.rarity}, ${d.price} G)${SUSTAIN_TOUCHED.has(d.id) ? " — SUS-B" : ""}${DORMANT_ITEMS.has(d.id) ? " — DORMANT (FLIP-X2: no source offers it)" : ""}`);
  const chip = shopChip(d.id, o);
  out.push(`- shop: chip ${chip ? `\`${plain(chip)}\`` : "none (today's card)"}; card \`${cardText(d.id, o)}\``);
  for (const s of stars) {
    out.push(`- ★${s}`);
    if (hasFace(d.id)) {
      const fl = faceLines(d.id, s, o)!;
      if (fl.stats) out.push(`  - stats: \`${plain(fl.stats)}\``);
      if (fl.stats2) out.push(`  - stats 2: \`${plain(fl.stats2)}\``);
      for (const r of fl.rules) out.push(`  - ability: \`${plain(r.text)}\`${r.label ? ` (brass: \`${plain(r.label)}\`)` : ""}`);
      if (fl.clause) out.push(`  - clause: \`${plain(fl.clause.text)}\``);
      for (const c of fl.caveats ?? []) out.push(`  - caveat: \`${plain(c)}\``);
      const lv = levelLines(d.id, s, o);
      if (lv?.length) out.push(`  - ⓘ LEVELS: ${lv.map((l) => `\`${plain(levelText(l))}\``).join(" · ")}`);
      // the ⓘ KEYWORDS: each word the face names, once, in reading order (keywords.ts: keywords as drawn, the labels, a note)
      const said = [...fl.rules.map((r) => r.text), fl.clause?.text ?? ""].join(" ");
      const words: string[] = [];
      for (const r of fl.rules) { const w = r.label?.split(/[ :]/)[0]; if (w && TRIGGERS.includes(w) && !words.includes(w)) words.push(w); }
      for (const k of KEYWORDS) if (said.includes(ICON[k]) && !words.includes(k)) words.push(k);
      const note = TAP_NOTES[d.id];
      if (note && !words.includes(note.word)) words.push(note.word);
      for (const w of words) out.push(`  - ⓘ KEYWORDS ${w}: \`${plain(glossaryText(w, { def: d.id, stars: s, o }) ?? "")}\``);
    } else {
      const at = abilityText(d.id, s, o);
      out.push(`  - kept text: ${at.sentences.map((t) => `\`${t}\``).join(" ")}${at.perk ? ` (perk ★${at.perk.stars} ${at.perk.name})` : ""}`);
    }
  }
}

function sheet(): string {
  const out: string[] = [];
  // TXT-096: the game's version and its rules string (was "FLIP-X2 on x2", the build FLIP-X2 checked)
  out.push(`# BeltBattles text sheet (${VERSION}; rules ${RULES_VERSION})`, "");
  // the sustain pieces and runes are on since release X (FLIP-X2); the dormant pieces and runes are listed in their places,
  // marked DORMANT
  out.push("Generated by tools/textSheet.ts. Icons print as [NAME]. The sustain pieces and runes are on (release X). Dormant pieces and runes (no source offers them) are listed, marked DORMANT.", "");
  // PLAIN-1 (REQ-BFG-084; BRIEF-PLAIN1 P4): with --plain-rigs the six plain stat rigs are on (PLAIN_RIGS), listed after
  // every base piece in catalogue order; without it the sheet is the base's, line for line
  if (plainRigsRules()) out.push("PLAIN-1: PLAIN_RIGS is on (--plain-rigs): the six plain stat rigs are listed after the base's pieces.", "");
  out.push("## Keywords", "");
  for (const k of KEYWORDS) out.push(`- ${k}: U+${ICON[k].charCodeAt(0).toString(16).toUpperCase()}, colour ${ICON_COLOUR[ICON[k]]}`);
  out.push("", "## Glossary rows (what a tap shows, no piece)", "");
  for (const r of GLOSSARY) out.push(`- **${r.word}**${r.aliases.length ? ` (${r.aliases.join(", ")})` : ""} [${r.scope}]: \`${plain(r.def)}\``);
  out.push("", "## Pieces", "");
  withSustain(() => {
    // FLIP-X2: the buyable modules and the dormant ones (DORMANT_ITEMS: SIFTER), in catalogue order, the dormant marked
    const mods = Object.values(ITEMS).filter((d) => !!d.merchant && d.price > 0 && d.kind !== "supply" && (buyableModules().includes(d) || DORMANT_ITEMS.has(d.id)));
    const supplies = Object.values(ITEMS).filter((d) => d.kind === "supply" && d.price > 0);
    const signature = Object.values(HEROES).map((h) => ITEMS[h.factory]).filter((d, i, a) => d && a.indexOf(d) === i);
    for (const d of [...mods, ...supplies, ...signature]) { piece(d, out); out.push(""); }
  });
  out.push("## Runes", "");
  // FLIP-X1 (F-d, SUS-D §9): the runes with the switch on, as the pieces: RUNE_LIST's 57, then SUS-D's 8 (runeList())
  // FLIP-X2 (REVIEW-TUNEX answers 2-4): the same 65 in the same order, a dormant one (DORMANT_RUNES) marked; TXT-096: none
  // is dormant since BAL-2 (DORMANT_RUNES is empty; was "the 4 dormant ones"), so no rune line carries the mark today
  const runes = [...RUNE_LIST, ...SUSTAIN_RUNE_LIST];
  for (const r of runes) out.push(`- ${r.name} (${r.id}; ${r.tier}, ${r.theme}): \`${plain(runeLine(r))}\` — reminder \`${runeReminder(r)}\`${RUNE_TEXT[r.id] ? " — SUS-B" : ""}${isSustainRune(r.id) ? " — SUS-D" : ""}${DORMANT_RUNES.has(r.id) ? " — DORMANT (FLIP-X2: no dawn offers it)" : ""}`);
  out.push("", "Rune reminders: " + Object.entries(RUNE_REMINDER).map(([k, v]) => `${k} \`${v}\``).join("; "), "");
  out.push("## Captains", "");
  for (const id of RIVAL_IDS) out.push(`- ${RIVALS[id].name}: trick \`${RIVALS[id].trick}\`, blurb \`${RIVALS[id].blurb}\`${id === "karsk" ? " — SUS-B" : ""}`);
  return out.join("\n") + "\n";
}

if ((process.argv[1] ?? "").endsWith("textSheet.js")) {
  const path = process.argv[2];
  if (!path) throw new Error("usage: node tools/dist/textsheet/textSheet.js <out.md> [--plain-rigs]");
  if (process.argv.includes("--plain-rigs")) setPlainRigs(true); // PLAIN-1 (REQ-BFG-084): the six in ITEMS
  const text = sheet();
  writeFileSync(path, text);
  console.log(`text sheet: ${text.split("\n").length} lines -> ${path}`);
}
