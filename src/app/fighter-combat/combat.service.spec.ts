import { TestBed } from '@angular/core/testing';
import { CombatService } from './combat.service';
import { WalletService } from '../economy/wallet.service';
import { StatisticsService } from '../statistics/statistics.service';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { EquipmentService } from './equipment.service';
import { COMBAT_TURN_MS, FIGHTER_DEFEAT_LOCKOUT_MS } from '../configs/game-config';

const KOBOLD_DEN = 'kobold-den';

describe('CombatService', () => {
  let service: CombatService;
  let wallet: WalletService;
  let statistics: StatisticsService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    jasmine.clock().install();
    // install() alone only fakes setTimeout/setInterval — mockDate() is what makes
    // Date.now() (what CombatService actually measures elapsed time against) move
    // together with tick(), same reasoning as timed-actions.service.spec.ts.
    jasmine.clock().mockDate();
    service = TestBed.inject(CombatService);
    wallet = TestBed.inject(WalletService);
    statistics = TestBed.inject(StatisticsService);
  });

  afterEach(() => {
    jasmine.clock().uninstall();
  });

  it('starts with full HP, no lockout, and no active encounter', () => {
    expect(service.currentFighterHp).toBe(service.fighterMaxHp);
    expect(service.canFight).toBeTrue();
    expect(service.activeEncounter).toBeNull();
  });

  describe('start()', () => {
    it("begins an encounter against the area's enemy", () => {
      service.start(KOBOLD_DEN);
      expect(service.activeEncounter?.enemyId).toBe('kobold');
    });

    it('is a no-op if a fight is already active', () => {
      service.start(KOBOLD_DEN);
      const first = service.activeEncounter;
      service.start(KOBOLD_DEN);
      expect(service.activeEncounter).toBe(first);
    });

    it('is a no-op for an unknown area', () => {
      service.start('not-a-real-area');
      expect(service.activeEncounter).toBeNull();
    });

    it('is a no-op while locked out after a defeat', () => {
      service.restore({ fighterHp: 1, lockedOutUntil: Date.now() + 1000, activeEncounter: null });
      service.start(KOBOLD_DEN);
      expect(service.activeEncounter).toBeNull();
    });
  });

  describe('flee()', () => {
    it('ends the encounter immediately with no lockout', () => {
      service.start(KOBOLD_DEN);
      service.flee();
      expect(service.activeEncounter).toBeNull();
      expect(service.canFight).toBeTrue();
    });

    it('is a no-op when no fight is active', () => {
      expect(() => service.flee()).not.toThrow();
      expect(service.activeEncounter).toBeNull();
    });
  });

  describe('turn resolution', () => {
    it('a won fight grants gold, records the kill, and leaves Fight! immediately available', () => {
      spyOn(statistics, 'recordAction');
      service.restore({
        fighterHp: service.fighterMaxHp,
        lockedOutUntil: null,
        activeEncounter: { areaId: KOBOLD_DEN, enemyId: 'kobold', enemyHp: 1, actorTurn: 'fighter' },
      });
      // The Fighter's base Strength (15) beats the Kobold's base Dexterity (10) even on
      // an equal max roll, so a single constant stub is enough to guarantee a hit.
      spyOn(Math, 'random').and.returnValue(0.9999);
      jasmine.clock().tick(COMBAT_TURN_MS);

      expect(service.activeEncounter).toBeNull();
      expect(wallet.getAmount('gold')).toBeGreaterThan(0);
      expect(statistics.recordAction).toHaveBeenCalledWith('fighter-defeat-kobold');
      expect(service.canFight).toBeTrue();
    });

    it('a lost fight revives the Fighter to full HP and starts the defeat lockout', () => {
      service.restore({
        fighterHp: 1,
        lockedOutUntil: null,
        activeEncounter: { areaId: KOBOLD_DEN, enemyId: 'kobold', enemyHp: 60, actorTurn: 'enemy' },
      });
      // The Kobold's base Strength (8) is below the Fighter's base Dexterity (13), so a
      // hit needs an explicit high attack roll / low defense roll rather than one
      // constant stub.
      spyOn(Math, 'random').and.returnValues(0.9999, 0, 0.9999);
      jasmine.clock().tick(COMBAT_TURN_MS);

      expect(service.activeEncounter).toBeNull();
      expect(service.currentFighterHp).toBe(service.fighterMaxHp);
      expect(service.canFight).toBeFalse();
      expect(service.lockedOutRemainingMs).toBeGreaterThan(0);
    });

    it('Fight! re-enables once the defeat lockout fully elapses', () => {
      service.restore({
        fighterHp: 1,
        lockedOutUntil: null,
        activeEncounter: { areaId: KOBOLD_DEN, enemyId: 'kobold', enemyHp: 60, actorTurn: 'enemy' },
      });
      spyOn(Math, 'random').and.returnValues(0.9999, 0, 0.9999);
      jasmine.clock().tick(COMBAT_TURN_MS);
      expect(service.canFight).toBeFalse();

      jasmine.clock().tick(FIGHTER_DEFEAT_LOCKOUT_MS);
      expect(service.canFight).toBeTrue();
    });

    it('does nothing while it is not yet time for the next turn', () => {
      service.start(KOBOLD_DEN);
      const enemyHpBefore = service.activeEncounter!.enemyHp;
      jasmine.clock().tick(COMBAT_TURN_MS - 1);
      expect(service.activeEncounter?.enemyHp).toBe(enemyHpBefore);
    });
  });

  describe('swift-strike ring', () => {
    it('lands a follow-up attack when the equipped ring procs mid-fight', () => {
      const equipment = TestBed.inject(EquipmentService);
      const activityLog = TestBed.inject(ActivityLogService);
      const log = spyOn(activityLog, 'log');
      equipment.addToInventory('ring-swift-strike');
      equipment.equip('ring-swift-strike', 'ring-1');

      service.restore({
        fighterHp: service.fighterMaxHp,
        lockedOutUntil: null,
        activeEncounter: { areaId: KOBOLD_DEN, enemyId: 'kobold', enemyHp: 60, actorTurn: 'fighter' },
      });
      // Fighter (STR 15) vs Kobold (DEX 10): attack 1 rolls d20=19 (0.9) vs d20=1 (0),
      // hits for 8 damage (str-15 damage roll of 0.5 -> floor(0.5*15)+1), then the
      // ring's 5% extra-attack-chance check succeeds (0.01 < 0.05) via
      // resolveExcessCount. Attack 2 (the follow-up itself) resolves the exact same
      // way for another 8 damage (52 -> 44hp, nowhere near lethal), then the
      // extra-attack-chance check fails this time (0.9 >= 0.05), so resolveTurn's loop
      // stops at exactly 2 attacks. See combat-resolution.spec.ts's "chains a
      // follow-up attack" test for the same 8-value hand-traced shape.
      spyOn(Math, 'random').and.returnValues(
        0.9, 0, 0.5, 0.01, // attack 1: hit, damage, follow-up proc succeeds
        0.9, 0, 0.5, 0.9   // attack 2 (follow-up): hit, damage, follow-up proc fails -> stop
      );
      jasmine.clock().tick(COMBAT_TURN_MS);

      // Both turns log to the shared Activity Log at 'default' (INFO) level — there's
      // no separate local combat feed to check instead.
      expect(log).toHaveBeenCalledTimes(2);
      expect(log.calls.argsFor(0)).toEqual([jasmine.stringMatching(/^You hit! \d+ damage\./), 'default']);
      expect(log.calls.argsFor(1)).toEqual([jasmine.stringMatching(/^You strike again! \d+ damage\./), 'default']);
    });

    it('sends a loot-dropped ring straight to the equipment inventory on a won fight', () => {
      const equipment = TestBed.inject(EquipmentService);
      service.restore({
        fighterHp: service.fighterMaxHp,
        lockedOutUntil: null,
        activeEncounter: { areaId: KOBOLD_DEN, enemyId: 'kobold', enemyHp: 1, actorTurn: 'fighter' },
      });
      // Attack hits (d20=19 vs d20=1) for lethal damage against the Kobold's 1 hp;
      // resolveTurn's loop breaks as soon as defender.hp <= 0, so no follow-up-chance
      // roll is ever consumed. Then resolveVictory walks the Kobold's loot table in
      // order:
      //  - gold (chance 1.0): 0.5 < 1.0 -> always drops, consumes a 2nd roll for amount
      //  - kobold-ears (chance 0.6): 0.9 >= 0.6 -> skipped, no amount roll
      //  - ring-swift-strike (chance 0.05): 0.01 < 0.05 -> drops (equipment branch,
      //    no amount roll — addToInventory() just adds 1 copy)
      spyOn(Math, 'random').and.returnValues(0.9, 0, 0.5, 0.5, 0.5, 0.9, 0.01);
      jasmine.clock().tick(COMBAT_TURN_MS);

      expect(service.activeEncounter).toBeNull();
      expect(equipment.getInventoryCount('ring-swift-strike')).toBe(1);
    });
  });

  describe('pattern loot drops', () => {
    // No FIGHTER_ENEMIES entry has a 'pattern' loot type yet (the 5 Common patterns
    // start known rather than drop-gated, this version) — same "wired but unexercised"
    // precedent as PatternCraftingService's rarity-upgrade path
    // (pattern-crafting.service.spec.ts). Replace this with a real test the moment an
    // enemy's loot table gets one.
    it('unlocks the dropped pattern via PatternCraftingService', () => {
      pending("no FIGHTER_ENEMIES loot entry has type 'pattern' yet");
    });
  });

  describe('snapshot / restore', () => {
    it('round-trips HP, lockout, and an in-progress encounter', () => {
      service.start(KOBOLD_DEN);
      const snapshot = service.getSnapshot();

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({});
      const restored = TestBed.inject(CombatService);
      restored.restore(snapshot);

      expect(restored.activeEncounter).toEqual(snapshot.activeEncounter);
      expect(restored.currentFighterHp).toBe(snapshot.fighterHp);
    });

    it('does not replay any turns for time that passed before restore() is called', () => {
      service.start(KOBOLD_DEN);
      const snapshot = service.getSnapshot();
      const enemyHpBefore = snapshot.activeEncounter!.enemyHp;

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({});
      const restored = TestBed.inject(CombatService);
      jasmine.clock().tick(60 * 60 * 1000); // an hour passes on the fresh instance's own clock
      restored.restore(snapshot);

      // restore() just re-anchored nextTurnAt to "now" - no turn has resolved yet.
      expect(restored.activeEncounter?.enemyHp).toBe(enemyHpBefore);
    });
  });
});
