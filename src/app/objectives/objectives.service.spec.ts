import { TestBed } from '@angular/core/testing';
import { ObjectivesService } from './objectives.service';
import { StatisticsService } from '../statistics/statistics.service';
import { WalletService } from '../economy/wallet.service';
import { UnlocksService } from '../shared/unlocks.service';
import { CharacterSelectService } from '../character-select/character-select.service';
import { EquipmentService } from '../fighter-combat/equipment.service';
import { OBJECTIVES, enemyDefeatActionId } from '../configs/game-config';

const COMMON_SET = (OBJECTIVES.find(o => o.id === 'equip-common-set') as { equipmentIds: string[] }).equipmentIds;
const SLOT_FOR: Record<string, string> = {
  'forged-sword': 'weapon',
  'forged-helmet': 'helmet',
  'forged-armor': 'armor',
  'forged-boots': 'boots',
  'forged-gauntlets': 'gauntlets',
};

describe('ObjectivesService', () => {
  let service: ObjectivesService;
  let statistics: StatisticsService;
  let unlocks: UnlocksService;
  let characters: CharacterSelectService;
  let equipment: EquipmentService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    service = TestBed.inject(ObjectivesService);
    statistics = TestBed.inject(StatisticsService);
    unlocks = TestBed.inject(UnlocksService);
    characters = TestBed.inject(CharacterSelectService);
    equipment = TestBed.inject(EquipmentService);
  });

  function state(id: string) {
    return service.objectives.find(o => o.config.id === id);
  }

  describe('prerequisiteSystemId', () => {
    it('hides kill-20-kobolds and equip-common-set until minigames unlock', () => {
      expect(state('kill-20-kobolds')).toBeUndefined();
      expect(state('equip-common-set')).toBeUndefined();

      unlocks.unlock('minigames');

      expect(state('kill-20-kobolds')).toBeDefined();
      expect(state('equip-common-set')).toBeDefined();
    });
  });

  describe('kill-20-kobolds', () => {
    beforeEach(() => unlocks.unlock('minigames'));

    it('counts Kobold defeats, becomes claimable at 20, and unlocks Jacks on claim', () => {
      for (let i = 0; i < 19; i++) statistics.recordAction(enemyDefeatActionId('kobold'));
      expect(state('kill-20-kobolds')!.current).toBe(19);
      expect(state('kill-20-kobolds')!.claimable).toBeFalse();

      statistics.recordAction(enemyDefeatActionId('kobold'));
      expect(state('kill-20-kobolds')!.claimable).toBeTrue();

      service.claim('kill-20-kobolds');
      expect(unlocks.isUnlocked('jacks')).toBeTrue();
    });
  });

  describe('equip-common-set (equipment-equipped)', () => {
    beforeEach(() => unlocks.unlock('minigames'));

    function equipAll(ids: string[]): void {
      for (const id of ids) {
        equipment.addToInventory(id);
        equipment.equip(id, SLOT_FOR[id]);
      }
    }

    it('progress is how many listed items are currently worn', () => {
      expect(state('equip-common-set')!.target).toBe(COMMON_SET.length);
      equipAll(COMMON_SET.slice(0, 2));
      expect(state('equip-common-set')!.current).toBe(2);
      expect(state('equip-common-set')!.claimable).toBeFalse();
    });

    it('merely holding the items in the bag does not count', () => {
      for (const id of COMMON_SET) equipment.addToInventory(id);
      expect(state('equip-common-set')!.current).toBe(0);
    });

    it('becomes claimable once all are worn, stays so after unequipping, and unlocks the Collection Log', () => {
      equipAll(COMMON_SET);
      expect(state('equip-common-set')!.claimable).toBeTrue();

      equipment.unequip('weapon');
      expect(state('equip-common-set')!.claimable).toBeTrue(); // sticky

      service.claim('equip-common-set');
      expect(unlocks.isUnlocked('collectionLog')).toBeTrue();
    });
  });

  describe('unlock-brewmaster', () => {
    it('appears once Blacksmith is unlocked, reaches at 75,000 lifetime Gold (not before), and unlocks Brewmaster', () => {
      expect(state('unlock-brewmaster')).toBeUndefined();
      characters.unlock('blacksmith');
      expect(state('unlock-brewmaster')).toBeDefined();

      const wallet = TestBed.inject(WalletService);
      wallet.add('gold', 74_999);
      expect(state('unlock-brewmaster')!.claimable).toBeFalse();
      wallet.add('gold', 1);
      expect(state('unlock-brewmaster')!.claimable).toBeTrue();

      service.claim('unlock-brewmaster');
      expect(characters.isUnlocked('brewmaster')).toBeTrue();
    });
  });
});
