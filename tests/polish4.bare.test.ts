// POLISH-4 (REQ-BFG-089; P4-3, cap's ruling 2: option B): A BATTLE FACE DROPS ITS CLOSE ROW ONLY WHERE THE ROW COSTS ONE OF THE PIECE'S OWN ABILITY LINES.
//   On a landscape phone at a pixel ratio of 2.625 to 3 the integer scale is 6 or 7, the screen 390-406 x 180-187 logical px and the face the whole floor between the boards, 106-122 x 162-169 px (844x390@3: 135 x 177). A finger-sized CLOSE row
//   (19-22 px and 6 under the text) took the room of `IT TAKES BELTS ON COLUMNS ...` and `SPEED: LEVEL n/4.`: at polish3b-accepted your own faces short of a rule line were 156 at 851x393@2.75, 127 at 915x412@2.625, 74 at 926x428@3, 36 at 812x375@3,
//   6 at 1920x1080 (the foe's 156 / 129 / 135 / 125 / 6, and 6 at 844x390). Now battleScout.ts facePlan draws a face WITHOUT the row (`PanelPlan.bare`) where the face with the row is not the rule text whole and the face without it is, or gives
//   away fewer ability blocks; every other face keeps its CLOSE row exactly as before. A bare face closes as every face does: a press on the battlefield off any part (BattleFaces.press), or BACK. Nothing is said about it (no hint, no words).
import { afterEach, describe, expect, it } from "vitest";
import { G, fresh, installRaster } from "./raster.helpers";
import { battleLayout, battleGrid, battleScale, laneLayout } from "../src/game/battleLayout";
import { viewWithSub } from "../src/game/viewGrid";
import { BattleScreen } from "../src/screens/battle";
import { abilityGone, facePlan, pickPart, partsOnScreen } from "../src/screens/battleScout";
import { rulesWhole, visibleLines, type PanelPlan } from "../src/screens/build/inspector";
import { setupRun } from "../src/tooling";
import { CELL } from "../src/sim/content";
import { inGrid, key, occupancy } from "../src/sim/deck";
import { ENCHANT, setEnchant, withEnchant } from "../src/sim/enchant";
import type { Game } from "../src/game/game";
import type { Run } from "../src/game/run";
import { faces } from "./polish3b.helpers";
import { VIEW13_NAMES, gameAt, p3bFacePlan, viewAt, type View13 } from "./polish4.helpers";

installRaster();
afterEach(() => setEnchant(ENCHANT));

/** the blocks a plan draws whole: `role|text|label` -> role */
const drawnKeys = (p: PanelPlan): Map<string, string> => {
  const drawn = new Set(visibleLines(p).map((v) => v.line));
  return new Map(p.body.shown.filter((l) => l.lines.length > 0 && l.lines.every((ln) => drawn.has(ln))).map((l) => [`${l.b.role}|${l.b.text}|${l.b.label ?? ""}`, l.b.role] as [string, string]));
};

/** Per view and column [own A, own B, foe A, foe B]: [faces drawn bare, faces still short of a CORE or GEAR rule line] (the scout's table, POLISH-4 SCOUT section 4, with this build's counts). */
const TABLE: Record<View13, [number, number][]> = {
  "desk-1920x1080": [[6, 0], [0, 0], [6, 0], [0, 0]],
  "laptop-1366x768": [[0, 0], [0, 0], [0, 0], [0, 0]],
  "desk-1280x800": [[0, 0], [0, 0], [0, 0], [0, 0]],
  "land-844x390": [[0, 0], [0, 0], [6, 0], [0, 0]],
  "op-402x690": [[0, 0], [0, 0], [0, 0], [0, 0]],
  "phone-360x640": [[0, 0], [0, 0], [0, 0], [0, 0]],
  "col96-3040x1710": [[6, 0], [0, 0], [16, 0], [0, 0]],
  "land-812x375@3": [[30, 6], [0, 0], [119, 6], [0, 0]],
  "pixel5-851x393@2.75": [[156, 16], [2, 0], [130, 42], [7, 0]],
  "land-915x412@2.625": [[111, 16], [2, 0], [123, 16], [2, 0]],
  "promax-926x428@3": [[64, 10], [0, 0], [119, 16], [0, 0]],
  "band-280x653": [[0, 0], [0, 0], [0, 0], [0, 0]],
  "band-300x640": [[0, 0], [0, 0], [0, 0], [0, 0]],
};

