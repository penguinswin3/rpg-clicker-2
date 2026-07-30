import { TestBed } from '@angular/core/testing';
import { SaveService } from './save.service';
import { WalletService } from '../economy/wallet.service';
import { CharacterSelectService } from '../character-select/character-select.service';
import { ObjectivesService } from '../objectives/objectives.service';
import { StatisticsService } from '../statistics/statistics.service';
import { UpgradesService } from '../upgrades/upgrades.service';
import { UnlocksService } from '../shared/unlocks.service';
import { TimedActionsService } from '../timed-actions/timed-actions.service';
import { HoldHintService } from '../shared/hold-hint.service';
import { CraftingService } from '../crafting/crafting.service';
import { EquipmentService } from '../fighter-combat/equipment.service';
import { CombatService } from '../fighter-combat/combat.service';
import { SaveData } from './save-data';

/**
 * "Every registered component is reflected properly in the save game" — the invariant
 * this file exists to guard. `SaveData`'s field list is checked by the compiler against
 * `SaveService.exportBase64()` already (TS won't let a field go unassigned), so what
 * *isn't* automatically caught is a whole new stateful service that never got wired into
 * either at all. There's no way to detect that purely by reflection (nothing forces a
 * service to register itself), so `EXPECTED_SAVE_KEYS` below is a hand-maintained
 * checklist: forgetting to update it when adding a new persisted field/service is exactly
 * the mistake this test is designed to force you to notice. Update it in the same PR that
 * adds a new getSnapshot()/restore() pair — see AGENTS.md's "Testing" section.
 */
const EXPECTED_SAVE_KEYS: (keyof SaveData)[] = [
  'schemaVersion',
  'gameVersion',
  'createdAt',
  'updatedAt',
  'wallet',
  'characters',
  'objectives',
  'statistics',
  'playtimeSeconds',
  'settings',
  'unseenAttention',
  'upgrades',
  'unlocks',
  'timedActions',
  'holdHints',
  'crafting',
  'equipment',
  'combat',
];

function decode(base64: string): Record<string, unknown> {
  return JSON.parse(atob(base64));
}

describe('SaveService', () => {
  let saveService: SaveService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    saveService = TestBed.inject(SaveService);
  });

  afterEach(() => localStorage.clear());

  it('exports exactly the expected top-level keys — no more, no less', () => {
    const decoded = decode(saveService.exportBase64());
    expect(Object.keys(decoded).sort()).toEqual([...EXPECTED_SAVE_KEYS].sort());
  });

  it('every currently-known persisted service snapshot round-trips through the export byte-for-byte', () => {
    // Put every persisted system into a non-default state, then confirm the export
    // captures each one's *current* getSnapshot() exactly — not a stale/zeroed value.
    const wallet = TestBed.inject(WalletService);
    const characters = TestBed.inject(CharacterSelectService);
    const objectives = TestBed.inject(ObjectivesService);
    const statistics = TestBed.inject(StatisticsService);
    const upgrades = TestBed.inject(UpgradesService);
    const unlocks = TestBed.inject(UnlocksService);
    const timedActions = TestBed.inject(TimedActionsService);
    const holdHint = TestBed.inject(HoldHintService);
    const crafting = TestBed.inject(CraftingService);
    const equipment = TestBed.inject(EquipmentService);
    const combat = TestBed.inject(CombatService);

    wallet.add('gold', 123);
    unlocks.unlock('guildContract');
    timedActions.start('fighter-guild-contract');
    statistics.recordAction('fighter-hard-labor');
    holdHint.markHeld('fighter-hard-labor');
    wallet.add('ingot', 10);
    crafting.click('blacksmith-smith-metal');
    equipment.addToInventory('ring-swift-strike');
    equipment.equip('ring-swift-strike', 'ring-1');

    const decoded = decode(saveService.exportBase64()) as unknown as SaveData;

    expect(decoded.wallet).toEqual(wallet.getSnapshot());
    expect(decoded.characters).toEqual(characters.getSnapshot());
    expect(decoded.objectives).toEqual(objectives.getSnapshot());
    expect(decoded.statistics).toEqual(statistics.getSnapshot());
    expect(decoded.upgrades).toEqual(upgrades.getSnapshot());
    expect(decoded.unlocks).toEqual(unlocks.getSnapshot());
    expect(decoded.timedActions).toEqual(timedActions.getSnapshot());
    expect(decoded.holdHints).toEqual(holdHint.getSnapshot());
    expect(decoded.crafting).toEqual(crafting.getSnapshot());
    expect(decoded.equipment).toEqual(equipment.getSnapshot());
    expect(decoded.combat).toEqual(combat.getSnapshot());
  });

  it('parse() rejects garbage without throwing', () => {
    expect((saveService as unknown as { parse: (b64: string) => boolean }).parse('not-base64-json')).toBeFalse();
  });
});
