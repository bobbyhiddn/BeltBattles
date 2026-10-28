// IDENT-1 (REQ-BFG-122): the title's two OPTIONS entries and their cards. S6 (REQ-BFG-119): and a third row, PRIVACY, which opens the privacy
// policy outside the game (net/privacyLink.ts); it has no card and is on whatever the session is. S6D (REQ-BFG-119): and MY PLAYER ID, between
// LINK A DEVICE and DELETE MY ONLINE DATA: the operator's decision that a player who lost every device can quote their own ID.
//   LINK A DEVICE        a card with two choices. SHOW MY CODE asks the server for a one-time code (net/linkClient.ts requestLinkCode) and
//                        shows it big as XXXX-XXXX, the minutes left and one line: ENTER IT ON YOUR OTHER DEVICE. ENTER A CODE has a real
//                        HTML <input> (the name screen's way, src/screens/name.ts) with an OK button of at least 44x44 CSS px; it calls
//                        redeemLinkCode. Success says the device is linked and when that starts (the next NEW RUN); a refusal shows
//                        one plain line, chosen by the server's status.
//   MY PLAYER ID         a card that shows the player ID as a readable code (net/playerCode.ts: XXXX-XXXX-XXXX-XXXX, capitals and digits, 80 bits
//                        of the ID), big as the link code is, the NAME#TAG other players see (net/names.ts displayName) and one dim line: QUOTE THIS
//                        CODE IF YOU WRITE TO US ABOUT YOUR DATA. It sends nothing: it shows what the device holds (identity.playerId, which on a
//                        linked device is the player it is linked to, the ID its uploads carry). `ghost-admin delete-player` and `find-player` take the code.
//   DELETE MY ONLINE DATA  asks once (CANCEL / DELETE), says what goes and what stays, then reports the result (deleteOnlineData).
// With no server (offline, a build without one, a session that failed or has no identity yet) LINK, MY PLAYER ID and DELETE are drawn off and one
// plain line under the rows says why (hud.ts optionsCard's `extras`).
// The cards are modals (game.ts openModal): drawn over the screen, they take every tap and key, as the name screen does. Their layout is
// the pure layoutCard below, so tests/ident1.ui.test.ts checks exactly what is drawn on the desk and on the phones. The words follow
// docs/TEXT-STYLE.md section 8: capitals, whole sentences with their full stops, no line breaks of their own (they wrap at draw time).

import { currentName } from "../game/ghostSnapshot"; // S6D: the name other players see, on the MY PLAYER ID card
import type { Game, Modal } from "../game/game";
import { onlineSession, type Online } from "../game/online";
import type { Identity } from "../net/identity";
import { deleteOnlineData, redeemLinkCode, requestLinkCode } from "../net/linkClient";
import { displayName } from "../net/names"; // S6D: NAME#TAG
import { playerCode } from "../net/playerCode"; // S6D: the readable code of a player ID
import { PRIVACY_URL, openOutside } from "../net/privacyLink"; // S6 (REQ-BFG-119): the PRIVACY row
import { drawText, textWidth, wrap, type FontId } from "../render/font";
import { C } from "../render/palette";
import { rect, type G } from "../render/pixel";
import type { OptionsExtras } from "../ui/hud";
import { button, panel, type Rect } from "../ui/ui";

// ------------------------------------------------------------------------------------------------------------------ the words

