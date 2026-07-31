import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { SixStats } from '../shared/six-stats';
import { EQUIPMENT_ITEMS, EQUIPMENT_SLOTS, EquipmentConfig, FIGHTER_BASE_STATS } from '../configs/game-config';

export interface EquipmentSnapshot {
  inventory: Record<string, number>;
  equipped: Record<string, string>;
}

/**
 * Owns the Fighter's unequipped item counts and per-slot-instance equip state together —
 * equip/unequip is one atomic move between "in bag" and "worn," not two services reaching
 * into each other. Items are fungible by id (like a second, typed wallet): a given item
 * is always identical, held as a count, never an individually-rolled instance.
 *
 * equip()/unequip() below don't themselves check whether a fight is active. "Gear can't
 * change mid-fight" — the assumption that makes getEffectiveStats()/getBonusDamage()/
 * getDamageReduction()/getExtraAttackChance() safe to recompute live rather than
 * snapshot per-turn (see CombatService) — is enforced by the UI layer instead: the
 * `disabled` input on InventoryPanelComponent/EquipmentPanelComponent, gated on whether
 * CombatService has an active encounter. A future caller of equip()/unequip() that
 * bypasses those components would silently break that assumption — this service isn't
 * where the real guarantee lives.
 */
@Injectable({ providedIn: 'root' })
export class EquipmentService {
  private inventory = new Map<string, number>();
  /** Slot instance id -> equipped item id. A slot instance absent from this map is empty. */
  private equipped = new Map<string, string>();

  private changesSource = new Subject<void>();
  readonly changes$ = this.changesSource.asObservable();

  getInventoryCount(itemId: string): number {
    return this.inventory.get(itemId) ?? 0;
  }

  get inventoryEntries(): { config: EquipmentConfig; count: number }[] {
    return EQUIPMENT_ITEMS
      .map(config => ({ config, count: this.getInventoryCount(config.id) }))
      .filter(entry => entry.count > 0);
  }

  getEquippedItemId(slotInstanceId: string): string | undefined {
    return this.equipped.get(slotInstanceId);
  }

  /** Adds `count` copies of an item to the bag — the loot-granting path (CombatService)
   *  calls this on a victory equipment drop. */
  addToInventory(itemId: string, count = 1): void {
    if (count <= 0) return;
    this.inventory.set(itemId, this.getInventoryCount(itemId) + count);
    this.changesSource.next();
  }

  /** Moves one copy of `itemId` from the bag into `slotInstanceId`, first returning
   *  whatever was already worn there (if anything) back to the bag. No-op if the item
   *  isn't held, the slot instance doesn't exist, or the item's slotType doesn't match
   *  the slot instance's slotType. */
  equip(itemId: string, slotInstanceId: string): void {
    const item = EQUIPMENT_ITEMS.find(i => i.id === itemId);
    const slot = EQUIPMENT_SLOTS.find(s => s.id === slotInstanceId);
    if (!item || !slot || item.slotType !== slot.slotType) return;
    if (this.getInventoryCount(itemId) <= 0) return;

    const previous = this.equipped.get(slotInstanceId);
    if (previous) this.addToInventory(previous);

    this.inventory.set(itemId, this.getInventoryCount(itemId) - 1);
    this.equipped.set(slotInstanceId, itemId);
    this.changesSource.next();
  }

  /** Moves whatever is worn in `slotInstanceId` back into the bag. No-op if the slot is
   *  already empty. */
  unequip(slotInstanceId: string): void {
    const itemId = this.equipped.get(slotInstanceId);
    if (!itemId) return;
    this.equipped.delete(slotInstanceId);
    this.addToInventory(itemId);
  }

  /** Rarity-tier upgrade primitive: removes one copy of oldItemId — unequipping it and
   *  re-equipping newItemId into the exact same slot instance if oldItemId was worn
   *  there, otherwise just swapping the copy in inventory — and adds one copy of
   *  newItemId. No-op if oldItemId isn't held at all (neither equipped nor in the bag). */
  replaceInventoryItem(oldItemId: string, newItemId: string): void {
    const equippedSlot = [...this.equipped.entries()].find(([, itemId]) => itemId === oldItemId)?.[0];
    if (equippedSlot) {
      this.equipped.set(equippedSlot, newItemId);
      this.changesSource.next();
      return;
    }

    const count = this.getInventoryCount(oldItemId);
    if (count <= 0) return;
    this.inventory.set(oldItemId, count - 1);
    this.addToInventory(newItemId); // emits changesSource.next() itself
  }

  private equippedConfigs(): EquipmentConfig[] {
    return [...this.equipped.values()]
      .map(itemId => EQUIPMENT_ITEMS.find(i => i.id === itemId))
      .filter((c): c is EquipmentConfig => !!c);
  }

  /** Base stats plus every equipped item's stat-bonus effects, summed live — never
   *  cached, same "recompute from config + current state" convention as UpgradesService. */
  getEffectiveStats(): SixStats {
    const stats = { ...FIGHTER_BASE_STATS };
    for (const config of this.equippedConfigs()) {
      for (const effect of config.effects) {
        if (effect.type === 'stat-bonus') {
          stats[effect.stat] += effect.amount;
        }
      }
    }
    return stats;
  }

  getBonusDamage(): number {
    let total = 0;
    for (const config of this.equippedConfigs()) {
      for (const effect of config.effects) {
        if (effect.type === 'bonus-damage') total += effect.amount;
      }
    }
    return total;
  }

  getDamageReduction(): number {
    let total = 0;
    for (const config of this.equippedConfigs()) {
      for (const effect of config.effects) {
        if (effect.type === 'damage-reduction') total += effect.reduction;
      }
    }
    return total;
  }

  getExtraAttackChance(): number {
    let total = 0;
    for (const config of this.equippedConfigs()) {
      for (const effect of config.effects) {
        if (effect.type === 'extra-attack-chance') total += effect.chance;
      }
    }
    return total;
  }

  getSnapshot(): EquipmentSnapshot {
    return {
      inventory: Object.fromEntries(this.inventory),
      equipped: Object.fromEntries(this.equipped),
    };
  }

  restore(snapshot: EquipmentSnapshot | undefined): void {
    this.inventory = new Map(Object.entries(snapshot?.inventory ?? {}));
    // A persisted slot instance id that no longer exists in EQUIPMENT_SLOTS (removed or
    // renamed) can't just be kept — it would go on contributing its effects forever via
    // equippedConfigs() while being unreachable/unequippable through the UI, which only
    // ever iterates the real EQUIPMENT_SLOTS list. Same stale-reference handling as
    // CombatService.restore(); here the item is returned to the bag rather than simply
    // discarded, same as a normal unequip().
    const equipped = new Map<string, string>();
    for (const [slotInstanceId, itemId] of Object.entries(snapshot?.equipped ?? {})) {
      if (EQUIPMENT_SLOTS.some(s => s.id === slotInstanceId)) {
        equipped.set(slotInstanceId, itemId);
      } else {
        this.inventory.set(itemId, this.getInventoryCount(itemId) + 1);
      }
    }
    this.equipped = equipped;
    this.changesSource.next();
  }
}
