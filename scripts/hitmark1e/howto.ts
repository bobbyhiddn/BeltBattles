// HITMARK-1E (REQ-BFG-100, C7; BRIEF-HITMARK1E step 7, an extra) picture tool, not shipped: HOW TO PLAY's line 6 (the keyword line) as the
// title screen draws it (screens/title.ts HELP_KEYWORDS: icons() of "{*BURN}: HULL DAMAGE OVER TIME. ... {*FRAY}: LATER HULL HITS DEAL
// MORE.", each keyword its icon in its own colour and its word, wrapped and drawn with richText.ts wrapRich and drawRich on the raised
// card's navy). PREMISE.md writes the same line with icon NAMES in brackets, because it is text: a reader of it never sees what [FRAY]
// looks like, and a player who opens HOW TO PLAY does. This draws what the player sees, so a cold read can be given it (an extra read:
// does a reader who can see FRAY's icon beside its word still answer the red number with FRAY?). Each art px is 4 screen px.
// Build: npx vite build --ssr scripts/hitmark1e/howto.ts --outDir <W>/tmp/hitmark1e-howto --emptyOutDir --logLevel warn
// Run:   node <W>/tmp/hitmark1e-howto/howto.js <out.png>
import { writeFileSync } from "node:fs";
import { C } from "../../src/render/palette";
import { icons, drawText } from "../../src/render/font";
import { makeCanvas, rect } from "../../src/render/pixel";
import { colourize, drawRich, wrapRich } from "../../src/ui/richText";
import { Img, R, installDocument } from "../art1e/raster";

installDocument();

const OUT = process.argv[2] ?? "howto-6.png";
// the title screen's HELP_KEYWORDS, word for word
const LINE = icons("6  {*BURN}: HULL DAMAGE OVER TIME. {*STUN}: STOPS THE PART IT HITS FOR A WHILE. {*PLATE}: SOAKS HULL DAMAGE. {*SHIELD}: BLOCKS ALL OF ONE HIT'S DAMAGE. {*PAIR}: SLUGS FROM TWO BELTS REACH ONE TURRET AT ONCE. {*FRAY}: LATER HULL HITS DEAL MORE.");
const W = 225, S = 4, PAD = 8;
const lines = wrapRich(colourize(LINE, C.bone), W - 2 * PAD, "5");
const H = 20 + lines.length * 9 + PAD;
const [cv, g] = makeCanvas(W, H);
rect(g, 0, 0, W, H, C.ink);
rect(g, 1, 1, W - 2, H - 2, C.navy);
rect(g, 1, 1, W - 2, 1, C.slate2);
drawText(g, "HOW TO PLAY", W / 2, 6, C.yellow, { align: "center" });
lines.forEach((ln, i) => drawRich(g, ln, PAD, 20 + i * 9, "5"));
const img = new Img(W * S, H * S, [0, 0, 0]);
img.blit(R(cv), 0, 0, S);
writeFileSync(OUT, img.png());
console.log(`${OUT}: ${W * S}x${H * S} px, ${lines.length} lines (the title screen's HELP_KEYWORDS: item 6 of HOW TO PLAY, icons in their own colours)`);
