import {
  RESOURCES,
  CHARACTERS,
  CHARACTER_ACTIONS,
  TIMED_ACTIONS,
  CRAFTING_ACTIONS,
  UPGRADES,
  OBJECTIVES,
  GENERATORS,
} from './game-config';
import {
  RESOURCE_FLAVOR,
  ACTION_FLAVOR,
  TIMED_ACTION_FLAVOR,
  CRAFTING_FLAVOR,
  UPGRADE_FLAVOR,
} from './flavor-text';
import { idsMissingFlavor, duplicateIds, danglingReferences, emojiSymbols } from '../../testing/invariants';

/**
 * Config-integrity checks — the generic "did I forget to register X" safety net.
 * game-config.ts/flavor-text.ts are hand-maintained parallel structures (a resource's
 * game data lives in one file, its cosmetics in the other; an upgrade's effect references
 * another config's id by string, with nothing in the type system forcing that string to
 * be real) — this file is what catches drift between them instead of it surfacing as a
 * blank button label or a silently-inert upgrade at runtime. Add a case here whenever a
 * new config family or cross-reference shape is introduced (see AGENTS.md's "Testing"
 * section) rather than trusting it by hand.
 */
describe('game-config integrity', () => {
  const characterIds = CHARACTERS.map(c => c.id);
  const resourceIds = RESOURCES.map(r => r.id);
  const characterActionIds = CHARACTER_ACTIONS.map(a => a.id);
  const timedActionIds = TIMED_ACTIONS.map(a => a.id);
  const craftingActionIds = CRAFTING_ACTIONS.map(a => a.id);
  const upgradeIds = UPGRADES.map(u => u.id);

  describe('Characters', () => {
    it('has no duplicate ids', () => {
      expect(duplicateIds(characterIds)).toEqual([]);
    });
  });

  describe('Resources', () => {
    it('has no duplicate ids', () => {
      expect(duplicateIds(resourceIds)).toEqual([]);
    });

    it('every resource has a RESOURCE_FLAVOR entry', () => {
      expect(idsMissingFlavor(resourceIds, RESOURCE_FLAVOR)).toEqual([]);
    });

    it('every resource is assigned to a real character', () => {
      expect(danglingReferences(RESOURCES.map(r => r.characterId), characterIds)).toEqual([]);
    });

    it('every RESOURCE_FLAVOR symbol is a plain Unicode glyph, never an emoji (AGENTS.md)', () => {
      const symbols = Object.fromEntries(Object.entries(RESOURCE_FLAVOR).map(([id, f]) => [id, f.symbol]));
      expect(emojiSymbols(symbols)).toEqual([]);
    });

    it('every RESOURCE_FLAVOR entry has a non-empty name and color', () => {
      for (const resource of RESOURCES) {
        const flavor = RESOURCE_FLAVOR[resource.id];
        expect(flavor.name).withContext(resource.id).not.toBe('');
        expect(flavor.color).withContext(resource.id).not.toBe('');
        expect(flavor.symbol).withContext(resource.id).not.toBe('');
      }
    });
  });

  describe('Character actions (primary buttons)', () => {
    it('has no duplicate ids', () => {
      expect(duplicateIds(characterActionIds)).toEqual([]);
    });

    it('every action has an ACTION_FLAVOR entry', () => {
      expect(idsMissingFlavor(characterActionIds, ACTION_FLAVOR)).toEqual([]);
    });

    it('every action has a non-empty label and logMessage', () => {
      for (const action of CHARACTER_ACTIONS) {
        const flavor = ACTION_FLAVOR[action.id];
        expect(flavor.label).withContext(action.id).not.toBe('');
        expect(flavor.logMessage).withContext(action.id).not.toBe('');
      }
    });

    it('every action targets a real character and resource', () => {
      expect(danglingReferences(CHARACTER_ACTIONS.map(a => a.characterId), characterIds)).toEqual([]);
      expect(danglingReferences(CHARACTER_ACTIONS.map(a => a.resourceId), resourceIds)).toEqual([]);
    });

    it('every action pays a positive amount', () => {
      for (const action of CHARACTER_ACTIONS) {
        expect(action.amountPerAction).withContext(action.id).toBeGreaterThan(0);
      }
    });
  });

  describe('Timed actions (second buttons)', () => {
    it('has no duplicate ids', () => {
      expect(duplicateIds(timedActionIds)).toEqual([]);
    });

    it('every timed action has a TIMED_ACTION_FLAVOR entry with a non-empty label and logMessage', () => {
      expect(idsMissingFlavor(timedActionIds, TIMED_ACTION_FLAVOR)).toEqual([]);
      for (const action of TIMED_ACTIONS) {
        const flavor = TIMED_ACTION_FLAVOR[action.id];
        expect(flavor.label).withContext(action.id).not.toBe('');
        expect(flavor.logMessage).withContext(action.id).not.toBe('');
      }
    });

    it('a requiresCollection action defines an explicit readyLabel (not falling back to label)', () => {
      for (const action of TIMED_ACTIONS.filter(a => a.requiresCollection)) {
        expect(TIMED_ACTION_FLAVOR[action.id].readyLabel)
          .withContext(`${action.id} needs a distinct readyLabel, else "ready to collect" looks identical to idle`)
          .toBeTruthy();
      }
    });

    it('every timed action targets a real character', () => {
      expect(danglingReferences(TIMED_ACTIONS.map(a => a.characterId), characterIds)).toEqual([]);
    });

    it('every reward/cost/bonusReward resourceId is real', () => {
      for (const action of TIMED_ACTIONS) {
        expect(resourceIds).withContext(`${action.id}.reward`).toContain(action.reward.resourceId);
        if (action.cost) expect(resourceIds).withContext(`${action.id}.cost`).toContain(action.cost.resourceId);
        if (action.bonusReward) {
          expect(resourceIds).withContext(`${action.id}.bonusReward`).toContain(action.bonusReward.resourceId);
        }
      }
    });

    it('a "fixed" duration is positive; a "random" duration has 0 < minMs < maxMs', () => {
      for (const action of TIMED_ACTIONS) {
        if (action.duration.type === 'fixed') {
          expect(action.duration.ms).withContext(action.id).toBeGreaterThan(0);
        } else {
          expect(action.duration.minMs).withContext(action.id).toBeGreaterThan(0);
          expect(action.duration.maxMs).withContext(action.id).toBeGreaterThan(action.duration.minMs);
        }
      }
    });

    it('cost and reward amounts are positive', () => {
      for (const action of TIMED_ACTIONS) {
        expect(action.reward.amount).withContext(action.id).toBeGreaterThan(0);
        if (action.cost) expect(action.cost.amount).withContext(`${action.id}.cost`).toBeGreaterThan(0);
        if (action.bonusReward) {
          expect(action.bonusReward.chance).withContext(`${action.id}.bonusReward`).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('Crafting actions (Blacksmith buttons)', () => {
    it('has no duplicate ids', () => {
      expect(duplicateIds(craftingActionIds)).toEqual([]);
    });

    it('every crafting action has a CRAFTING_FLAVOR entry with a non-empty label and logMessage', () => {
      expect(idsMissingFlavor(craftingActionIds, CRAFTING_FLAVOR)).toEqual([]);
      for (const action of CRAFTING_ACTIONS) {
        const flavor = CRAFTING_FLAVOR[action.id];
        expect(flavor.label).withContext(action.id).not.toBe('');
        expect(flavor.logMessage).withContext(action.id).not.toBe('');
      }
    });

    it('every crafting action targets a real character', () => {
      expect(danglingReferences(CRAFTING_ACTIONS.map(a => a.characterId), characterIds)).toEqual([]);
    });

    it('every cost/reward resourceId is real', () => {
      for (const action of CRAFTING_ACTIONS) {
        expect(resourceIds).withContext(`${action.id}.cost`).toContain(action.cost.resourceId);
        expect(resourceIds).withContext(`${action.id}.reward`).toContain(action.reward.resourceId);
      }
    });

    it('cost and reward amounts are positive', () => {
      for (const action of CRAFTING_ACTIONS) {
        expect(action.cost.amount).withContext(`${action.id}.cost`).toBeGreaterThan(0);
        expect(action.reward.amount).withContext(`${action.id}.reward`).toBeGreaterThan(0);
      }
    });

    it("a 'hold' mechanic has a positive holdMs and decayMultiplier; a 'clicks' mechanic has a positive clicksRequired", () => {
      for (const action of CRAFTING_ACTIONS) {
        if (action.mechanic.type === 'hold') {
          expect(action.mechanic.holdMs).withContext(action.id).toBeGreaterThan(0);
          expect(action.mechanic.decayMultiplier).withContext(action.id).toBeGreaterThan(0);
        } else {
          expect(action.mechanic.clicksRequired).withContext(action.id).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('Upgrades', () => {
    it('has no duplicate ids', () => {
      expect(duplicateIds(upgradeIds)).toEqual([]);
    });

    it('every upgrade has an UPGRADE_FLAVOR entry with a non-empty label and description', () => {
      expect(idsMissingFlavor(upgradeIds, UPGRADE_FLAVOR)).toEqual([]);
      for (const upgrade of UPGRADES) {
        const flavor = UPGRADE_FLAVOR[upgrade.id];
        expect(flavor.label).withContext(upgrade.id).not.toBe('');
        expect(flavor.description).withContext(upgrade.id).not.toBe('');
      }
    });

    it('every upgrade belongs to a real character (UpgradesPanelComponent filters on this)', () => {
      expect(danglingReferences(UPGRADES.map(u => u.characterId), characterIds)).toEqual([]);
    });

    it('every upgrade is paid in a real resource', () => {
      expect(danglingReferences(UPGRADES.map(u => u.resourceId), resourceIds)).toEqual([]);
    });

    it('every upgrade has a sane cost curve and level cap', () => {
      for (const upgrade of UPGRADES) {
        expect(upgrade.baseCost).withContext(upgrade.id).toBeGreaterThan(0);
        expect(upgrade.costScalingFactor).withContext(upgrade.id).toBeGreaterThan(0);
        expect(upgrade.maxLevel).withContext(upgrade.id).toBeGreaterThan(0);
      }
    });

    it('every effect references a real target id of the right kind', () => {
      const knownActionIds = new Set([...characterActionIds, ...timedActionIds]);
      for (const upgrade of UPGRADES) {
        const effect = upgrade.effect;
        switch (effect.type) {
          case 'action-amount':
            expect(characterActionIds).withContext(upgrade.id).toContain(effect.actionId);
            break;
          case 'generator-rate':
            expect(GENERATORS.map(g => g.id)).withContext(upgrade.id).toContain(effect.generatorId);
            break;
          case 'timed-action-yield':
          case 'timed-action-duration':
          case 'bonus-reward-chance':
            expect(timedActionIds).withContext(upgrade.id).toContain(effect.timedActionId);
            break;
          case 'payout-double-chance':
          case 'cascading-double-chance':
            for (const targetId of effect.targetActionIds) {
              expect(knownActionIds.has(targetId)).withContext(`${upgrade.id} -> ${targetId}`).toBeTrue();
            }
            break;
        }
      }
    });
  });

  describe('Objectives', () => {
    it('has no duplicate ids', () => {
      expect(duplicateIds(OBJECTIVES.map(o => o.id))).toEqual([]);
    });

    it('a resource-threshold objective targets a real resource', () => {
      for (const objective of OBJECTIVES) {
        if (objective.type !== 'resource-threshold') continue;
        expect(resourceIds).withContext(objective.id).toContain(objective.resourceId);
      }
    });

    it('a specific-action-count objective targets a real action (character or timed)', () => {
      const knownActionIds = new Set([...characterActionIds, ...timedActionIds, ...craftingActionIds]);
      for (const objective of OBJECTIVES) {
        if (objective.type !== 'specific-action-count') continue;
        expect(knownActionIds.has(objective.actionId)).withContext(objective.id).toBeTrue();
      }
    });

    it('prerequisiteCharacterId, if set, references a real character', () => {
      for (const objective of OBJECTIVES) {
        if (!objective.prerequisiteCharacterId) continue;
        expect(characterIds).withContext(objective.id).toContain(objective.prerequisiteCharacterId);
      }
    });

    it('every reward references a real target of the right kind', () => {
      for (const objective of OBJECTIVES) {
        for (const reward of objective.rewards ?? []) {
          switch (reward.type) {
            case 'character':
              expect(characterIds).withContext(`${objective.id} -> ${reward.characterId}`).toContain(reward.characterId);
              break;
            case 'upgrade':
              expect(upgradeIds).withContext(`${objective.id} -> ${reward.upgradeId}`).toContain(reward.upgradeId);
              break;
            case 'system':
              // systemId is typed as `keyof typeof UNLOCKS` already, so any value here
              // is statically guaranteed real — nothing further to check at runtime.
              break;
          }
        }
      }
    });
  });
});
