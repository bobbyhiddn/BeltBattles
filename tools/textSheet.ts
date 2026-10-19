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
import { fusible, gradeOf, isSignatureFactory, starsOf } from "../src/sim/stars"; // ENCHANT-2 (T4): the rivals' pieces' stars and grades
import { ICON, ICON_BASE, ICON_COLOUR, KEYWORDS, icons, textWidth } from "../src/render/font";
import { faceLines, hasFace } from "../src/ui/faces";
import { abilityText, cardText } from "../src/ui/abilityText";
import { GLOSSARY, GLOSSARY_WRAP_W, RUNE_REMINDER } from "../src/ui/glossary"; // WORDS-1: TAP_NOTES and glossaryText left with the KEYWORDS list (panelWords); ENCHANT-1: GLOSSARY_WRAP_W, the op view's text row
import { shopChip } from "../src/ui/chips";
import { levelLines, levelText } from "../src/screens/build/levels";
import { DORMANT_RUNES, RUNE_LIST, SUSTAIN_RUNE_LIST, isSustainRune } from "../src/sim/runes"; // FLIP-X2: the dormant runes marked
import { DORMANT_ITEMS } from "../src/sim/races/data"; // FLIP-X2: SIFTER, listed and marked
import { runeLine, runeReminder, RUNE_TEXT } from "../src/ui/runeText";
import { RIVALS, RIVAL_IDS, rivalBuild } from "../src/sim/rivals"; // ENCHANT-2 (T4): rivalBuild, the rivals' enchanted pieces
import { VERSION } from "../src/version"; // TXT-096: the title's version
import { faceBlocks } from "../src/screens/build/faceBlocks"; // WORDS-1 (REQ-BFG-081): the ⓘ KEYWORDS as the panel names them
import { panelWords } from "../src/screens/build/keywords"; // WORDS-1
import { familiesOf, familyNote } from "../src/ui/families"; // WORDS-1: the family tags' tap notes
import { CORE_WORDS, HERO_WORDS } from "../src/ui/glossary"; // WORDS-1: the core list
import { runeTag } from "../src/ui/runeText"; // WORDS-1: LAST STAND's tag
import { setShapes } from "../src/sim/shapes"; // SHAPES-1: BB_SHAPES=1
import { plainRigsRules, setPlainRigs } from "../src/sim/plainRigs"; // PLAIN-1 (REQ-BFG-084): --plain-rigs
import { setShapes2, shapes2Rules } from "../src/sim/shapes2"; // SHAPES-2 (REQ-BFG-114): --shapes2
import { ENCHANT_DEFS, ENCHANT_IDS, enchantKindOf, enchantProblem, enchantRules, replacesText, sellAskText, setEnchant, type EnchantId, type EnchantKind } from "../src/sim/enchant"; // ENCHANT-1 (REQ-BFG-085): --enchant
import { turretSlots } from "../src/sim/deck"; // ENCHANT-2 (T4): the rivals' installed turrets
import { ENCHANT_NOTES, enchantedTitle, partNotes, pieceLine, wordFace, wordOn } from "../src/ui/enchantFaces"; // ENCHANT-1 (E7): the word cards, the notes, the pieces' words
import { colourize, lineWidth, wrapRich } from "../src/ui/richText"; // ENCHANT-1 (E7): the fit measures
import { rigShape } from "../src/sim/content"; // ENCHANT-1: the refusal reasons' example pieces
import { EXTRA_BELT_LEFT, KEPT_WIDE } from "../src/game/fuse"; // ENCHANT-1 (run 5): WIDE's extra belt, the refusal and the merge toast
import { newRun, type Run } from "../src/game/run"; // ENCHANT-2 (T4): the ASH SHRINE's cards, made on a real run
import { makeEvent } from "../src/game/events"; // ENCHANT-2 (T4)
import type { Choice, Delta, EventState } from "../src/game/eventDefs"; // ENCHANT-2 (T4)
import { SHRINE_ID, SHRINE_NO_TAKER, shrineChoices } from "../src/game/shrine"; // ENCHANT-2 (T3): the cards and the reason a card is blocked
import { warlordDropTable } from "../src/game/road"; // ENCHANT-2 (T2): a rival's drop table, its lines carrying the word
import { cardNote, choiceLabel, deltaIcon, deltaText, itemName } from "../src/screens/event/cards"; // ENCHANT-2 (T3): the card's strings and the widths its chips take
import { eventLayout } from "../src/screens/event/layout"; // ENCHANT-2 (T3): the card widths the event screen lays out
import { wordInfoRows } from "../src/screens/event/wordInfo"; // ENCHANT-2 (T3): the word card behind a card's `?`
import { cutName, dropCardText, dropListHeader, dropListText, dropWord, fitWordName, NO_DROP } from "../src/screens/fork/drops"; // ENCHANT-2 (T2): the drop list and the victory card
import { dropClass, pctText, type DropLine } from "../src/sim/npcDay"; // ENCHANT-2 (T2)
import { hasGrid, shapeGridSize } from "../src/ui/shapePic"; // ENCHANT-2 (T3): a shaped part's plate takes room on a card

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
  // ENCHANT-2 (REQ-BFG-085; T4b): a PART's NOTES line 1 by word (enchantFaces.ts partNotes: the second sentence says where the numbers above the word's line come
  // from); the four lines above are the word CARD's. Lines 2-4 of a part's NOTES are the four lines above.
  out.push("", "### A part's NOTES line 1, by word (T4b; the word cards keep the lines above)", "");
  for (const id of ENCHANT_IDS) out.push(`- ${ENCHANT_DEFS[id].name}: \`${partNotes(id)[0]}\` (${fits(`NOTES line 1 (${ENCHANT_DEFS[id].name})`, partNotes(id)[0])})`);
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
  // ENCHANT-2 (REQ-BFG-085; BRIEF-ENCHANT2 T4): the rivals' own words (npcWords.ts, T1) as the FOE's face reads them (VIEW BATTLEFIELD and the scouted foe: faceText on the
  // foe's build). Day 12: all three words are live. Each enchanted piece of each captain's warlord deck: its title (the word first) and the word's line at THIS piece's
  // stars (a signature factory reads its FACTORY level), each line with its rows on the phone and desk, and any OVERFLOW (counted in the summary below)
  out.push("", "### A rival's enchanted pieces (ENCHANT-2 T4; day 12, all three words live: the foe's face in VIEW BATTLEFIELD and the scouted foe)", "");
  for (const id of RIVAL_IDS) {
    const b = rivalBuild(id, 12);
    const held: { def: string; word: EnchantId; grade: number; stars: number }[] = [
      ...b.items.filter((p) => p.ench !== undefined).map((p) => ({ def: p.def, word: p.ench as EnchantId, grade: gradeOf(b, p), stars: isSignatureFactory(p.def) ? 1 : starsOf(p) })),
      ...turretSlots(b).filter((s) => s.turret?.ench !== undefined).map((s) => ({ def: s.turret!.def, word: s.turret!.ench as EnchantId, grade: starsOf(s.turret!), stars: starsOf(s.turret!) })),
    ];
    out.push(`- ${RIVALS[id].name} (${id}):${held.length ? "" : " (no word)"}`);
    for (const h of held) {
      const d = ITEMS[h.def], kind = enchantKindOf(d)!, title = enchantedTitle(h.word, `${d.name}${h.stars > 1 ? ` ${"★".repeat(h.stars)}` : ""}`);
      const tw = [textWidth(title), textWidth(title, "3")];
      const titleFit = (["phone", "desk"] as const).map((v) => (tw[0] <= TITLE_W[v] ? "5x7" : tw[1] <= TITLE_W[v] ? "3x5" : "CUT")).join("/");
      const line = pieceLine(h.word, kind, h.grade, 12)!; // ENCHANT-2 (T6 fix round): the line on the foe's day, 12: RISING's amount is the day's (enchantFaces.ts wordLine)
      out.push(`  - ${title} (${kind}; title ${tw[0]} px in 5x7, ${tw[1]} in 3x5; phone/desk: ${titleFit}): \`${plain(line)}\` (${fits(`${RIVALS[id].name}: ${title}`, line)})`);
    }
  }
  // ENCHANT-2 (REQ-BFG-085; BRIEF-ENCHANT2 T4): the ASH SHRINE's cards (T3) and the drop lines (T2), read off the game's own functions, each text measured against the
  // room its screen gives it; any text wider than its room joins the overflows counted in the summary below
  withCanvasStub(() => {
    shrineCardsSection(out);
    dropLinesSection(out);
  });
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

