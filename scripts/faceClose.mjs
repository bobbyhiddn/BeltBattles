// POLISH-4c (REQ-BFG-089; RULING-REVIEW-POLISH4 N4): the close of a BARE battle face, for the scripts that drive the game by real input.
// Since POLISH-4 (P4-3) a battle face whose CLOSE row would cost one of the piece's own ability lines is drawn without it: no CLOSE button, no `faceclose` region, and the page tooling reports its `close` as null (bb.scout().face.close in VIEW
// BATTLEFIELD, bb.foeView().face.close in the build screen's scouted foe view). Such a face closes the way every face does in its view:
//  - "battle" (VIEW BATTLEFIELD): a press on the battlefield off every part (BattleFaces.press: anything that is not a part closes the face), or BACK (`viewback`);
//  - "foe" (the scouted foe view, build/foeView.ts): a press off every part of the foe's carrier (FoeView.press), Escape (FoeView.key), or BACK (`foeback`).
// This module is the press: it finds a point off every part, off the open face's rect and off every UI region (in the page, by the game's own pick; an empty board tile in VIEW BATTLEFIELD, the NEXT BATTLE card's place in the foe view),
// has the caller's own `press` (a tap or a click: scripts/touchcheck.mjs's, scripts/scoutshots.mjs's, a driver's) press it, and reads what followed. It takes no picture, steps no frame and writes no log: the caller checks `ok` and says `where`.
// A face WITH a CLOSE is not this module's: the callers press that button, as they always did (touchcheck.mjs scoutView and foeCardSteps, scoutshots.mjs tour).

/** What the callers say of a bare face (a check's text, a log line). */
export const BARE_TEXT = "no CLOSE: a bare face, closed by a press off any part";

/** An open face with no CLOSE target (`face` as bb.scout() or bb.foeView() report it: `close` null). */
export const isBare = (face) => !!face && face.close == null;

/** The view's open face and whether the view itself is open, as the page tooling reports them (null off the view's screen). */
export const readFace = (page, view) => page.evaluate((view) => {
  if (view === "foe") { const f = window.bb.foeView(); return f ? { face: f.face, stays: f.open } : null; }
  const s = window.bb.scout();
  return s ? { face: s.face, stays: s.phase === "view" } : null;
}, view);

/** In the page: the first point (CSS client px) where a press closes the open face of `view`: on the screen, off the face's rect (2 px of margin), off every UI region (BACK included) and off every part, by the game's own pick (a press
 *  probe with the face state put back). It and its four neighbours 1.5 px away must all pass, so a rounding of the finger's point cannot change the answer. `prefer`: a CSS point tried first. */
const FIND = ({ view, prefer }) => {
  const g = window.bb.game, s = g.screen, ui = g.ui, k = g.view.scale / g.view.dpr, c = g.canvas.getBoundingClientRect();
  if (view === "foe" && !s.foeView.open) return null;
  const faces = view === "foe" ? s.foeView.faces : s.faces;
  const r = faces.last ? faces.last.r : null; // logical px
  const keep = faces.open;
  const part = (x, y) => { // a part under the point? The press sets `open` to the part's face, or to null: put it back
    const hit = view === "foe" ? (s.foeView.press(s, x, y), !!faces.open) : s.faces.press(s.arena, s.motion, x, y);
    faces.open = keep;
    return hit;
  };
  const one = (x, y) => x > 2 && y > 2 && x < g.W - 2 && y < g.H - 2 && !(r && x >= r.x - 2 && x < r.x + r.w + 2 && y >= r.y - 2 && y < r.y + r.h + 2) && !ui.hit(Math.round(x), Math.round(y)) && !part(x, y);
  const good = (x, y) => one(x, y) && [[1.5, 0], [-1.5, 0], [0, 1.5], [0, -1.5]].every(([dx, dy]) => one(x + dx, y + dy));
  const out = (x, y, source) => ({ x: c.left + x * k, y: c.top + y * k, source });
  if (prefer) { const x = (prefer.x - c.left) / k, y = (prefer.y - c.top) / k; if (good(x, y)) return out(x, y, "the card's place"); }
  if (view === "battle") { // an empty board tile: side 1's board first, then yours (a tile is 12 px: content.ts CELL)
    for (const side of [1, 0]) for (const cy of [4, 5, 3, 6, 2, 7, 1, 8]) for (const cx of [4, 5, 3, 6, 2, 7, 1, 8]) {
      const [x, y] = s.motion.localToScreen(s.arena, side, (cx + 0.5) * 12, (cy + 0.5) * 12);
      if (good(x, y)) return out(x, y, `an empty tile (${cx},${cy}) of side ${side}'s board`);
    }
  }
  for (let y = 6; y < g.H - 6; y += 6) for (let x = 6; x < g.W - 6; x += 6) if (good(x, y)) return out(x, y, `an empty place of the screen (${x},${y})`);
  return null;
};

/**
 * Close the open BARE face of `view` ("battle": VIEW BATTLEFIELD; "foe": the scouted foe view) by a real press off any part: `press({x, y})` is the caller's tap or click at client point (x, y) in CSS px, followed by whatever frames the
 * caller steps after a press. `opts.prefer`: a CSS point to try first (the foe view: the NEXT BATTLE card's place). Returns { ok, where, why, title }: `ok` when the face is gone and the view still open; `where` names the point; `why` says what
 * stopped it otherwise (no face open, a face that has a CLOSE, no empty point, or what was seen after the press). Presses nothing unless a bare face is open and a point is found.
 */
export async function closeBare(page, view, press, opts = {}) {
  const before = await readFace(page, view);
  if (!before || !before.face) return { ok: false, where: "", why: "no face is open", title: "" };
  const title = before.face.title ?? "";
  if (!isBare(before.face)) return { ok: false, where: "", why: "the open face has a CLOSE", title };
  const at = await page.evaluate(FIND, { view, prefer: opts.prefer ?? null });
  if (!at) return { ok: false, where: "", why: "no point off every part, off the face and off every UI region", title };
  await press({ x: at.x, y: at.y });
  let after = await readFace(page, view);
  for (let i = 0; i < 20 && after && after.face && after.stays; i++) { // the frame that clears the face may still be coming
    await new Promise((done) => setTimeout(done, 50));
    after = await readFace(page, view);
  }
  const where = `${at.x.toFixed(1)},${at.y.toFixed(1)} CSS px: ${at.source}`;
  const ok = !!after && after.face == null && after.stays === true;
  return { ok, where, why: ok ? "" : `after the press the face is ${after && after.face ? "still open" : "gone"} and the view is ${after && after.stays ? "open" : "closed"}`, title };
}