/** Every word the cards and the OPTIONS entries use, in one place (tests/ident1.ui.test.ts sweeps them). */
export const WORDS = {
  linkRow: "LINK A DEVICE",
  deleteRow: "DELETE MY ONLINE DATA",
  privacyRow: "PRIVACY", // S6: always on, offline too: it opens the privacy policy outside the game (net/privacyLink.ts)
  idRow: "MY PLAYER ID", // S6D: on and off with LINK A DEVICE; the privacy page and the support page name this row (tests/s6.pages.test.ts)
  // why the two entries are off (one line, by state)
  offNone: "ONLINE ONLY. THIS GAME HAS NO SERVER.",
  offFailed: "THIS PAGE CANNOT GO ONLINE.",
  offLoading: "GETTING READY. TRY AGAIN IN A MOMENT.",
  // the link card
  linkTitle: "LINK A DEVICE",
  linkHint: "ONE DEVICE SHOWS A CODE. THE OTHER ENTERS IT.",
  showCode: "SHOW MY CODE",
  enterCode: "ENTER A CODE",
  asking: "ASKING THE SERVER...",
  useIt: "ENTER IT ON YOUR OTHER DEVICE.",
  expired: "THE CODE HAS EXPIRED. ASK FOR A NEW ONE.",
  newCode: "NEW CODE",
  entryHint: "TYPE THE CODE FROM YOUR OTHER DEVICE.",
  checking: "CHECKING THE CODE...",
  linked: "DEVICE LINKED. IT STARTS AT YOUR NEXT NEW RUN.",
  typeFirst: "TYPE THE CODE FIRST.",
  eightChars: "A CODE HAS 8 LETTERS AND NUMBERS.",
  neverThese: "CODES NEVER HAVE 0, 1, I, L OR O.",
  // the player ID card (S6D). `seenAs` has a % where NAME#TAG goes (seenLine); with no name stored the card says `seenNoName` instead
  idTitle: "MY PLAYER ID",
  seenAs: "OTHER PLAYERS SEE YOU AS %.",
  seenNoName: "YOU HAVE NO NAME YET. OTHER PLAYERS SEE YOU ONLY AFTER YOU PICK ONE.",
  quoteIt: "QUOTE THIS CODE IF YOU WRITE TO US ABOUT YOUR DATA.",
  // the delete card
  deleteTitle: "DELETE MY ONLINE DATA",
  goes: "THIS DELETES YOUR ONLINE PROFILE, YOUR LINKS AND YOUR GHOSTS.",
  stays: "YOUR PROGRESS ON THIS DEVICE STAYS.",
  deleting: "DELETING...",
  deleted: "DONE. YOUR NEXT ONLINE GAME STARTS A NEW PLAYER.",
  // buttons
  close: "CLOSE",
  back: "BACK",
  done: "DONE",
  cancel: "CANCEL",
  delete: "DELETE",
  tryAgain: "TRY AGAIN",
  // what a refusal says, by the server's status (failLine)
  noAnswer: "NO ANSWER FROM THE SERVER. TRY AGAIN.",
  codeRefused: "THAT CODE DID NOT WORK.",
  linkedAlready: "THIS DEVICE ALREADY HAS A LINKED PLAYER.",
  playerDeleted: "THIS PLAYER WAS DELETED. RESTART THE GAME.",
  clock: "YOUR CLOCK IS WRONG. SET IT RIGHT AND TRY AGAIN.",
  tooMany: "TOO MANY TRIES. TRY AGAIN IN A WHILE.",
  closed: "LINKING IS CLOSED RIGHT NOW.",
  serverNo: "THE SERVER SAID NO. TRY AGAIN LATER.",
} as const;

/** The countdown line: "9 MINUTES LEFT.", "1 MINUTE LEFT.". */
export const minutesLeftLine = (n: number): string => (n >= 2 ? `${n} MINUTES LEFT.` : "1 MINUTE LEFT.");

/** S6D: the player ID card's line about what other players see: "OTHER PLAYERS SEE YOU AS ANNA#4F." (names.ts displayName: the name, then the
 *  tag every reader derives from the player ID, which on a linked device is the ID its uploads carry), or, with no name stored (a player who has
 *  none cannot upload a ghost: the server refuses one without a name), what they see then. */
export const seenLine = (name: string | null, playerId: string): string =>
  name ? WORDS.seenAs.replace("%", () => displayName(name, playerId)) : WORDS.seenNoName;

/** The one plain line a refusal gets. `op`: which call. A status of its own where the server has one; no status = no answer. */
export function failLine(op: "code" | "redeem" | "delete", status?: number): string {
  if (status === undefined) return WORDS.noAnswer;
  if (op === "redeem" && status === 403) return WORDS.codeRefused; // wrong, expired or used: the server never says which, nor do we
  if (status === 409) return WORDS.linkedAlready;
  if (status === 410) return WORDS.playerDeleted;
  if (status === 422) return WORDS.clock;
  if (status === 429) return WORDS.tooMany;
  if (status === 403) return WORDS.closed;
  return WORDS.serverNo;
}