// ----------------------------------------------------------------------------------------- ENCHANT-2 (REQ-BFG-085; BRIEF-ENCHANT2 T4): the ASH SHRINE's cards and the drop lines

/** Node has no canvas, and a card's chips take their icons' widths (cards.ts chipWidth): the sprite builders get a canvas that holds a size and draws nothing. */
function withCanvasStub<T>(fn: () => T): T {
  const host = globalThis as unknown as { document?: unknown };
  const had = host.document;
  const ctx: unknown = new Proxy(function () { /* draws nothing */ }, { get: () => ctx, apply: () => ctx, set: () => true });
  host.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
  try {
    return fn();
  } finally {
    if (had === undefined) delete host.document;
    else host.document = had;
  }
}

/** `px` of `room` art px for one text of a card, a list row or the victory card; wider than its room is an OVERFLOW (listed in the summary below). */
function pxFit(where: string, px: number, room: number): string {
  const over = px > room;
  if (over) overflows.push(`${where} (${px} px of ${room})`);
  return `${px} of ${room} px${over ? " OVERFLOW" : ""}`;
}

/** The event screen's layouts the sheet measures: the two real viewports (the screen's integer scale 2 on a 1280x800 desk and on a 402x690 phone) and the narrowest layouts
 *  (3 cards of 138 px on a desk, one of 182 on a phone: the pins of tests/enchant2.shrine.cards.test.ts). */
