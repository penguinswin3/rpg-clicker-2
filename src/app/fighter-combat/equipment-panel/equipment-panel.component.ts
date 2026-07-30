import { Component, Input, OnInit, OnDestroy, inject, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { EQUIPMENT_SLOTS, EQUIPMENT_ITEMS, EquipmentSlotInstance } from '../../configs/game-config';
import { getEquipmentFlavor, getRarityFlavor } from '../../configs/flavor-text';
import { EquipmentService } from '../equipment.service';

@Component({
  selector: 'app-equipment-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './equipment-panel.component.html',
  styleUrl: './equipment-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EquipmentPanelComponent implements OnInit, OnDestroy {
  private equipment = inject(EquipmentService);
  private cdr = inject(ChangeDetectorRef);
  private sub = new Subscription();

  @Input() disabled = false;

  readonly slots: EquipmentSlotInstance[] = EQUIPMENT_SLOTS;

  ngOnInit(): void {
    this.sub.add(this.equipment.changes$.subscribe(() => this.cdr.markForCheck()));
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  equippedItemId(slotInstanceId: string): string | undefined {
    return this.equipment.getEquippedItemId(slotInstanceId);
  }

  label(itemId: string): string {
    return getEquipmentFlavor(itemId).label;
  }

  /** Looks up rarity from the static config, not the runtime inventory — an equipped
   *  item has already left the bag, so it wouldn't be found in inventoryEntries. */
  rarityColor(itemId: string): string {
    const config = EQUIPMENT_ITEMS.find(i => i.id === itemId);
    return config ? getRarityFlavor(config.rarity).color : '#bbb';
  }

  unequip(slotInstanceId: string): void {
    if (this.disabled) return;
    this.equipment.unequip(slotInstanceId);
  }
}
