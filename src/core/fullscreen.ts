// C1 (store hardening, BRIEF-C1 item 4): a FULLSCREEN on/off choice for the title's OPTIONS card (ui/hud.ts optionsCard). The
// page asks the browser (the Fullscreen API on the document element), keeps its label in step with the browser's own
// `fullscreenchange` (Esc leaves fullscreen too, and so does a browser button), and shows the choice only where the browser
// can do it: `document.fullscreenEnabled` true. Where it is false (an iPhone's Safari, a frame without `allowfullscreen`) or
// there is no `document` (tests, a server), the row is not drawn at all: never a dead button. The state is never kept here:
// it is read from `document.fullscreenElement` each time it is drawn, so it cannot go stale. Nothing here touches the sim.

/** The part of `document` read here (tests pass a fake). */
export interface FullscreenDoc {
  fullscreenEnabled?: boolean;
  fullscreenElement?: unknown;
  documentElement?: { requestFullscreen?: (options?: { navigationUI?: "hide" | "show" | "auto" }) => Promise<void> | void };
  exitFullscreen?: () => Promise<void> | void;
  addEventListener(type: "fullscreenchange", listener: () => void): void;
  removeEventListener(type: "fullscreenchange", listener: () => void): void;
}

const pageDocument = (): FullscreenDoc | undefined => (typeof document === "undefined" ? undefined : document);

/** The browser can do fullscreen here (`document.fullscreenEnabled` is true). */
export function fullscreenAvailable(doc: FullscreenDoc | undefined = pageDocument()): boolean {
  return doc?.fullscreenEnabled === true;
}

/** The page is fullscreen now (some element is). */
export function isFullscreen(doc: FullscreenDoc | undefined = pageDocument()): boolean {
  return !!doc?.fullscreenElement;
}

/** The OPTIONS row's label, in the words of its neighbours (REDUCED MOTION: ON, SOUND: OFF). */
export function fullscreenLabel(on: boolean): string {
  return `FULLSCREEN: ${on ? "ON" : "OFF"}`;
}

/** The OPTIONS row as it is drawn now, or null where the browser cannot do fullscreen (no row, no dead button). */
export function fullscreenRow(doc: FullscreenDoc | undefined = pageDocument()): { label: string; active: boolean } | null {
  if (!fullscreenAvailable(doc)) return null;
  const on = isFullscreen(doc);
  return { label: fullscreenLabel(on), active: on };
}

/** A promise a caller does not wait for: a refusal (no user gesture, a frame that may not) is not an error in a game. */
function quietly(p: unknown): void {
  void Promise.resolve(p).catch(() => undefined);
}

/** Leave fullscreen if the page is in it, else ask for it on the document element. Call it from a tap (the browser wants a
 *  user gesture). Never throws, never waits: the row's label follows `fullscreenchange`, not this call. */
export function toggleFullscreen(doc: FullscreenDoc | undefined = pageDocument()): void {
  if (!doc || !fullscreenAvailable(doc)) return;
  try {
    if (isFullscreen(doc)) quietly(doc.exitFullscreen?.());
    else quietly(doc.documentElement?.requestFullscreen?.());
  } catch {
    /* an engine that throws instead of rejecting: the page stays as it is */
  }
}

/** Calls `onChange(fullscreen)` when the browser's `fullscreenchange` fires (a toggle, Esc, a browser button). Returns a
 *  function that stops listening. With no document it listens to nothing. */
export function watchFullscreen(onChange: (fullscreen: boolean) => void, doc: FullscreenDoc | undefined = pageDocument()): () => void {
  if (!doc) return () => undefined;
  const on = () => onChange(isFullscreen(doc));
  doc.addEventListener("fullscreenchange", on);
  return () => doc.removeEventListener("fullscreenchange", on);
}