/** The 8 characters a code has (server/links.ts CODE_ALPHABET: A-Z without I L O, and 2-9). A typed code that cannot be one is told so
 *  here, without a try (the server counts wrong tries). tests/ident1.ui.test.ts pins this equal to the server's alphabet. */
const CODE_CHARS = /^[A-HJKMNP-Z2-9]{8}$/;

/** What was typed, as the server wants it: upper case, only letters and digits, XXXX-XXXX when it has 8; else the problem line. */
export function checkTyped(typed: string): { ok: true; code: string } | { ok: false; line: string } {
  const c = String(typed ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!c) return { ok: false, line: WORDS.typeFirst };
  if (c.length !== 8) return { ok: false, line: WORDS.eightChars };
  if (!CODE_CHARS.test(c)) return { ok: false, line: WORDS.neverThese };
  return { ok: true, code: `${c.slice(0, 4)}-${c.slice(4)}` };
}

// ------------------------------------------------------------------------------------------------------------------ availability

export interface LinkSession {
  url: string;
  identity: Identity;
}
export type Availability = { on: true; session: LinkSession } | { on: false; why: string };

/** Are LINK A DEVICE and DELETE MY ONLINE DATA on? Only with an online session that has an identity. Off with one plain reason: no
 *  session at all (offline, or a build with no server), a session that failed (no WebCrypto: a plain-http page), or one still loading. */
export function linkAvailability(s: Pick<Online, "url" | "identity" | "failed"> | null = onlineSession()): Availability {
  if (!s) return { on: false, why: WORDS.offNone };
  if (s.failed || s.identity === null) return { on: false, why: WORDS.offFailed };
  if (!s.identity) return { on: false, why: WORDS.offLoading };
  return { on: true, session: { url: s.url, identity: s.identity } };
}

export interface LinkCardDeps {
  requestLinkCode: typeof requestLinkCode;
  redeemLinkCode: typeof redeemLinkCode;
  deleteOnlineData: typeof deleteOnlineData;
  /** Whether the entries are on, now (default: the page's online session). */
  availability: () => Availability;
  /** The clock, for the code's time left at the moment it arrives. */
  now: () => number;
  /** S6: opens an address outside the game, for the PRIVACY row. Default: net/privacyLink.ts openOutside (a new tab on the web, the system
   *  browser in the apps). Optional, so a test's own full set of deps (ident1.ui.test.ts's fakeDeps) needs no change. */
  openOutside?: (url: string) => void;
  /** S6D: the name other players see on the MY PLAYER ID card (default: ghostSnapshot.ts currentName, the one the uploads carry). Optional, so a
   *  test's own full set of deps needs no change. */
  name?: () => string | null;
}

export function realDeps(): LinkCardDeps {
  return { requestLinkCode, redeemLinkCode, deleteOnlineData, availability: () => linkAvailability(), now: () => Date.now() };
}

/** The OPTIONS entries below NAME (hud.ts optionsCard's `extras`): LINK A DEVICE, (S6D) MY PLAYER ID and DELETE MY ONLINE DATA, off with the one
 *  line why while there is no session, and (S6) PRIVACY, always on: also offline, where the browser then shows its own offline page. `k`: the
 *  title's button size factor, read when a card opens and while it is up. */
export function optionsExtras(game: Game, k: () => number = () => 1, deps: Partial<LinkCardDeps> = {}): OptionsExtras {
  const d: LinkCardDeps = { ...realDeps(), ...deps };
  const a = d.availability();
  const open = (start: "link" | "delete" | "id") => () => game.openModal(new LinkCard(game, start, k, d));
  return {
    rows: [
      { id: "opt-link", label: WORDS.linkRow, disabled: !a.on, onTap: open("link") },
      // S6D (REQ-BFG-119): the player's own ID, on exactly when LINK A DEVICE is (an identity has loaded), off with the same note otherwise
      { id: "opt-id", label: WORDS.idRow, disabled: !a.on, onTap: open("id") },
      { id: "opt-delete", label: WORDS.deleteRow, disabled: !a.on, onTap: open("delete") },
      // S6 (REQ-BFG-119): the privacy policy, outside the game. Not tied to the session, the build or the demo flag
      { id: "opt-privacy", label: WORDS.privacyRow, onTap: () => (d.openOutside ?? openOutside)(PRIVACY_URL) },
    ],
    ...(a.on ? {} : { note: a.why }),
  };
}

