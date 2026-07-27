// Shared assertion helpers for the config-integrity / save-completeness / rate-coverage
// spec files — see AGENTS.md's "Testing" section. Kept here rather than inline in any one
// spec since more than one spec file uses them, and new specs should reuse rather than
// re-derive their own version of the same check.

/** Every id in `ids` that has no entry in `flavorMap` — e.g. a RESOURCES/CHARACTER_ACTIONS/
 *  TIMED_ACTIONS/UPGRADES id with no matching flavor-text.ts entry. Empty result means the
 *  invariant holds. */
export function idsMissingFlavor(ids: string[], flavorMap: Record<string, unknown>): string[] {
  return ids.filter(id => !(id in flavorMap));
}

/** Every id in `ids` that appears more than once — catches a copy-pasted config entry
 *  that forgot to change its id (two upgrades silently sharing one id, etc). */
export function duplicateIds(ids: string[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) dupes.add(id);
    seen.add(id);
  }
  return [...dupes];
}

/** Every id in `ids` that isn't present in `validIds` — for cross-referencing config
 *  fields that point at another config's id (an upgrade's `actionId`, an objective
 *  reward's `characterId`, ...). */
export function danglingReferences(ids: string[], validIds: Iterable<string>): string[] {
  const valid = new Set(validIds);
  return ids.filter(id => !valid.has(id));
}

/** Common emoji code point ranges — deliberately broad, not exhaustive, since the rule
 *  (AGENTS.md's "No emojis, ever") is a blanket ban: flag anything that looks like one
 *  rather than trying to enumerate every emoji precisely. Covers the emoji-presentation
 *  blocks (misc pictographs, emoticons, transport, supplemental symbols, dingbats,
 *  misc symbols) plus the explicit emoji variation selector. None of this game's actual
 *  symbols (see RESOURCE_FLAVOR) fall inside these ranges. */
const EMOJI_PATTERN = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;

/** Every [id, symbol] pair whose symbol looks like an emoji rather than a plain Unicode
 *  text glyph. Empty result means the invariant holds. */
export function emojiSymbols(symbols: Record<string, string>): [string, string][] {
  return Object.entries(symbols).filter(([, symbol]) => EMOJI_PATTERN.test(symbol));
}
