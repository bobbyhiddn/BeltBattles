// POLISH-3b (REQ-BFG-089, REQ-BFG-087; P2, the review's N1 of POLISH-3): WHERE NEITHER PLAN IS THE RULE TEXT WHOLE, A BATTLE FACE DRAWS THE PLAN THAT GIVES AWAY FEWER ABILITY BLOCKS (the 3x5 plan on a tie or a win).
//   At polish3-accepted facePlan kept planPanel's 5x7 plan whenever the 3x5 plan was not the rule text whole either, even where the 3x5 plan gave away fewer ability lines: SPARKFANG's RISING SCRAP CANNON (turret slot 0, days
//   8/12/16, the warlord deck and the dusk stand-in: POLISH-3's SIX) drew the 5x7 plan's shorter form (variant 6) at 1920x1080, giving away its stat row `RATE 50  HOLDS 3  GEAR SLOTS` and `IT TAKES BELTS ON COLUMNS`
//   (counted against its full text: five ability blocks), and `IT TAKES BELTS ON COLUMNS` and `SPEED: LEVEL 2/4.` at 844x390. The 3x5 plan gives away `SPEED: LEVEL 2/4.` only.
import { afterEach, describe, expect, it } from "vitest";
import { installRaster } from "./raster.helpers";
import { abilityGone, facePlan } from "../src/screens/battleScout";
import { gapsAtLeast, planPanel, rulesWhole, visibleLines, type PanelPlan } from "../src/screens/build/inspector";
import { ENCHANT, setEnchant, withEnchant } from "../src/sim/enchant";
import { lineText } from "../src/ui/richText";
import { VIEW_NAMES, abilityLeft, faces, isSix, oldFacePlan, plain, viewOf, type Face, type ViewName } from "./polish3b.helpers";
import { p3bFacePlan } from "./polish4.helpers";

installRaster();
afterEach(() => setEnchant(ENCHANT));

const drawnText = (p: PanelPlan): string[] => visibleLines(p).flatMap((v) => (v.line === "rule" ? [] : [plain(lineText(v.line.spans))]));
const planOf = (f: Face, name: ViewName, side: 0 | 1, o: { small?: boolean } = {}): PanelPlan => {
  const { fa, tp } = viewOf(name, side);
  return withEnchant(() => planPanel(f.t, fa.area, f.fam, { tap: tp, band: fa.band, wrap: true, ...o })); // facePlan plans every battle face with `wrap` (P1): the candidates are the wrap plans
};
// POLISH-4 (P4-3): P2's rule is a rule of the face WITH its CLOSE row, which is what these tests pin: `drawn` is that plan (tests/polish4.helpers.ts p3bFacePlan: facePlan as POLISH-3b left it). facePlan now also draws a face
// WITHOUT the row (`bare`) where the row costs an ability line: the six below are such faces (their SPEED line is drawn; the first test's last block and tests/polish4.bare.test.ts say so).
const drawn = (f: Face, name: ViewName, side: 0 | 1): PanelPlan => { const { fa, tp } = viewOf(name, side); return withEnchant(() => p3bFacePlan(f.t, fa, f.fam, tp)); };
const SIX_TAGS = ["rivalBuild d8", "rivalBuild d12", "rivalBuild d16", "standInBuild d8", "standInBuild d12", "standInBuild d16"].map((t) => `A sparkfang ${t} turret0`);

