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
import { ICON, ICON_BASE, ICON_COLOUR, KEYWORDS, icons, textWidth } from "../src/render/font";
import { faceLines, hasFace } from "../src/ui/faces";
import { abilityText, cardText } from "../src/ui/abilityText";
import { GLOSSARY, GLOSSARY_WRAP_W, RUNE_REMINDER } from "../src/ui/glossary"; // WORDS-1: TAP_NOTES and glossaryText left with the KEYWORDS list (panelWords); ENCHANT-1: GLOSSARY_WRAP_W, the op view's text row
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
import { plainRigsRules, setPlainRigs } from "../src/sim/plainRigs"; // PLAIN-1 (REQ-BFG-084): --plain-rigs
import { setShapes2, shapes2Rules } from "../src/sim/shapes2"; // SHAPES-2 (REQ-BFG-114): --shapes2
import { setScaleRigs } from "../src/sim/scale"; // SCALE-2c (REQ-BFG-098): BB_SCALE=1
import { scaleNotes } from "../src/ui/faces"; // SCALE-2c (REQ-BFG-089): the readers' NOTES line (SCALE_RIGS on only)
import { setGates } from "../src/sim/gates"; // GATES-1 (REQ-BFG-052): --gates
import { splitSheetLines } from "../src/sim/splitPreview"; // GATES-1b (REQ-BFG-057 B2): --gates also lists the drop-to-split tag
import { ENCHANT_DEFS, ENCHANT_IDS, enchantKindOf, enchantProblem, enchantRules, replacesText, sellAskText, setEnchant, type EnchantKind } from "../src/sim/enchant"; // ENCHANT-1 (REQ-BFG-085): --enchant
import { ENCHANT_NOTES, enchantedTitle, wordFace, wordOn } from "../src/ui/enchantFaces"; // ENCHANT-1 (E7): the word cards, the notes, the pieces' words
import { colourize, lineWidth, wrapRich } from "../src/ui/richText"; // ENCHANT-1 (E7): the fit measures
import { rigShape } from "../src/sim/content"; // ENCHANT-1: the refusal reasons' example pieces
import { EXTRA_BELT_LEFT, KEPT_WIDE } from "../src/game/fuse"; // ENCHANT-1 (run 5): WIDE's extra belt, the refusal and the merge toast

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
  // PLAIN-1 (REQ-BFG-084; BRIEF-PLAIN1 P4): with --plain-rigs the six plain stat rigs are on (PLAIN_RIGS), listed after
  // every base piece in catalogue order; without it the sheet is the base's, line for line
  if (plainRigsRules()) out.push("PLAIN-1: PLAIN_RIGS is on (--plain-rigs): the six plain stat rigs are listed after the base's pieces.", "");
  // SHAPES-2 (REQ-BFG-114; BRIEF-SHAPES2 S5): with --shapes2 the six more shaped plain rigs are on (SHAPES2), listed after
  // every other piece in catalogue order; without it the sheet is the base's, line for line
  if (shapes2Rules()) out.push("SHAPES-2: SHAPES2 is on (--shapes2): the six more shaped plain rigs (ELBOW GUARD, SAW BAR, SPARK COMB, CINDER HOOK, JAW CRUSHER, PICKAXE) are listed after the other pieces.", "");
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
  if (enchantRules()) enchantSection(out); // ENCHANT-1 (REQ-BFG-085): with --enchant only; without it the sheet is the base's, line for line
  return out.join("\n") + "\n";
}

// ----------------------------------------------------------------------------------------- ENCHANT-1 (REQ-BFG-085; BRIEF-ENCHANT1 E7)

/** The room each new text is measured against, in art px of the 5x7 face: the op view's tap panel text row (glossary.ts GLOSSARY_WRAP_W: the
 *  402x690 @3 panel is 235 wide) and the desk column's (a 128 px panel less its two 5 px margins); and a title's room beside the panel's icon box
 *  (the panel's width less 23 px for the icon and 4 px for the edge: inspector.ts planIn's subMax with no button beside it). */
const FIT_W = { phone: GLOSSARY_WRAP_W, desk: 118 } as const;
const TITLE_W = { phone: 208, desk: 101 } as const;
const overflows: string[] = [];

/** `n rows` at each view for a text in markup or glyphs, wrapped as the panel wraps it; a row wider than its room is an OVERFLOW (listed at the end). */
function fits(where: string, markup: string, oneLine = false): string {
  const t = icons(markup);
  const parts = (["phone", "desk"] as const).map((v) => {
    const rows = wrapRich(colourize(t, "#FFFFFF"), FIT_W[v], "5"), widest = Math.max(0, ...rows.map((r) => lineWidth(r, "5")));
    const over = widest > FIT_W[v] || (oneLine && v === "phone" && rows.length > 1);
    if (over) overflows.push(`${where} (${v}: ${widest} px of ${FIT_W[v]}${rows.length > 1 ? `, ${rows.length} rows` : ""})`);
    return `${v} ${rows.length} row${rows.length === 1 ? "" : "s"} ${widest} px${over ? " OVERFLOW" : ""}`;
  });
  return parts.join(", ");
}

