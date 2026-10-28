/**
 * Config ids that were renamed after shipping, old -> new. Ids are save keys (action
 * counts, crafting progress, upgrade levels), so a rename would otherwise silently drop
 * that data from an existing save. Each restore() that reads id-keyed data runs it
 * through `migrateId`/`migrateKeys` — add an entry here whenever an id is renamed, and
 * never remove one (an old save can be loaded at any time).
 */
export const RENAMED_IDS: Readonly<Record<string, string>> = {
  'blacksmith-forge-ingots': 'blacksmith-smelt-ingots',
  'faster-forging': 'faster-smelting',
};

export function migrateId(id: string): string {
  return RENAMED_IDS[id] ?? id;
}

/** Re-keys a saved id -> value record. If a save somehow holds both the old and new id,
 *  the new id's value wins rather than being overwritten by the stale one. */
export function migrateKeys<T>(record: Record<string, T>): Record<string, T> {
  const migrated: Record<string, T> = {};
  for (const [id, value] of Object.entries(record)) {
    const newId = migrateId(id);
    if (newId !== id && newId in record) continue;
    migrated[newId] = value;
  }
  return migrated;
}
