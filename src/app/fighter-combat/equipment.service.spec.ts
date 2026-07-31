import { TestBed } from '@angular/core/testing';
import { EquipmentService } from './equipment.service';

describe('EquipmentService', () => {
  let service: EquipmentService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(EquipmentService);
  });

  it('starts with an empty inventory and nothing equipped', () => {
    expect(service.inventoryEntries).toEqual([]);
    expect(service.getEquippedItemId('ring-1')).toBeUndefined();
  });

  it('addToInventory increases the held count', () => {
    service.addToInventory('ring-swift-strike');
    expect(service.getInventoryCount('ring-swift-strike')).toBe(1);
    service.addToInventory('ring-swift-strike', 2);
    expect(service.getInventoryCount('ring-swift-strike')).toBe(3);
  });

  it('equip moves one copy from inventory into the given slot instance', () => {
    service.addToInventory('ring-swift-strike');
    service.equip('ring-swift-strike', 'ring-1');
    expect(service.getEquippedItemId('ring-1')).toBe('ring-swift-strike');
    expect(service.getInventoryCount('ring-swift-strike')).toBe(0);
  });

  it('equip is a no-op if the item is not held', () => {
    service.equip('ring-swift-strike', 'ring-1');
    expect(service.getEquippedItemId('ring-1')).toBeUndefined();
  });

  it('equip is a no-op if the slotType does not match', () => {
    service.addToInventory('ring-swift-strike');
    service.equip('ring-swift-strike', 'helmet');
    expect(service.getEquippedItemId('helmet')).toBeUndefined();
    expect(service.getInventoryCount('ring-swift-strike')).toBe(1);
  });

  it('equipping into an occupied slot returns the previous item to inventory', () => {
    service.addToInventory('ring-swift-strike', 2);
    service.equip('ring-swift-strike', 'ring-1');
    service.equip('ring-swift-strike', 'ring-1');
    expect(service.getEquippedItemId('ring-1')).toBe('ring-swift-strike');
    expect(service.getInventoryCount('ring-swift-strike')).toBe(1);
  });

  it('unequip returns the item to inventory and empties the slot', () => {
    service.addToInventory('ring-swift-strike');
    service.equip('ring-swift-strike', 'ring-1');
    service.unequip('ring-1');
    expect(service.getEquippedItemId('ring-1')).toBeUndefined();
    expect(service.getInventoryCount('ring-swift-strike')).toBe(1);
  });

  it('unequip on an empty slot is a no-op', () => {
    service.unequip('ring-1');
    expect(service.getInventoryCount('ring-swift-strike')).toBe(0);
  });

  describe('replaceInventoryItem', () => {
    it('swaps an equipped item in place, in the same slot instance', () => {
      service.addToInventory('basic-sword');
      service.equip('basic-sword', 'weapon');

      service.replaceInventoryItem('basic-sword', 'forged-sword');

      expect(service.getEquippedItemId('weapon')).toBe('forged-sword');
      expect(service.getInventoryCount('basic-sword')).toBe(0);
      expect(service.getInventoryCount('forged-sword')).toBe(0); // went straight into the slot, not the bag
    });

    it('swaps an unequipped item in inventory, without equipping the new one', () => {
      service.addToInventory('basic-sword');

      service.replaceInventoryItem('basic-sword', 'forged-sword');

      expect(service.getInventoryCount('basic-sword')).toBe(0);
      expect(service.getInventoryCount('forged-sword')).toBe(1);
      expect(service.getEquippedItemId('weapon')).toBeUndefined();
    });

    it('is a no-op if the old item is not held at all', () => {
      service.replaceInventoryItem('basic-sword', 'forged-sword');

      expect(service.getInventoryCount('forged-sword')).toBe(0);
      expect(service.getInventoryCount('basic-sword')).toBe(0);
    });
  });

  it('getEffectiveStats returns base stats when nothing is equipped', () => {
    const stats = service.getEffectiveStats();
    expect(stats.strength).toBe(15);
    expect(stats.dexterity).toBe(13);
  });

  it("getExtraAttackChance sums the equipped ring's chance", () => {
    expect(service.getExtraAttackChance()).toBe(0);
    service.addToInventory('ring-swift-strike');
    service.equip('ring-swift-strike', 'ring-1');
    expect(service.getExtraAttackChance()).toBeCloseTo(0.05);
  });

  it('getExtraAttackChance stacks two copies of the same ring across both ring slots', () => {
    service.addToInventory('ring-swift-strike', 2);
    service.equip('ring-swift-strike', 'ring-1');
    service.equip('ring-swift-strike', 'ring-2');
    expect(service.getExtraAttackChance()).toBeCloseTo(0.1);
  });

  it('getBonusDamage and getDamageReduction are 0 with no equipped effects of that kind', () => {
    service.addToInventory('ring-swift-strike');
    service.equip('ring-swift-strike', 'ring-1');
    expect(service.getBonusDamage()).toBe(0);
    expect(service.getDamageReduction()).toBe(0);
  });

  it('snapshot/restore round-trips inventory and equipped state into a fresh instance', () => {
    service.addToInventory('ring-swift-strike', 2);
    service.equip('ring-swift-strike', 'ring-1');
    const snapshot = service.getSnapshot();

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const restored = TestBed.inject(EquipmentService);
    restored.restore(snapshot);

    expect(restored.getSnapshot()).toEqual(snapshot);
    expect(restored.getEquippedItemId('ring-1')).toBe('ring-swift-strike');
    expect(restored.getInventoryCount('ring-swift-strike')).toBe(1);
  });
});
