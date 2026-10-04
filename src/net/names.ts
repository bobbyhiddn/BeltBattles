// PACKS M2 (REQ-BFG-063): required player names. The ONE module with the name rules: the name screen
// (src/screens/name.ts), the client's snapshot checks (src/game/ghostSnapshot.ts isSnapshot) and the strict decoder
// the server runs (src/net/snapshot.ts checkSnapshot; server/app.ts POST /v1/ghosts) all call nameProblem.
//
//  - A name is 2 to NAME_MAX (10) characters of A-Z, 0-9, space and hyphen. The screen takes what was typed through
//    normalizeName (upper-cased, trimmed, inner runs of spaces collapsed to one). Snapshots and the server take only
//    that canonical form: anything else (lower case, a leading, trailing or double space) is "bad characters".
//  - A small blocklist (slurs and the worst profanity), kept ROT13-encoded below so the source does not spell them
//    out, is checked on the name with spaces and hyphens removed and the digit swaps undone (0 O, 1 I, 3 E, 4 A, 5 S,
//    7 T): ANYWHERE words are refused wherever they appear in it; WHOLE words (short ones that sit inside ordinary
//    words: CLASSIC, GRAPE, HANCOCK, SCUNTHORPE) only when they are the whole name or one of its words. WANDERER is
//    reserved: it is what the game shows for a ghost without a name. Both are "not allowed".
//  - The tag that tells two ANNAs apart is "#" and two upper-case hex digits: the low byte of FNV-1a 32 (offset basis
//    0x811c9dc5, prime 0x01000193) over the playerId string's UTF-16 code units (a playerId is ASCII: ID_PATTERN).
//    It is never stored or sent: every reader derives it from snapshot.playerId, so nobody can choose it.

export const NAME_MIN = 2;
export const NAME_MAX = 10;
/** What a foe without a player name is called (seed pool ghosts, legacy uploads); no player may take it. */
export const WANDERER = "WANDERER";
/** Where the name lives on the device: localStorage, beside the anonymous player id (ghostSnapshot.ts PLAYER_KEY). */
export const NAME_KEY = "beltbattles.name.v1";

export type NameProblem = "missing" | "too short" | "too long" | "bad characters" | "not allowed";

/** The screen's text for each refusal (short plain upper-case words, no decimals). */
export const NAME_REFUSAL: Record<NameProblem, string> = {
  missing: "TYPE A NAME",
  "too short": "NAME TOO SHORT",
  "too long": "NAME TOO LONG",
  "bad characters": "ONLY A-Z 0-9 SPACE -",
  "not allowed": "PICK ANOTHER NAME",
};
/** The name screen's title and its hint line. */
export const NAME_TITLE = "YOUR CAPTAIN NAME";
export const NAME_HINT = `${NAME_MIN} TO ${NAME_MAX} OF A-Z 0-9 SPACE -`;

const CANON = /^[A-Z0-9 -]+$/;

/** What the screen makes of the typed text: upper case, trimmed, inner runs of spaces (any white space) as one space. */
export function normalizeName(input: string): string {
  return String(input ?? "").toUpperCase().replace(/\s+/g, " ").trim();
}

function rot13(s: string): string {
  return s.replace(/[A-Z]/g, (c) => String.fromCharCode(((c.charCodeAt(0) - 65 + 13) % 26) + 65));
}

// ROT13 (decoded once, at load). Refused wherever they appear in the squashed name:
const ANYWHERE = ("AVTTRE AVTTN AVTTNM SNTTBG SNTTVG SHPX FUVG JUBER OVGPU ONFGNEQ ERGNEQ XVXR CHFFL CRAVF INTVAN GJNG "
  + "JNAXRE QVYQB WVMM FYHG UVGYRE FVRTURVY XXX ZBYRFG CRQBCUVYR CNRQB GENAAL JRGONPX GBJRYURNQ NFFUBYR NEFRUBYR OBYYBPXF "
  + "CBEA CVFF XVYYLBHEFRYS PUVAXL").split(" ").map(rot13);
// ...and refused only as the whole squashed name or one of the name's words:
const WHOLE = new Set(("PHAG PHAGF FCVP FCVPF PUVAX PUVAXF PBPX PBPXF QVPX QVPXF ENCR ENCRQ ENCRF ENCVFG ANMV ANMVF CRQB "
  + "CRQBF QLXR QLXRF SNT SNTF UBZB PBBA PBBAF TBBX TBBXF JBC ORNARE CNXV ARTEB NFF NEFR GVG GVGF OBBOF PHZ FRK NANY NAHF "
  + "JNAX XLF UBAXL").split(" ").map(rot13));

const SWAPS: Record<string, string> = { "0": "O", "1": "I", "3": "E", "4": "A", "5": "S", "7": "T" };
const unswap = (s: string) => s.replace(/[013457]/g, (d) => SWAPS[d]);

/** The blocklist and the reserved WANDERER on a canonical name: true when it is refused ("not allowed"). */
export function blockedName(name: string): boolean {
  const squashed = unswap(name.replace(/[ -]/g, ""));
  if (squashed === WANDERER || WHOLE.has(squashed) || ANYWHERE.some((w) => squashed.includes(w))) return true;
  return name.split(/[ -]+/).some((w) => WHOLE.has(unswap(w)));
}

/**
 * Why `name` can't be a player name, or null when it can. One reason, checked in this order: missing (absent or
 * empty), bad characters (not a string, a character outside A-Z 0-9 space hyphen, or not the canonical form), too short,
 * too long, not allowed (the blocklist, or WANDERER). The server answers an upload's reason as 422 "name: <reason>".
 */
export function nameProblem(name: unknown): NameProblem | null {
  if (name === undefined || name === null || name === "") return "missing";
  if (typeof name !== "string" || !CANON.test(name) || name !== normalizeName(name)) return "bad characters";
  if (name.length < NAME_MIN) return "too short";
  if (name.length > NAME_MAX) return "too long";
  if (blockedName(name)) return "not allowed";
  return null;
}

/** The tag's two hex digits for a playerId: the low byte of FNV-1a 32 over the string (see the header). */
export function nameTag(playerId: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < playerId.length; i++) {
    h ^= playerId.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return (h & 0xff).toString(16).toUpperCase().padStart(2, "0");
}

/** A player as other players see them: NAME#TAG. */
export function displayName(name: string, playerId: string): string {
  return `${name}#${nameTag(playerId)}`;
}
