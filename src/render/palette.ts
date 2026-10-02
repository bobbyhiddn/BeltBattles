// Shared palette. Anchors follow BeltBreaker v1 (#050B12 ink, slate ramps, amber/cyan
// accents); industrial-fantasy extensions add rust, brass, timber, verdigris, fire and
// the dark wind's plum. Sprites should only use these named values.

import type { Faction } from "../sim/content"; // races:

export const C = {
  ink: "#050B12",
  night: "#0A131D",
  navy: "#101B27",
  slate0: "#172432",
  slate1: "#263745",
  slate2: "#344958",
  slate3: "#536875",
  slate4: "#7A8F9A",
  steel0: "#3E454C",
  steel1: "#5A5F64",
  steel2: "#8D938C",
  steel3: "#AFB1A3",
  bone: "#D0CEB7",
  white: "#E9F1E5",
  amber: "#F38F32",
  yellow: "#F6CF48",
  red: "#EF5B4E",
  maroon: "#501E1E",
  cyan: "#40E0DA",
  ice: "#80E5EF",
  blue: "#2899E8",
  deepblue: "#1B4F86",
  green: "#59DF67",
  lime: "#28FF64",
  moss: "#2D3732",
  // earth
  soil0: "#17120D",
  soil1: "#231C15",
  soil2: "#30271D",
  soil3: "#3F3426",
  soil4: "#584A34",
  soil5: "#76654A",
  scrub0: "#2B3320",
  scrub1: "#435230",
  // rust iron (orc)
  rust0: "#2E1610",
  rust1: "#4F2518",
  rust2: "#7A3A22",
  rust3: "#A5552F",
  rust4: "#CF7A45",
  // brass
  brass0: "#3D3014",
  brass1: "#6B5424",
  brass2: "#A58535",
  brass3: "#D8B75A",
  brass4: "#F2E08A",
  // timber
  wood0: "#2F1E12",
  wood1: "#4E331D",
  wood2: "#77502C",
  wood3: "#A57641",
  wood4: "#C99A5E",
  // verdigris (elf)
  verd0: "#0E2623",
  verd1: "#173F39",
  verd2: "#23695C",
  verd3: "#3E9C83",
  verd4: "#7FD2B0",
  // plum (dark wind, arcane)
  plum0: "#0F0816",
  plum1: "#1E1029",
  plum2: "#34194A",
  plum3: "#55306F",
  plum4: "#8A5CB0",
  // fire
  fire0: "#5E170C",
  fire1: "#A82E14",
  fire2: "#E0561B",
  fire3: "#FF9B2A",
  fire4: "#FFE38A",
  fire5: "#FFFBE0",
  // oil / grease
  oil0: "#0B130E",
  oil1: "#18281D",
  oil2: "#2F5A36",
  // copper
  cop0: "#4A2414",
  cop1: "#7E3F1F",
  cop2: "#B8672F",
  cop3: "#E39A55",
  // belts
  belt0: "#0D1218",
  belt1: "#161E27",
  belt2: "#26313C",
  belt3: "#3B4855",
  // 0.8.0 H1 (REQ-BFG-011): the human and dwarf ramps from the race art (raceart 0c094b2, render/races/palette.ts RC
  // and palette2.ts RC2). Blued, riveted steel (the human hull)
  bsteel0: "#151C26",
  bsteel1: "#222D3B",
  bsteel2: "#344457",
  bsteel3: "#50657C",
  bsteel4: "#7D93A8",
  // granite (the dwarf hull)
  stone0: "#1C1916",
  stone1: "#2E2924",
  stone2: "#473F37",
  stone3: "#6B5F52",
  stone4: "#968775",
  // rune light (the dwarf glow): periwinkle, bluer and colder than the elves' ice
  rune0: "#1A2150",
  rune1: "#2E3F9E",
  rune2: "#5A74E8",
  rune3: "#9DB0FF",
  rune4: "#DCE3FF",
  // skin (the human and dwarf portraits)
  skin0: "#4A2C1E",
  skin1: "#7C4B32",
  skin2: "#B37552",
  skin3: "#E0A77E",
  // BASTION's hull plating: cool dwarven iron with a rune tint, apart from every hull-bar colour
  plate0: "#1B2130",
  plate1: "#4A5670",
  plate2: "#8795B4",
  plate3: "#C6D0EA",
};

export type ColorName = keyof typeof C;

/** Rarity accent colours (always paired with a label/shape, never colour alone). */
export const RARITY_COLOR: Record<string, string> = {
  common: C.steel3,
  rare: C.cyan,
  epic: C.plum4,
  legendary: C.yellow,
};

export interface FactionPalette {
  hull0: string;
  hull1: string;
  hull2: string;
  hull3: string;
  hull4: string;
  trim0: string;
  trim1: string;
  trim2: string;
  deck0: string;
  deck1: string;
  deck2: string;
  glow: string;
}

const BASE_FACTION: Record<"orc" | "elf", FactionPalette> = { // races: renamed from FACTION (see below)
  orc: {
    hull0: C.rust0, hull1: C.rust1, hull2: C.rust2, hull3: C.rust3, hull4: C.rust4,
    trim0: C.steel0, trim1: C.steel1, trim2: C.steel2,
    deck0: "#1C1E22", deck1: "#272A2E", deck2: "#33373B",
    glow: C.fire3,
  },
  elf: {
    hull0: C.verd0, hull1: C.verd1, hull2: C.verd2, hull3: C.verd3, hull4: C.verd4,
    trim0: C.brass1, trim1: C.brass2, trim2: C.brass3,
    deck0: "#16232A", deck1: "#1E2F37", deck2: "#283C45",
    glow: C.ice,
  },
};

// races: the new factions' palettes. 0.8.0 H1: HUMAN (FOUNDRY) and DWARF (BASTION) are the race art's (raceart 0c094b2,
// render/races/palette.ts RACE_PAL); BEASTFOLK and UNALIGNED stay PLACEHOLDERS until METRONOME and SIPHON ship (0.9.0).
export const FACTION: Record<Faction, FactionPalette> = {
  ...BASE_FACTION,
  human: {
    hull0: C.bsteel0, hull1: C.bsteel1, hull2: C.bsteel2, hull3: C.bsteel3, hull4: C.bsteel4,
    trim0: C.brass1, trim1: C.brass2, trim2: C.brass3,
    deck0: "#191D24", deck1: "#222730", deck2: "#2D333D",
    glow: C.yellow,
  },
  dwarf: {
    hull0: C.stone0, hull1: C.stone1, hull2: C.stone2, hull3: C.stone3, hull4: C.stone4,
    trim0: C.steel0, trim1: C.steel1, trim2: C.steel2,
    deck0: "#1D1A18", deck1: "#282420", deck2: "#342F2A",
    glow: C.rune3,
  },
  beastfolk: BASE_FACTION.orc,
  unaligned: BASE_FACTION.elf,
};
