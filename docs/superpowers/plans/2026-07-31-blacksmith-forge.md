# Blacksmith Forge (Pattern Crafting) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Blacksmith's first minigame — Pattern-based equipment crafting (5 starting-known Common patterns, a generic-but-unexercised rarity-upgrade mechanism, a single-craft-at-a-time passive timer) — as designed in `docs/superpowers/specs/2026-07-31-blacksmith-forge-design.md`.

**Architecture:** Config-driven data (`game-config.ts`/`flavor-text.ts`) feeds a new root service, `PatternCraftingService` (a `TimedActionsService`-style ticking service holding known-pattern state and at most one active craft), which grants items through a new generic primitive on the existing `EquipmentService`. A new `blacksmith-forge/` component tree surfaces it, hosted in the existing `MinigameZoneComponent` slot (extended from one hardcoded occupant to a per-active-character choice), and `CombatService` gains one more loot-drop case so a pattern can (in principle) drop from a kill.

**Tech Stack:** Angular 17 (standalone components, OnPush change detection), RxJS, Karma/Jasmine unit tests (`jasmine.clock()` for timer-based services), Playwright e2e.

## Global Constraints

- Config data (costs, durations, cross-entity relations) lives in `game-config.ts`; cosmetic data (labels, log flavor, symbols) lives in `flavor-text.ts` — never merged.
- Every stateful service is `@Injectable({ providedIn: 'root' })`, holds state privately, exposes `changes$: Subject<void>`, and has `getSnapshot()`/`restore()` since its state is persisted.
- Every persisted field must be wired into `SaveData` (`src/app/save/save-data.ts`), `SaveService` (`src/app/save/save.service.ts`), and `EXPECTED_SAVE_KEYS` (`src/app/save/save.service.spec.ts`) — this plan bundles all three into Task 5.
- All new components are `standalone: true` with `changeDetection: ChangeDetectionStrategy.OnPush`.
- UI follows the established terminal aesthetic: `'Courier New', Courier, monospace`, near-black backgrounds, thin `#222`/`#333` borders, bracketed zone titles (e.g. `[ BLACKSMITH FORGE ]`), no emoji — plain Unicode glyphs only (enforced by `emojiSymbols()` in `src/testing/invariants.ts`).
- Every new config array needs a matching integrity check in `game-config.spec.ts` (no duplicate ids, every id has a flavor entry, every cross-reference resolves) using the existing helpers in `src/testing/invariants.ts`.
- **Only the 5 Common patterns ship with real content.** The rarity-upgrade path (`upgradesFromEquipmentId`, `EquipmentService.replaceInventoryItem`) and the `'pattern'` loot-drop type are implemented and correct, but nothing in `PATTERNS`/`FIGHTER_ENEMIES` exercises them yet — same "fully wired but unexercised" precedent as `GENERATORS` (AGENTS.md §7). Their tests use Jasmine's `pending()` rather than a fabricated scenario, exactly like `per-second-calculator.service.spec.ts` does for `GENERATORS` — do not invent fake config to force coverage.
- Run `npm run test:all` after every task and confirm it passes before committing — extend the existing suite, never write throwaway scripts.

---

### Task 1: Config & flavor — Patterns, forged equipment, and the loot-drop type

**Files:**
- Modify: `src/app/configs/game-config.ts` (insert after the `EQUIPMENT_ITEMS` array, currently ending around line 534)
- Modify: `src/app/configs/flavor-text.ts` (extend `EQUIPMENT_FLAVOR`; add `PatternFlavor`/`PATTERN_FLAVOR`/`getPatternFlavor`)
- Test: `src/app/configs/game-config.spec.ts`

**Interfaces:**
- Produces: `PatternConfig` (`{ id, characterId, slotType, rarity, equipmentId, upgradesFromEquipmentId?, cost: {resourceId,amount}[], durationMs, unlocked }`), `PATTERNS: PatternConfig[]` (5 entries: `pattern-common-weapon`/`-helmet`/`-armor`/`-boots`/`-gauntlets`) — all from `game-config.ts`. 5 new `EQUIPMENT_ITEMS` entries: `forged-sword`, `forged-helmet`, `forged-armor`, `forged-boots`, `forged-gauntlets`. `PatternFlavor` (`{ label, logMessage }`), `PATTERN_FLAVOR: Record<string, PatternFlavor>`, `getPatternFlavor(id): PatternFlavor` — all from `flavor-text.ts`. Every later task imports these.

**Note:** `LootDrop`'s `'pattern'` variant is deliberately **not** added here — it's added in Task 4, together with the `CombatService` code that handles it, so the codebase never sits in a state where `LootDrop` has a case `CombatService`'s loot loop doesn't compile against.

- [ ] **Step 1: Write the failing integrity tests**

Add to the top of `src/app/configs/game-config.spec.ts`, inside the existing import blocks:

```ts
// add to the existing `from './game-config'` import list:
  PATTERNS,
// add to the existing `from './flavor-text'` import list:
  PATTERN_FLAVOR,
```

Add a new top-level const near the existing `const equipmentIds = ...` line:

```ts
const patternIds = PATTERNS.map(p => p.id);
```

Add a new `describe` block (anywhere at the top level, e.g. right after the `describe('Fighter Combat: equipment', ...)` block):

```ts
describe('Blacksmith Forge: patterns', () => {
  it('has no duplicate ids', () => {
    expect(duplicateIds(patternIds)).toEqual([]);
  });

  it('every pattern has a PATTERN_FLAVOR entry with a non-empty label and logMessage', () => {
    expect(idsMissingFlavor(patternIds, PATTERN_FLAVOR)).toEqual([]);
    for (const pattern of PATTERNS) {
      const flavor = PATTERN_FLAVOR[pattern.id];
      expect(flavor.label).withContext(pattern.id).not.toBe('');
      expect(flavor.logMessage).withContext(pattern.id).not.toBe('');
    }
  });

  it('every pattern targets a real character', () => {
    expect(danglingReferences(PATTERNS.map(p => p.characterId), characterIds)).toEqual([]);
  });

  it("every pattern's equipmentId (and upgradesFromEquipmentId, if set) resolves to a real equipment item", () => {
    for (const pattern of PATTERNS) {
      expect(equipmentIds).withContext(`${pattern.id}.equipmentId`).toContain(pattern.equipmentId);
      if (pattern.upgradesFromEquipmentId) {
        expect(equipmentIds)
          .withContext(`${pattern.id}.upgradesFromEquipmentId`)
          .toContain(pattern.upgradesFromEquipmentId);
      }
    }
  });

  it("every pattern's slotType and rarity match its own equipmentId's EquipmentConfig", () => {
    for (const pattern of PATTERNS) {
      const item = EQUIPMENT_ITEMS.find(i => i.id === pattern.equipmentId);
      expect(item).withContext(pattern.id).toBeDefined();
      expect(item!.slotType).withContext(pattern.id).toBe(pattern.slotType);
      expect(item!.rarity).withContext(pattern.id).toBe(pattern.rarity);
    }
  });

  it('every cost resourceId is real and every amount is positive', () => {
    for (const pattern of PATTERNS) {
      for (const entry of pattern.cost) {
        expect(resourceIds).withContext(`${pattern.id} -> ${entry.resourceId}`).toContain(entry.resourceId);
        expect(entry.amount).withContext(`${pattern.id} -> ${entry.resourceId}`).toBeGreaterThan(0);
      }
    }
  });

  it('every pattern has a positive durationMs', () => {
    for (const pattern of PATTERNS) {
      expect(pattern.durationMs).withContext(pattern.id).toBeGreaterThan(0);
    }
  });
});
```