// ------------------------------------------------------------------------------------------------------------------ the layout

export type Tone = "title" | "text" | "dim" | "ok" | "bad" | "code";

export interface Line {
  text: string;
  tone?: Tone;
  /** The code: drawn big (the largest scale of the 5x7 face the card holds). */
  big?: boolean;
}
export interface Btn {
  id: string;
  label: string;
  primary?: boolean;
  danger?: boolean;
  onTap: () => void;
}
/** What a card shows in one state. */
export interface Content {
  title: string;
  lines: Line[];
  /** The HTML entry row (input and OK) sits after the lines. */
  entry?: boolean;
  /** Lines under the entry row (a refusal, as the name screen puts its own below its row). */
  below?: Line[];
  buttons: Btn[];
  /** Stack the buttons (a menu), else two sit side by side. */
  stack?: boolean;
}

export interface LaidLine {
  text: string;
  /** The text's centre x and top y, logical px. */
  x: number;
  y: number;
  w: number;
  font: FontId;
  scale: number;
  tone: Tone;
}
export interface LaidButton {
  id: string;
  r: Rect;
  label: string;
  font: FontId;
  primary?: boolean;
  danger?: boolean;
}
export interface CardLayout {
  card: Rect;
  title: LaidLine;
  lines: LaidLine[];
  /** Where the HTML row (input and OK) sits, logical px; null while there is none. */
  row: Rect | null;
  buttons: LaidButton[];
  /** The body font: the 5x7 face where the title steps its scale down (k above 1: a phone), else the 3x5 face (as helpCard). */
  font: FontId;
}

/** The card's width at k = 1, logical px; it keeps that CSS width where the title steps its scale down (k times as wide), within the screen. */
export const CARD_W = 220;
/** The entry row's height in CSS px: the input and the OK button (a finger's 44 px, and some). */
export const ROW_CSS = 48;
/** The OK button's width in CSS px. */
export const OK_CSS = 64;
/** The input's maxLength: room for XXXX-XXXX with spaces or dashes typed in. */
export const INPUT_MAX = 16;

/**
 * The card for `c` on a W x H screen. `k`: the title's buttons' size factor (the menu scale over the title's; 1 on the desk).
 * `css`: CSS px per logical px (view.scale / view.dpr), which sizes the HTML row. Pure: the draw below and the tests read the same numbers.
 */
export function layoutCard(c: Content, W: number, H: number, k: number, css: number): CardLayout {
  const u = (n: number) => Math.ceil(n * k - 1e-9);
  const cw = Math.min(W - 8, Math.round(CARD_W * k));
  const x = Math.round((W - cw) / 2);
  const y = Math.max(4, Math.round(H * 0.08)); // near the top, as the name screen: a phone's keyboard leaves it in view
  const pad = 8, iw = cw - 2 * pad, cx = x + cw / 2;
  const font: FontId = k > 1 ? "5" : "3";
  const rowH = font === "5" ? 9 : 7;
  const title: LaidLine = { text: c.title, x: cx, y: y + 6, w: textWidth(c.title), font: "5", scale: 1, tone: "title" };
  let yy = y + 20;
  const lines: LaidLine[] = [];
  const put = (group: readonly Line[]): void => {
    for (const ln of group) {
      if (ln.big) {
        // the code: the largest scale (3, 2, 1) of the 5x7 face whose width and outline fit the card
        const base = textWidth(ln.text);
        const scale = [3, 2, 1].find((s) => base * s + 2 * s <= iw) ?? 1;
        lines.push({ text: ln.text, x: cx, y: yy + scale, w: base * scale, font: "5", scale, tone: "code" });
        yy += 9 * scale + 5;
      } else {
        for (const part of wrap(ln.text, iw, font)) {
          lines.push({ text: part, x: cx, y: yy, w: textWidth(part, font), font, scale: 1, tone: ln.tone ?? "text" });
          yy += rowH;
        }
        yy += 3;
      }
    }
  };
  put(c.lines);
  let row: Rect | null = null;
  if (c.entry) {
    const rh = Math.ceil(ROW_CSS / css - 1e-9); // at least ROW_CSS CSS px tall: the input and OK are a finger's size
    row = { x: x + pad, y: yy, w: iw, h: rh };
    yy += rh + 5;
  }
  put(c.below ?? []);
  const bh = u(19);
  const buttons: LaidButton[] = [];
  const labelFont = (label: string, w: number): FontId => (textWidth(label) <= w - 10 ? "5" : "3");
  const lay = (b: Btn, r: Rect): void => {
    buttons.push({ id: b.id, r, label: b.label, font: labelFont(b.label, r.w), ...(b.primary ? { primary: true } : {}), ...(b.danger ? { danger: true } : {}) });
  };
  if (c.buttons.length === 2 && !c.stack) {
    const bw = Math.floor((iw - 6) / 2);
    lay(c.buttons[0], { x: x + pad, y: yy, w: bw, h: bh });
    lay(c.buttons[1], { x: x + pad + bw + 6, y: yy, w: bw, h: bh });
    yy += bh;
  } else {
    const bw = c.buttons.length === 1 ? Math.min(iw, u(120)) : Math.min(iw, u(170));
    c.buttons.forEach((b, i) => {
      lay(b, { x: Math.round(cx - bw / 2), y: yy, w: bw, h: bh });
      yy += bh + (i < c.buttons.length - 1 ? 3 : 0);
    });
  }
  return { card: { x, y, w: cw, h: yy + 8 - y }, title, lines, row, buttons, font };
}