describe("POLISH-3b P2: SPARKFANG's RISING SCRAP CANNON gives away SPEED only", () => {
  for (const name of ["desk-1920x1080", "land-844x390"] as ViewName[]) {
    it(`${name}: the six foe faces are drawn from the 3x5 plan: SPEED: LEVEL 2/4. is the one ability block given away; the stat row and IT TAKES BELTS ON COLUMNS are drawn (the old plan gave away more)`, () => {
      const six = faces(true).filter(isSix);
      expect(six.map((f) => f.tag)).toEqual(SIX_TAGS);
      const { fa, tp } = viewOf(name, 1);
      for (const f of six) {
        const p = drawn(f, name, 1), old = withEnchant(() => oldFacePlan(f.t, fa, f.fam, tp)), lines = drawnText(p);
        expect(p.body.font, `${f.tag}: the 3x5 face`).toBe("3");
        expect(p.body.variant, `${f.tag}: the full text, not a compact form`).toBe(0);
        expect(abilityLeft(f.t, p).map((b) => plain(b.text)), `${f.tag}: the ability blocks given away`).toEqual(["SPEED: LEVEL 2/4."]);
        expect(abilityGone(f.t, p), f.tag).toBe(1);
        // the drawn text, its lines joined: the turret's stat row `RATE 50  HOLDS 3  GEAR SLOTS 1` (one pair a line in the 100 px column, one line where the row fits) and the wrapped `IT TAKES BELTS ON COLUMNS 5 AND 6.`
        const text = lines.join(" ");
        expect(text, `${f.tag}: the stat row is drawn (${JSON.stringify(lines)})`).toMatch(/RATE 50 HOLDS 3 GEAR SLOTS \d/);
        expect(text, `${f.tag}: IT TAKES BELTS ON COLUMNS is drawn`).toMatch(/IT TAKES BELTS ON COLUMNS \d/);
        expect(text, `${f.tag}: SPEED is the line given away`).not.toMatch(/SPEED: LEVEL/);
        expect(old.body.variant, `${f.tag}: the old rule drew the 5x7 plan's shorter form`).toBe(6);
        expect(abilityGone(f.t, old), `${f.tag}: the old plan gave away five ability blocks of the full text`).toBe(5);
        expect(JSON.stringify(p), `${f.tag}: it is the 3x5 plan`).toBe(JSON.stringify(planOf(f, name, 1, { small: true })));
        expect(rulesWhole(p), `${f.tag}: still not the rule text whole (SPEED fits neither face)`).toBe(false);
        // POLISH-4 (P4-3): the CLOSE row was what SPEED lacked room for: facePlan draws the face without it, whole, SPEED drawn
        const bare = withEnchant(() => facePlan(f.t, fa, f.fam, tp));
        expect(bare.bare, `${f.tag}: drawn without its CLOSE row`).toBe(true);
        expect(rulesWhole(bare), `${f.tag}: the rule text whole`).toBe(true);
        expect(abilityGone(f.t, bare), f.tag).toBe(0);
        expect(drawnText(bare).join(" "), `${f.tag}: SPEED is drawn`).toMatch(/SPEED: LEVEL 2\/4\./);
      }
    });
  }
});

describe("POLISH-3b P2: the rule, over every battle face of both corpora, own and foe, on the six views", () => {
  for (const name of VIEW_NAMES) {
    it(`${name}: a whole plan is kept; else the 3x5 plan where it is whole; else the plan that gives away fewer ability blocks (the 3x5 plan on a tie)`, () => {
      let total = 0;
      const foe = { neither: 0, win: 0, tie: 0, loss: 0 };
      for (const side of [0, 1] as const) {
        const { fa, tp } = viewOf(name, side);
        for (const f of faces(side === 1).filter((x) => side === 0 || x.corpus === "A")) { // corpus B is the player's own pieces
          total++;
          const p = withEnchant(() => p3bFacePlan(f.t, fa, f.fam, tp));
          const plan = planOf(f, name, side), sm = planOf(f, name, side, { small: true });
          if (!plan.column || rulesWhole(plan)) { expect(JSON.stringify(p), `${f.tag}: a plan that is whole is kept`).toBe(JSON.stringify(plan)); continue; }
          if (rulesWhole(sm)) { expect(JSON.stringify(p), `${f.tag}: the 3x5 plan where it is whole`).toBe(JSON.stringify(sm)); continue; }
          const gp = abilityGone(f.t, plan), gs = abilityGone(f.t, sm), gd = abilityGone(f.t, p);
          expect(gd, `${f.tag}: the drawn plan gives away no more than either`).toBeLessThanOrEqual(Math.min(gp, gs));
          expect(JSON.stringify(p), `${f.tag}: the 3x5 plan on a tie or a win (planner's ${gp}, 3x5 ${gs})`).toBe(JSON.stringify(gs <= gp ? sm : plan));
          if (side === 1) { foe.neither++; if (gs < gp) foe.win++; else if (gs === gp) foe.tie++; else foe.loss++; }
        }
      }
      expect(total, `${name}: faces checked (own 4,051, foe 2,242)`).toBe(4051 + 2242);
      // POLISH-3's SIX: the only foe faces neither plan can show whole, at 1920x1080 and at 844x390; the 3x5 plan wins on each (SPEED against five blocks); every other view has none
      expect(foe, name).toEqual(name === "desk-1920x1080" || name === "land-844x390" ? { neither: 6, win: 6, tie: 0, loss: 0 } : { neither: 0, win: 0, tie: 0, loss: 0 });
    });
  }
});

