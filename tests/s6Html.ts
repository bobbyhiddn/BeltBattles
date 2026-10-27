// S6 (REQ-BFG-119): a small, strict HTML checker for the two static pages (server/pages/*.html). It is not a browser: it holds the pages to the
// plain rules they are written under. Every element is closed explicitly (no optional end tags), every attribute value is quoted, the only raw-text
// element is <style>, and the void elements are the HTML ones. tests/s6.pages.test.ts uses it, and shows it catches what it is for.

export const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);

export interface Tag {
  name: string;
  attrs: Record<string, string>;
  /** Index of the `<` in the source. */
  at: number;
}

export interface Parsed {
  /** Every start tag, in order. */
  tags: Tag[];
  /** Problems found while reading: unbalanced or crossed tags, a stray `<` or `>`, an unquoted attribute value, an unclosed element. */
  errors: string[];
  /** The text of each <style> element. */
  styles: string[];
  /** The text between tags, tags removed (style content left out), whitespace squeezed. */
  text: string;
}

const TOKEN = /<!--[\s\S]*?-->|<!doctype[^>]*>|<\/([a-zA-Z][a-zA-Z0-9-]*)\s*>|<([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^<>]*?)?)\s*(\/?)>/gi;
const ATTR = /([a-zA-Z_:][a-zA-Z0-9_:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

export function parseHtml(src: string): Parsed {
  const tags: Tag[] = [];
  const errors: string[] = [];
  const styles: string[] = [];
  const stack: string[] = [];
  const textParts: string[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  TOKEN.lastIndex = 0;
  const gap = (from: number, to: number): void => {
    const between = src.slice(from, to);
    if (/[<>]/.test(between)) errors.push(`a stray < or > in the text at ${from}: ${JSON.stringify(between.slice(0, 40))}`);
    textParts.push(between);
  };
  while ((m = TOKEN.exec(src)) !== null) {
    gap(last, m.index);
    last = m.index + m[0].length;
    if (m[0].startsWith("<!")) continue; // a comment or the doctype
    if (m[1] !== undefined) {
      const name = m[1].toLowerCase();
      const top = stack.pop();
      if (top !== name) errors.push(`</${name}> at ${m.index} closes ${top === undefined ? "nothing" : `<${top}>`}`);
      continue;
    }
    const name = m[2].toLowerCase();
    const attrs: Record<string, string> = {};
    const raw = m[3] ?? "";
    let a: RegExpExecArray | null;
    ATTR.lastIndex = 0;
    while ((a = ATTR.exec(raw)) !== null) {
      if (a[4] !== undefined) errors.push(`<${name} ${a[1]}=${a[4]}> at ${m.index}: the attribute value is not quoted`);
      attrs[a[1].toLowerCase()] = a[2] ?? a[3] ?? a[4] ?? "";
    }
    tags.push({ name, attrs, at: m.index });
    if (VOID.has(name)) continue;
    if (m[4] === "/") {
      errors.push(`<${name}/> at ${m.index}: a self-closing non-void element`);
      continue;
    }
    if (name === "style") {
      const end = src.indexOf("</style>", last);
      if (end < 0) {
        errors.push("<style> is never closed");
        break;
      }
      styles.push(src.slice(last, end));
      last = end + "</style>".length;
      TOKEN.lastIndex = last;
      continue;
    }
    stack.push(name);
  }
  gap(last, src.length);
  for (const open of stack) errors.push(`<${open}> is never closed`);
  return { tags, errors, styles, text: textParts.join("").replace(/\s+/g, " ").trim() };
}

// ------------------------------------------------------------------------------------------------------------------ contrast

/** A hex colour (#rgb or #rrggbb) as [r, g, b] in 0..255, or null. */
export function hexToRgb(hex: string): [number, number, number] | null {
  const h = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!h) return null;
  const s = h[1].length === 3 ? [...h[1]].map((c) => c + c).join("") : h[1];
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}

/** WCAG 2 relative luminance. */
export function luminance([r, g, b]: [number, number, number]): number {
  const lin = (v: number): number => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG 2 contrast ratio of two colours, 1..21. */
export function contrast(a: [number, number, number], b: [number, number, number]): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export interface Rule {
  selector: string;
  decls: Record<string, string>;
}

/** The rules of a style sheet without at-rules: `selector { property: value; ... }`. */
export function parseCss(css: string): Rule[] {
  const rules: Rule[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css.replace(/\/\*[\s\S]*?\*\//g, ""))) !== null) {
    const decls: Record<string, string> = {};
    for (const d of m[2].split(";")) {
      const i = d.indexOf(":");
      if (i > 0) decls[d.slice(0, i).trim().toLowerCase()] = d.slice(i + 1).trim();
    }
    rules.push({ selector: m[1].trim(), decls });
  }
  return rules;
}

/** The first #hex colour inside a declaration's value (`1px solid #243649` -> `#243649`), or null. */
export function hexIn(value: string | undefined): string | null {
  return value?.match(/#[0-9a-fA-F]{3,6}\b/)?.[0] ?? null;
}
