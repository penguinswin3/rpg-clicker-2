import { Component, Input, OnInit, OnDestroy, inject, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { EmptyStateComponent } from '../../shared/empty-state/empty-state.component';
import { TooltipDirective } from '../../shared/tooltip/tooltip.directive';
import { TooltipContent } from '../../shared/tooltip/tooltip-content';
import { EQUIPMENT_SLOTS, EQUIPMENT_ITEMS, EquipmentConfig } from '../../configs/game-config';
import { getEquipmentFlavor, getRarityFlavor } from '../../configs/flavor-text';
import { EquipmentService } from '../equipment.service';

/** Unequipped item stacks, one square icon box per stack — click one to equip it into
 *  its first free (or, if none are free, its first) matching slot instance. Name,
 *  rarity, slot, count, and effect all live in the hover tooltip rather than on the box
 *  itself, so the grid stays a simple row of icons. */
@Component({
  selector: 'app-inventory-panel',
  standalone: true,
  imports: [CommonModule, EmptyStateComponent, TooltipDirective],
  templateUrl: './inventory-panel.component.html',
  styleUrl: './inventory-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InventoryPanelComponent implements OnInit, OnDestroy {
  private equipment = inject(EquipmentService);
  private cdr = inject(ChangeDetectorRef);
  private sub = new Subscription();

  @Input() disabled = false;

  get entries(): { config: EquipmentConfig; count: number }[] {
    return this.equipment.inventoryEntries;
  }

  ngOnInit(): void {
    this.sub.add(this.equipment.changes$.subscribe(() => this.cdr.markForCheck()));
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  /** `entries` builds a fresh array of fresh objects on every call (see
   *  EquipmentService.inventoryEntries) — without a trackBy keyed on the stable item id,
   *  *ngFor treats every change-detection pass as "all new," destroying and recreating
   *  each icon box's DOM node. That silently cancels any in-progress hover (the box a
   *  tooltip is timing on is a different node moments later), so a trackBy here isn't
   *  just a perf nicety, it's required for hover to work at all. */
  trackByItemId(_index: number, entry: { config: EquipmentConfig; count: number }): string {
    return entry.config.id;
  }

  symbol(id: string): string {
    return getEquipmentFlavor(id).symbol;
  }

  rarityColor(rarity: EquipmentConfig['rarity']): string {
    return getRarityFlavor(rarity).color;
  }

  tooltip(entry: { config: EquipmentConfig; count: number }): TooltipContent {
    const flavor = getEquipmentFlavor(entry.config.id);
    const rarity = getRarityFlavor(entry.config.rarity);
    const slot = EQUIPMENT_SLOTS.find(s => s.slotType === entry.config.slotType);
    return {
      title: flavor.label,
      rows: [
        { label: 'Rarity', value: rarity.label, color: rarity.color },
        { label: 'Slot', value: slot?.label ?? '' },
        { label: 'Count', value: `x${entry.count}` },
        { label: 'Effect', value: flavor.description, wrap: true },
      ],
    };
  }

  equip(itemId: string): void {
    if (this.disabled) return;
    const slotId = this.firstCompatibleSlotId(itemId);
    if (slotId) this.equipment.equip(itemId, slotId);
  }

  private firstCompatibleSlotId(itemId: string): string | undefined {
    const item = EQUIPMENT_ITEMS.find(i => i.id === itemId);
    if (!item) return undefined;
    const candidates = EQUIPMENT_SLOTS.filter(s => s.slotType === item.slotType);
    const empty = candidates.find(s => !this.equipment.getEquippedItemId(s.id));
    return (empty ?? candidates[0])?.id;
  }
}