/** The pieces the words are shown on, one of each kind the allow-list takes: a rig with a stat row, a stamping factory, a turret. */
const WORD_PIECES: [EnchantKind, string][] = [["rig", "whetstone"], ["factory", "press"], ["turret", "scrapcannon"]];

/**
 * ENCHANT-1 (E7; run 3): the eight words as a player reads them, with the switch on. For each word: its own card's tap panel (its name in its
 * colour, its line for each kind it goes on: MASSIVE ONLY ON A TURRET, SWIFT ONLY ON A FACTORY), the NOTES, the REPLACES and SELL? strings; then one enchanted piece of each kind it can go on, at
 * the stars where its numbers move (★1 and ★3; GROWING with and without a grown counter), as the panel draws it (faceBlocks.ts: the stat rows with
 * the word's numbers, the word's line), each text with its rows on the phone and desk and any OVERFLOW; then the refusal reasons. The summary
 * lists every overflow (none expected: the new rows fit both views).
 */
function enchantSection(out: string[]): void {
  out.push("", "## Enchantments (ENCHANT-1, REQ-BFG-085; --enchant)", "");
  out.push("Generated with ENCHANT on. Icons print as [NAME]. Each text's rows are the wrapped rows of the 5x7 face on the op view's 225 px text row and the desk column's 118 px; a row wider than its room, or a stat row that takes a second row on the phone, is an OVERFLOW (listed at the end). Titles are measured against the room beside the icon box (phone 208 px, desk column 101 px): the 5x7 face where it fits, else the 3x5 face, else the name is cut.", "");
  out.push("### The default rules text (NOTES, behind the hover or the tap)", "");
  for (const n of ENCHANT_NOTES) out.push(`- \`${n}\` (${fits("NOTES", n)})`);
  out.push("", "### The word cards (the ENCHANTER's offer and each warlord pick: the icon and the price on the card; the tap panel says this)", "");
  for (const id of ENCHANT_IDS) {
    const f = wordFace(id), d = ENCHANT_DEFS[id];
    out.push(`- **${f.name}** (${id}, code ~${d.code}; colour ${f.color}; stars ${d.scales ? "multiply its numbers" : "change nothing"}; goes on: ${d.kinds.join(", ")})`);
    for (const l of f.lines) out.push(`  - ${l.label}${l.legal ? `: \`${plain(l.text)}\` (${fits(`${f.name} ${l.label}`, l.text)})` : ""}`);
    out.push(`  - ${replacesText(id)} (REPLACES, asked when a new word goes on a piece holding ${f.name}); ${sellAskText(id)} (asked before selling a piece holding it)`);
  }
  out.push("", "### One enchanted piece of each kind a word can go on (panel face: title, stat rows, the word's line)", "");
  const o = { hero: "furnace" as const };
  for (const id of ENCHANT_IDS) {
    for (const [kind, def] of WORD_PIECES) {
      if (!ENCHANT_DEFS[id].kinds.includes(kind)) {
        out.push(`- ${ENCHANT_DEFS[id].name} on a ${kind}: ${enchantProblem(def, id)}`);
        continue;
      }
      const d = ITEMS[def];
      for (const [stars, grow] of id === "growing" ? [[1, 0], [1, 2], [3, 2]] as const : [[1, 0], [3, 0]] as const) {
        const w = wordOn({ ench: id, grow }, d, stars);
        if (!w) throw new Error(`textSheet: no word ${id} on ${def}`);
        const title = enchantedTitle(id, `${d.name}${stars > 1 ? ` ${"★".repeat(stars)}` : ""}`);
        const tw = [textWidth(title), textWidth(title, "3")];
        const titleFit = (["phone", "desk"] as const).map((v) => (tw[0] <= TITLE_W[v] ? "5x7" : tw[1] <= TITLE_W[v] ? "3x5" : "CUT")).join("/");
        out.push(`- ${title} (${kind}${grow ? `; GROWING counter ${grow}` : ""}; title ${tw[0]} px in 5x7, ${tw[1]} in 3x5; phone/desk: ${titleFit})`);
        for (const b of faceBlocks(def, stars, o, w) ?? []) {
          if (b.note) continue; // kind text (a turret's HOLDS line) is NOTES, not the face
          const hued = b.hue ? `; ${b.hue.colour} on number${b.hue.nums.length > 1 ? "s" : ""} ${b.hue.nums.map((n) => n + 1).join(", ")}` : "";
          out.push(`  - ${b.pairs || (!b.brass && !b.colour && /\d/.test(plain(b.text)) && b.text.length < 40) ? "stats" : "line"}: \`${plain(b.text)}\`${b.colour ? ` (${b.colour})` : ""}${hued} (${fits(`${title}: ${plain(b.text)}`, b.text, !!b.pairs)})`);
        }
      }
    }
  }
  out.push("", "### The refusal reasons (a tap on a piece the word cannot go on, in APPLY)", "");
  const first = (pred: (d: ItemDef) => boolean): ItemDef | undefined => Object.values(ITEMS).find(pred);
  const cases: [string, ItemDef | undefined, string][] = [
    ["MASSIVE on a rig", ITEMS.whetstone, "massive"], ["SWIFT on a rig", ITEMS.whetstone, "swift"],
    ["MASSIVE on a factory", ITEMS.press, "massive"], ["SWIFT on a turret", ITEMS.scrapcannon, "swift"], // ENCHANT-1b (N1): each word has one kind
    ["FIERY on a rig that hits no slug", ITEMS.stoker, "fiery"], // ENCHANT-1b (N3): IT HITS NO SLUGS (also RISING, GROWING and ECHOING)
    ["ECHOING on a rig with nothing to double", ITEMS.tollbooth, "echoing"], // ENCHANT-1c (C2): NOTHING TO DOUBLE (13 rigs; FIERY, RISING and GROWING stay legal there)
    ["WIDE on an X rig", first((d) => d.kind === "gate" && rigShape(d) === "X"), "wide"],
    ["a word on gear", first((d) => d.kind === "mod"), "fiery"], ["a word on a core", first((d) => d.kind === "core"), "fiery"], ["a word on a supply", first((d) => d.kind === "supply"), "fiery"],
  ];
  for (const [what, d, word] of cases) {
    const why = d ? enchantProblem(d, word) : null;
    out.push(`- ${what}${d ? ` (${d.name})` : ""}: ${why ? `\`${why}\` (${fits(what, why, true)})` : "no refusal (not in this sheet's catalogue)"}`);
  }
  for (const [what, why] of [["a factory using WIDE's extra belt takes no other word (run 5)", EXTRA_BELT_LEFT], ["a merge keeps WIDE (run 5; a toast)", KEPT_WIDE]] as const) out.push(`- ${what}: \`${why}\` (${fits(what, why, true)})`);
  out.push("", `### Overflows (every new text above, phone and desk): ${overflows.length}`, "");
  for (const x of overflows) out.push(`- ${x}`);
  // every piece a word can go on, every legal word, ★1 and ★3: the title as inspector.ts fitTitle draws it (5x7, else 3x5, else the name is cut
  // with a dot). Informational: a cut title is not a text overflowing its box, but the word first makes the long names longer
  const cut: string[] = [];
  let titles = 0;
  for (const d of Object.values(ITEMS)) {
    const kind = enchantKindOf(d);
    if (!kind || !d.price) continue;
    for (const id of ENCHANT_IDS) {
      if (!ENCHANT_DEFS[id].kinds.includes(kind)) continue;
      for (const stars of fusible(d.id) ? [1, 3] : [1]) {
        const title = enchantedTitle(id, `${d.name}${stars > 1 ? ` ${"★".repeat(stars)}` : ""}`);
        titles++;
        for (const v of ["phone", "desk"] as const) if (textWidth(title) > TITLE_W[v] && textWidth(title, "3") > TITLE_W[v]) cut.push(`${title} (${v}: ${textWidth(title, "3")} px in 3x5 against ${TITLE_W[v]})`);
      }
    }
  }
  out.push("", `### Titles cut (every piece, every legal word, ★1 and ★3: ${titles} titles; the name is cut with a dot where even the 3x5 face is too wide): ${cut.length}`, "");
  for (const x of cut) out.push(`- ${x}`);
}