// ------------------------------------------------------------------------------------------------------------------ the card

type Step =
  | { s: "id" } // S6D: MY PLAYER ID, one state: it shows what the device holds and sends nothing
  | { s: "menu" }
  | { s: "asking" }
  | { s: "code"; code: string; t0: number; left: number }
  | { s: "codefail"; line: string }
  | { s: "enter"; problem: string | null }
  | { s: "checking" }
  | { s: "linked" }
  | { s: "confirm" }
  | { s: "deleting" }
  | { s: "deleted" }
  | { s: "deletefail"; line: string };

/** A code lives 10 minutes (server/links.ts CODE_TTL_MS); the countdown never starts above that, whatever the two clocks say. */
const CODE_TTL_MS = 10 * 60_000;

const css = (el: HTMLElement, style: Record<string, string>) => {
  for (const [k, v] of Object.entries(style)) el.style.setProperty(k, v);
};

export class LinkCard implements Modal {
  private step: Step;
  private box: HTMLDivElement | null = null;
  /** The HTML entry (null while the card is not at the entry step, and headless). */
  input: HTMLInputElement | null = null;
  private placed = "";
  private disposed = false;
  private seq = 0; // an answer that comes after the card moved on is dropped
  private typed = ""; // what was typed, kept across a refusal (and what a headless run types)

  constructor(private game: Game, start: "link" | "delete" | "id" = "link", private k: () => number = () => 1, private deps: LinkCardDeps = realDeps()) {
    this.step = start === "delete" ? { s: "confirm" } : start === "id" ? { s: "id" } : { s: "menu" };
  }

  /** Tooling and tests: the state and the layout as drawn. */
  info(): { step: Step["s"]; layout: CardLayout; content: Content } {
    const content = this.content();
    return { step: this.step.s, layout: this.layout(content), content };
  }

  private layout(content = this.content()): CardLayout {
    const { W, H, view } = this.game;
    return layoutCard(content, W, H, this.k(), view.scale / view.dpr);
  }

  // -------------------------------------------------------------------------------------------------- what each step shows

  private minutesLeft(): number {
    const st = this.step;
    if (st.s !== "code") return 0;
    const ms = st.left - (this.game.t - st.t0) * 1000;
    return ms <= 0 ? 0 : Math.ceil(ms / 60_000);
  }