(`patternIds` here is only used by this task's own `describe('Blacksmith Forge: patterns', ...)` block above — the existing enemy-loot-entry test is extended separately, in Task 4, alongside the `LootDrop` union change it depends on.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `ng test --include=src/app/configs/game-config.spec.ts --watch=false`
Expected: FAIL to compile — `PATTERNS`/`PATTERN_FLAVOR` don't exist yet.

- [ ] **Step 3: Add `PatternConfig`/`PATTERNS` and the 5 forged equipment items to `game-config.ts`**

Insert this new section immediately after the `EQUIPMENT_ITEMS` array's closing `];` (currently line 534) and before the `// ── Fighter Combat: enemies & areas ──` comment:

```ts
// ── Blacksmith Forge: patterns ─────────────────────────────────
// A Pattern is a permanent recipe, not a consumable — once known
// (PatternCraftingService.knownPatternIds), the Blacksmith can craft it any number of
// times, cost/time permitting. Each pattern represents a single equipment slot-line for
// the Fighter, not a repeatable stack: once its equipmentId is owned, the pattern is
// "done" until a future higher-tier pattern (upgradesFromEquipmentId set) supersedes it
// in place — see PatternCraftingService.isOwned.

export interface PatternConfig {
  id: string;
  characterId: string;
  slotType: EquipmentSlotType;
  rarity: EquipmentRarity;
  /** The equipment item this pattern produces. */
  equipmentId: string;
  /** Set only for a rarity-upgrade pattern (none ship in this version — see PATTERNS
   *  below). Craft requires the Fighter currently owns this item (equipped or in
   *  inventory); PatternCraftingService consumes it and replaces it with `equipmentId`
   *  via EquipmentService.replaceInventoryItem. */
  upgradesFromEquipmentId?: string;
  cost: { resourceId: string; amount: number }[];
  durationMs: number;
  /** Whether this pattern is known from the moment the Blacksmith Forge unlocks — same
   *  "starts unlocked" meaning as UpgradeConfig.unlocked/CharacterConfig.unlocked. A
   *  future non-starting pattern (rarity upgrade, combat drop) ships false and relies on
   *  PatternCraftingService.unlock(). */
  unlocked: boolean;
}

export const PATTERNS: PatternConfig[] = [
  {
    id: 'pattern-common-weapon',
    characterId: 'blacksmith',
    slotType: 'weapon',
    rarity: 'common',
    equipmentId: 'forged-sword',
    cost: [{ resourceId: 'ironmongery', amount: 5 }, { resourceId: 'ingot', amount: 5 }],
    durationMs: 60_000,
    unlocked: true,
  },
  {
    id: 'pattern-common-helmet',
    characterId: 'blacksmith',
    slotType: 'helmet',
    rarity: 'common',
    equipmentId: 'forged-helmet',
    cost: [{ resourceId: 'ironmongery', amount: 3 }, { resourceId: 'ingot', amount: 5 }],
    durationMs: 45_000,
    unlocked: true,
  },
  {
    id: 'pattern-common-armor',
    characterId: 'blacksmith',
    slotType: 'armor',
    rarity: 'common',
    equipmentId: 'forged-armor',
    cost: [{ resourceId: 'ironmongery', amount: 6 }, { resourceId: 'ingot', amount: 8 }],
    durationMs: 90_000,
    unlocked: true,
  },
  {
    id: 'pattern-common-boots',
    characterId: 'blacksmith',
    slotType: 'boots',
    rarity: 'common',
    equipmentId: 'forged-boots',
    cost: [{ resourceId: 'ironmongery', amount: 3 }, { resourceId: 'pelt', amount: 2 }],
    durationMs: 40_000,
    unlocked: true,
  },
  {
    id: 'pattern-common-gauntlets',
    characterId: 'blacksmith',
    slotType: 'gauntlets',
    rarity: 'common',
    equipmentId: 'forged-gauntlets',
    cost: [{ resourceId: 'ironmongery', amount: 4 }, { resourceId: 'pelt', amount: 2 }],
    durationMs: 50_000,
    unlocked: true,
  },
];
```

Add these 5 entries inside the existing `EQUIPMENT_ITEMS` array (after the `basic-sword` entry, before its closing `];`):

```ts
  {
    id: 'forged-sword',
    slotType: 'weapon',
    rarity: 'common',
    effects: [{ type: 'bonus-damage', amount: 1 }],
  },
  {
    id: 'forged-helmet',
    slotType: 'helmet',
    rarity: 'common',
    effects: [{ type: 'stat-bonus', stat: 'wisdom', amount: 1 }],
  },
  {
    id: 'forged-armor',
    slotType: 'armor',
    rarity: 'common',
    effects: [{ type: 'damage-reduction', reduction: 0.05 }],
  },
  {
    id: 'forged-boots',
    slotType: 'boots',
    rarity: 'common',
    effects: [{ type: 'stat-bonus', stat: 'dexterity', amount: 1 }],
  },
  {
    id: 'forged-gauntlets',
    slotType: 'gauntlets',
    rarity: 'common',
    effects: [{ type: 'stat-bonus', stat: 'strength', amount: 1 }],
  },
```

(`LootDrop` is left untouched here — its `'pattern'` case is added in Task 4, together with the `CombatService` code that handles it.)

- [ ] **Step 4: Add flavor entries to `flavor-text.ts`**

Add these 5 entries inside the existing `EQUIPMENT_FLAVOR` record (after `basic-sword`):

```ts
  'forged-sword': {
    label: 'Forged Sword',
    description: '+1 bonus damage while equipped.',
    symbol: '|',
  },
  'forged-helmet': {
    label: 'Forged Helmet',
    description: '+1 Wisdom while equipped.',
    symbol: '∩',
  },
  'forged-armor': {
    label: 'Forged Armor',
    description: 'Reduces incoming damage by 5% while equipped.',
    symbol: '#',
  },
  'forged-boots': {
    label: 'Forged Boots',
    description: '+1 Dexterity while equipped.',
    symbol: '⌐',
  },
  'forged-gauntlets': {
    label: 'Forged Gauntlets',
    description: '+1 Strength while equipped.',
    symbol: '»',
  },
```

Add a new section at the end of `flavor-text.ts`:

```ts
// ── Blacksmith Forge: patterns ─────────────────────────────────

export interface PatternFlavor {
  /** Title shown on the Craft button and in its tooltip. */
  label: string;
  /** Flavor sentence logged (SUCCESS level) once the craft completes. */
  logMessage: string;
}

// Keyed by PatternConfig.id (game-config.ts).
export const PATTERN_FLAVOR: Record<string, PatternFlavor> = {
  'pattern-common-weapon': {
    label: 'Weapon Pattern (Common)',
    logMessage: 'You finish shaping the blade and admire your work.',
  },
  'pattern-common-helmet': {
    label: 'Helmet Pattern (Common)',
    logMessage: 'You quench the newly-formed helmet and set it aside to cool.',
  },
  'pattern-common-armor': {
    label: 'Armor Pattern (Common)',
    logMessage: 'You rivet the last plate into place, completing the armor.',
  },
  'pattern-common-boots': {
    label: 'Boots Pattern (Common)',
    logMessage: 'You fit the final buckle, finishing a sturdy pair of boots.',
  },
  'pattern-common-gauntlets': {
    label: 'Gauntlets Pattern (Common)',
    logMessage: 'You hammer the last joint smooth, completing the gauntlets.',
  },
};

const DEFAULT_PATTERN_FLAVOR: PatternFlavor = { label: '', logMessage: '' };

export function getPatternFlavor(id: string): PatternFlavor {
  return PATTERN_FLAVOR[id] ?? DEFAULT_PATTERN_FLAVOR;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `ng test --include=src/app/configs/game-config.spec.ts --watch=false`
Expected: PASS — including every pre-existing test in this file (the new `forged-*` equipment ids automatically satisfy the existing `EQUIPMENT_FLAVOR`/`emojiSymbols`/`slotType` checks since those iterate `EQUIPMENT_ITEMS` generically).

- [ ] **Step 6: Commit**

```bash
git add src/app/configs/game-config.ts src/app/configs/flavor-text.ts src/app/configs/game-config.spec.ts
git commit -m "Add Blacksmith Forge patterns, forged equipment items, and the pattern loot-drop type"
```

---

### Task 2: `EquipmentService.replaceInventoryItem` — the rarity-upgrade primitive

**Files:**
- Modify: `src/app/fighter-combat/equipment.service.ts`
- Test: `src/app/fighter-combat/equipment.service.spec.ts`

**Interfaces:**
- Consumes: `EQUIPMENT_ITEMS`/`EQUIPMENT_SLOTS` (Task 1's `forged-sword` id specifically, for the test).
- Produces: `EquipmentService.replaceInventoryItem(oldItemId: string, newItemId: string): void`. `PatternCraftingService` (Task 3) is the real caller.

- [ ] **Step 1: Write the failing tests**

Add to `src/app/fighter-combat/equipment.service.spec.ts`, inside the existing `describe('EquipmentService', ...)` block (e.g. after the `unequip` tests):

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `ng test --include=src/app/fighter-combat/equipment.service.spec.ts --watch=false`
Expected: FAIL to compile — `replaceInventoryItem` doesn't exist on `EquipmentService` yet.

- [ ] **Step 3: Implement `replaceInventoryItem`**

Add to `src/app/fighter-combat/equipment.service.ts`, as a new public method (e.g. right after `unequip`):

```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `ng test --include=src/app/fighter-combat/equipment.service.spec.ts --watch=false`
Expected: PASS (all pre-existing tests plus the 3 new ones).

- [ ] **Step 5: Commit**

```bash
git add src/app/fighter-combat/equipment.service.ts src/app/fighter-combat/equipment.service.spec.ts
git commit -m "Add EquipmentService.replaceInventoryItem, the rarity-upgrade swap primitive"
```

---

### Task 3: `PatternCraftingService`

**Files:**
- Create: `src/app/blacksmith-forge/pattern-crafting.service.ts`
- Test: `src/app/blacksmith-forge/pattern-crafting.service.spec.ts`

**Interfaces:**
- Consumes: `PATTERNS`, `PatternConfig`, `EQUIPMENT_SLOTS`, `TIMED_ACTION_TICK_MS` (`game-config.ts`); `getPatternFlavor`, `getEquipmentFlavor` (`flavor-text.ts`); `resourceNameToken` (`shared/resource-token.ts`); `WalletService.getAmount/add`; `EquipmentService.getInventoryCount/getEquippedItemId/addToInventory/replaceInventoryItem`; `StatisticsService.recordAction`; `ActivityLogService.log`.
- Produces: `PatternCraftingSnapshot` (`{ knownPatternIds: string[]; active: { patternId: string; startedAt: number } | null }`), `PatternState` (`{ config: PatternConfig; known: boolean; owned: boolean; active: boolean; progress: number }`), `PatternCraftingService` with `patterns: PatternState[]` (getter), `changes$: Observable<void>`, `isOwned(config: PatternConfig): boolean`, `getProgress(patternId: string): number`, `unlock(patternId: string): void`, `start(patternId: string): void`, `getSnapshot(): PatternCraftingSnapshot`, `restore(snapshot: PatternCraftingSnapshot | undefined): void`. Tasks 4, 5, 6 all depend on these exact names.

- [ ] **Step 1: Write the failing tests**

Create `src/app/blacksmith-forge/pattern-crafting.service.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { PatternCraftingService } from './pattern-crafting.service';
import { WalletService } from '../economy/wallet.service';
import { StatisticsService } from '../statistics/statistics.service';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { EquipmentService } from '../fighter-combat/equipment.service';

const WEAPON_PATTERN = 'pattern-common-weapon'; // 5 ironmongery + 5 ingot, 60s -> forged-sword

describe('PatternCraftingService', () => {
  let service: PatternCraftingService;
  let wallet: WalletService;
  let statistics: StatisticsService;
  let equipment: EquipmentService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    jasmine.clock().install();
    jasmine.clock().mockDate();
    service = TestBed.inject(PatternCraftingService);
    wallet = TestBed.inject(WalletService);
    statistics = TestBed.inject(StatisticsService);
    equipment = TestBed.inject(EquipmentService);
  });

  afterEach(() => {
    jasmine.clock().uninstall();
  });

  function stateFor(id: string) {
    return service.patterns.find(p => p.config.id === id)!;
  }

  function fundWeaponPattern() {
    wallet.add('ironmongery', 5);
    wallet.add('ingot', 5);
  }

  it('all 5 Common patterns are known from the start', () => {
    const knownIds = service.patterns.filter(p => p.known).map(p => p.config.id);
    expect(knownIds).toEqual([
      'pattern-common-weapon',
      'pattern-common-helmet',
      'pattern-common-armor',
      'pattern-common-boots',
      'pattern-common-gauntlets',
    ]);
  });

  describe('start()', () => {
    it('no-ops for an unknown id', () => {
      expect(() => service.start('not-a-real-id')).not.toThrow();
    });

    it('no-ops (and charges nothing) if any cost resource is unaffordable', () => {
      service.start(WEAPON_PATTERN);
      expect(stateFor(WEAPON_PATTERN).active).toBeFalse();
      expect(wallet.getAmount('ironmongery')).toBe(0);
    });

    it('logs an error to the activity log if unaffordable', () => {
      const activityLog = TestBed.inject(ActivityLogService);
      const log = spyOn(activityLog, 'log');

      service.start(WEAPON_PATTERN);

      expect(log).toHaveBeenCalledOnceWith(jasmine.stringMatching(/not enough/i), 'error');
    });

    it('charges every cost entry exactly, up front', () => {
      fundWeaponPattern();
      service.start(WEAPON_PATTERN);
      expect(wallet.getAmount('ironmongery')).toBe(0);
      expect(wallet.getAmount('ingot')).toBe(0);
      expect(stateFor(WEAPON_PATTERN).active).toBeTrue();
    });

    it('no-ops if a different craft is already active', () => {
      fundWeaponPattern();
      wallet.add('ironmongery', 3);
      wallet.add('ingot', 5); // enough left over to also afford the helmet pattern
      service.start(WEAPON_PATTERN);

      const spentAfterFirst = wallet.getAmount('ironmongery');
      service.start('pattern-common-helmet');

      expect(wallet.getAmount('ironmongery')).toBe(spentAfterFirst); // helmet's cost never charged
      expect(stateFor('pattern-common-helmet').active).toBeFalse();
    });

    it('no-ops if the item is already owned', () => {
      equipment.addToInventory('forged-sword');
      fundWeaponPattern();

      service.start(WEAPON_PATTERN);

      expect(stateFor(WEAPON_PATTERN).active).toBeFalse();
      expect(wallet.getAmount('ironmongery')).toBe(5); // never charged
    });
  });

  describe('completion', () => {
    it('grants the item to Fighter inventory once the duration elapses, and clears active', () => {
      fundWeaponPattern();
      service.start(WEAPON_PATTERN);

      jasmine.clock().tick(60_000);

      expect(equipment.getInventoryCount('forged-sword')).toBe(1);
      expect(stateFor(WEAPON_PATTERN).active).toBeFalse();
      expect(stateFor(WEAPON_PATTERN).owned).toBeTrue();
    });

    it('does not grant the item before the duration elapses', () => {
      fundWeaponPattern();
      service.start(WEAPON_PATTERN);

      jasmine.clock().tick(59_000);

      expect(equipment.getInventoryCount('forged-sword')).toBe(0);
      expect(stateFor(WEAPON_PATTERN).active).toBeTrue();
    });

    it('records the completion via StatisticsService, so it counts toward an action-count objective', () => {
      const recordAction = spyOn(statistics, 'recordAction').and.callThrough();
      fundWeaponPattern();
      service.start(WEAPON_PATTERN);
      expect(recordAction).not.toHaveBeenCalled();

      jasmine.clock().tick(60_000);
      expect(recordAction).toHaveBeenCalledOnceWith(WEAPON_PATTERN);
    });

    it('logs completion at "success" with the item label in parens', () => {
      const activityLog = TestBed.inject(ActivityLogService);
      const log = spyOn(activityLog, 'log');
      fundWeaponPattern();
      service.start(WEAPON_PATTERN);

      jasmine.clock().tick(60_000);

      expect(log).toHaveBeenCalledOnceWith(jasmine.stringMatching(/Forged Sword/), 'success');
    });

    it('progress climbs from 0 toward 1 while active, and resets to 0 once complete', () => {
      fundWeaponPattern();
      service.start(WEAPON_PATTERN);

      jasmine.clock().tick(30_000);
      const mid = stateFor(WEAPON_PATTERN).progress;
      expect(mid).toBeGreaterThan(0);
      expect(mid).toBeLessThan(1);

      jasmine.clock().tick(30_000);
      expect(stateFor(WEAPON_PATTERN).progress).toBe(0); // completed and cleared, not clamped at 1
    });

    it("another pattern's progress stays 0 while a different one is active", () => {
      fundWeaponPattern();
      service.start(WEAPON_PATTERN);
      jasmine.clock().tick(30_000);
      expect(stateFor('pattern-common-helmet').progress).toBe(0);
    });
  });

  describe('unlock()', () => {
    it('is idempotent — unlocking an already-known pattern stays known, does not throw', () => {
      expect(() => service.unlock(WEAPON_PATTERN)).not.toThrow();
      expect(stateFor(WEAPON_PATTERN).known).toBeTrue();
    });
  });

  describe('changes$', () => {
    it('fires on start() and on completion', () => {
      let emissions = 0;
      service.changes$.subscribe(() => emissions++);

      fundWeaponPattern();
      service.start(WEAPON_PATTERN);
      expect(emissions).toBe(1);

      jasmine.clock().tick(60_000);
      expect(emissions).toBe(2);
    });
  });

  describe('snapshot / restore', () => {
    it('round-trips a mid-craft active state and its remaining progress', () => {
      fundWeaponPattern();
      service.start(WEAPON_PATTERN);
      jasmine.clock().tick(20_000);
      const snapshot = service.getSnapshot();

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({});
      const restored = TestBed.inject(PatternCraftingService);
      restored.restore(snapshot);

      const progress = restored.patterns.find(p => p.config.id === WEAPON_PATTERN)!.progress;
      expect(progress).toBeGreaterThan(0);
      expect(progress).toBeLessThan(1);
    });

    it('a fresh instance with no snapshot still starts with the 5 Common patterns known', () => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({});
      const restored = TestBed.inject(PatternCraftingService);
      restored.restore(undefined);

      expect(restored.patterns.filter(p => p.known).length).toBe(5);
    });
  });

  describe('rarity-upgrade patterns (upgradesFromEquipmentId)', () => {
    // No PATTERNS entry sets upgradesFromEquipmentId yet (Common tier only, this
    // version) — same "wired but unexercised" precedent as GENERATORS
    // (per-second-calculator.service.spec.ts). Replace this with a real test the moment
    // the first upgrade-tier pattern is registered; don't leave it passing for its own
    // sake.
    it('consumes the prerequisite item and grants the upgraded item in its place', () => {
      pending('no PATTERNS entry has upgradesFromEquipmentId set yet');
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `ng test --include=src/app/blacksmith-forge/pattern-crafting.service.spec.ts --watch=false`
Expected: FAIL — cannot find module `./pattern-crafting.service`.

- [ ] **Step 3: Implement `PatternCraftingService`**

Create `src/app/blacksmith-forge/pattern-crafting.service.ts`:

```ts
import { Injectable, inject } from '@angular/core';
import { Subject } from 'rxjs';
import { WalletService } from '../economy/wallet.service';
import { StatisticsService } from '../statistics/statistics.service';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { EquipmentService } from '../fighter-combat/equipment.service';
import { PATTERNS, PatternConfig, EQUIPMENT_SLOTS, TIMED_ACTION_TICK_MS } from '../configs/game-config';
import { getPatternFlavor, getEquipmentFlavor } from '../configs/flavor-text';
import { resourceNameToken } from '../shared/resource-token';

export interface PatternCraftingSnapshot {
  knownPatternIds: string[];
  active: { patternId: string; startedAt: number } | null;
}

export interface PatternState {
  config: PatternConfig;
  known: boolean;
  /** Whether the Fighter currently holds config.equipmentId (equipped or in inventory) —
   *  once true, this pattern can't be crafted again until a future upgrade-tier pattern
   *  supersedes it (see AGENTS.md's "one item per slot-line" rule). */
  owned: boolean;
  /** True while this exact pattern is the one currently crafting. */
  active: boolean;
  /** 0..1 elapsed fraction of durationMs — 0 whenever this pattern isn't the active one. */
  progress: number;
}

/**
 * Owns the Blacksmith's known-pattern set and at most one active craft — modeled on
 * TimedActionsService's absolute-timestamp-anchor pattern (a passive real-time wait, not
 * an active hold/click), but constrained to a single concurrent craft across every
 * pattern, not one timer per id. A pattern, once known, stays known forever (a recipe
 * unlock, not a consumable); each pattern represents one equipment slot-line for the
 * Fighter, not a repeatable stack — see `isOwned` and AGENTS.md.
 */
@Injectable({ providedIn: 'root' })
export class PatternCraftingService {
  private wallet = inject(WalletService);
  private statistics = inject(StatisticsService);
  private activityLog = inject(ActivityLogService);
  private equipment = inject(EquipmentService);

  private knownPatternIds = new Set<string>(PATTERNS.filter(p => p.unlocked).map(p => p.id));
  private activeCraft: { patternId: string; startedAt: number } | null = null;

  private changesSource = new Subject<void>();
  readonly changes$ = this.changesSource.asObservable();

  constructor() {
    setInterval(() => this.checkCompletions(), TIMED_ACTION_TICK_MS);
  }

  get patterns(): PatternState[] {
    return PATTERNS.map(config => ({
      config,
      known: this.knownPatternIds.has(config.id),
      owned: this.isOwned(config),
      active: this.activeCraft?.patternId === config.id,
      progress: this.getProgress(config.id),
    }));
  }

  isOwned(config: PatternConfig): boolean {
    return this.isHeldAnywhere(config.equipmentId);
  }

  getProgress(patternId: string): number {
    if (!this.activeCraft || this.activeCraft.patternId !== patternId) return 0;
    const config = PATTERNS.find(p => p.id === patternId);
    if (!config) return 0;
    return Math.min((Date.now() - this.activeCraft.startedAt) / config.durationMs, 1);
  }

  /** Idempotent — the future hook for a combat-dropped pattern (see CombatService). */
  unlock(patternId: string): void {
    if (this.knownPatternIds.has(patternId)) return;
    this.knownPatternIds.add(patternId);
    this.changesSource.next();
  }

  /** No-op if the pattern is unknown, already owned, its upgrade prerequisite isn't
   *  held, a different craft is already active, or any cost entry is unaffordable
   *  (logging an insufficient-cost error in that last case, same convention as
   *  TimedActionsService.start). */
  start(patternId: string): void {
    const config = PATTERNS.find(p => p.id === patternId);
    if (!config) return;
    if (!this.knownPatternIds.has(patternId)) return;
    if (this.activeCraft) return;
    if (this.isOwned(config)) return;
    if (config.upgradesFromEquipmentId && !this.isHeldAnywhere(config.upgradesFromEquipmentId)) return;

    for (const entry of config.cost) {
      if (this.wallet.getAmount(entry.resourceId) < entry.amount) {
        this.logInsufficientCost(config, entry.resourceId);
        return;
      }
    }
    for (const entry of config.cost) {
      this.wallet.add(entry.resourceId, -entry.amount);
    }

    this.activeCraft = { patternId, startedAt: Date.now() };
    this.changesSource.next();
  }

  private isHeldAnywhere(itemId: string): boolean {
    if (this.equipment.getInventoryCount(itemId) > 0) return true;
    return EQUIPMENT_SLOTS.some(slot => this.equipment.getEquippedItemId(slot.id) === itemId);
  }

  private checkCompletions(): void {
    if (!this.activeCraft) return;
    const config = PATTERNS.find(p => p.id === this.activeCraft!.patternId);
    if (!config) {
      // Defensive: PATTERNS shrank while a craft was active in memory — clear rather
      // than spin forever checking a config that no longer exists, same reasoning as
      // CombatService's stale-enemy guard.
      this.activeCraft = null;
      this.changesSource.next();
      return;
    }
    if (Date.now() - this.activeCraft.startedAt < config.durationMs) return;

    this.grantReward(config);
    this.activeCraft = null;
    this.changesSource.next();
  }

  private grantReward(config: PatternConfig): void {
    // Same "count on completion, not on start" convention as TimedActionsService/
    // CraftingService.
    this.statistics.recordAction(config.id);
    if (config.upgradesFromEquipmentId) {
      this.equipment.replaceInventoryItem(config.upgradesFromEquipmentId, config.equipmentId);
    } else {
      this.equipment.addToInventory(config.equipmentId);
    }
    this.logCompletion(config);
  }

  private logInsufficientCost(config: PatternConfig, resourceId: string): void {
    const { label } = getPatternFlavor(config.id);
    this.activityLog.log(`Not enough ${resourceNameToken(resourceId)} to start ${label}.`, 'error');
  }

  /** 'success', not 'default' — a completed craft is a noteworthy, non-routine event
   *  (same tier as an Objective claim or a combat victory), and there's no currency
   *  amount to append as a colored token, so the item's plain label goes in parens
   *  instead — matching how a combat equipment drop already logs (see CombatService). */
  private logCompletion(config: PatternConfig): void {
    const { logMessage } = getPatternFlavor(config.id);
    const itemLabel = getEquipmentFlavor(config.equipmentId).label;
    this.activityLog.log(`${logMessage} (${itemLabel})`, 'success');
  }

  getSnapshot(): PatternCraftingSnapshot {
    return {
      knownPatternIds: [...this.knownPatternIds],
      active: this.activeCraft ? { ...this.activeCraft } : null,
    };
  }

  restore(snapshot: PatternCraftingSnapshot | undefined): void {
    const defaults = PATTERNS.filter(p => p.unlocked).map(p => p.id);
    this.knownPatternIds = new Set(snapshot?.knownPatternIds ?? defaults);

    const restoredActive = snapshot?.active;
    const configStillExists = !!restoredActive && PATTERNS.some(p => p.id === restoredActive.patternId);
    this.activeCraft = restoredActive && configStillExists ? { ...restoredActive } : null;
    this.changesSource.next();
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `ng test --include=src/app/blacksmith-forge/pattern-crafting.service.spec.ts --watch=false`
Expected: PASS (1 pending — the rarity-upgrade test — and every other spec green).

- [ ] **Step 5: Commit**

```bash
git add src/app/blacksmith-forge/pattern-crafting.service.ts src/app/blacksmith-forge/pattern-crafting.service.spec.ts
git commit -m "Add PatternCraftingService — Blacksmith Forge's known-pattern and single-craft state"
```

---

### Task 4: Widen `LootDrop` and handle a `'pattern'` drop in `CombatService`

This task adds the `LootDrop` union's `'pattern'` case and the code that handles it
together, in one commit — unlike Task 1's config, this one can't be split across a task
boundary, since a `LootDrop` union with a case nothing handles yet would leave
`combat.service.ts`'s existing `if/else` loot loop failing to compile (TypeScript would
narrow its `else` branch to `{equipment} | {pattern}` and `drop.equipmentId` would no
longer typecheck there).

**Files:**
- Modify: `src/app/configs/game-config.ts` (the `LootDrop` union, currently ~line 546)
- Modify: `src/app/configs/game-config.spec.ts` (the existing enemy-loot-entry test)
- Modify: `src/app/fighter-combat/combat.service.ts`
- Test: `src/app/fighter-combat/combat.service.spec.ts`

**Interfaces:**
- Consumes: `PatternCraftingService.unlock(patternId: string): void` (Task 3); `getPatternFlavor` (Task 1); `patternIds` (a top-level const already added to `game-config.spec.ts` by Task 1).
- Produces: `LootDrop` gains a `{ type: 'pattern'; patternId: string; chance: number }` member. `resolveVictory` now handles all three variants.

- [ ] **Step 1: Write the failing tests**

In `src/app/configs/game-config.spec.ts`, replace the existing "every enemy loot entry references a real resource or equipment item, with a sane chance" test (inside `describe('Fighter Combat: enemies & areas', ...)`) with:

```ts
it('every enemy loot entry references a real resource, equipment item, or pattern, with a sane chance', () => {
  for (const enemy of FIGHTER_ENEMIES) {
    for (const drop of enemy.loot) {
      expect(drop.chance).withContext(enemy.id).toBeGreaterThan(0);
      expect(drop.chance).withContext(enemy.id).toBeLessThanOrEqual(1);
      if (drop.type === 'resource') {
        expect(resourceIds).withContext(`${enemy.id} -> ${drop.resourceId}`).toContain(drop.resourceId);
        expect(drop.min).withContext(enemy.id).toBeGreaterThan(0);
        expect(drop.max).withContext(enemy.id).toBeGreaterThanOrEqual(drop.min);
      } else if (drop.type === 'equipment') {
        expect(equipmentIds).withContext(`${enemy.id} -> ${drop.equipmentId}`).toContain(drop.equipmentId);
      } else {
        expect(patternIds).withContext(`${enemy.id} -> ${drop.patternId}`).toContain(drop.patternId);
      }
    }
  }
});
```

In `src/app/fighter-combat/combat.service.spec.ts`, add a pending test inside the existing `describe('CombatService', ...)` block (e.g. after the `describe('swift-strike ring', ...)` block):

```ts
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
```

- [ ] **Step 2: Run both spec files to verify they fail**

Run: `ng test --include=src/app/configs/game-config.spec.ts --watch=false`
Run: `ng test --include=src/app/fighter-combat/combat.service.spec.ts --watch=false`
Expected: both FAIL to compile — `drop.patternId` doesn't exist on the current 2-variant `LootDrop` union.

- [ ] **Step 3: Widen `LootDrop` and handle the new branch in `resolveVictory`**

In `src/app/configs/game-config.ts`, modify the `LootDrop` union (currently ~line 546) to add a third case:

```ts
export type LootDrop =
  | { type: 'resource'; resourceId: string; chance: number; min: number; max: number }
  | { type: 'equipment'; equipmentId: string; chance: number }
  | { type: 'pattern'; patternId: string; chance: number };
```

In `src/app/fighter-combat/combat.service.ts`, add an import:

```ts
import { PatternCraftingService } from '../blacksmith-forge/pattern-crafting.service';
```

Add `getPatternFlavor` to the existing `flavor-text` import:

```ts
import { getEquipmentFlavor, getFighterEnemyFlavor, getPatternFlavor } from '../configs/flavor-text';
```

Add a new injected field alongside the others:

```ts
  private patternCrafting = inject(PatternCraftingService);
```

Replace the loot loop inside `resolveVictory` (currently an `if/else` over `resource`/`equipment`) with a three-way branch:

```ts
    const grants: string[] = [];
    for (const drop of enemyConfig.loot) {
      if (Math.random() >= drop.chance) continue;
      if (drop.type === 'resource') {
        const amount = drop.min + Math.floor(Math.random() * (drop.max - drop.min + 1));
        this.wallet.add(drop.resourceId, amount);
        grants.push(resourceAmountToken(drop.resourceId, amount));
      } else if (drop.type === 'equipment') {
        this.equipment.addToInventory(drop.equipmentId);
        grants.push(getEquipmentFlavor(drop.equipmentId).label);
      } else {
        this.patternCrafting.unlock(drop.patternId);
        grants.push(getPatternFlavor(drop.patternId).label);
      }
    }
```

- [ ] **Step 4: Run both spec files to confirm everything passes**

Run: `ng test --include=src/app/configs/game-config.spec.ts --watch=false`
Run: `ng test --include=src/app/fighter-combat/combat.service.spec.ts --watch=false`
Expected: both PASS (the second has 1 pending — the new test — rest green). The existing gold/ears/ring loot test (`'sends a loot-dropped ring straight to the equipment inventory on a won fight'`) must still pass unchanged, since its `Math.random` stub sequence never reaches a `'pattern'` drop.

- [ ] **Step 5: Commit**

```bash
git add src/app/configs/game-config.ts src/app/configs/game-config.spec.ts src/app/fighter-combat/combat.service.ts src/app/fighter-combat/combat.service.spec.ts
git commit -m "Add the pattern loot-drop type and wire CombatService to unlock a dropped pattern"
```

---

### Task 5: Save wiring

**Files:**
- Modify: `src/app/save/save-data.ts`
- Modify: `src/app/save/save.service.ts`
- Test: `src/app/save/save.service.spec.ts`

**Interfaces:**
- Consumes: `PatternCraftingSnapshot`, `PatternCraftingService` (Task 3).
- Produces: `SaveData.patternCrafting: PatternCraftingSnapshot`.

- [ ] **Step 1: Write the failing tests**

In `src/app/save/save.service.spec.ts`, add an import:

```ts
import { PatternCraftingService } from '../blacksmith-forge/pattern-crafting.service';
```

Add `'patternCrafting'` to the end of the `EXPECTED_SAVE_KEYS` array:

```ts
const EXPECTED_SAVE_KEYS: (keyof SaveData)[] = [
  // ...unchanged entries...
  'combat',
  'patternCrafting',
];
```

In the round-trip test, inject the service, put it into a non-default state, and assert the export captures it:

```ts
    // add alongside the other TestBed.inject(...) lines:
    const patternCrafting = TestBed.inject(PatternCraftingService);

    // add alongside the other state-mutating calls, before `const decoded = ...`:
    wallet.add('ironmongery', 5);
    wallet.add('ingot', 5);
    patternCrafting.start('pattern-common-weapon');

    // add alongside the other `expect(decoded.x).toEqual(x.getSnapshot())` lines:
    expect(decoded.patternCrafting).toEqual(patternCrafting.getSnapshot());
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `ng test --include=src/app/save/save.service.spec.ts --watch=false`
Expected: FAIL — the exported keys don't include `'patternCrafting'` yet, and `decoded.patternCrafting` is `undefined`.

- [ ] **Step 3: Wire `patternCrafting` into `SaveData` and `SaveService`**

In `src/app/save/save-data.ts`, add an import:

```ts
import { PatternCraftingSnapshot } from '../blacksmith-forge/pattern-crafting.service';
```

Add a field to the `SaveData` interface (after `combat`):

```ts
  /** Blacksmith's known patterns and any in-progress craft. See
   *  PatternCraftingService.getSnapshot/restore. */
  patternCrafting: PatternCraftingSnapshot;
```

In `src/app/save/save.service.ts`, add an import:

```ts
import { PatternCraftingService } from '../blacksmith-forge/pattern-crafting.service';
```

Add an injected field (after `combat`):

```ts
  private patternCrafting = inject(PatternCraftingService);
```

Add to `exportBase64()`'s `data` object (after `combat: this.combat.getSnapshot(),`):

```ts
      patternCrafting: this.patternCrafting.getSnapshot(),
```

Add to `parse()`'s `apply` block (after `this.combat.restore(data.combat);`):

```ts
      this.patternCrafting.restore(data.patternCrafting);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `ng test --include=src/app/save/save.service.spec.ts --watch=false`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/save/save-data.ts src/app/save/save.service.ts src/app/save/save.service.spec.ts
git commit -m "Persist PatternCraftingService state in the save file"
```

---

### Task 6: `BlacksmithForgeComponent` (UI)

**Files:**
- Create: `src/app/blacksmith-forge/blacksmith-forge.component.ts`
- Create: `src/app/blacksmith-forge/blacksmith-forge.component.html`
- Create: `src/app/blacksmith-forge/blacksmith-forge.component.scss`
- Test: `src/app/blacksmith-forge/blacksmith-forge.component.spec.ts`

**Interfaces:**
- Consumes: `PatternCraftingService.patterns/changes$/start()` (Task 3); `PATTERNS`, `EQUIPMENT_SLOTS`, `TIMED_ACTION_TICK_MS` (`game-config.ts`); `getPatternFlavor`, `getRarityFlavor`, `RESOURCE_FLAVOR` (`flavor-text.ts`); `formatAmount`, `formatDurationMs` (`shared/number-format.ts`); `TooltipDirective`/`TooltipContent`/`TooltipRow` (`shared/tooltip/`).
- Produces: `BlacksmithForgeComponent` (selector `app-blacksmith-forge`). Task 7 hosts it.

- [ ] **Step 1: Write the failing component tests**

Create `src/app/blacksmith-forge/blacksmith-forge.component.spec.ts`:

```ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BlacksmithForgeComponent } from './blacksmith-forge.component';
import { PatternCraftingService } from './pattern-crafting.service';
import { WalletService } from '../economy/wallet.service';

describe('BlacksmithForgeComponent', () => {
  let fixture: ComponentFixture<BlacksmithForgeComponent>;
  let patternCrafting: PatternCraftingService;
  let wallet: WalletService;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [BlacksmithForgeComponent] });
    fixture = TestBed.createComponent(BlacksmithForgeComponent);
    patternCrafting = TestBed.inject(PatternCraftingService);
    wallet = TestBed.inject(WalletService);
    fixture.detectChanges();
  });

  it('renders one row per known pattern, each with an enabled Craft button', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelectorAll('.pattern-row').length).toBe(5);
    const buttons = el.querySelectorAll<HTMLButtonElement>('.craft-button');
    expect(buttons.length).toBe(5);
    buttons.forEach(b => expect(b.disabled).toBeFalse());
  });

  it('shows "-- not forged --" for every pattern with no owned item yet', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelectorAll('.pattern-none').length).toBe(5);
  });

  it('clicking Craft on an affordable pattern starts it and disables every row', () => {
    wallet.add('ironmongery', 5);
    wallet.add('ingot', 5);
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector(
      '[data-testid="pattern-craft-pattern-common-weapon"]'
    ) as HTMLButtonElement;
    button.click();
    fixture.detectChanges();

    const buttons = fixture.nativeElement.querySelectorAll<HTMLButtonElement>('.craft-button');
    buttons.forEach((b: HTMLButtonElement) => expect(b.disabled).toBeTrue());
  });

  it('clicking Craft on an unaffordable pattern does not start a craft', () => {
    const button = fixture.nativeElement.querySelector(
      '[data-testid="pattern-craft-pattern-common-weapon"]'
    ) as HTMLButtonElement;
    button.click();
    fixture.detectChanges();

    expect(patternCrafting.patterns.some(p => p.active)).toBeFalse();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `ng test --include=src/app/blacksmith-forge/blacksmith-forge.component.spec.ts --watch=false`
Expected: FAIL — cannot find module `./blacksmith-forge.component`.

- [ ] **Step 3: Implement the component**

Create `src/app/blacksmith-forge/blacksmith-forge.component.ts`:

```ts
import { Component, OnInit, OnDestroy, inject, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription, interval } from 'rxjs';
import { TooltipDirective } from '../shared/tooltip/tooltip.directive';
import { TooltipContent, TooltipRow } from '../shared/tooltip/tooltip-content';
import { PatternCraftingService, PatternState } from './pattern-crafting.service';
import { EQUIPMENT_SLOTS, PatternConfig, TIMED_ACTION_TICK_MS } from '../configs/game-config';
import { getPatternFlavor, getRarityFlavor, RESOURCE_FLAVOR } from '../configs/flavor-text';
import { formatAmount, formatDurationMs } from '../shared/number-format';

/** The Blacksmith's second minigame-zone occupant (see MinigameZoneComponent) — a fixed
 *  list of equipment slot-lines, each craftable once known and not yet owned. Only one
 *  craft can be active across the whole list; see PatternCraftingService. */
@Component({
  selector: 'app-blacksmith-forge',
  standalone: true,
  imports: [CommonModule, TooltipDirective],
  templateUrl: './blacksmith-forge.component.html',
  styleUrl: './blacksmith-forge.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BlacksmithForgeComponent implements OnInit, OnDestroy {
  private patternCrafting = inject(PatternCraftingService);
  private cdr = inject(ChangeDetectorRef);
  private sub = new Subscription();

  /** Same "invisible until unlocked" convention as a locked Upgrade/Character — an
   *  unknown pattern (none exist yet; reserved for a future Uncommon+ tier) renders no
   *  row at all rather than a dimmed placeholder. */
  get visiblePatterns(): PatternState[] {
    return this.patternCrafting.patterns.filter(p => p.known);
  }

  get anyActive(): boolean {
    return this.visiblePatterns.some(p => p.active);
  }

  ngOnInit(): void {
    this.sub.add(this.patternCrafting.changes$.subscribe(() => this.cdr.markForCheck()));
    // Re-renders the active row's progress fill on the same cadence
    // PatternCraftingService checks completion on — purely visual, same reasoning as
    // ButtonZoneComponent's own TIMED_ACTION_TICK_MS refresh (AGENTS.md §6).
    this.sub.add(
      interval(TIMED_ACTION_TICK_MS).subscribe(() => {
        if (this.anyActive) this.cdr.markForCheck();
      })
    );
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  trackPattern(_: number, p: PatternState): string {
    return p.config.id;
  }

  label(p: PatternState): string {
    return getPatternFlavor(p.config.id).label;
  }

  slotLabel(p: PatternState): string {
    return EQUIPMENT_SLOTS.find(s => s.slotType === p.config.slotType)?.label ?? p.config.slotType;
  }

  rarityLabel(p: PatternState): string {
    return getRarityFlavor(p.config.rarity).label;
  }

  rarityColor(p: PatternState): string {
    return getRarityFlavor(p.config.rarity).color;
  }

  /** Disabled unless this exact pattern can be started right now — already owned, or
   *  any craft (including this one) currently in progress, both block it. */
  craftDisabled(p: PatternState): boolean {
    return p.owned || this.anyActive;
  }

  statusLabel(p: PatternState): string {
    if (p.active) return 'Crafting...';
    if (p.owned) return 'OWNED';
    if (this.anyActive) return 'Forge Busy';
    return 'Craft';
  }

  craft(p: PatternState): void {
    if (this.craftDisabled(p)) return;
    this.patternCrafting.start(p.config.id);
  }

  tooltip(config: PatternConfig): TooltipContent {
    const rows: TooltipRow[] = config.cost.map(entry => {
      const resource = RESOURCE_FLAVOR[entry.resourceId];
      return { label: 'Cost', value: `${formatAmount(entry.amount)} ${resource.symbol}`, color: resource.color };
    });
    rows.push({ label: 'Duration', value: formatDurationMs(config.durationMs) });
    return { title: getPatternFlavor(config.id).label, rows };
  }
}
```

Create `src/app/blacksmith-forge/blacksmith-forge.component.html`:

```html
<div class="blacksmith-forge">
  <div class="zone-header">[ BLACKSMITH FORGE ]</div>
  <div class="pattern-row" *ngFor="let p of visiblePatterns; trackBy: trackPattern">
    <div class="pattern-slot-label">{{ slotLabel(p) }}</div>
    <div class="pattern-owned" *ngIf="p.owned; else notForged" [style.color]="rarityColor(p)">
      {{ rarityLabel(p) }}
    </div>
    <ng-template #notForged>
      <div class="pattern-owned pattern-none">-- not forged --</div>
    </ng-template>
    <button
      class="craft-button"
      [attr.data-testid]="'pattern-craft-' + p.config.id"
      [appTooltip]="tooltip(p.config)"
      [disabled]="craftDisabled(p)"
      (click)="craft(p)">
      <div class="craft-button-fill" *ngIf="p.active" [style.width.%]="p.progress * 100"></div>
      <span class="craft-button-label">{{ statusLabel(p) }}</span>
    </button>
  </div>
</div>
```

Create `src/app/blacksmith-forge/blacksmith-forge.component.scss`:

```scss
.blacksmith-forge {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-family: 'Courier New', Courier, monospace;
  padding: 6px;
  border: 1px solid #222;
  width: 100%;
}

.zone-header {
  font-size: 11px;
  color: #bbb;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.pattern-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border: 1px solid #333;
  padding: 6px 8px;
}

.pattern-slot-label {
  flex: 0 0 auto;
  width: 90px;
  font-size: 10px;
  color: #888;
  text-transform: uppercase;
}

.pattern-owned {
  flex: 1 1 auto;
  font-size: 12px;
  text-align: left;
}

.pattern-none {
  color: #666;
}

.craft-button {
  position: relative;
  overflow: hidden;
  flex: 0 0 auto;
  min-width: 110px;
  background: #000;
  color: #fff;
  border: 1px solid #fff;
  font-family: inherit;
  font-size: 12px;
  letter-spacing: 0.05em;
  padding: 6px 14px;
  cursor: pointer;
  transition: background 0.1s, color 0.1s, border-color 0.1s;

  &:hover:not(:disabled) { background: #1a1a1a; }
  &:active:not(:disabled) { background: #222; }

  &:disabled {
    color: #666;
    border-color: #444;
    cursor: default;
  }
}

// Same layered-fill-behind-text shape as .timed-button-fill/.crafting-button-fill
// (button-zone.component.scss) — this component can't @extend that file's Sass
// placeholder across files, so its button chrome is restated locally rather than shared.
.craft-button-fill {
  position: absolute;
  inset: 0 auto 0 0;
  background: #fff;
  opacity: 0.18;
  transition: width 0.1s linear;
  z-index: 0;
}

.craft-button-label {
  position: relative;
  z-index: 1;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `ng test --include=src/app/blacksmith-forge/blacksmith-forge.component.spec.ts --watch=false`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/blacksmith-forge/blacksmith-forge.component.ts src/app/blacksmith-forge/blacksmith-forge.component.html src/app/blacksmith-forge/blacksmith-forge.component.scss src/app/blacksmith-forge/blacksmith-forge.component.spec.ts
git commit -m "Add BlacksmithForgeComponent — the Pattern crafting UI"
```

---

### Task 7: Host `BlacksmithForgeComponent` in `MinigameZoneComponent`

**Files:**
- Modify: `src/app/game-area/minigame-zone/minigame-zone.component.ts`
- Modify: `src/app/game-area/minigame-zone/minigame-zone.component.html`
- Test: `src/app/game-area/minigame-zone/minigame-zone.component.spec.ts`

**Interfaces:**
- Consumes: `BlacksmithForgeComponent` (Task 6).
- Produces: `MinigameZoneComponent.showBlacksmithForge: boolean` (getter), alongside the existing `showFighterCombat`.

- [ ] **Step 1: Write the failing test**

Add to `src/app/game-area/minigame-zone/minigame-zone.component.spec.ts` (after the existing `'shows Fighter Combat...'` test):

```ts
  it('shows Blacksmith Forge once minigames are unlocked and Blacksmith is active', () => {
    characters.unlock('blacksmith');
    characters.select('blacksmith');
    unlocks.unlock('minigames');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-blacksmith-forge')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('app-fighter-combat')).toBeFalsy();
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `ng test --include=src/app/game-area/minigame-zone/minigame-zone.component.spec.ts --watch=false`
Expected: FAIL — `app-blacksmith-forge` never renders (`MinigameZoneComponent` doesn't know about it yet).

- [ ] **Step 3: Wire it in**

In `src/app/game-area/minigame-zone/minigame-zone.component.ts`, add an import:

```ts
import { BlacksmithForgeComponent } from '../../blacksmith-forge/blacksmith-forge.component';
```

Add it to the `imports` array (alongside `FighterCombatComponent`):

```ts
  imports: [CommonModule, EmptyStateComponent, FighterCombatComponent, BlacksmithForgeComponent],
```

Add a new getter alongside `showFighterCombat`, and one more to drive the empty state:

```ts
  get showFighterCombat(): boolean {
    return this.minigamesUnlocked && this.activeCharacterId === 'fighter';
  }

  get showBlacksmithForge(): boolean {
    return this.minigamesUnlocked && this.activeCharacterId === 'blacksmith';
  }

  get showEmptyState(): boolean {
    return !this.showFighterCombat && !this.showBlacksmithForge;
  }
```

Replace `src/app/game-area/minigame-zone/minigame-zone.component.html` with:

```html
<div class="minigame-zone">
  <div class="zone-header">[ MINIGAMES ]</div>
  <div class="zone-body">
    <app-fighter-combat *ngIf="showFighterCombat"></app-fighter-combat>
    <app-blacksmith-forge *ngIf="showBlacksmithForge"></app-blacksmith-forge>
    <app-empty-state *ngIf="showEmptyState" message="Under construction"></app-empty-state>
  </div>
</div>
```

- [ ] **Step 4: Run the full spec file to verify everything passes**

Run: `ng test --include=src/app/game-area/minigame-zone/minigame-zone.component.spec.ts --watch=false`
Expected: PASS — including the pre-existing `'keeps showing the empty state for a different active character even once unlocked'` test (Ranger is neither Fighter nor Blacksmith, so `showEmptyState` still resolves `true` for it).

- [ ] **Step 5: Commit**

```bash
git add src/app/game-area/minigame-zone/minigame-zone.component.ts src/app/game-area/minigame-zone/minigame-zone.component.html src/app/game-area/minigame-zone/minigame-zone.component.spec.ts
git commit -m "Host BlacksmithForgeComponent in MinigameZoneComponent while Blacksmith is active"
```

---

### Task 8: E2E coverage

**Files:**
- Modify: `e2e/helpers.ts`
- Create: `e2e/blacksmith-forge.spec.ts`

**Interfaces:**
- Consumes: everything from Tasks 1–7 (real pattern ids/costs/durations, the `pattern-craft-<id>` test ids, `seedSave`).
- Produces: `patternCraftButton(page, patternId)`, `seedBlacksmithForgeReadySave(page)` — both in `e2e/helpers.ts`.

- [ ] **Step 1: Add the two new e2e helpers**

Add to `e2e/helpers.ts` (after `craftingActionButton`):

```ts
/** Locates a Blacksmith Forge Craft button by its stable PatternConfig.id
 *  (`data-testid="pattern-craft-<id>"`, blacksmith-forge.component.html), same reasoning
 *  as timedActionButton/craftingActionButton above. */
export function patternCraftButton(page: Page, patternId: string) {
  return page.locator(`[data-testid="pattern-craft-${patternId}"]`);
}
```

Add after `seedBlacksmithUnlockedSave`:

```ts
/** Blacksmith active with the Forge unlocked (minigames system) and enough
 *  Ironmongery/Ingot/Pelt on hand to start any single Common pattern craft. */
export async function seedBlacksmithForgeReadySave(page: Page): Promise<void> {
  await seedSave(page, {
    characters: { unlockedIds: ['fighter', 'ranger', 'blacksmith'], activeId: 'blacksmith' },
    objectives: { reachedIds: [], completedIds: ['unlock-ranger', 'unlock-blacksmith'] },
    upgrades: { levels: {}, unlockedIds: ['hard-work', 'better-offcuts', 'extra-baiting', 'clean-traps'] },
    unlocks: { minigames: true },
    wallet: { amounts: { ironmongery: 20, ingot: 20, pelt: 10 }, unlockedIds: ['ironmongery', 'ingot', 'pelt'] },
  });
}
```

- [ ] **Step 2: Write the e2e spec**

Create `e2e/blacksmith-forge.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { gotoFreshGame, seedSave, seedBlacksmithForgeReadySave, patternCraftButton, trackConsoleErrors } from './helpers';

test.describe('Blacksmith Forge minigame', () => {
  test('shows all 5 Common patterns, each craftable, once the Forge unlocks', async ({ page }) => {
    const errors = trackConsoleErrors(page);
    await seedBlacksmithForgeReadySave(page);
    await gotoFreshGame(page);

    await expect(page.locator('app-blacksmith-forge')).toBeVisible();
    await expect(page.locator('.pattern-row')).toHaveCount(5);
    await expect(patternCraftButton(page, 'pattern-common-weapon')).toBeEnabled();

    expect(errors).toEqual([]);
  });

  test('crafting with no resources logs an error instead of charging', async ({ page }) => {
    await seedSave(page, {
      characters: { unlockedIds: ['fighter', 'ranger', 'blacksmith'], activeId: 'blacksmith' },
      objectives: { reachedIds: [], completedIds: ['unlock-ranger', 'unlock-blacksmith'] },
      upgrades: { levels: {}, unlockedIds: ['hard-work', 'better-offcuts', 'extra-baiting', 'clean-traps'] },
      unlocks: { minigames: true },
    });
    await gotoFreshGame(page);

    await patternCraftButton(page, 'pattern-common-weapon').click();

    await expect(page.locator('.log-entry', { hasText: 'Not enough' })).toBeVisible();
    await expect(patternCraftButton(page, 'pattern-common-weapon')).toBeEnabled(); // never started
  });

  test('starting a craft charges the cost immediately and disables every other pattern row', async ({ page }) => {
    await seedBlacksmithForgeReadySave(page);
    await gotoFreshGame(page);

    await patternCraftButton(page, 'pattern-common-weapon').click();

    // Weapon costs 5 Ironmongery + 5 Ingot; seeded with 20 of each.
    await expect(page.locator('.vault-row', { hasText: 'IRONMONGERY' }).locator('.vault-amount')).toHaveText('15');
    await expect(patternCraftButton(page, 'pattern-common-helmet')).toBeDisabled();
  });

  test('completing a craft grants the item to the Fighter and logs success', async ({ page }) => {
    await seedBlacksmithForgeReadySave(page);
    await gotoFreshGame(page);

    // Boots (40s) is the fastest-completing Common pattern — keeps this test's real wait
    // as short as the suite allows while still exercising a genuine completion.
    await patternCraftButton(page, 'pattern-common-boots').click();
    await expect(page.locator('.log-entry', { hasText: 'sturdy pair of boots' })).toBeVisible({ timeout: 45_000 });

    await expect(patternCraftButton(page, 'pattern-common-boots')).toHaveText('OWNED');
    await expect(patternCraftButton(page, 'pattern-common-boots')).toBeDisabled();
  });
});
```

- [ ] **Step 3: Run the new e2e spec**

Run: `npm run test:e2e -- blacksmith-forge`
Expected: PASS (4 tests). The completion test is a genuine ~40s real-time wait — consistent with this suite's existing tolerance for real waits on a fixed-duration action (see Forge Ingots' ~10.5s wait in `e2e/blacksmith.spec.ts`).

- [ ] **Step 4: Run the full suite one final time**

Run: `npm run test:all`
Expected: PASS — every unit spec from Tasks 1–7 plus this task's e2e spec, with no regressions anywhere else in the app.

- [ ] **Step 5: Commit**

```bash
git add e2e/helpers.ts e2e/blacksmith-forge.spec.ts
git commit -m "Add e2e coverage for the Blacksmith Forge minigame"
```
