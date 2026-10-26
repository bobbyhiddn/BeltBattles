// Types for scripts/android-version.mjs (M1, BRIEF-M1 Goal 4), so tests/m1.version.test.ts type-checks without allowJs.
export const MAX_VERSION_CODE: number;
export function androidVersion(version: string, rebuild?: number | string): { versionName: string; versionCode: number };
export function rebuildFromTag(tag: string, version: string): number;
export function run(argv: string[], readPackage?: (path: string) => { version?: unknown }): string;
