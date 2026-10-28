import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  ElementRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import {
  CollectionLogService,
  CollectionProgress,
  entryDisplayName,
  setEnemyId,
} from './collection-log.service';
import { CollectionLogDetail, CollectionLogDetailComponent } from './collection-log-detail.component';
import {
  COLLECTION_LOG_CATEGORIES,
  COLLECTION_LOG_SETS,
  CollectionLogCategory,
  CollectionLogEntryConfig,
  CollectionLogSetConfig,
  EQUIPMENT_ITEMS,
  LootDrop,
} from '../configs/game-config';
import {
  COLLECTION_LOG_CATEGORY_FLAVOR,
  COLLECTION_LOG_KILL_LABEL,
  COLLECTION_LOG_SET_FLAVOR,
  getRarityFlavor,
  RESOURCE_FLAVOR,
} from '../configs/flavor-text';
import { SettingsService } from '../options/settings.service';
import { formatAmount } from '../shared/number-format';

/** The Collection Log modal — fixed-size, with category tabs pinned above a scrolling
 *  body that holds either the set grid or one entry's detail view. Uncollected entries
 *  render as "???" rather than being hidden: a deliberate exception to the usual
 *  "invisible until unlocked" convention, since visible gaps (and real set / overall
 *  totals) are the whole point of a collection log. Drop rates live only in a
 *  monster's detail view, not on the grid. */
