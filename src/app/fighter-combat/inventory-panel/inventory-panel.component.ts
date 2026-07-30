import { Component, Input, OnInit, OnDestroy, inject, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { EmptyStateComponent } from '../../shared/empty-state/empty-state.component';
import { EQUIPMENT_SLOTS, EQUIPMENT_ITEMS, EquipmentConfig } from '../../configs/game-config';
import { getEquipmentFlavor, getRarityFlavor } from '../../configs/flavor-text';
import { EquipmentService } from '../equipment.service';

/** Unequipped item stacks — click one to equip it into its first free (or, if none are
 *  free, its first) matching slot instance. */
@Component({
  selector: 'app-inventory-panel',
  standalone: true,
  imports: [CommonModule, EmptyStateComponent],
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

  label(id: string): string {
    return getEquipmentFlavor(id).label;
  }

  description(id: string): string {
    return getEquipmentFlavor(id).description;
  }

  rarityColor(rarity: EquipmentConfig['rarity']): string {
    return getRarityFlavor(rarity).color;
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