describe("POLISH-4 P4-3: a face is bare only where its CLOSE row costs an ability line; every other face is the plan it was", () => {
  for (const name of VIEW13_NAMES) {
    it(`${name}: bare / still short [own A, own B, foe A, foe B] = ${JSON.stringify(TABLE[name])}; a bare face gives away fewer ability blocks than the same face with its row, and every other face (a belt aside: tests/polish4.beltrows.test.ts) is JSON-equal to POLISH-3b's plan`, () => {
      const got: [number, number][] = [];
      for (const foe of [false, true]) for (const co of ["A", "B"] as const) {
        const { fa, tp } = viewAt(name, foe ? 1 : 0);
        let bare = 0, short = 0;
        for (const f of faces(foe).filter((x) => x.corpus === co)) {
          const [plan, ref] = withEnchant(() => [facePlan(f.t, fa, f.fam, tp), p3bFacePlan(f.t, fa, f.fam, tp)] as [PanelPlan, PanelPlan]);
          if (plan.bare) {
            bare++;
            expect(plan.column, `${name} ${f.tag}: only a column face`).toBe(true);
            expect(rulesWhole(ref), `${name} ${f.tag}: with its row the face was short of a rule line`).toBe(false);
            expect(abilityGone(f.t, plan), `${name} ${f.tag}: without the row it gives away fewer ability blocks`).toBeLessThan(abilityGone(f.t, ref));
            expect(plan.r.y + plan.r.h, `${name} ${f.tag}: inside the floor`).toBeLessThanOrEqual(fa.area.y + fa.area.h);
          } else if (f.kind !== "route") {
            expect(JSON.stringify(plan), `${name} ${f.tag}: no row dropped, the plan is POLISH-3b's`).toBe(JSON.stringify(ref));
          }
          if (plan.column && !rulesWhole(plan)) short++;
          // REQ-BFG-089: no word is added. A bare face draws, besides what the face with its row drew, ability blocks and CORE / GEAR / hit rows of the piece's own text and nothing else: no note, flavour, hint, reminder or caveat
          if (plan.bare) {
            const was = drawnKeys(ref);
            for (const [k, role] of drawnKeys(plan)) if (!was.has(k)) expect(["ability", "row"], `${name} ${f.tag}: added block ${k}`).toContain(role); // the piece's own ability lines and its CORE / GEAR (or a belt's hit) rows given whole
            for (const l of plan.body.shown) expect(["hint", "flavour", "reminder", "caveat"].includes(l.b.role) || l.b.note !== undefined, `${name} ${f.tag}: ${l.b.text}`).toBe(false);
          }
        }
        got.push([bare, short]);
      }
      expect(got).toEqual(TABLE[name]);
    });
  }
});

// ---------------------------------------------------------------------------------------- the close flow, on a real BattleScreen at 851x393@2.75

const DT = 1 / 60;
const pickSub = (pw: number, ph: number, p: boolean, scale: number): number => { const g = battleGrid(pw, ph, p); return g.close === scale ? g.sub : 1; };
/** A stand-in Game for a BattleScreen (scout1.flow.test.ts's): the run, a silent audio, the view the phone gets, and go() recording the next screen. */
function fakeGame(run: Run, w: number, h: number, dpr: number): Game {
  const view = viewWithSub(w, h, dpr, (pw, ph, p) => battleScale(pw, ph, p), pickSub);
  const silent = new Proxy({}, { get: () => () => undefined });
  const g = { run, audio: silent, view, W: view.W, H: view.H, portrait: view.portrait, t: 0 } as unknown as Game;
  (g as unknown as { go: (s: unknown) => void }).go = () => undefined;
  return g;
}

