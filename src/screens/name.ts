// PACKS M2 (REQ-BFG-063): the name screen. A player name is required: with none stored, the title's first tap opens this
// screen before anything else (hero select, CONTINUE), and it can't be skipped; the options card's NAME entry opens the
// same screen to change it (CANCEL keeps the old name; a change affects later uploads only). It is an overlay the game
// shell draws over whatever screen is up (game.ts openName), so changing the name mid-run leaves that screen as it was.
// The canvas draws the dimmed backdrop, the panel, its title, hint and refusal line in the pixel font; the entry itself is
// a real HTML <input type=text> (so phone keyboards work) with an OK button of at least 44x44 CSS px laid over the panel's
// row. Letters show upper case as typed; Enter or OK submits; the refusal (names.ts NAME_REFUSAL) shows on the panel.

import type { Game } from "../game/game";
import { C } from "../render/palette";
import { rect, type G } from "../render/pixel";
import { drawText, textWidth } from "../render/font";
import { panel, type Rect } from "../ui/ui";
import { NAME_HINT, NAME_REFUSAL, NAME_TITLE, nameProblem, normalizeName, type NameProblem } from "../net/names";
import { currentName, setPlayerName } from "../game/ghostSnapshot";

/** The entry row's height in CSS px: the input and the OK button (a finger's 44 px, and some). */
export const NAME_ROW_CSS = 48;
/** The OK button's width in CSS px (and CANCEL's). */
export const NAME_OK_CSS = 64;
export const NAME_CANCEL_CSS = 96;
/** The input's maxLength: room to type past NAME_MAX, so a long name is refused with its reason, never cut. */
export const NAME_INPUT_MAX = 24;

export interface NameEntryOpts {
  /** First time (no name stored): no CANCEL, Escape does nothing. */
  required: boolean;
  /** After OK stored the name. */
  done?: (name: string) => void;
}

export interface NameLayout {
  panel: Rect;
  titleY: number;
  hintY: number;
  row: Rect; // where the HTML row (input, OK, CANCEL) sits, in logical px
  refusalY: number;
}

/** The panel in logical px for a W x H screen whose logical px is `k` CSS px. Pure (tests). */
export function nameLayout(W: number, H: number, k: number): NameLayout {
  const w = Math.min(W - 8, 260);
  const x = Math.round(W / 2 - w / 2);
  const rh = Math.ceil(NAME_ROW_CSS / k);
  const y = Math.max(4, Math.round(H * 0.08));
  const titleY = y + 6, hintY = y + 17;
  const row = { x: x + 6, y: y + 26, w: w - 12, h: rh };
  const refusalY = row.y + rh + 5;
  return { panel: { x, y, w, h: refusalY + 7 + 6 - y }, titleY, hintY, row, refusalY };
}

const css = (el: HTMLElement, style: Record<string, string>) => {
  for (const [k, v] of Object.entries(style)) el.style.setProperty(k, v);
};

export class NameEntry {
  problem: NameProblem | null = null;
  private box: HTMLDivElement | null = null;
  input: HTMLInputElement | null = null;
  private placed = "";

  constructor(private game: Game, readonly opts: NameEntryOpts) {
    if (typeof document === "undefined") return; // headless (tests): the rules and the storage still work
    const box = document.createElement("div");
    box.id = "bb-name";
    css(box, { position: "fixed", display: "flex", gap: "6px", "z-index": "10", "box-sizing": "border-box" });
    const input = document.createElement("input");
    input.id = "bb-name-input";
    input.type = "text";
    input.setAttribute("autocapitalize", "characters");
    input.setAttribute("autocomplete", "off");
    input.setAttribute("autocorrect", "off");
    input.setAttribute("spellcheck", "false");
    input.spellcheck = false;
    input.setAttribute("enterkeyhint", "done");
    input.setAttribute("aria-label", "Captain name");
    input.maxLength = NAME_INPUT_MAX;
    input.value = currentName() ?? "";
    css(input, {
      flex: "1 1 auto", "min-width": "0", height: "100%", "box-sizing": "border-box", margin: "0", padding: "0 10px",
      font: "bold 20px ui-monospace, Menlo, Consolas, monospace", "letter-spacing": "2px", "text-transform": "uppercase",
      color: C.bone, background: C.ink, border: `2px solid ${C.slate4}`, "border-radius": "0", outline: "none",
      "-webkit-user-select": "text", "user-select": "text", "caret-color": C.yellow,
    });
    input.addEventListener("keydown", (e) => {
      e.stopPropagation(); // the game's own keys (M, Space, Backspace...) stay out of the name
      if (e.key === "Enter") {
        e.preventDefault();
        this.submit();
      } else if (e.key === "Escape") this.cancel();
    });
    input.addEventListener("input", (e) => {
      this.problem = null;
      if ((e as InputEvent).isComposing) return;
      const v = input.value, up = v.toUpperCase();
      if (v !== up) {
        const a = input.selectionStart, b = input.selectionEnd;
        input.value = up;
        if (a !== null && b !== null) input.setSelectionRange(a, b);
      }
    });
    box.appendChild(input);
    const btn = (id: string, label: string, w: number, bg: string, fg: string, onTap: () => void) => {
      const b = document.createElement("button");
      b.id = id;
      b.type = "button";
      b.textContent = label;
      css(b, {
        flex: "0 0 auto", width: `${w}px`, "min-width": "44px", height: "100%", "min-height": "44px", margin: "0", padding: "0",
        font: "bold 18px ui-monospace, Menlo, Consolas, monospace", color: fg, background: bg, border: `2px solid ${C.ink}`,
        "border-radius": "0", cursor: "pointer", "touch-action": "manipulation",
      });
      b.addEventListener("click", (e) => {
        e.preventDefault();
        onTap();
      });
      box.appendChild(b);
    };
    btn("bb-name-ok", "OK", NAME_OK_CSS, C.amber, C.ink, () => this.submit());
    if (!opts.required) btn("bb-name-cancel", "CANCEL", NAME_CANCEL_CSS, C.slate2, C.white, () => this.cancel());
    document.body.appendChild(box);
    this.box = box;
    this.input = input;
    this.focus();
  }

