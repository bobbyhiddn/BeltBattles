// 0.6.1 flip (FUSE_LIVE = true): validateBuild rejects an unmerged same-star pair. Stars-off harness
// builds reproduce the v1 harness, which never merges, and the par decks (heroRefBuild) hold pairs until
// job E merges them. For those decks every other validateBuild rule must still hold.
export const exceptPairs = (errors: readonly string[]): string[] => errors.filter((e) => !e.startsWith("item: UNFUSED PAIR:"));
