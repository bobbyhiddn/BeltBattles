// Types for scripts/ios-version.mjs (M2, BRIEF-M2 Goal 2), so tests/m2.workflows.test.ts type-checks without allowJs.
export function iosVersion(version: string): { marketingVersion: string };
export function kindFromTag(tag: string, version: string): "release" | "smoke";
export function run(argv: string[], readPackage?: (path: string) => { version?: unknown }): string;