  focus(): void {
    try {
      this.input?.focus({ preventScroll: true });
    } catch {
      /* ignore */
    }
  }

  /** OK or Enter: store the name if names.ts takes it, else show why on the panel. */
  submit(): void {
    const name = normalizeName(this.input?.value ?? "");
    if (this.input) this.input.value = name;
    const p = nameProblem(name);
    if (p) {
      this.problem = p;
      this.game.audio.play("error");
      this.focus();
      return;
    }
    setPlayerName(name);
    this.game.closeName();
    this.opts.done?.(name);
  }

  /** Text typed into the entry, as the tooling types it (scripts/touchcheck.mjs uses the real input instead). */
  type(text: string): void {
    if (this.input) this.input.value = text;
  }

  cancel(): void {
    if (this.opts.required) return;
    this.game.closeName();
  }

  /** Keys that reach the game while the entry is up (the input has its own): Enter submits, Escape cancels. */
  key(k: string): void {
    if (k === "Enter") this.submit();
    else if (k === "Escape") this.cancel();
    else this.focus();
  }

  dispose(): void {
    this.box?.remove();
    this.box = null;
    this.input = null;
  }

  /** Tooling (bb.nameEntry()): the layout as drawn and the refusal line. */
  info(): { required: boolean; problem: NameProblem | null; refusal: string | null; layout: NameLayout } {
    const { W, H, view } = this.game;
    return { required: this.opts.required, problem: this.problem, refusal: this.problem ? NAME_REFUSAL[this.problem] : null, layout: nameLayout(W, H, view.scale / view.dpr) };
  }

  draw(g: G): void {
    const { W, H, view, ui } = this.game;
    const k = view.scale / view.dpr;
    const L = nameLayout(W, H, k);
    g.globalAlpha = 0.8;
    rect(g, 0, 0, W, H, C.ink);
    g.globalAlpha = 1;
    ui.add({ id: "namebg", r: { x: 0, y: 0, w: W, h: H }, onTap: () => this.focus() });
    panel(g, L.panel, "raised");
    ui.add({ id: "namecard", r: L.panel, onTap: () => this.focus() });
    const cx = L.panel.x + L.panel.w / 2;
    drawText(g, NAME_TITLE, cx, L.titleY, C.yellow, { align: "center", outline: C.ink });
    drawText(g, NAME_HINT, cx, L.hintY, C.slate4, { font: "3", align: "center" });
    rect(g, L.row.x - 1, L.row.y - 1, L.row.w + 2, L.row.h + 2, C.ink);
    if (this.problem) {
      const t = NAME_REFUSAL[this.problem];
      const font = textWidth(t) <= L.panel.w - 8 ? "5" : "3";
      drawText(g, t, cx, L.refusalY, C.red, { font, align: "center", outline: C.ink });
    }
    this.place(L.row, k);
  }

  /** The HTML row over the panel's row, in CSS px (set only when it moved). */
  private place(row: Rect, k: number): void {
    if (!this.box) return;
    const r = this.game.canvas.getBoundingClientRect();
    const left = Math.round(r.left + row.x * k), top = Math.round(r.top + row.y * k);
    const w = Math.round(row.w * k), h = Math.max(NAME_ROW_CSS, Math.round(row.h * k));
    const key = `${left},${top},${w},${h}`;
    if (key === this.placed) return;
    this.placed = key;
    css(this.box, { left: `${left}px`, top: `${top}px`, width: `${w}px`, height: `${h}px` });
  }
}
