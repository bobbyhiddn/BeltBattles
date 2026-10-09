// FIELD-1 (REQ-BFG-075): the readability test's checks for the battle settings (the logic half,
// tests/styles.readability.test.ts; the rendered half reads the drawn battle in scripts/stylecheck.mjs). For every setting,
// against the colours that cover its ground (what is behind the boards: SCENE_GROUND):
//  - the board plate's edge: its ink rim (C.ink) against the ground, WCAG contrast;
//  - each carrier style's hull, and each faction's default hull (the foes): the fill against the ground, CIE76 delta E (a
//    hull reads by its colour as much as by its brightness, and its ink rim carries the outline: that is the edge row);
//  - the damage smoke (below 50% hull: slate3, slate4) and fire (below 25%: fire4, yellow, white) against the ground, WCAG.
// The thresholds are today's weakest: the least value each check takes over today's three seas (and today's four default
// carriers), so no setting reads worse than a battle reads now (as CUSTOM-3 set its carrier thresholds). Display only: no
// sim value. Not in the player bundle (tools and tests import it).

import { C, FACTION } from "./palette";
import { SCENE_IDS, type SceneId, type SeaKind } from "./motion";
import { SEAS } from "./backdrop";
import { CARRIERS } from "./styles";
import { CARRIER_FACTIONS, FIRE_25, SMOKE_50, carrierFill, contrast, separation } from "./styleContrast";

/** The colours that cover each setting's ground (its far layer, opaque: the base and its large tones). The seas: their
 *  base, deep and swell (backdrop.ts farLayer draws only these). tests/styles.readability.test.ts renders each far layer
 *  and finds these colours covering at least 90% of it. */
export const SCENE_GROUND: Record<SceneId, readonly string[]> = {
  calm: [SEAS.calm.base, SEAS.calm.deep, SEAS.calm.swell],
  storm: [SEAS.storm.base, SEAS.storm.deep, SEAS.storm.swell],
  ember: [SEAS.ember.base, SEAS.ember.deep, SEAS.ember.swell],
  forest: ["#0D1C15", "#102620", "#0F2219"],
  desert: ["#2C1F10", "#30220E", "#231709"],
  badlands: ["#26110C", "#2E150E"],
  sky: ["#0A1A36", "#0E1F42", "#10224A", "#10233F", "#0E2140", "#08162D", "#13253F"],
  clouds: ["#121820", "#182029", "#1C2530"],
};

export const TODAY_SEAS: readonly SeaKind[] = ["calm", "storm", "ember"];

const minOver = <T>(xs: readonly T[], f: (x: T) => number): number => Math.min(...xs.map(f));

/** One setting's checks. */
export interface SceneChecks {
  /** The plate's ink rim against the ground (WCAG). */
  edge: number;
  /** Each carrier style's fill against the ground (delta E), the least over the four factions' fills of that style. */
  styles: Record<string, number>;
  /** Each faction's default fill (hull2) against the ground (delta E). */
  factions: Record<string, number>;
  /** Smoke at 50% and fire at 25% against the ground (WCAG). */
  smoke: number;
  fire: number;
}

export function sceneChecks(s: SceneId): SceneChecks {
  const G = SCENE_GROUND[s];
  const styles: Record<string, number> = {};
  for (const st of CARRIERS) styles[st.id] = minOver(CARRIER_FACTIONS, (f) => minOver(G, (g) => separation(carrierFill(st, f), g)));
  const factions: Record<string, number> = {};
  for (const f of CARRIER_FACTIONS) factions[f] = minOver(G, (g) => separation(FACTION[f].hull2, g));
  return {
    edge: minOver(G, (g) => contrast(C.ink, g)),
    styles,
    factions,
    smoke: minOver(SMOKE_50, (c) => minOver(G, (g) => contrast(c, g))),
    fire: minOver(FIRE_25, (c) => minOver(G, (g) => contrast(c, g))),
  };
}

/** Today's weakest over the three seas (the hull check over today's four default carriers): the thresholds. */
function today(): { edge: number; hull: number; smoke: number; fire: number } {
  const v = TODAY_SEAS.map(sceneChecks);
  return {
    edge: Math.min(...v.map((x) => x.edge)),
    hull: Math.min(...v.map((x) => Math.min(...Object.values(x.factions)))),
    smoke: Math.min(...v.map((x) => x.smoke)),
    fire: Math.min(...v.map((x) => x.fire)),
  };
}

export const SCENE_THRESHOLDS = today();

/** Every row: setting, check, value, threshold, pass. */
export function sceneRows(): { scene: SceneId; check: string; value: number; min: number; pass: boolean }[] {
  const T = SCENE_THRESHOLDS, e = 1e-9;
  const out: { scene: SceneId; check: string; value: number; min: number; pass: boolean }[] = [];
  for (const s of SCENE_IDS) {
    const k = sceneChecks(s);
    out.push({ scene: s, check: "plate edge (ink rim, WCAG)", value: k.edge, min: T.edge, pass: k.edge >= T.edge - e });
    for (const st of CARRIERS) out.push({ scene: s, check: `hull ${st.name} (delta E)`, value: k.styles[st.id], min: T.hull, pass: k.styles[st.id] >= T.hull - e });
    for (const f of CARRIER_FACTIONS) out.push({ scene: s, check: `foe ${f} default (delta E)`, value: k.factions[f], min: T.hull, pass: k.factions[f] >= T.hull - e });
    out.push({ scene: s, check: "smoke at 50% (WCAG)", value: k.smoke, min: T.smoke, pass: k.smoke >= T.smoke - e });
    out.push({ scene: s, check: "fire at 25% (WCAG)", value: k.fire, min: T.fire, pass: k.fire >= T.fire - e });
  }
  return out;
}
