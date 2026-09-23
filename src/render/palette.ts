// Shared palette. Anchors follow BeltBreaker v1 (#050B12 ink, slate ramps, amber/cyan
// accents); industrial-fantasy extensions add rust, brass, timber, verdigris, fire and
// the dark wind's plum. Sprites should only use these named values.

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

export const FACTION: Record<"orc" | "elf", FactionPalette> = {
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
