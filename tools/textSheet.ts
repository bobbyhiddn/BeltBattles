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
import { GLOSSARY, RUNE_REMINDER } from "../src/ui/glossary"; // WORDS-1: TAP_NOTES and glossaryText left with the KEYWORDS list (panelWords)
import { shopChip } from "../src/ui/chips";
import { levelLines, levelText } from "../src/screens/build/levels";
import { DORMANT_RUNES, RUNE_LIST, SUSTAIN_RUNE_LIST, isSustainRune } from "../src/sim/runes"; // FLIP-X2: the dormant runes marked
import { DORMANT_ITEMS } from "../src/sim/races/data"; // FLIP-X2: SIFTER, listed and marked
import { runeLine, runeReminder, RUNE_TEXT } from "../src/ui/runeText";
import { RIVALS, RIVAL_IDS } from "../src/sim/rivals";
import { VERSION } from "../src/version"; // TXT-096: the title's version
import { faceBlocks } from "../src/screens/build/faceBlocks"; // WORDS-1 (REQ-BFG-081): the ⓘ KEYWORDS as the panel names them
import { panelWords } from "../src/screens/build/keywords"; // WORDS-1
import { familiesOf, familyNote } from "../src/ui/families"; // WORDS-1: the family tags' tap notes
import { CORE_WORDS, HERO_WORDS } from "../src/ui/glossary"; // WORDS-1: the core list
import { runeTag } from "../src/ui/runeText"; // WORDS-1: LAST STAND's tag
import { setShapes } from "../src/sim/shapes"; // SHAPES-1: BB_SHAPES=1
import { setScaleRigs } from "../src/sim/scale"; // SCALE-2c (REQ-BFG-098): BB_SCALE=1
import { scaleNotes } from "../src/ui/faces"; // SCALE-2c (REQ-BFG-089): the readers' NOTES line (SCALE_RIGS on only)

const NAME_OF = new Map<string, string>(Object.entries(ICON).map(([k, v]) => [v as string, k]));
/** Markup or glyphs as plain text: each private-use icon as [NAME]. */
const plain = (s: string): string => [...icons(s)].map((ch) => (ch.charCodeAt(0) >= ICON_BASE && NAME_OF.has(ch) ? `[${NAME_OF.get(ch)}]` : ch)).join("");
const SUSTAIN_TOUCHED = new Set(["riveter", "shieldwall", ...SUSTAIN_IDS]);

function piece(d: ItemDef, out: string[]): void {
  const o = d.kind === "core" ? { k: 1 } : d.id === "mimic" ? { hero: "furnace" as const } : {};
  const stars = fusible(d.id) ? [1, 2, 3] : [1];
  out.push(`### ${d.name} (${d.id}; ${d.kind}, ${d.rarity}, ${d.price} G)${SUSTAIN_TOUCHED.has(d.id) ? " — SUS-B" : ""}${DORMANT_ITEMS.has(d.id) ? " — DORMANT (FLIP-X2: no source offers it)" : ""}`);
  const chip = shopChip(d.id, o);
  // WORDS-1 (REQ-BFG-081): the family tags in the panel's header, each tappable with its families.ts line
  for (const t of familiesOf(d.id)) out.push(`- family ${t}: tap \`${plain(familyNote(t))}\``);
  out.push(`- shop: chip ${chip ? `\`${plain(chip)}\`` : "none (today's card)"}; card \`${cardText(d.id, o)}\``);
  for (const s of stars) {
    out.push(`- ★${s}`);
    if (hasFace(d.id)) {
      const fl = faceLines(d.id, s, o)!;
      if (fl.stats) out.push(`  - stats: \`${plain(fl.stats)}\``);
      if (fl.stats2) out.push(`  - stats 2: \`${plain(fl.stats2)}\``);
      for (const p of fl.plain ?? []) out.push(`  - plain: \`${plain(p)}\``); // WORDS-1 (REQ-BFG-081): a turret's lines under its stat row
      for (const r of fl.rules) out.push(`  - ability: \`${plain(r.text)}\`${r.label ? ` (brass: \`${plain(r.label)}\`)` : ""}`);
      if (fl.clause) out.push(`  - clause: \`${plain(fl.clause.text)}\``);
      for (const c of fl.caveats ?? []) out.push(`  - caveat: \`${plain(c)}\``);
      const lv = levelLines(d.id, s, o);
      if (lv?.length) out.push(`  - ⓘ LEVELS: ${lv.map((l) => `\`${plain(levelText(l))}\``).join(" · ")}`);
      // the ⓘ KEYWORDS: each word the face names, once, in reading order. WORDS-1 (REQ-BFG-081): read off the panel's own
      // blocks by keywords.ts panelWords (the keywords as drawn, the labels, a tap note, the stat icons, every glossary word a
      // face line prints), so the sheet lists what a tap shows on that card (was a list built here: labels, keywords, note)
      for (const w of panelWords(faceBlocks(d.id, s, o) ?? [], { def: d.id, stars: s, o })) out.push(`  - ⓘ KEYWORDS ${w.word}: \`${plain(w.text)}\``);
      // SCALE-2c (REQ-BFG-089): a scaling piece's count line, its ⓘ NOTES (faces.ts scaleNotes; none with SCALE_RIGS off)
      for (const n of scaleNotes(d.id)) out.push(`  - ⓘ NOTES: \`${plain(n)}\``);
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
  // WORDS-1 (REQ-BFG-081): the core list (glossary.ts CORE_WORDS) and the hero words
  out.push("## Core list (WORDS-1)", "", `- ${CORE_WORDS.join(", ")} (${CORE_WORDS.length} words); hero words: ${Object.entries(HERO_WORDS).map(([w, h]) => `${w} (${h})`).join(", ")}`, "");
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
  for (const r of runes) out.push(`- ${r.name} (${r.id}; ${r.tier}, ${r.theme}; tag ${runeTag(r)}): \`${plain(runeLine(r))}\` — reminder \`${runeReminder(r)}\`${RUNE_TEXT[r.id] ? " — runeText.ts override" : ""}${isSustainRune(r.id) ? " — SUS-D" : ""}${DORMANT_RUNES.has(r.id) ? " — DORMANT (FLIP-X2: no dawn offers it)" : ""}`);
  out.push("", "Rune reminders: " + Object.entries(RUNE_REMINDER).map(([k, v]) => `${k} \`${v}\``).join("; "), "");
  out.push("## Captains", "");
  for (const id of RIVAL_IDS) out.push(`- ${RIVALS[id].name}: trick \`${RIVALS[id].trick}\`, blurb \`${RIVALS[id].blurb}\`${id === "karsk" ? " — SUS-B" : ""}`);
  return out.join("\n") + "\n";
}

if ((process.argv[1] ?? "").endsWith("textSheet.js")) {
  const path = process.argv[2];
  if (!path) throw new Error("usage: node tools/dist/textsheet/textSheet.js <out.md>");
  // SHAPES-1 (REQ-BFG-086, S8): BB_SHAPES=1 makes the sheet with SHAPES on (the three shaped rigs, GANTRY PRESS 2x3, ASSEMBLY
  // LINE I3), as the brief's text-sheet check asks; unset, the sheet is as before
  if (process.env.BB_SHAPES === "1") setShapes(true);
  // SCALE-2c (REQ-BFG-098): BB_SCALE=1 makes the sheet with SCALE_RIGS on (the 12 scaling pieces); unset, as before
  if (process.env.BB_SCALE === "1") setScaleRigs(true);
  const text = sheet();
  writeFileSync(path, text);
  console.log(`text sheet: ${text.split("\n").length} lines -> ${path}`);
}