const EVENT_VIEWS: readonly { name: string; W: number; H: number; portrait: boolean }[] = [
  { name: "desk 1280x800", W: 640, H: 400, portrait: false },
  { name: "narrowest desk", W: 440, H: 250, portrait: false },
  { name: "phone 402x690", W: 201, H: 345, portrait: true },
  { name: "narrowest phone", W: 190, H: 330, portrait: true },
];
const SHRINE_SEED = 4242, SHRINE_DAY = 4;

/** The shrine on `day` of a fresh FURNACE run holding `cargo` in cargo: the run and the event its cards are made from (tests/enchant2.shrine.test.ts atShrine's form). */
function shrineAt(cargo: string[], day: number): { run: Run; ev: EventState } {
  const run = newRun("furnace", SHRINE_SEED);
  run.day = day;
  for (const def of cargo) run.inventory.push({ uid: run.nextUid++, def });
  return { run, ev: makeEvent(SHRINE_SEED, day, SHRINE_ID) };
}

/** cards.ts chipWidth: a chip is its icon, 2 px and its text, then 5 px; a part's chip is its icon alone when `bare`. */
const chipW = (d: Delta, cost: boolean, day: number, bare: boolean): number => {
  const text = bare && d.k === "item" ? "" : deltaText(d, cost, day), icon = deltaIcon(d).width;
  return (text ? icon + 2 + textWidth(text, "3") : icon) + 5;
};
/** cards.ts exchange's `need`: the cost chips (or FREE and 4 px), the arrow's 7 px, the gain chips (NOTHING's own width where there is no gain: it is drawn, not counted there). */
const exchangeNeed = (c: Choice, day: number, bare: boolean): number =>
  (c.cost.length ? c.cost.reduce((n, d) => n + chipW(d, true, day, bare), 0) : textWidth("FREE", "3") + 4) + 7
  + (c.gain.length ? c.gain.reduce((n, d) => n + chipW(d, false, day, false), 0) : textWidth("NOTHING", "3") + 5);
/** The exchange line as text: the cost chips (a part as [icon] when `bare`) or FREE, the arrow, the gain chips or NOTHING. */
const exchangeText = (c: Choice, day: number, bare: boolean): string =>
  `${c.cost.length ? c.cost.map((d) => (bare && d.k === "item" ? "[icon]" : deltaText(d, true, day))).join(" ") : "FREE"} → ${c.gain.length ? c.gain.map((d) => deltaText(d, false, day)).join(" ") : "NOTHING"}`;

/** How the exchange line sits on a card `cw` px wide (cards.ts exchange): its room (the card less 10 px, and a shaped part's plate), what the whole line takes, what it takes
 *  when a card that gains a word draws its part as an icon alone (`bare`, as exchange decides it: the whole line wider than the room). */