if ((process.argv[1] ?? "").endsWith("textSheet.js")) {
  const path = process.argv[2];
  if (!path) throw new Error("usage: node tools/dist/textsheet/textSheet.js <out.md> [--plain-rigs] [--shapes2] [--gates] [--enchant] (BB_SHAPES=1, BB_SCALE=1)");
  // SHAPES-1 (REQ-BFG-086, S8): BB_SHAPES=1 makes the sheet with SHAPES on (the three shaped rigs, GANTRY PRESS 2x3, ASSEMBLY
  // LINE I3), as the brief's text-sheet check asks; unset, the sheet is as before
  if (process.env.BB_SHAPES === "1") setShapes(true);
  if (process.argv.includes("--plain-rigs")) setPlainRigs(true); // PLAIN-1 (REQ-BFG-084): the six in ITEMS
  if (process.argv.includes("--shapes2")) setShapes2(true); // SHAPES-2 (REQ-BFG-114): the six more in ITEMS (after PLAIN-1's, when both are on)
  // SCALE-2c (REQ-BFG-098): BB_SCALE=1 makes the sheet with SCALE_RIGS on (the 12 scaling pieces); unset, as before
  if (process.env.BB_SCALE === "1") setScaleRigs(true);
  if (process.argv.includes("--gates")) setGates(true); // GATES-1 (REQ-BFG-052): the three gates in ITEMS (after every other def)
  if (process.argv.includes("--enchant")) setEnchant(true); // ENCHANT-1 (REQ-BFG-085): the eight enchantments' section at the end (the pieces above are as before)
  const text = sheet() + (process.argv.includes("--gates") ? splitSheetLines().join("\n") : ""); // GATES-1b B2: the tag's words, only with --gates
  writeFileSync(path, text);
  console.log(`text sheet: ${text.split("\n").length} lines -> ${path}`);
}
