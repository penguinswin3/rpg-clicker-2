import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  Output,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { StatBlockComponent } from '../fighter-combat/stat-block/stat-block.component';
import {
  EQUIPMENT_ITEMS,
  EQUIPMENT_SLOTS,
  EnemyConfig,
  FIGHTER_ENEMIES,
  LootDrop,
  PATTERNS,
} from '../configs/game-config';
import {
  getEquipmentFlavor,
  getFighterEnemyFlavor,
  getPatternFlavor,
  getRarityFlavor,
  RESOURCE_FLAVOR,
} from '../configs/flavor-text';
import { getMaxHp } from '../shared/six-stats';
import { formatDropRate } from '../shared/number-format';
import { titleCase } from './collection-log.service';

/** What the detail view is showing — a monster, an equipment piece, or a resource. */
export type CollectionLogDetail =
  | { kind: 'monster'; enemyId: string }
  | { kind: 'equipment'; equipmentId: string }
  | { kind: 'resource'; resourceId: string };

interface DetailRow {
  label: string;
  value: string;
  color?: string;
}

interface LootRow {
  name: string;
  color: string;
  quantity: string;
  rate: string;
}

/**
 * The Collection Log's in-modal detail pane — replaces the set grid rather than opening
 * a second modal (ModalService tracks exactly one, AGENTS.md §11). Every number is read
 * from the same config the real systems use, never restated. A loot row the player
 * hasn't collected yet keeps its name hidden ("???") but still shows its rate, same as
 * the grid row it came from.
 */