  private content(): Content {
    const st = this.step;
    const b = (id: string, label: string, onTap: () => void, o: { primary?: boolean; danger?: boolean } = {}): Btn => ({ id, label, onTap, ...o });
    const close = b("link-close", WORDS.close, () => this.close());
    switch (st.s) {
      case "id": {
        // S6D: read live (the card stays right if the session goes away under it, or the name changes): the code of the ID the uploads carry
        const a = this.deps.availability();
        if (!a.on) return { title: WORDS.idTitle, lines: [{ text: a.why, tone: "dim" }], buttons: [b("id-close", WORDS.close, () => this.close(), { primary: true })] };
        const id = a.session.identity.playerId;
        return {
          title: WORDS.idTitle,
          lines: [{ text: playerCode(id), big: true }, { text: seenLine((this.deps.name ?? currentName)(), id) }, { text: WORDS.quoteIt, tone: "dim" }],
          buttons: [b("id-close", WORDS.close, () => this.close(), { primary: true })],
        };
      }
      case "menu":
        return {
          title: WORDS.linkTitle, lines: [{ text: WORDS.linkHint }], stack: true,
          buttons: [b("link-show", WORDS.showCode, () => void this.ask(), { primary: true }), b("link-enter", WORDS.enterCode, () => this.openEntry()), close],
        };
      case "asking":
        return { title: WORDS.linkTitle, lines: [{ text: WORDS.asking, tone: "dim" }], buttons: [close] };
      case "code": {
        const n = this.minutesLeft();
        return {
          title: WORDS.linkTitle,
          lines: [{ text: st.code, big: true }, n > 0 ? { text: minutesLeftLine(n), tone: "dim" } : { text: WORDS.expired, tone: "bad" }, { text: WORDS.useIt }],
          buttons: [b("link-new", WORDS.newCode, () => void this.ask()), b("link-close", WORDS.close, () => this.close(), { primary: true })],
        };
      }
      case "codefail":
        return { title: WORDS.linkTitle, lines: [{ text: st.line, tone: "bad" }], buttons: [b("link-retry", WORDS.tryAgain, () => void this.ask()), close] };
      case "enter":
        return {
          title: WORDS.linkTitle, lines: [{ text: WORDS.entryHint, tone: "dim" }], entry: true,
          ...(st.problem ? { below: [{ text: st.problem, tone: "bad" as const }] } : {}),
          buttons: [b("link-back", WORDS.back, () => this.setStep({ s: "menu" }))],
        };
      case "checking":
        return { title: WORDS.linkTitle, lines: [{ text: WORDS.checking, tone: "dim" }], buttons: [close] };
      case "linked":
        return { title: WORDS.linkTitle, lines: [{ text: WORDS.linked, tone: "ok" }], buttons: [b("link-done", WORDS.done, () => this.close(), { primary: true })] };
      case "confirm":
        return {
          title: WORDS.deleteTitle, lines: [{ text: WORDS.goes }, { text: WORDS.stays, tone: "dim" }],
          buttons: [b("del-cancel", WORDS.cancel, () => this.close()), b("del-go", WORDS.delete, () => void this.erase(), { danger: true })],
        };
      case "deleting":
        return { title: WORDS.deleteTitle, lines: [{ text: WORDS.deleting, tone: "dim" }], buttons: [close] };
      case "deleted":
        return { title: WORDS.deleteTitle, lines: [{ text: WORDS.deleted, tone: "ok" }], buttons: [b("del-done", WORDS.done, () => this.close(), { primary: true })] };
      case "deletefail":
        return { title: WORDS.deleteTitle, lines: [{ text: st.line, tone: "bad" }], buttons: [b("del-retry", WORDS.tryAgain, () => void this.erase()), close] };
    }
  }

  // -------------------------------------------------------------------------------------------------- the steps

  private setStep(next: Step): void {
    this.seq++; // whatever was asked before no longer matters
    this.step = next;
    if (next.s === "enter") this.makeRow();
    else this.dropRow();
  }

  close(): void {
    this.game.closeModal();
  }

  /** Escape: one step back (the menu), or out. */
  private back(): void {
    const s = this.step.s;
    if (s === "id" || s === "menu" || s === "linked" || s === "confirm" || s === "deleted" || s === "deletefail" || s === "deleting" || s === "checking") this.close();
    else this.setStep({ s: "menu" });
  }

