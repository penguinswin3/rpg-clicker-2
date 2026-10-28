import { Injectable, inject } from '@angular/core';
import { Subject } from 'rxjs';
import { ActivityLogService } from '../activity-log/activity-log.service';
import {
  COLLECTION_LOG_SETS,
  CollectionLogCategory,
  CollectionLogEntryConfig,
  CollectionLogSetConfig,
  CollectionLogSource,
} from '../configs/game-config';
import { getEquipmentFlavor, getFighterEnemyFlavor, RESOURCE_FLAVOR } from '../configs/flavor-text';

export interface CollectionLogSnapshot {
  /** Entry id -> times collected. An id absent here has never been collected. */
  counts: Record<string, number>;
}

export interface CollectionProgress {
  collected: number;
  total: number;
}

/** The loot shape CombatService already has in hand at drop time. */
export type CollectionLogDropItem = Extract<CollectionLogSource, { type: 'drop' }>['item'];

const ALL_ENTRIES: CollectionLogEntryConfig[] = COLLECTION_LOG_SETS.flatMap(s => s.entries);

/**
 * Owns the Collection Log's per-entry counts (COLLECTION_LOG_SETS, game-config.ts).
 * Whoever performs the real event calls the matching `record*` method directly — same
 * "the actor records it" convention as StatisticsService.recordAction — and an event
 * with no matching entry is a silent no-op, so callers never need to check first.
 * Collected is sticky: counts only ever grow. Runs regardless of whether the
 * `collectionLog` system is unlocked; that only gates the modal.
 */
@Injectable({ providedIn: 'root' })
export class CollectionLogService {
  private activityLog = inject(ActivityLogService);

  private counts = new Map<string, number>();

  private changesSource = new Subject<void>();
  readonly changes$ = this.changesSource.asObservable();

  recordCraft(equipmentId: string): void {
    this.recordMatching(s => s.type === 'craft' && s.equipmentId === equipmentId);
  }

  recordKill(enemyId: string): void {
    this.recordMatching(s => s.type === 'kill' && s.enemyId === enemyId);
  }

  recordDrop(enemyId: string, item: CollectionLogDropItem): void {
    this.recordMatching(s => {
      if (s.type !== 'drop' || s.enemyId !== enemyId || s.item.type !== item.type) return false;
      return s.item.type === 'equipment'
        ? s.item.equipmentId === (item as { equipmentId: string }).equipmentId
        : s.item.resourceId === (item as { resourceId: string }).resourceId;
    });
  }

  getCount(entryId: string): number {
    return this.counts.get(entryId) ?? 0;
  }

  isCollected(entryId: string): boolean {
    return this.getCount(entryId) > 0;
  }

  setProgress(set: CollectionLogSetConfig): CollectionProgress {
    return this.progressOf(set.entries);
  }

  categoryProgress(category: CollectionLogCategory): CollectionProgress {
    return this.progressOf(COLLECTION_LOG_SETS.filter(s => s.category === category).flatMap(s => s.entries));
  }

  get overallProgress(): CollectionProgress {
    return this.progressOf(ALL_ENTRIES);
  }

  private progressOf(entries: CollectionLogEntryConfig[]): CollectionProgress {
    return { collected: entries.filter(e => this.isCollected(e.id)).length, total: entries.length };
  }

  private recordMatching(matches: (source: CollectionLogSource) => boolean): void {
    let changed = false;
    for (const entry of ALL_ENTRIES) {
      if (!matches(entry.source)) continue;
      const next = this.getCount(entry.id) + 1;
      this.counts.set(entry.id, next);
      changed = true;
      // 'rare' — a brand-new entry is a noteworthy one-off, and logging above
      // 'default' gets it screen-reader-announced for free (AGENTS.md §19).
      if (next === 1) this.activityLog.log(`New collection log entry: ${entryDisplayName(entry)}.`, 'rare');
    }
    if (changed) this.changesSource.next();
  }

  getSnapshot(): CollectionLogSnapshot {
    return { counts: Object.fromEntries(this.counts) };
  }

  restore(snapshot: CollectionLogSnapshot | undefined): void {
    this.counts = new Map(Object.entries(snapshot?.counts ?? {}));
    this.changesSource.next();
  }
}

/** The collected item/monster's own name — shared by the new-entry log line and the
 *  panel (which swaps in COLLECTION_LOG_KILL_LABEL for a kill row inside its own
 *  monster's set, where repeating the monster's name would be redundant). */
export function entryDisplayName(entry: CollectionLogEntryConfig): string {
  const source = entry.source;
  switch (source.type) {
    case 'craft':
      return getEquipmentFlavor(source.equipmentId).label;
    case 'kill':
      return getFighterEnemyFlavor(source.enemyId).label;
    case 'drop':
      return source.item.type === 'equipment'
        ? getEquipmentFlavor(source.item.equipmentId).label
        : titleCase(RESOURCE_FLAVOR[source.item.resourceId]?.name ?? '');
  }
}

/** The monster a 'monsters'-category set is about — taken from its 'kill' entry, so the
 *  set config doesn't have to restate it. */
export function setEnemyId(set: CollectionLogSetConfig): string | undefined {
  for (const entry of set.entries) if (entry.source.type === 'kill') return entry.source.enemyId;
  return undefined;
}

/** RESOURCE_FLAVOR names are all-caps (Party Vault styling) — title-cased here so a
 *  resource reads like the mixed-case equipment names beside it. */
export function titleCase(text: string): string {
  return text.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}