@Component({
  selector: 'app-collection-log-panel',
  standalone: true,
  imports: [CommonModule, CollectionLogDetailComponent],
  templateUrl: './collection-log-panel.component.html',
  styleUrl: './collection-log-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CollectionLogPanelComponent implements OnInit, OnDestroy {
  private collectionLog = inject(CollectionLogService);
  private settings = inject(SettingsService);
  private cdr = inject(ChangeDetectorRef);
  private host: ElementRef<HTMLElement> = inject(ElementRef);
  private sub = new Subscription();

  readonly categories = COLLECTION_LOG_CATEGORIES;
  activeCategory: CollectionLogCategory = COLLECTION_LOG_CATEGORIES[0];
  dropRateAsPercent = this.settings.state.dropRateAsPercent;

  detail: CollectionLogDetail | null = null;
  /** `data-focus-key` of whatever opened the detail view — focus returns there on Back. */
  private returnFocusKey: string | null = null;

  get activeSets(): CollectionLogSetConfig[] {
    return COLLECTION_LOG_SETS.filter(s => s.category === this.activeCategory);
  }

  get overall(): CollectionProgress {
    return this.collectionLog.overallProgress;
  }

  get overallPercent(): number {
    const { collected, total } = this.overall;
    return total > 0 ? Math.floor((collected / total) * 100) : 0;
  }

  ngOnInit(): void {
    this.sub.add(this.collectionLog.changes$.subscribe(() => this.cdr.markForCheck()));
    this.sub.add(this.settings.state$.subscribe(s => {
      this.dropRateAsPercent = s.dropRateAsPercent;
      this.cdr.markForCheck();
    }));
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  selectCategory(category: CollectionLogCategory): void {
    this.activeCategory = category;
    this.detail = null;
    this.returnFocusKey = null;
  }

  categoryLabel(category: CollectionLogCategory): string {
    return COLLECTION_LOG_CATEGORY_FLAVOR[category]?.label ?? category;
  }

  categoryProgress(category: CollectionLogCategory): CollectionProgress {
    return this.collectionLog.categoryProgress(category);
  }

  setLabel(set: CollectionLogSetConfig): string {
    return COLLECTION_LOG_SET_FLAVOR[set.id]?.label ?? set.id;
  }

  setProgress(set: CollectionLogSetConfig): CollectionProgress {
    return this.collectionLog.setProgress(set);
  }

  isComplete(set: CollectionLogSetConfig): boolean {
    const { collected, total } = this.setProgress(set);
    return collected === total;
  }

  setEnemy(set: CollectionLogSetConfig): string | undefined {
    return setEnemyId(set);
  }

  /** A monster's details unlock with its first kill — same "???" rule as its entries. */
  isMonsterKnown(set: CollectionLogSetConfig): boolean {
    const kill = set.entries.find(e => e.source.type === 'kill');
    return !!kill && this.collectionLog.isCollected(kill.id);
  }

  isCollected(entry: CollectionLogEntryConfig): boolean {
    return this.collectionLog.isCollected(entry.id);
  }

  count(entry: CollectionLogEntryConfig): number {
    return this.collectionLog.getCount(entry.id);
  }

  entryLabel(entry: CollectionLogEntryConfig): string {
    return entry.source.type === 'kill' ? COLLECTION_LOG_KILL_LABEL : entryDisplayName(entry);
  }

  /** An item's own rarity color, a resource's own accent color, plain white otherwise —
   *  the same color an item/resource already wears everywhere else. */
  entryColor(entry: CollectionLogEntryConfig): string {
    const source = entry.source;
    const equipmentId =
      source.type === 'craft' ? source.equipmentId
      : source.type === 'drop' && source.item.type === 'equipment' ? source.item.equipmentId
      : undefined;
    if (equipmentId) {
      const rarity = EQUIPMENT_ITEMS.find(i => i.id === equipmentId)?.rarity;
      return rarity ? getRarityFlavor(rarity).color : '#fff';
    }
    if (source.type === 'drop' && source.item.type === 'resource') {
      return RESOURCE_FLAVOR[source.item.resourceId]?.color ?? '#fff';
    }
    return '#fff';
  }

  openEntry(entry: CollectionLogEntryConfig): void {
    const source = entry.source;
    switch (source.type) {
      case 'craft':
        this.openDetail({ kind: 'equipment', equipmentId: source.equipmentId }, `entry:${entry.id}`);
        break;
      case 'kill':
        this.openDetail({ kind: 'monster', enemyId: source.enemyId }, `entry:${entry.id}`);
        break;
      case 'drop':
        this.openDetail(
          source.item.type === 'equipment'
            ? { kind: 'equipment', equipmentId: source.item.equipmentId }
            : { kind: 'resource', resourceId: source.item.resourceId },
          `entry:${entry.id}`
        );
        break;
    }
  }

  openMonster(enemyId: string): void {
    this.openDetail({ kind: 'monster', enemyId }, `monster:${enemyId}`);
  }

  closeDetail(): void {
    this.detail = null;
    const key = this.returnFocusKey;
    this.returnFocusKey = null;
    // Render the grid back first, so the button that opened the detail exists again.
    this.cdr.detectChanges();
    if (key) {
      this.host.nativeElement.querySelector<HTMLElement>(`[data-focus-key="${key}"]`)?.focus();
    }
  }

  /** Arrow fn so the detail view can call it unbound. A loot row that isn't a Collection
   *  Log entry at all (guaranteed currency) is never hidden. */
  readonly isLootCollected = (enemyId: string, drop: LootDrop): boolean => {
    const entry = COLLECTION_LOG_SETS.flatMap(s => s.entries).find(e => {
      const s = e.source;
      if (s.type !== 'drop' || s.enemyId !== enemyId) return false;
      if (drop.type === 'equipment') return s.item.type === 'equipment' && s.item.equipmentId === drop.equipmentId;
      if (drop.type === 'resource') return s.item.type === 'resource' && s.item.resourceId === drop.resourceId;
      return false;
    });
    return entry ? this.collectionLog.isCollected(entry.id) : true;
  };

  formatProgress(p: CollectionProgress): string {
    return `${p.collected}/${p.total}`;
  }

  formatAmount(value: number): string {
    return formatAmount(value);
  }

  trackSet(_: number, set: CollectionLogSetConfig): string {
    return set.id;
  }

  trackEntry(_: number, entry: CollectionLogEntryConfig): string {
    return entry.id;
  }

  private openDetail(detail: CollectionLogDetail, returnFocusKey: string): void {
    this.detail = detail;
    this.returnFocusKey = returnFocusKey;
  }
}