  /** SHOW MY CODE (and NEW CODE): ask for a code. */
  async ask(): Promise<void> {
    const a = this.deps.availability();
    if (!a.on) return this.setStep({ s: "codefail", line: a.why }); // the session went away under the card
    this.setStep({ s: "asking" });
    const mine = this.seq;
    let r: Awaited<ReturnType<typeof requestLinkCode>>;
    try {
      r = await this.deps.requestLinkCode(a.session.url, a.session.identity);
    } catch {
      r = { ok: false, error: "failed" };
    }
    if (this.disposed || mine !== this.seq) return;
    if (r.ok) {
      const left = Math.max(0, Math.min(CODE_TTL_MS, r.expiresAt - this.deps.now()));
      this.setStep({ s: "code", code: r.code, t0: this.game.t, left });
    } else {
      this.setStep({ s: "codefail", line: failLine("code", r.status) });
    }
  }

  private openEntry(): void {
    this.setStep({ s: "enter", problem: null });
  }

  /** OK (or Enter) on the entry: check the typing here (no try is spent on a code that cannot be one), then redeem it. */
  async submit(): Promise<void> {
    if (this.step.s !== "enter") return;
    this.typed = this.input?.value ?? this.typed;
    const c = checkTyped(this.typed);
    if (!c.ok) {
      this.game.audio.play("error");
      this.setStep({ s: "enter", problem: c.line });
      return;
    }
    const a = this.deps.availability();
    if (!a.on) {
      this.setStep({ s: "enter", problem: a.why });
      return;
    }
    this.setStep({ s: "checking" });
    const mine = this.seq;
    let r: Awaited<ReturnType<typeof redeemLinkCode>>;
    try {
      r = await this.deps.redeemLinkCode(a.session.url, a.session.identity, c.code);
    } catch {
      r = { ok: false, error: "failed" };
    }
    if (this.disposed || mine !== this.seq) return;
    if (r.ok) this.setStep({ s: "linked" });
    else {
      this.game.audio.play("error");
      this.setStep({ s: "enter", problem: failLine("redeem", r.status) });
    }
  }

  /** DELETE: the server forgets the player; this device drops its key and link (linkClient.ts); local progress stays. */
  async erase(): Promise<void> {
    const a = this.deps.availability();
    if (!a.on) return this.setStep({ s: "deletefail", line: a.why });
    this.setStep({ s: "deleting" });
    const mine = this.seq;
    let r: Awaited<ReturnType<typeof deleteOnlineData>>;
    try {
      r = await this.deps.deleteOnlineData(a.session.url, a.session.identity);
    } catch {
      r = { ok: false, error: "failed" };
    }
    if (this.disposed || mine !== this.seq) return;
    this.setStep(r.ok ? { s: "deleted" } : { s: "deletefail", line: failLine("delete", r.status) });
  }

  // -------------------------------------------------------------------------------------------------- the HTML entry (name.ts's way)

  private makeRow(): void {
    this.dropRow();
    if (typeof document === "undefined" || !document.body) return; // headless (tests): the rules still work
    const box = document.createElement("div");
    box.id = "bb-link";
    css(box, { position: "fixed", display: "flex", gap: "6px", "z-index": "10", "box-sizing": "border-box" });
    const input = document.createElement("input");
    input.id = "bb-link-input";
    input.type = "text";
    input.setAttribute("autocapitalize", "characters");
    input.setAttribute("autocomplete", "off");
    input.setAttribute("autocorrect", "off");
    input.setAttribute("spellcheck", "false");
    input.spellcheck = false;
    input.setAttribute("enterkeyhint", "go");
    input.setAttribute("aria-label", "Link code");
    input.maxLength = INPUT_MAX;
    input.value = this.typed;
    css(input, {
      flex: "1 1 auto", "min-width": "0", height: "100%", "box-sizing": "border-box", margin: "0", padding: "0 10px",
      font: "bold 20px ui-monospace, Menlo, Consolas, monospace", "letter-spacing": "2px", "text-transform": "uppercase",
      color: C.bone, background: C.ink, border: `2px solid ${C.slate4}`, "border-radius": "0", outline: "none",
      "-webkit-user-select": "text", "user-select": "text", "caret-color": C.yellow,
    });
    input.addEventListener("keydown", (e) => {
      e.stopPropagation(); // the game's own keys (M, Space, Backspace...) stay out of the code
      if (e.key === "Enter") {
        e.preventDefault();
        void this.submit();
      } else if (e.key === "Escape") this.back();
    });
    input.addEventListener("input", (e) => {
      if ((e as InputEvent).isComposing) return;
      const v = input.value, up = v.toUpperCase();
      this.typed = up;
      if (v !== up) {
        const a = input.selectionStart, b = input.selectionEnd;
        input.value = up;
        if (a !== null && b !== null) input.setSelectionRange(a, b);
      }
    });
    box.appendChild(input);
    const ok = document.createElement("button");
    ok.id = "bb-link-ok";
    ok.type = "button";
    ok.textContent = "OK";
    css(ok, {
      flex: "0 0 auto", width: `${OK_CSS}px`, "min-width": "44px", height: "100%", "min-height": "44px", margin: "0", padding: "0",
      font: "bold 18px ui-monospace, Menlo, Consolas, monospace", color: C.ink, background: C.amber, border: `2px solid ${C.ink}`,
      "border-radius": "0", cursor: "pointer", "touch-action": "manipulation",
    });
    ok.addEventListener("click", (e) => {
      e.preventDefault();
      void this.submit();
    });
    box.appendChild(ok);
    document.body.appendChild(box);
    this.box = box;
    this.input = input;
    this.placed = "";
    this.focus();
  }