describe("POLISH-3b P2: the rule on a sweep of face areas (ties and losses included)", () => {
  it("SPARKFANG's six texts, own and foe's, in columns 96-144 px wide and 100-230 px tall: a whole plan is kept, the plan that gives away fewer ability blocks is drawn, the 3x5 plan on a tie", () => {
    let cells = 0, neither = 0, win = 0, tie = 0, loss = 0;
    for (const foe of [true, false]) {
      const { tp } = viewOf("desk-1920x1080", foe ? 1 : 0);
      for (const f of faces(foe).filter(isSix)) for (let w = 96; w <= 144; w += 4) for (let h = 100; h <= 230; h += 10) {
        const fa = { area: { x: 2, y: 2, w, h }, band: false };
        const p = withEnchant(() => p3bFacePlan(f.t, fa, f.fam, tp)), plan = withEnchant(() => planPanel(f.t, fa.area, f.fam, { tap: tp, band: false, wrap: true }));
        const sm = withEnchant(() => planPanel(f.t, fa.area, f.fam, { tap: tp, band: false, small: true, wrap: true }));
        cells++;
        if (!plan.column || rulesWhole(plan)) { expect(JSON.stringify(p), `${f.tag} ${w}x${h}`).toBe(JSON.stringify(plan)); continue; }
        if (rulesWhole(sm)) { expect(JSON.stringify(p), `${f.tag} ${w}x${h}`).toBe(JSON.stringify(sm)); continue; }
        neither++;
        const gp = abilityGone(f.t, plan), gs = abilityGone(f.t, sm), gd = abilityGone(f.t, p);
        expect(gd, `${f.tag} ${w}x${h}`).toBeLessThanOrEqual(Math.min(gp, gs));
        expect(JSON.stringify(p), `${f.tag} ${w}x${h}: planner's ${gp}, 3x5 ${gs}`).toBe(JSON.stringify(gs <= gp ? sm : plan));
        if (gs < gp) win++; else if (gs === gp) tie++; else loss++;
      }
    }
    console.log(`POLISH-3b P2 sweep: ${cells} cells, neither plan whole ${neither}: 3x5 wins ${win}, ties ${tie}, planner's wins ${loss}`);
    expect(cells).toBe(2 * 6 * 13 * 14);
    expect(neither, "the sweep reaches the rule").toBeGreaterThan(20);
    expect(win, "a win for the 3x5 plan").toBeGreaterThan(0);
    expect(tie, "a tie: the 3x5 plan").toBeGreaterThan(0);
  });
});