function exchangeFit(c: Choice, day: number, cw: number): { whole: number; used: number; room: number; bare: boolean } {
  const shaped = [...c.gain, ...c.cost].find((d): d is Extract<Delta, { k: "item" }> => d.k === "item" && hasGrid(d.def));
  const room = cw - 10 - (shaped ? shapeGridSize(shaped.def).w + 2 + 4 : 0);
  const need = exchangeNeed(c, day, false), bare = c.gain.some((d) => d.k === "ench") && need > room;
  return { whole: need - 5, used: (bare ? exchangeNeed(c, day, true) : need) - 5, room, bare };
}

/** One card as a sheet line: its label (5x7, to the `?` button where it has one), its exchange line (3x5) and its note (3x5). */
function cardRow(where: string, c: Choice, i: number, cw: number, day: number): string {
  const word = c.gain.some((d) => d.k === "ench"), f = exchangeFit(c, day, cw);
  const label = choiceLabel(c.label), note = cardNote(c), at = `${where}, card ${i + 1}`;
  return `  - card ${i + 1}: label \`${label}\` (${pxFit(`${at} label`, textWidth(label, "5"), cw - 16 - (word ? 14 : 4))}); exchange \`${exchangeText(c, day, f.bare)}\` (${pxFit(`${at} exchange`, f.used, f.room)}${f.bare ? `; the whole line would take ${f.whole}: the part is its icon alone` : ""}); ${note ? `note \`${note}\` (${pxFit(`${at} note`, textWidth(note, "3"), cw - 10)})` : "no note"}`;
}

/**
 * ENCHANT-2 (REQ-BFG-085; T3): the ASH SHRINE's cards as the event screen draws them. The cards are the game's own (game/shrine.ts shrineChoices on a FURNACE run: day 4, a TEMPER
 * in cargo; and the same with nothing in cargo, and with a card blocked for NO PART TAKES IT), their labels, chips and notes the screen's functions (cards.ts choiceLabel, deltaText,
 * cardNote), so a words change moves this section with it. Each is measured on the event screen's layouts: the label, the exchange line and the note against the room the card
 * gives them; the price on the day's hull (-100 on day 1 to -1400 on day 18) and the longest part names with the widest word; the word card behind each `?`.
 */
function shrineCardsSection(out: string[]): void {
  out.push("", "### The ASH SHRINE's cards (ENCHANT-2 T3; as the event screen draws them: label, exchange line, note; the word card behind each `?`)", "");
  out.push("Read off the game: game/shrine.ts shrineChoices on a FURNACE run (seed 4242, day 4, a TEMPER in cargo), the labels through cards.ts choiceLabel, the chips through deltaText and the notes through cardNote. Widths are the art px each text takes. The label is drawn in the 5x7 face from the card's x+16 to its `?` button; the exchange line in the 3x5 face across the card less 10 px (a chip is its icon, 2 px and its text, then 5 px; the arrow takes 7): a card that gains a word draws a part's chip as its icon alone when the whole line does not fit, and the word never gives way (cards.ts exchange); the note in the 3x5 face from x+5, the card less 10 px wide. A text wider than its room is an OVERFLOW (counted in the summary below).", "");
  const { run, ev } = shrineAt(["temper"], SHRINE_DAY);
  const cards = shrineChoices(run, ev);
  const empty = shrineAt([], SHRINE_DAY);
  const noPart = shrineChoices(empty.run, empty.ev)[1];
  const noTaker: Choice = { ...cards[0], blocked: SHRINE_NO_TAKER };
  const widest = ENCHANT_IDS.reduce((a, b) => (textWidth(ENCHANT_DEFS[b].name, "3") > textWidth(ENCHANT_DEFS[a].name, "3") ? b : a));
  const longest = Object.values(ITEMS).filter((d) => d.kind !== "turret" && d.kind !== "supply" && d.merchant)
    .sort((a, b) => textWidth(itemName(b.id), "3") - textWidth(itemName(a.id), "3") || (a.id < b.id ? -1 : 1)).slice(0, 6);
  for (const v of EVENT_VIEWS) {
    const L = eventLayout(v.W, v.H, v.portrait, 3), cw = L.cards[0].w, ch = L.cards[0].h;
    out.push(`- ${v.name} (event layout ${v.W}x${v.H}; cards ${cw} x ${ch} px)`);
    cards.forEach((c, i) => out.push(cardRow(v.name, c, i, cw, SHRINE_DAY)));
    out.push(cardRow(`${v.name}, nothing in cargo`, noPart, 1, cw, SHRINE_DAY), cardRow(`${v.name}, no part takes the word`, noTaker, 0, cw, SHRINE_DAY));
    // the price on the day's hull (cards.ts deltaText: hullShown), the widest word: the word chip must still fit on card 1
    const hull = [1, 4, 10, 18].map((day) => {
      const c: Choice = { ...cards[0], gain: [{ k: "ench", word: widest }] }, f = exchangeFit(c, day, cw);
      return `day ${day} \`${deltaText(c.cost[0], true, day)}\` (${pxFit(`${v.name}, ${cards[0].label} at day ${day} with ${ENCHANT_DEFS[widest].name}`, f.used, f.room)})`;
    });
    out.push(`  - the price on the day's hull, with the widest word (${ENCHANT_DEFS[widest].name}): ${hull.join("; ")}`);
    // the longest part names (the cargo's parts: no turret, no supply) with the widest word: the line when the name is kept, and as the icon alone when it must give way
    const names = longest.map((d) => {
      const c: Choice = { ...cards[1], cost: [{ k: "item", def: d.id, uid: 1, from: "cargo" }], gain: [{ k: "ench", word: widest }] }, f = exchangeFit(c, SHRINE_DAY, cw);
      return `${itemName(d.id)} ${f.bare ? `${f.whole} px whole, icon alone ` : ""}(${pxFit(`${v.name}, ${cards[1].label} with ${itemName(d.id)} and ${ENCHANT_DEFS[widest].name}`, f.used, f.room)})`;
    });
    out.push(`  - the longest part names on card 2, with the widest word (${ENCHANT_DEFS[widest].name}): ${names.join("; ")}`);
    // the word card behind a `?` (wordInfo.ts drawWordInfo): the event panel less 2 px each side, rows wrapped 12 px in, 8 px a row from 17 px down, TAP TO CLOSE 9 px up from the foot
    const pw = L.panel.w - 4, ph = L.panel.h - 4, most = Math.floor((ph - 24) / 8);
    const rows = ENCHANT_IDS.map((id) => {
      const n = wordInfoRows(id, pw - 12)!.rows.reduce((s, r) => s + r.length, 0);
      if (n > most) overflows.push(`${v.name}, the word card of ${ENCHANT_DEFS[id].name} (${n} rows of ${most})`);
      return `${ENCHANT_DEFS[id].name} ${n}${n > most ? " OVERFLOW" : ""}`;
    });
    out.push(`  - the word card behind a \`?\` (the event panel ${pw} x ${ph} px; room for ${most} rows): rows by word: ${rows.join(", ")}`);
  }
  out.push("", "The word cards behind the `?` (wordInfo.ts wordInfoRows: one row for each kind the word goes on, the card's own text; the rows are the same on every view):", "");
  for (const id of ENCHANT_IDS) out.push(`- ${ENCHANT_DEFS[id].name}: ${wordFace(id).lines.map((l) => `\`${plain(`${l.label}: ${l.text}`)}\``).join(" · ")}`);
}

/** The drop list's panel (drops.ts drawDropList: min(W - 8, 220) wide) on the views the sheet measures. */
const LIST_VIEWS: readonly { name: string; W: number }[] = [{ name: "desk", W: 640 }, { name: "phone", W: 201 }, { name: "narrowest phone", W: 190 }];
/** The room a list row's name has beside the odds (drops.ts drawDropList). */
const listRowRoom = (l: DropLine, W: number): number => Math.min(W - 8, 220) - 6 - 24 - textWidth(pctText(l.odds)) - 4 - (hasGrid(l.def) ? shapeGridSize(l.def).w + 4 : 0);

/** A drop-list row that carries a word: the word (3x5) and the name cut with a dot to the room beside the odds, on each view; "" for a plain row. */
function rowFit(where: string, l: DropLine): string {
  const wd = dropWord(l.ench);
  if (!wd) return "";
  const name = itemName(l.def), ww = textWidth(wd.text, "3");
  return ` (${LIST_VIEWS.map((v) => {
    const room = listRowRoom(l, v.W), cut = cutName(name, "3", room - ww);
    return `${v.name} ${pxFit(`${where} (${v.name})`, ww + textWidth(cut, "3"), room)}${cut !== name ? `, name cut to \`${cut}\`` : ""}`;
  }).join("; ")})`;
}

/** The victory card's views: warlordHud.ts drawWarlordResult's panel is min(W - 10, 214) wide, the drop card 20 less, and the name's room 26 less than the card (drops.ts drawDropCard). */
const VICTORY_VIEWS: readonly { name: string; W: number }[] = [{ name: "desk", W: 640 }, { name: "phone 402x690", W: 201 }, { name: "narrowest phone", W: 190 }];
const victoryCard = (W: number): { card: number; room: number } => {
  const card = Math.min(W - 10, 214) - 20;
  return { card, room: card - 26 };
};

/**
 * ENCHANT-2 (REQ-BFG-085; T2): the drop lines with a word: the fork's inspect panel (the ⓘ list: header and rows) and the victory screen's drop card, read off the game's own
 * functions (drops.ts dropListHeader, dropListText, dropCardText; game/road.ts warlordDropTable, whose lines carry the word of the rival's copy), each measured against the
 * room its screen gives it.
 */
function dropLinesSection(out: string[]): void {
  out.push("", "### Drop lines with a word (ENCHANT-2 T2; the fork's ⓘ list and the victory card)", "");
  out.push("Read off the game: game/road.ts warlordDropTable on the rival's deck for the day, the list's header through drops.ts dropListHeader, its rows through dropListText (the word first, in its colour, then the part's name, its class and its odds), the victory card through dropCardText. A list row's name is drawn in the 3x5 face beside the odds on a panel of min(W - 8, 220) px, cut with a dot where it has no room; the victory card's name has the card less 26 px (the card is the panel less 20, the panel min(W - 10, 214)): the 5x7 face where the word and the name fit, else the 3x5 face with the name cut with a dot. A text wider than its room is an OVERFLOW (counted in the summary below).", "");
  // the ⓘ list of one rival, whole: SPARKFANG on day 8 holds two words (KILN BRACED, SCRAP CANNON RISING), at the Easy star (★1) and the Hard star (★2)
  const sf = rivalBuild("sparkfang", 8);
  for (const tier of ["easy", "hard"] as const) {
    const t = warlordDropTable("sparkfang", tier, sf), head = dropListHeader(t);
    out.push(`- ${RIVALS.sparkfang.name} on day 8 (${t.lines.filter((l) => l.ench).map((l) => `${l.def}: ${l.ench}`).join(", ") || "no word on a part it drops"}), the ⓘ list at ${tier}: header \`${head}\` (${LIST_VIEWS.map((v) => `${v.name} ${pxFit(`${RIVALS.sparkfang.name} ⓘ header (${v.name})`, textWidth(head, "3"), Math.min(v.W - 8, 220) - 12)}`).join("; ")}); ${t.lines.length} rows:`);
    const rows = dropListText(t);
    t.lines.forEach((l, i) => out.push(`  - \`${rows[i]}\`${rowFit(`${RIVALS.sparkfang.name}: ${rows[i]}`, l)}`));
  }
  // every captain on day 12 (all three words live): the rows of the Hard list that carry a word
  out.push("", "The rows with a word in every captain's Hard list on day 12 (all three words live):", "");
  let worded = 0;
  for (const id of RIVAL_IDS) {
    const t = warlordDropTable(id, "hard", rivalBuild(id, 12)), rows = dropListText(t);
    const held = t.lines.map((l, i) => ({ l, row: rows[i] })).filter((x) => x.l.ench !== undefined);
    worded += held.length;
    out.push(`- ${RIVALS[id].name} (${id}): ${t.lines.length} rows, ${held.length} with a word${held.length ? ":" : id === "matriarch" ? " (her legendary part is a core: it takes none)" : ""}`);
    for (const { l, row } of held) out.push(`  - \`${row}\`${rowFit(`${RIVALS[id].name}: ${row}`, l)}`);
  }
  out.push("", `${worded} rows with a word in all.`, "");
  // the victory card: the part, its word before it in its colour, and the sub line with the star
  out.push("The victory card (dropCardText: name, sub line, and the word before the name; fitWordName picks the face):", "");
  for (const [what, drop, legendary, stars, word] of [
    ["a plain drop at ★1", "twinlatch", false, 1, undefined], ["a plain drop at ★2 (Hard)", "twinlatch", false, 2, undefined],
    ["FIERY at ★1", "twinlatch", false, 1, "fiery"], ["FIERY at ★2 (Hard)", "twinlatch", false, 2, "fiery"],
    ["the Matriarch's legendary part", "lance", true, 1, undefined],
  ] as const) {
    const t = dropCardText(drop, legendary, stars, word)!;
    const fit = VICTORY_VIEWS.map((v) => {
      const { card, room } = victoryCard(v.W);
      const name = t.word ? (() => { const f = fitWordName(t.word, t.name, room); return `${f.font === "5" ? "5x7" : "3x5"}, ${pxFit(`victory card, ${what}, name (${v.name})`, textWidth(t.word, f.font) + textWidth(f.name, f.font), room)}`; })() : `${textWidth(t.name)} px in 5x7 of ${room}`;
      return `${v.name}: name ${name}; sub ${pxFit(`victory card, ${what}, sub line (${v.name})`, textWidth(t.sub, "3"), card - 23 - 2)}`;
    });
    out.push(`- ${what}: name \`${t.word ?? ""}${t.name}\`, sub \`${t.sub}\` (${fit.join("; ")})`);
  }
  out.push(`- no drop: \`${NO_DROP}\``);
  // every legal (word, part) pair a drop can show: the face it is drawn in and the names that are cut, by view
  const pairs = ENCHANT_IDS.flatMap((word) => Object.values(ITEMS).filter((d) => dropClass(d.id) !== null && enchantProblem(d.id, word) === null).map((d) => ({ word, def: d.id })));
  out.push("", `Every legal (word, part) pair of a part that can drop (${pairs.length} pairs), drawn as drops.ts fitWordName picks the face, by view:`, "");
  for (const v of VICTORY_VIEWS) {
    const { room } = victoryCard(v.W);
    let big = 0;
    const cuts: string[] = [];
    for (const p of pairs) {
      const wd = dropWord(p.word)!, name = itemName(p.def), f = fitWordName(wd.text, name, room);
      if (textWidth(wd.text, f.font) + textWidth(f.name, f.font) > room) overflows.push(`victory card, ${wd.text}${name} (${v.name}: ${textWidth(wd.text, f.font) + textWidth(f.name, f.font)} px of ${room})`);
      if (f.font === "5") big++;
      else if (f.name !== name) cuts.push(`${wd.text}${name} → \`${f.name}\``);
    }
    out.push(`- ${v.name} (the name's room ${room} px): ${big} in the 5x7 face, ${pairs.length - big} in the 3x5 face, ${cuts.length} with the name cut with a dot${cuts.length ? `: ${cuts.slice(0, 8).join("; ")}${cuts.length > 8 ? `; and ${cuts.length - 8} more` : ""}` : ""}`);
  }
}

if ((process.argv[1] ?? "").endsWith("textSheet.js")) {
  const path = process.argv[2];
  if (!path) throw new Error("usage: node tools/dist/textsheet/textSheet.js <out.md> [--plain-rigs] [--shapes2] [--enchant]");
  // SHAPES-1 (REQ-BFG-086, S8): BB_SHAPES=1 makes the sheet with SHAPES on (the three shaped rigs, GANTRY PRESS 2x3, ASSEMBLY
  // LINE I3), as the brief's text-sheet check asks; unset, the sheet is as before
  if (process.env.BB_SHAPES === "1") setShapes(true);
  if (process.argv.includes("--plain-rigs")) setPlainRigs(true); // PLAIN-1 (REQ-BFG-084): the six in ITEMS
  if (process.argv.includes("--shapes2")) setShapes2(true); // SHAPES-2 (REQ-BFG-114): the six more in ITEMS (after PLAIN-1's, when both are on)
  if (process.argv.includes("--enchant")) setEnchant(true); // ENCHANT-1 (REQ-BFG-085): the eight enchantments' section at the end (the pieces above are as before)
  const text = sheet();
  writeFileSync(path, text);
  console.log(`text sheet: ${text.split("\n").length} lines -> ${path}`);
}