@Component({
  selector: 'app-collection-log-detail',
  standalone: true,
  imports: [CommonModule, StatBlockComponent],
  templateUrl: './collection-log-detail.component.html',
  styleUrl: './collection-log-detail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CollectionLogDetailComponent implements AfterViewInit {
  @Input({ required: true }) detail!: CollectionLogDetail;
  @Input() dropRateAsPercent = false;
  /** Whether a given loot row's item has been collected — supplied by the panel so this
   *  component stays free of CollectionLogService. */
  @Input() isLootCollected: (enemyId: string, drop: LootDrop) => boolean = () => true;
  @Output() back = new EventEmitter<void>();

  @ViewChild('backButton') backButton?: ElementRef<HTMLButtonElement>;

  /** Moves keyboard focus into the pane it just replaced the grid with, so a keyboard /
   *  screen-reader user isn't left on a node that no longer exists. */
  ngAfterViewInit(): void {
    this.backButton?.nativeElement.focus();
  }

  get enemy(): EnemyConfig | undefined {
    const detail = this.detail;
    return detail.kind === 'monster' ? FIGHTER_ENEMIES.find(e => e.id === detail.enemyId) : undefined;
  }

  get title(): string {
    switch (this.detail.kind) {
      case 'monster':
        return getFighterEnemyFlavor(this.detail.enemyId).label;
      case 'equipment':
        return getEquipmentFlavor(this.detail.equipmentId).label;
      case 'resource':
        return titleCase(RESOURCE_FLAVOR[this.detail.resourceId]?.name ?? '');
    }
  }

  get ascii(): string {
    return this.detail.kind === 'monster' ? getFighterEnemyFlavor(this.detail.enemyId).ascii : '';
  }

  /** Big icon-box glyph for an item/resource — the same symbol it wears in the
   *  inventory / Party Vault. Items have no ASCII art, so this is their "image." */
  get symbol(): string {
    if (this.detail.kind === 'equipment') return getEquipmentFlavor(this.detail.equipmentId).symbol;
    if (this.detail.kind === 'resource') return RESOURCE_FLAVOR[this.detail.resourceId]?.symbol ?? '';
    return '';
  }

  get symbolColor(): string {
    const detail = this.detail;
    if (detail.kind === 'equipment') {
      const rarity = EQUIPMENT_ITEMS.find(i => i.id === detail.equipmentId)?.rarity;
      return rarity ? getRarityFlavor(rarity).color : '#fff';
    }
    if (detail.kind === 'resource') return RESOURCE_FLAVOR[detail.resourceId]?.color ?? '#fff';
    return '#fff';
  }

  get rows(): DetailRow[] {
    switch (this.detail.kind) {
      case 'monster': {
        const enemy = this.enemy;
        return enemy ? [{ label: 'Max HP', value: `${getMaxHp(enemy.stats)}` }] : [];
      }
      case 'equipment': {
        const id = this.detail.equipmentId;
        const config = EQUIPMENT_ITEMS.find(i => i.id === id);
        if (!config) return [];
        const rarity = getRarityFlavor(config.rarity);
        const slot = EQUIPMENT_SLOTS.find(s => s.slotType === config.slotType);
        return [
          { label: 'Rarity', value: rarity.label, color: rarity.color },
          { label: 'Slot', value: slot?.label ?? config.slotType },
          { label: 'Effect', value: getEquipmentFlavor(id).description },
          ...this.sourceRows({ type: 'equipment', id }),
        ];
      }
      case 'resource':
        return [{ label: 'Type', value: 'Resource' }, ...this.sourceRows({ type: 'resource', id: this.detail.resourceId })];
    }
  }

  /** The monster's full loot table, uncollected rows included (name hidden, rate
   *  shown). Guaranteed currency isn't a Collection Log entry, so it's never hidden. */
  get lootRows(): LootRow[] {
    const enemy = this.enemy;
    if (!enemy) return [];
    return enemy.loot.map(drop => {
      const known = this.isLootCollected(enemy.id, drop);
      return {
        name: known ? this.lootName(drop) : '???',
        color: known ? this.lootColor(drop) : '#444',
        quantity: drop.type === 'resource' ? this.quantity(drop.min, drop.max) : '1',
        rate: formatDropRate(drop.chance, this.dropRateAsPercent),
      };
    });
  }

  /** Where an item comes from — every forge pattern that makes it, and every monster that
   *  drops it (with its rate). */
  private sourceRows(item: { type: 'equipment' | 'resource'; id: string }): DetailRow[] {
    const rows: DetailRow[] = [];
    if (item.type === 'equipment') {
      for (const pattern of PATTERNS.filter(p => p.equipmentId === item.id)) {
        rows.push({ label: 'Source', value: `Crafted (${getPatternFlavor(pattern.id).label})` });
      }
    }
    for (const enemy of FIGHTER_ENEMIES) {
      for (const drop of enemy.loot) {
        const matches =
          (item.type === 'equipment' && drop.type === 'equipment' && drop.equipmentId === item.id) ||
          (item.type === 'resource' && drop.type === 'resource' && drop.resourceId === item.id);
        if (!matches) continue;
        const rate = formatDropRate(drop.chance, this.dropRateAsPercent);
        rows.push({ label: 'Source', value: `${getFighterEnemyFlavor(enemy.id).label} (${rate})` });
      }
    }
    return rows;
  }

  private lootName(drop: LootDrop): string {
    switch (drop.type) {
      case 'resource':
        return titleCase(RESOURCE_FLAVOR[drop.resourceId]?.name ?? '');
      case 'equipment':
        return getEquipmentFlavor(drop.equipmentId).label;
      case 'pattern':
        return getPatternFlavor(drop.patternId).label;
    }
  }

  private lootColor(drop: LootDrop): string {
    if (drop.type === 'resource') return RESOURCE_FLAVOR[drop.resourceId]?.color ?? '#fff';
    if (drop.type === 'equipment') {
      const rarity = EQUIPMENT_ITEMS.find(i => i.id === drop.equipmentId)?.rarity;
      return rarity ? getRarityFlavor(rarity).color : '#fff';
    }
    return '#fff';
  }

  private quantity(min: number, max: number): string {
    return min === max ? `${min}` : `${min}-${max}`;
  }

  trackLoot(index: number): number {
    return index;
  }
}