describe("POLISH-4 P4-3: a bare face closes by a press off any part and by BACK (851x393@2.75, a real VIEW BATTLEFIELD)", () => {
  const NAME: View13 = "pixel5-851x393@2.75";

  /** the battle screen at its result card's VIEW BATTLEFIELD, the camera at CLOSE; and a drawing stub with a UI (the face's buttons are registered on it) */
  function viewBattlefield(day: number, seed: number) {
    const s = new BattleScreen(fakeGame(setupRun({ hero: "furnace", day, seed }), 851, 393, 2.75));
    for (let i = 0; i < 60 * 400 && s.phase !== "result"; i++) s.update(DT);
    expect(s.phase).toBe("result");
    expect(s.openView()).toBe(true);
    for (let i = 0; i < 90; i++) s.update(DT);
    s.motion.frame(s.arena);
    expect(s.motion.camera?.shot).toBe("close");
    const { v, game } = gameAt(NAME);
    const L = laneLayout(battleLayout(v.W, v.H, v.portrait));
    /** press a part, draw its face, return what was drawn */
    const open = (x: number, y: number) => {
      s.down(x, y);
      game.ui.begin();
      s.faces.draw(G(fresh(v.W, v.H)), game, s.arena, L, true, s.foeName);
      game.ui.end(); // the regions the face laid are hit-testable from here
      return s.faces.last;
    };
    return { s, v, game, L, open };
  }
  /** a screen point on `side`'s board over a tile that holds no part: where a press closes a face */
  function emptyTile(s: BattleScreen, side: 0 | 1, avoid: { x: number; y: number; w: number; h: number }, W: number, H: number): { x: number; y: number } | null {
    const b = s.arena.b.sides[side].build, occ = occupancy(b);
    for (let cy = 0; cy < 10; cy++) for (let cx = 0; cx < 10; cx++) {
      if (!inGrid(cx, cy)) continue;
      const o = occ[key(cx, cy)];
      if (o.item >= 0 || o.route >= 0) continue;
      const [x, y] = s.motion.localToScreen(s.arena, side, cx * CELL + CELL / 2, cy * CELL + CELL / 2);
      const inside = (r: { x: number; y: number; w: number; h: number }) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
      if (x > 1 && y > 1 && x < W - 1 && y < H - 1 && !inside(avoid) && pickPart(s.arena, s.motion, x, y) === null) return { x: Math.round(x), y: Math.round(y) };
    }
    return null;
  }

  it("a face drawn without its CLOSE row: no button is laid, a press at the button's place hits the face, and a press on an empty board tile closes it; BACK closes it too; another part swaps it", () => {
    const { s, v, game, open } = viewBattlefield(8, 21);
    let bare: { side: 0 | 1; x: number; y: number; sel: unknown } | null = null, kept = 0;
    for (const side of [0, 1] as const) for (const p of partsOnScreen(s.arena, s.motion, side)) {
      const last = open(p.x, p.y);
      expect(s.faces.open, "a press on a part opens its face").toEqual({ side, sel: p.sel });
      if (last!.close === null) bare ??= { side, x: p.x, y: p.y, sel: p.sel };
      else kept++;
    }
    expect(bare, "a bare face on this battlefield (a turret in the 3x5 face)").not.toBeNull();
    expect(kept, "faces that keep their CLOSE row").toBeGreaterThan(0);

    // 1. no button: nothing at the CLOSE button's place but the face itself (it blocks presses), and no region named faceclose
    const last = open(bare!.x, bare!.y)!;
    expect(last.close).toBeNull();
    expect(game.ui.hit(last.r.x + Math.floor(last.r.w / 2), last.r.y + last.r.h - 8)?.id, "the face blocks a press on its own foot").toBe("face");
    // the words: none for the way out (no line names CLOSE, BACK or a press)
    expect(last.lines.filter((l) => /\bCLOSE\b|\bBACK\b|\bTAP\b|\bPRESS\b/.test(l)), "no hint, no words").toEqual([]);

    // 2. a press on an empty board tile closes it (the face's rect is not on that tile, so the press reaches the battlefield)
    const empty = emptyTile(s, bare!.side === 0 ? 1 : 0, last.r, v.W, v.H) ?? emptyTile(s, bare!.side, last.r, v.W, v.H);
    expect(empty, "an empty board tile on screen, off the face").not.toBeNull();
    expect(game.ui.hit(empty!.x, empty!.y)?.id ?? null, "nothing of the face blocks that press").not.toBe("face");
    s.down(empty!.x, empty!.y);
    expect(s.faces.open, "the empty tile closed the face").toBeNull();

    // 3. BACK closes it (and returns to the card)
    open(bare!.x, bare!.y);
    expect(s.faces.open).not.toBeNull();
    s.key("Backspace");
    expect(s.faces.open, "BACK closed the face").toBeNull();
    expect(s.phase, "and returned to the result card").toBe("result");
  });

  it("a face that keeps its CLOSE row is as it was: the button is laid, a press on it closes the face", () => {
    const { s, game, open } = viewBattlefield(8, 21);
    let done = false;
    for (const side of [0, 1] as const) for (const p of partsOnScreen(s.arena, s.motion, side)) {
      const last = open(p.x, p.y)!;
      if (last.close === null || done) continue;
      const cx = last.close.x + Math.floor(last.close.w / 2), cy = last.close.y + Math.floor(last.close.h / 2);
      const reg = game.ui.hit(cx, cy);
      expect(reg?.id).toBe("faceclose");
      reg!.onTap?.();
      expect(s.faces.open, "CLOSE closed the face").toBeNull();
      done = true;
    }
    expect(done).toBe(true);
  });

  it("a bare face is swapped by a press on another part, as every face is", () => {
    const { s, open } = viewBattlefield(8, 21);
    const all = ([0, 1] as const).flatMap((side) => partsOnScreen(s.arena, s.motion, side).map((p) => ({ side, ...p })));
    const bare = all.find((p) => open(p.x, p.y)!.close === null)!;
    expect(bare).toBeDefined();
    const other = all.find((p) => !(p.side === bare.side && JSON.stringify(p.sel) === JSON.stringify(bare.sel)))!;
    open(bare.x, bare.y);
    s.down(other.x, other.y);
    expect(s.faces.open).toEqual({ side: other.side, sel: other.sel });
  });
});
