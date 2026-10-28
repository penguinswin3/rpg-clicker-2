import { TestBed } from '@angular/core/testing';
import { RENAMED_IDS, migrateId, migrateKeys } from './renamed-ids';
import { StatisticsService } from '../statistics/statistics.service';
import { CraftingService } from '../crafting/crafting.service';
import { UpgradesService } from '../upgrades/upgrades.service';
import { CRAFTING_ACTIONS, UPGRADES } from '../configs/game-config';

describe('renamed ids (save migration)', () => {
  it('migrateId maps an old id to its new one and leaves anything else alone', () => {
    expect(migrateId('blacksmith-forge-ingots')).toBe('blacksmith-smelt-ingots');
    expect(migrateId('hard-work')).toBe('hard-work');
  });

  it('migrateKeys re-keys a record, preferring the new id if both are present', () => {
    expect(migrateKeys({ 'faster-forging': 3, 'hard-work': 1 })).toEqual({ 'faster-smelting': 3, 'hard-work': 1 });
    expect(migrateKeys({ 'faster-forging': 3, 'faster-smelting': 5 })).toEqual({ 'faster-smelting': 5 });
  });

  it('every rename target is a real current id, and no old id is still in use', () => {
    const currentIds = new Set([...CRAFTING_ACTIONS.map(a => a.id), ...UPGRADES.map(u => u.id)]);
    for (const [oldId, newId] of Object.entries(RENAMED_IDS)) {
      expect(currentIds.has(newId)).withContext(newId).toBeTrue();
      expect(currentIds.has(oldId)).withContext(oldId).toBeFalse();
    }
  });

  describe('an old save keeps its Forge Ingots / Faster Forging progress', () => {
    beforeEach(() => TestBed.configureTestingModule({}));

    it('statistics action counts', () => {
      const statistics = TestBed.inject(StatisticsService);
      statistics.restore({ actionCounts: { 'blacksmith-forge-ingots': 12 }, lifetimeGained: {}, majorUnlocks: [] });
      expect(statistics.getActionCount('blacksmith-smelt-ingots')).toBe(12);
    });

    it('a staged hold in crafting progress', () => {
      const crafting = TestBed.inject(CraftingService);
      crafting.restore({ holds: { 'blacksmith-forge-ingots': { progressMs: 0, savedAt: Date.now() } }, clicks: {} });
      const state = crafting.actions.find(a => a.config.id === 'blacksmith-smelt-ingots')!;
      expect(state.costPaid).toBeTrue();
    });

    it('upgrade levels and unlock list', () => {
      const upgrades = TestBed.inject(UpgradesService);
      upgrades.restore({ levels: { 'faster-forging': 4 }, unlockedIds: ['faster-forging'] });
      expect(upgrades.getLevel('faster-smelting')).toBe(4);
      expect(upgrades.isUnlocked('faster-smelting')).toBeTrue();
    });
  });
});