  private dropRow(): void {
    this.box?.remove();
    this.box = null;
    this.input = null;
  }

  focus(): void {
    try {
      this.input?.focus({ preventScroll: true });
    } catch {
      /* ignore */
    }
  }

  /** Text typed into the entry, as the tooling types it (a headless run has no input: it keeps the text). */
  type(text: string): void {
    this.typed = text;
    if (this.input) this.input.value = text;
  }

  /** The HTML row over the card's row, in CSS px (set only when it moved). */
  private place(row: Rect): void {
    if (!this.box) return;
    const k = this.game.view.scale / this.game.view.dpr;
    const r = this.game.canvas.getBoundingClientRect();
    const left = Math.round(r.left + row.x * k), top = Math.round(r.top + row.y * k);
    const w = Math.round(row.w * k), h = Math.max(ROW_CSS, Math.round(row.h * k));
    const key = `${left},${top},${w},${h}`;
    if (key === this.placed) return;
    this.placed = key;
    css(this.box, { left: `${left}px`, top: `${top}px`, width: `${w}px`, height: `${h}px` });
  }

  // -------------------------------------------------------------------------------------------------- Modal

  /** Keys that reach the game while the card is up (the entry has its own): Enter submits the entry, Escape steps back. */
  key(k: string): void {
    if (k === "Escape") this.back();
    else if (k === "Enter" && this.step.s === "enter") void this.submit();
    else this.focus();
  }

  dispose(): void {
    this.disposed = true;
    this.dropRow();
  }

  draw(g: G): void {
    const { W, H, ui } = this.game;
    const content = this.content();
    const L = this.layout(content);
    g.globalAlpha = 0.8;
    rect(g, 0, 0, W, H, C.ink);
    g.globalAlpha = 1;
    ui.add({ id: "linkbg", r: { x: 0, y: 0, w: W, h: H }, block: true, onTap: () => this.focus() }); // a tap outside the card changes nothing
    panel(g, L.card, "raised");
    ui.add({ id: "linkcard", r: L.card, block: true, onTap: () => this.focus() });
    drawText(g, L.title.text, L.title.x, L.title.y, C.yellow, { align: "center", outline: C.ink });
    const colour: Record<Tone, string> = { title: C.yellow, text: C.bone, dim: C.slate4, ok: C.lime, bad: C.red, code: C.white };
    for (const ln of L.lines) {
      drawText(g, ln.text, ln.x, ln.y, colour[ln.tone], { font: ln.font, align: "center", scale: ln.scale, ...(ln.tone === "code" ? { outline: C.ink } : {}) });
    }
    if (L.row) {
      rect(g, L.row.x - 1, L.row.y - 1, L.row.w + 2, L.row.h + 2, C.ink);
      this.place(L.row);
    }
    for (const b of L.buttons) {
      const def = content.buttons.find((x) => x.id === b.id);
      button(ui, g, b.id, b.r, b.label, { font: b.font, primary: b.primary, danger: b.danger, ...(def ? { onTap: def.onTap } : {}) });
    }
  }
}
