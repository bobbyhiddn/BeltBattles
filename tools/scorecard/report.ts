// SC-TOOL: one mode's rows, written as <out>/sc-<mode>.json and <out>/sc-<mode>.md. The Markdown opens with the
// scorecard table (target id | target | measured | PASS/MISS | notes), then each detail table.

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { cmpOf, cmpText, fmtMeasured, judge, type Measured, type Target, type Verdict } from "./targets";

export interface Row {
  id: string;
  target: string; // the target as read from the targets file ("[10, 30]", ">= 17", ...)
  measured: Measured | null;
  unit: string; // what `measured` counts
  verdict: Verdict;
  notes: string[];
  detail?: unknown; // per-hero / per-day / per-part table, JSON only
}

/** A row against its target from the file (N/A with a note when the file has no such id). */
export function row(targets: readonly Target[], id: string, measured: Measured | null, unit: string, notes: string[], detail?: unknown, digits = 2): Row & { digits: number } {
  const t = targets.find((x) => x.id === id);
  if (!t) return { id, target: "(not in targets file)", measured, unit, verdict: "N/A", notes: [...notes, "the targets file has no row with this id"], detail, digits };
  const c = cmpOf(t);
  return { id, target: cmpText(c), measured, unit, verdict: judge(c, measured), notes, detail, digits };
}

/** A detail section: a heading and its Markdown lines. */
export interface Section { title: string; lines: string[] }

/** A Markdown table from a header and rows of cells ("|" in a cell is escaped). */
export function mdTable(head: string[], rows: (string | number)[][]): string[] {
  const cell = (x: string | number) => String(x).replace(/\|/g, "\\|").replace(/\n/g, " ");
  return [`| ${head.map(cell).join(" | ")} |`, `|${head.map(() => "---").join("|")}|`, ...rows.map((r) => `| ${r.map(cell).join(" | ")} |`)];
}

export interface Meta { label: string; args: string[]; seconds: number; [k: string]: unknown }

export function writeMode(out: string, mode: string, rows: (Row & { digits?: number })[], sections: Section[], meta: Meta): void {
  mkdirSync(out, { recursive: true });
  const json = {
    mode, label: meta.label, generated: new Date().toISOString(), meta,
    rows: Object.fromEntries(rows.map((r) => [r.id, { target: r.target, measured: r.measured, unit: r.unit, verdict: r.verdict, notes: r.notes, detail: r.detail }])),
  };
  writeFileSync(resolve(out, `sc-${mode}.json`), JSON.stringify(json, null, 1));
  const md: string[] = [
    `# Scorecard, --${mode} (${meta.label})`, "",
    `Generated ${json.generated} by tools/scorecard.ts in ${meta.seconds.toFixed(1)} s. Arguments: \`${meta.args.join(" ")}\`.`, "",
    ...mdTable(["target id", "target", "measured", "PASS/MISS", "notes"], rows.map((r) => [r.id, r.target, `${fmtMeasured(r.measured, r.digits ?? 2)} ${r.unit}`.trim(), r.verdict, r.notes.join(" ")])),
  ];
  for (const s of sections) md.push("", `## ${s.title}`, "", ...s.lines);
  writeFileSync(resolve(out, `sc-${mode}.md`), md.join("\n") + "\n");
}

/** One line per row for the console. */
export function printRows(mode: string, rows: Row[]): void {
  for (const r of rows) console.log(`${mode} ${r.id.padEnd(28)} ${r.target.padEnd(14)} ${fmtMeasured(r.measured).padEnd(18)} ${r.verdict}`);
}