describe("POLISH-3b P2: the foe's faces that moved are those twelve; nothing else, no default text, gaps as measured", () => {
  it("over the 2,242 foe faces on six views: the drawn plan differs from polish3-accepted's rule on exactly the SIX at 1920x1080 and at 844x390, and gives away fewer ability blocks there", () => {
    const moved: string[] = [];
    for (const name of VIEW_NAMES) {
      const { fa, tp } = viewOf(name, 1);
      for (const f of faces(true).filter((x) => x.corpus === "A")) {
        const p = withEnchant(() => facePlan(f.t, fa, f.fam, tp)), old = withEnchant(() => oldFacePlan(f.t, fa, f.fam, tp));
        if (JSON.stringify(p) === JSON.stringify(old)) continue;
        moved.push(`${name} ${f.tag}`);
        expect(abilityGone(f.t, p), `${name} ${f.tag}: fewer ability blocks given away`).toBeLessThan(abilityGone(f.t, old));
        // REQ-BFG-089: what the new plan draws that the old one did not is a piece's own ability lines: role `ability`, never a default-text block (a note flagged kind or rig, flavour, reminder, hint, caveat)
        const was = new Set(old.body.shown.map((l) => `${l.b.role}|${l.b.text}|${l.b.label ?? ""}`));
        for (const l of p.body.shown) if (!was.has(`${l.b.role}|${l.b.text}|${l.b.label ?? ""}`)) { expect(l.b.role, `${name} ${f.tag}: ${l.b.text}`).toBe("ability"); expect(l.b.note, `${name} ${f.tag}: ${l.b.text}`).toBeUndefined(); }
      }
    }
    expect(moved).toEqual([...SIX_TAGS.map((t) => `desk-1920x1080 ${t}`), ...SIX_TAGS.map((t) => `land-844x390 ${t}`)]);
  });

  it("REQ-BFG-087: the foe's faces with a gap under min (gaps.px < gaps.min) are the same count as at polish3-accepted on every view, but 844x390's (POLISH-4 P4-3: the six drawn without their CLOSE row have the room: 109 -> 103); the twelve are under min before (content first: SPACE-1 D3)", () => {
    const UNDER: Record<ViewName, number> = { "desk-1920x1080": 57, "laptop-1366x768": 88, "desk-1280x800": 47, "land-844x390": 103, "op-402x690": 503, "phone-360x640": 28 };
    for (const name of VIEW_NAMES) {
      const { fa, tp } = viewOf(name, 1);
      let under = 0;
      for (const f of faces(true).filter((x) => x.corpus === "A")) {
        const p = withEnchant(() => facePlan(f.t, fa, f.fam, tp));
        if (!gapsAtLeast(p, p.gaps.min)) under++;
        if (isSix(f) && (name === "desk-1920x1080" || name === "land-844x390")) {
          const old = withEnchant(() => oldFacePlan(f.t, fa, f.fam, tp));
          expect(gapsAtLeast(old, old.gaps.min), `${name} ${f.tag}: under min before`).toBe(false);
          // POLISH-4 (P4-3): drawn without the CLOSE row (SPEED drawn too) the six have the room 1 px of gap more at 1920x1080 (1 px: still under min 2) and are clear of min at 844x390
          expect(gapsAtLeast(p, p.gaps.min), `${name} ${f.tag}: under min after`).toBe(name === "land-844x390");
          if (name === "desk-1920x1080") expect(p.gaps.px, `${name} ${f.tag}: the gap px`).toBe(1);
        }
      }
      expect(under, `${name}: foe faces under min`).toBe(UNDER[name]);
    }
  });
});

describe("POLISH-3b P2: abilityGone", () => {
  it("counts the ability blocks of the full text a plan does not draw whole: a compact variant's shorter form counts as given away; blocks of another role never count", () => {
    const f = faces(true).find((x) => x.tag === "A sparkfang rivalBuild d8 turret0")!;
    const plan = planOf(f, "desk-1920x1080", 1), sm = planOf(f, "desk-1920x1080", 1, { small: true });
    expect(plan.body.variant, "the planner's plan is the compact variant").toBe(6);
    expect(abilityGone(f.t, plan)).toBe(5);
    expect(abilityGone(f.t, sm)).toBe(1);
    expect(plan.body.dropped.filter((b) => b.role === "ability").length, "BodyPlan.dropped counts only what the variant itself leaves out").toBe(2);
    expect(abilityGone({ body: [{ role: "hits", text: "T1 RAM +5" }, { role: "note", text: "x" }] }, sm)).toBe(0);
    const whole = faces(true).find((x) => x.corpus === "A" && x.kind === "item" && rulesWhole(planOf(x, "desk-1920x1080", 1)))!;
    expect(abilityGone(whole.t, planOf(whole, "desk-1920x1080", 1))).toBe(0);
  });
});
