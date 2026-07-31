# Fighter Combat Minigame Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Fighter's turn-based combat minigame — equipment/inventory with rarity, a persistent-HP combat engine against the Kobold, dynamic loot, and its UI — as designed in `docs/superpowers/specs/2026-07-29-fighter-combat-minigame-design.md`.

**Architecture:** Config-driven data (`game-config.ts`/`flavor-text.ts`) feeds two new root services — `EquipmentService` (inventory/equip state, effective stats) and `CombatService` (a `TimedActionsService`-style ticking engine resolving turns via pure functions in `combat-resolution.ts`) — both wired into the save system, surfaced through a new `fighter-combat/` component tree hosted in the existing `MinigameZoneComponent` slot.

**Tech Stack:** Angular 17 (standalone components, OnPush change detection), RxJS, Karma/Jasmine unit tests, Playwright e2e.

## Global Constraints

- Config data (costs, unlock rules, cross-entity relations) lives in `game-config.ts`; cosmetic data (names, colors, ascii art) lives in `flavor-text.ts` — never merged.
- Every stateful service is `@Injectable({ providedIn: 'root' })`, holds state privately (`Map`/plain fields), exposes a `changes$: Subject<void>`, and has `getSnapshot()`/`restore()` if any of its state is persisted.
- Every persisted field added to a service must be wired into `SaveData` (`src/app/save/save-data.ts`), `SaveService` (`src/app/save/save.service.ts`), and `EXPECTED_SAVE_KEYS` (`src/app/save/save.service.spec.ts`) before the plan is complete — this plan deliberately bundles that wiring for both new services into one dedicated task (Task 5) rather than repeating it inline in Tasks 2 and 4, so a service introduced earlier having no save-wiring yet is expected and not a defect until Task 5 lands.
- All new components are `standalone: true` with `changeDetection: ChangeDetectionStrategy.OnPush`.
- UI follows the established terminal aesthetic: `'Courier New', Courier, monospace`, near-black backgrounds, thin `#222`/`#333` borders, bracketed zone titles (e.g. `[ INVENTORY ]`), no emoji — plain Unicode glyphs only (enforced by `emojiSymbols()` in `src/testing/invariants.ts`).
- Combat math uses raw stat values added directly to `1d20` rolls — no D&D-style ability-modifier conversion.
- Every new config array needs a matching integrity check in `game-config.spec.ts` (no duplicate ids, every id has a flavor entry, every cross-reference resolves) using the existing helpers in `src/testing/invariants.ts`.
- Run `npm run test:all` after every task and confirm it passes before committing — extend the existing suite, never write throwaway scripts.

---

### Task 1: Shared foundations — six-stats and dice

**Files:**
- Create: `src/app/shared/six-stats.ts`
- Test: `src/app/shared/six-stats.spec.ts`
- Create: `src/app/shared/dice.ts`
- Test: `src/app/shared/dice.spec.ts`

**Interfaces:**
- Produces: `SixStat` (union of the six stat names), `SixStats` (interface), `getMaxHp(stats: SixStats): number` — all from `six-stats.ts`. `rollDie(sides: number): number`, `rollD20(): number` — both from `dice.ts`. Every later task imports these.

- [ ] **Step 1: Write the failing test for `getMaxHp`**

```ts
// src/app/shared/six-stats.spec.ts
import { getMaxHp, SixStats } from './six-stats';

describe('getMaxHp', () => {
  it('returns constitution times 10', () => {
    const stats: SixStats = {
      strength: 15, dexterity: 13, constitution: 14,
      intelligence: 8, wisdom: 10, charisma: 12,
    };
    expect(getMaxHp(stats)).toBe(140);
  });

  it('handles zero constitution', () => {
    const stats: SixStats = {
      strength: 1, dexterity: 1, constitution: 0,
      intelligence: 1, wisdom: 1, charisma: 1,
    };
    expect(getMaxHp(stats)).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `ng test --include=src/app/shared/six-stats.spec.ts --watch=false`
Expected: FAIL — cannot find module `./six-stats`.

- [ ] **Step 3: Write the minimal implementation**

```ts
// src/app/shared/six-stats.ts
export type SixStat =
  | 'strength'
  | 'dexterity'
  | 'constitution'
  | 'intelligence'
  | 'wisdom'
  | 'charisma';

export interface SixStats {
  strength: number;
  dexterity: number;
  constitution: number;
  intelligence: number;
  wisdom: number;
  charisma: number;
}

/** Max HP is derived, never stored redundantly — Constitution x 10. */
export function getMaxHp(stats: SixStats): number {
  return stats.constitution * 10;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `ng test --include=src/app/shared/six-stats.spec.ts --watch=false`
Expected: PASS (2 specs).

- [ ] **Step 5: Write the failing tests for `rollDie`/`rollD20`**

```ts
// src/app/shared/dice.spec.ts
import { rollDie, rollD20 } from './dice';

describe('rollDie', () => {
  it('returns 1 when Math.random returns 0', () => {
    spyOn(Math, 'random').and.returnValue(0);
    expect(rollDie(20)).toBe(1);
  });

  it('returns sides when Math.random returns just under 1', () => {
    spyOn(Math, 'random').and.returnValue(0.9999999);
    expect(rollDie(6)).toBe(6);
  });

  it('always returns an integer within [1, sides]', () => {
    for (let i = 0; i < 200; i++) {
      const roll = rollDie(20);
      expect(Number.isInteger(roll)).toBe(true);
      expect(roll).toBeGreaterThanOrEqual(1);
      expect(roll).toBeLessThanOrEqual(20);
    }
  });
});

describe('rollD20', () => {
  it('is equivalent to rollDie(20)', () => {
    spyOn(Math, 'random').and.returnValue(0.5);
    expect(rollD20()).toBe(rollDie(20));
  });

  it('stays within [1, 20] over many rolls', () => {
    for (let i = 0; i < 200; i++) {
      const roll = rollD20();
      expect(roll).toBeGreaterThanOrEqual(1);
      expect(roll).toBeLessThanOrEqual(20);
    }
  });
});
```

- [ ] **Step 6: Run the tests to verify they fail**

Run: `ng test --include=src/app/shared/dice.spec.ts --watch=false`
Expected: FAIL — cannot find module `./dice`.

- [ ] **Step 7: Write the minimal implementation**

```ts
// src/app/shared/dice.ts

/** Uniform random integer in [1, sides], inclusive of both ends. */
export function rollDie(sides: number): number {
  return Math.floor(Math.random() * sides) + 1;
}

/** Shorthand for the d20 roll used throughout Fighter Combat (initiative, to-hit). */
export function rollD20(): number {
  return rollDie(20);
}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `ng test --include=src/app/shared/dice.spec.ts --watch=false`
Expected: PASS (5 specs).

- [ ] **Step 9: Commit**

```bash
git add src/app/shared/six-stats.ts src/app/shared/six-stats.spec.ts src/app/shared/dice.ts src/app/shared/dice.spec.ts
git commit -m "Add shared SixStats model and dice-roll utility for Fighter Combat"
```

---

### Task 2: Equipment config, flavor, and EquipmentService

**Files:**
- Modify: `src/app/configs/game-config.ts` (append at end of file)
- Modify: `src/app/configs/flavor-text.ts` (append at end of file)
- Modify: `src/app/configs/game-config.spec.ts`
- Create: `src/app/fighter-combat/equipment.service.ts`
- Test: `src/app/fighter-combat/equipment.service.spec.ts`

**Interfaces:**
- Consumes: `SixStat`, `SixStats` from `../shared/six-stats` (Task 1).
- Produces: `FIGHTER_BASE_STATS: SixStats`, `EquipmentSlotType`, `EquipmentSlotInstance`, `EQUIPMENT_SLOTS: EquipmentSlotInstance[]`, `EquipmentRarity`, `EquipmentEffect`, `EquipmentConfig`, `EQUIPMENT_ITEMS: EquipmentConfig[]` (all from `game-config.ts`); `EQUIPMENT_FLAVOR`, `getEquipmentFlavor(id): EquipmentFlavor`, `RARITY_FLAVOR`, `getRarityFlavor(rarity): RarityFlavor` (all from `flavor-text.ts`); `EquipmentService` with `getInventoryCount(itemId): number`, `inventoryEntries: { config: EquipmentConfig; count: number }[]`, `getEquippedItemId(slotInstanceId): string | undefined`, `addToInventory(itemId, count?)`, `equip(itemId, slotInstanceId)`, `unequip(slotInstanceId)`, `getEffectiveStats(): SixStats`, `getBonusDamage(): number`, `getDamageReduction(): number`, `getExtraAttackChance(): number`, `getSnapshot(): EquipmentSnapshot`, `restore(snapshot)`, `changes$: Observable<void>`. All of this is consumed by Task 4 (`CombatService`), Task 5 (save integration), and Tasks 7–9 (UI).

- [ ] **Step 1: Append the equipment config to `game-config.ts`**

Add at the end of `src/app/configs/game-config.ts`:

```ts
// ── Fighter Combat: shared stats ──────────────────────────────
// SixStats is defined in shared/six-stats.ts (reused by a future Jacks system, which
// specs the identical six-stat model — see AGENTS.md).

import { SixStat, SixStats } from '../shared/six-stats';

export const FIGHTER_BASE_STATS: SixStats = {
  strength: 15,
  dexterity: 13,
  constitution: 14,
  intelligence: 8,
  wisdom: 10,
  charisma: 12,
};

// ── Fighter Combat: equipment slots ───────────────────────────
// Slots are a list of instances, not just types, because 'ring' needs two concurrent
// equip positions (ring-1/ring-2) — an item's `slotType` says which category it
// belongs to; equipping picks a specific free instance of that type.

export type EquipmentSlotType =
  | 'helmet'
  | 'armor'
  | 'boots'
  | 'gauntlets'
  | 'ring'
  | 'necklace';

export interface EquipmentSlotInstance {
  id: string;
  slotType: EquipmentSlotType;
  label: string;
}

export const EQUIPMENT_SLOTS: EquipmentSlotInstance[] = [
  { id: 'helmet', slotType: 'helmet', label: 'Helmet' },
  { id: 'armor', slotType: 'armor', label: 'Armor' },
  { id: 'boots', slotType: 'boots', label: 'Boots' },
  { id: 'gauntlets', slotType: 'gauntlets', label: 'Gauntlets' },
  { id: 'ring-1', slotType: 'ring', label: 'Ring' },
  { id: 'ring-2', slotType: 'ring', label: 'Ring' },
  { id: 'necklace', slotType: 'necklace', label: 'Necklace' },
];

// ── Fighter Combat: equipment items ───────────────────────────
// Items are fungible by id (like a second, typed wallet) — the player holds copies as a
// count, not individually-rolled instances. `rarity` is a real classification (a
// relation, like ResourceConfig.characterId), so it lives here; the rarity ladder's
// display color lives in flavor-text.ts (RARITY_FLAVOR), since it's shared taxonomy,
// not per-item cosmetic data.

export type EquipmentRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'unique';

export type EquipmentEffect =
  | { type: 'stat-bonus'; stat: SixStat; amount: number }
  | { type: 'bonus-damage'; amount: number }
  /** 0..1 fraction of incoming damage absorbed. */
  | { type: 'damage-reduction'; reduction: number }
  /** 0..1+ chance to attack again immediately after landing a hit — cascades past 100%
   *  via resolveExcessCount (shared/chance.ts), same as any other upgrade-style chance
   *  that can exceed 1.0. See CombatService for resolution. */
  | { type: 'extra-attack-chance'; chance: number };

export interface EquipmentConfig {
  id: string;
  slotType: EquipmentSlotType;
  rarity: EquipmentRarity;
  effects: EquipmentEffect[];
}

export const EQUIPMENT_ITEMS: EquipmentConfig[] = [
  {
    id: 'ring-swift-strike',
    slotType: 'ring',
    rarity: 'uncommon',
    effects: [{ type: 'extra-attack-chance', chance: 0.05 }],
  },
];
```

- [ ] **Step 2: Append the equipment flavor to `flavor-text.ts`**

Add at the end of `src/app/configs/flavor-text.ts`:

```ts
// ── Fighter Combat: equipment ──────────────────────────────────
import { EquipmentRarity } from './game-config';

export interface EquipmentFlavor {
  label: string;
  description: string;
}

// Keyed by EquipmentConfig.id (game-config.ts).
export const EQUIPMENT_FLAVOR: Record<string, EquipmentFlavor> = {
  'ring-swift-strike': {
    label: 'Ring of Swift Strikes',
    description: '5% chance to attack again immediately after landing a hit.',
  },
};

const DEFAULT_EQUIPMENT_FLAVOR: EquipmentFlavor = { label: '', description: '' };

export function getEquipmentFlavor(id: string): EquipmentFlavor {
  return EQUIPMENT_FLAVOR[id] ?? DEFAULT_EQUIPMENT_FLAVOR;
}

export interface RarityFlavor {
  label: string;
  color: string;
}

// Configurable rarity -> color mapping, positional match to this game's own
// gray/white/cyan/gold/purple color-hierarchy ladder (see AGENTS.md §3). Purple had no
// concrete value anywhere in the codebase before this — first realization of the
// reserved "Relic-tier" color.
export const RARITY_FLAVOR: Record<EquipmentRarity, RarityFlavor> = {
  common: { label: 'Common', color: '#aaa' },
  uncommon: { label: 'Uncommon', color: '#fff' },
  rare: { label: 'Rare', color: '#0ff' },
  epic: { label: 'Epic', color: '#ffd700' },
  unique: { label: 'Unique', color: '#b266ff' },
};

export function getRarityFlavor(rarity: EquipmentRarity): RarityFlavor {
  return RARITY_FLAVOR[rarity];
}
```

- [ ] **Step 3: Extend `game-config.spec.ts` with equipment integrity checks**

Change the import from `./game-config` to also include `EQUIPMENT_SLOTS, EQUIPMENT_ITEMS`, and the import from `./flavor-text` to also include `EQUIPMENT_FLAVOR, RARITY_FLAVOR`. Then add these two `const` declarations right after the existing `const upgradeIds = UPGRADES.map(u => u.id);` line:

```ts
  const equipmentSlotIds = EQUIPMENT_SLOTS.map(s => s.id);
  const equipmentIds = EQUIPMENT_ITEMS.map(e => e.id);
```

Then add this new `describe` block right before the final closing `});` of the outer `describe('game-config integrity', ...)` block:

```ts
  describe('Fighter Combat: equipment', () => {
    const slotTypes = new Set(EQUIPMENT_SLOTS.map(s => s.slotType));
    const rarities: EquipmentRarity[] = ['common', 'uncommon', 'rare', 'epic', 'unique'];

    it('EQUIPMENT_SLOTS has no duplicate ids', () => {
      expect(duplicateIds(equipmentSlotIds)).toEqual([]);
    });

    it('has no duplicate equipment item ids', () => {
      expect(duplicateIds(equipmentIds)).toEqual([]);
    });

    it('every equipment item has an EQUIPMENT_FLAVOR entry with a non-empty label and description', () => {
      expect(idsMissingFlavor(equipmentIds, EQUIPMENT_FLAVOR)).toEqual([]);
      for (const item of EQUIPMENT_ITEMS) {
        const flavor = EQUIPMENT_FLAVOR[item.id];
        expect(flavor.label).withContext(item.id).not.toBe('');
        expect(flavor.description).withContext(item.id).not.toBe('');
      }
    });

    it("every equipment item's slotType is a real slot type in EQUIPMENT_SLOTS", () => {
      for (const item of EQUIPMENT_ITEMS) {
        expect(slotTypes.has(item.slotType)).withContext(item.id).toBeTrue();
      }
    });

    it('every rarity tier has a RARITY_FLAVOR entry with a non-empty label and color', () => {
      for (const rarity of rarities) {
        const flavor = RARITY_FLAVOR[rarity];
        expect(flavor).withContext(rarity).toBeDefined();
        expect(flavor.label).withContext(rarity).not.toBe('');
        expect(flavor.color).withContext(rarity).not.toBe('');
      }
    });

    it('every stat-bonus effect targets a real SixStat', () => {
      const validStats = new Set(['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma']);
      for (const item of EQUIPMENT_ITEMS) {
        for (const effect of item.effects) {
          if (effect.type === 'stat-bonus') {
            expect(validStats.has(effect.stat)).withContext(item.id).toBeTrue();
          }
        }
      }
    });

    it('every damage-reduction effect is a fraction between 0 and 1, and every chance-based effect is positive', () => {
      for (const item of EQUIPMENT_ITEMS) {
        for (const effect of item.effects) {
          if (effect.type === 'damage-reduction') {
            expect(effect.reduction).withContext(item.id).toBeGreaterThan(0);
            expect(effect.reduction).withContext(item.id).toBeLessThanOrEqual(1);
          }
          if (effect.type === 'extra-attack-chance') {
            expect(effect.chance).withContext(item.id).toBeGreaterThan(0);
          }
        }
      }
    });
  });
```

Also add `EquipmentRarity` to the type-only import from `./game-config` (needed for the `rarities: EquipmentRarity[]` local array above).

- [ ] **Step 4: Run the config spec to verify it passes**

Run: `ng test --include=src/app/configs/game-config.spec.ts --watch=false`
Expected: PASS — all existing specs plus the new "Fighter Combat: equipment" block.

- [ ] **Step 5: Write the failing tests for `EquipmentService`**

```ts
// src/app/fighter-combat/equipment.service.spec.ts
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
```

- [ ] **Step 6: Run the tests to verify they fail**

Run: `ng test --include=src/app/fighter-combat/equipment.service.spec.ts --watch=false`
Expected: FAIL — cannot find module `./equipment.service`.

- [ ] **Step 7: Write the minimal implementation**

```ts
// src/app/fighter-combat/equipment.service.ts
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
    this.equipped = new Map(Object.entries(snapshot?.equipped ?? {}));
    this.changesSource.next();
  }
}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `ng test --include=src/app/fighter-combat/equipment.service.spec.ts --watch=false`
Expected: PASS (13 specs).

- [ ] **Step 9: Run the full unit suite to check for regressions**

Run: `npm run test:unit`
Expected: PASS — no regressions in existing specs.

- [ ] **Step 10: Commit**

```bash
git add src/app/configs/game-config.ts src/app/configs/flavor-text.ts src/app/configs/game-config.spec.ts src/app/fighter-combat/equipment.service.ts src/app/fighter-combat/equipment.service.spec.ts
git commit -m "Add equipment/rarity config and EquipmentService"
```

---

### Task 3: combat-resolution.ts — pure turn-resolution logic

**Files:**
- Create: `src/app/fighter-combat/combat-resolution.ts`
- Test: `src/app/fighter-combat/combat-resolution.spec.ts`

**Interfaces:**
- Consumes: `rollD20` (Task 1, `../shared/dice`), `SixStats` (Task 1, `../shared/six-stats`), `resolveExcessCount` (existing, `../shared/chance`).
- Produces: `CombatCombatant` (interface: `stats: SixStats; hp: number; bonusDamage: number; damageReduction: number; extraAttackChance: number`), `CombatTurnResult` (interface: `actor: 'fighter' | 'enemy'; attackRoll: number; defenseRoll: number; hit: boolean; damage?: number; followUp: boolean`), `rollInitiative(fighter, enemy): 'fighter' | 'enemy'`, `resolveAttack(actor, attacker, defender, followUp): CombatTurnResult`, `rollDamage(strength): number`, `rollsFollowUpAttack(attacker): boolean`, `resolveTurn(actor, attacker, defender): CombatTurnResult[]`. Task 4 (`CombatService`) is the sole consumer of all of these.

This is pure logic with no Angular dependencies and no config-array lookups — it operates entirely on the `CombatCombatant`/`CombatTurnResult` shapes it defines itself, so it has no dependency on Task 2's equipment config or the enemy/area config Task 4 introduces.

- [ ] **Step 1: Write the failing tests for `rollDamage`**

```ts
// src/app/fighter-combat/combat-resolution.spec.ts
import {
  CombatCombatant,
  resolveAttack,
  resolveTurn,
  rollDamage,
  rollInitiative,
  rollsFollowUpAttack,
} from './combat-resolution';

function combatant(overrides: Partial<CombatCombatant> = {}): CombatCombatant {
  return {
    stats: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
    hp: 100,
    bonusDamage: 0,
    damageReduction: 0,
    extraAttackChance: 0,
    ...overrides,
  };
}

describe('rollDamage', () => {
  it('returns 1 when Math.random returns 0', () => {
    spyOn(Math, 'random').and.returnValue(0);
    expect(rollDamage(15)).toBe(1);
  });

  it('returns strength when Math.random returns just under 1', () => {
    spyOn(Math, 'random').and.returnValue(0.9999999);
    expect(rollDamage(15)).toBe(15);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `ng test --include=src/app/fighter-combat/combat-resolution.spec.ts --watch=false`
Expected: FAIL — cannot find module `./combat-resolution`.

- [ ] **Step 3: Write `CombatCombatant`, `CombatTurnResult`, and `rollDamage`**

```ts
// src/app/fighter-combat/combat-resolution.ts
import { rollD20 } from '../shared/dice';
import { resolveExcessCount } from '../shared/chance';
import { SixStats } from '../shared/six-stats';

/** One side of an active encounter, fully resolved to live numbers — the Fighter's
 *  equipment bonuses are already summed in by the caller (EquipmentService); an enemy's
 *  non-stat fields are always 0, since only the Fighter equips gear. Keeping both sides
 *  in this one shape means turn resolution never has to special-case "if this is the
 *  fighter." */
export interface CombatCombatant {
  stats: SixStats;
  hp: number;
  bonusDamage: number;
  /** 0..1 fraction of incoming damage absorbed. */
  damageReduction: number;
  /** 0..1+ chance to attack again after a hit — see resolveTurn. */
  extraAttackChance: number;
}

export interface CombatTurnResult {
  actor: 'fighter' | 'enemy';
  attackRoll: number;
  defenseRoll: number;
  hit: boolean;
  /** Present only when hit is true. */
  damage?: number;
  /** True if this turn was itself a follow-up attack granted by extraAttackChance. */
  followUp: boolean;
}

/** Random damage between 1 and `strength`, inclusive. */
export function rollDamage(strength: number): number {
  return Math.floor(Math.random() * strength) + 1;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `ng test --include=src/app/fighter-combat/combat-resolution.spec.ts --watch=false`
Expected: PASS (2 specs).

- [ ] **Step 5: Write the failing tests for `rollInitiative`**

Add to `combat-resolution.spec.ts`:

```ts
describe('rollInitiative', () => {
  it('picks whichever side rolled higher', () => {
    spyOn(Math, 'random').and.returnValues(0.1, 0.9); // fighter d20 low, enemy d20 high
    const fighter = combatant();
    const enemy = combatant();
    expect(rollInitiative(fighter, enemy)).toBe('enemy');
  });

  it('a tie favors the fighter', () => {
    spyOn(Math, 'random').and.returnValue(0.5); // identical roll both sides
    const fighter = combatant();
    const enemy = combatant();
    expect(rollInitiative(fighter, enemy)).toBe('fighter');
  });
});
```

- [ ] **Step 6: Run the tests to verify they fail**

Run: `ng test --include=src/app/fighter-combat/combat-resolution.spec.ts --watch=false`
Expected: FAIL — `rollInitiative` is not exported.

- [ ] **Step 7: Implement `rollInitiative`**

Append to `combat-resolution.ts`:

```ts
/** 1d20 + effective DEX for each side; the higher total acts first. A tie favors the
 *  Fighter, mirroring "tie goes to the attacker" — the Fighter is the one who initiated
 *  the encounter. */
export function rollInitiative(fighter: CombatCombatant, enemy: CombatCombatant): 'fighter' | 'enemy' {
  const fighterRoll = rollD20() + fighter.stats.dexterity;
  const enemyRoll = rollD20() + enemy.stats.dexterity;
  return enemyRoll > fighterRoll ? 'enemy' : 'fighter';
}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `ng test --include=src/app/fighter-combat/combat-resolution.spec.ts --watch=false`
Expected: PASS (4 specs).

- [ ] **Step 9: Write the failing tests for `resolveAttack`**

Add to `combat-resolution.spec.ts`:

```ts
describe('resolveAttack', () => {
  it('is a hit when the attack roll is greater than or equal to the defense roll', () => {
    // attacker d20=19 (+10=29), defender d20=1 (+10=11), then a damage roll (any hit
    // needs a 3rd Math.random() call inside rollDamage — omitting it leaves the damage
    // math NaN once the mock sequence is exhausted).
    spyOn(Math, 'random').and.returnValues(0.9, 0, 0.999);
    const attacker = combatant();
    const defender = combatant();
    const result = resolveAttack('fighter', attacker, defender, false);
    expect(result.hit).toBeTrue();
    expect(defender.hp).toBeLessThan(100);
  });

  it('a tie is a hit (favors the attacker)', () => {
    spyOn(Math, 'random').and.returnValue(0.5); // identical roll both sides -> equal totals
    const attacker = combatant();
    const defender = combatant();
    const result = resolveAttack('fighter', attacker, defender, false);
    expect(result.hit).toBeTrue();
  });

  it("a miss leaves the defender's hp untouched", () => {
    spyOn(Math, 'random').and.returnValues(0, 0.9); // attacker d20=1, defender d20=19
    const attacker = combatant();
    const defender = combatant();
    const result = resolveAttack('fighter', attacker, defender, false);
    expect(result.hit).toBeFalse();
    expect(result.damage).toBeUndefined();
    expect(defender.hp).toBe(100);
  });

  it('damage is floored at a minimum of 1 even with high damage reduction', () => {
    // attacker d20=19, defender d20=1 (hit), damage roll near-max
    spyOn(Math, 'random').and.returnValues(0.9, 0, 0.999);
    const attacker = combatant();
    const defender = combatant({ damageReduction: 0.99 });
    const result = resolveAttack('fighter', attacker, defender, false);
    expect(result.hit).toBeTrue();
    expect(result.damage).toBe(1);
  });

  it('adds bonusDamage on top of the rolled amount before applying reduction', () => {
    // attacker d20=19, defender d20=1 (hit), damage roll at max (10 at strength 10)
    spyOn(Math, 'random').and.returnValues(0.9, 0, 0.999);
    const attacker = combatant({ bonusDamage: 5 });
    const defender = combatant();
    const result = resolveAttack('fighter', attacker, defender, false);
    expect(result.damage).toBe(15); // 10 (max roll at str 10) + 5 bonus
  });
});
```

- [ ] **Step 10: Run the tests to verify they fail**

Run: `ng test --include=src/app/fighter-combat/combat-resolution.spec.ts --watch=false`
Expected: FAIL — `resolveAttack` is not exported.

- [ ] **Step 11: Implement `resolveAttack`**

Append to `combat-resolution.ts`:

```ts
/** Resolves exactly one attack: attacker rolls 1d20 + effective STR, defender rolls 1d20
 *  + effective DEX, tie-or-better for the attacker hits. On a hit, damage is `random(1,
 *  attacker STR) + attacker.bonusDamage`, reduced by the defender's damageReduction
 *  (floored, minimum 1 — a hit is never a true no-op), and is subtracted from the
 *  defender's hp in place (mutates `defender.hp`). `followUp` should be set by the caller
 *  to record whether this particular attack was itself a swift-strike bonus attack — it
 *  has no bearing on this function's own math. */
export function resolveAttack(
  actor: 'fighter' | 'enemy',
  attacker: CombatCombatant,
  defender: CombatCombatant,
  followUp: boolean
): CombatTurnResult {
  const attackRoll = rollD20() + attacker.stats.strength;
  const defenseRoll = rollD20() + defender.stats.dexterity;
  const hit = attackRoll >= defenseRoll;

  if (!hit) {
    return { actor, attackRoll, defenseRoll, hit, followUp };
  }

  const rawDamage = rollDamage(attacker.stats.strength) + attacker.bonusDamage;
  const reduced = Math.floor(rawDamage * (1 - defender.damageReduction));
  const damage = Math.max(1, reduced);
  defender.hp = Math.max(0, defender.hp - damage);

  return { actor, attackRoll, defenseRoll, hit, damage, followUp };
}
```

- [ ] **Step 12: Run the tests to verify they pass**

Run: `ng test --include=src/app/fighter-combat/combat-resolution.spec.ts --watch=false`
Expected: PASS (9 specs).

- [ ] **Step 13: Write the failing tests for `rollsFollowUpAttack` and `resolveTurn`**

Add to `combat-resolution.spec.ts`:

```ts
describe('rollsFollowUpAttack', () => {
  it('returns false when extraAttackChance is 0', () => {
    spyOn(Math, 'random').and.returnValue(0);
    expect(rollsFollowUpAttack(combatant({ extraAttackChance: 0 }))).toBeFalse();
  });

  it('returns true when the roll lands under the chance', () => {
    spyOn(Math, 'random').and.returnValue(0.01);
    expect(rollsFollowUpAttack(combatant({ extraAttackChance: 0.05 }))).toBeTrue();
  });

  it('returns false when the roll lands over the chance', () => {
    spyOn(Math, 'random').and.returnValue(0.5);
    expect(rollsFollowUpAttack(combatant({ extraAttackChance: 0.05 }))).toBeFalse();
  });
});

describe('resolveTurn', () => {
  it('resolves exactly one attack when the attacker has no follow-up chance', () => {
    // hit (attacker d20=19, defender d20=1), damage roll, then the follow-up chance's
    // own Math.random() call (resolveExcessCount always consumes one, even at chance 0)
    spyOn(Math, 'random').and.returnValues(0.9, 0, 0.5, 0.5);
    const attacker = combatant(); // extraAttackChance defaults to 0
    const defender = combatant();
    const results = resolveTurn('fighter', attacker, defender);
    expect(results.length).toBe(1);
    expect(results[0].followUp).toBeFalse();
  });

  it('chains a follow-up attack when the proc succeeds, marking it as such', () => {
    spyOn(Math, 'random').and.returnValues(
      0.9, 0, 0.5, 0.01, // attack 1: hit, damage, follow-up proc succeeds
      0.9, 0, 0.5, 0.9   // attack 2 (follow-up): hit, damage, follow-up proc fails -> stop
    );
    const attacker = combatant({ extraAttackChance: 0.05 });
    const defender = combatant({ hp: 1000 }); // plenty of hp so it doesn't die mid-chain
    const results = resolveTurn('fighter', attacker, defender);
    expect(results.length).toBe(2);
    expect(results[0].followUp).toBeFalse();
    expect(results[1].followUp).toBeTrue();
  });

  it('stops immediately once the defender is defeated, even mid-chain', () => {
    spyOn(Math, 'random').and.returnValues(0.9, 0, 0.999); // hit for max damage (10) against 5 hp
    const attacker = combatant({ extraAttackChance: 0.05 });
    const defender = combatant({ hp: 5 });
    const results = resolveTurn('fighter', attacker, defender);
    expect(results.length).toBe(1);
    expect(defender.hp).toBe(0);
  });
});
```

- [ ] **Step 14: Run the tests to verify they fail**

Run: `ng test --include=src/app/fighter-combat/combat-resolution.spec.ts --watch=false`
Expected: FAIL — `rollsFollowUpAttack`/`resolveTurn` are not exported.

- [ ] **Step 15: Implement `rollsFollowUpAttack` and `resolveTurn`**

Append to `combat-resolution.ts`:

```ts
/** Whether `attacker` gets an immediate follow-up attack after landing a hit — resolves
 *  the "excess percent" cascade the same way an upgrade-boosted chance would (see
 *  shared/chance.ts), so stacking multiple swift-strike-style effects can chain past a
 *  single guaranteed extra attack. */
export function rollsFollowUpAttack(attacker: CombatCombatant): boolean {
  return resolveExcessCount(attacker.extraAttackChance) >= 1;
}

/** Resolves one full turn for `actor` against `defender` — the initial attack, plus any
 *  immediate follow-up attacks its extra-attack-chance grants (each checked again after
 *  landing, so a chain of follow-ups can occur). Mutates both combatants' `hp` in place
 *  (via resolveAttack). Stops early if the defender's hp reaches 0. Returns every attack
 *  resolved, in order (length 1 if there was no follow-up). */
export function resolveTurn(
  actor: 'fighter' | 'enemy',
  attacker: CombatCombatant,
  defender: CombatCombatant
): CombatTurnResult[] {
  const results: CombatTurnResult[] = [];
  let followUp = false;

  for (;;) {
    const result = resolveAttack(actor, attacker, defender, followUp);
    results.push(result);
    if (defender.hp <= 0) break;
    if (!result.hit || !rollsFollowUpAttack(attacker)) break;
    followUp = true;
  }

  return results;
}
```

- [ ] **Step 16: Run the tests to verify they pass**

Run: `ng test --include=src/app/fighter-combat/combat-resolution.spec.ts --watch=false`
Expected: PASS (15 specs total).

- [ ] **Step 17: Run the full unit suite to check for regressions**

Run: `npm run test:unit`
Expected: PASS.

- [ ] **Step 18: Commit**

```bash
git add src/app/fighter-combat/combat-resolution.ts src/app/fighter-combat/combat-resolution.spec.ts
git commit -m "Add pure combat turn-resolution logic"
```

---

### Task 4: Enemy/area config, flavor, and CombatService

**Files:**
- Modify: `src/app/configs/game-config.ts` (append at end of file)
- Modify: `src/app/configs/flavor-text.ts` (append at end of file)
- Modify: `src/app/configs/game-config.spec.ts`
- Create: `src/app/fighter-combat/combat.service.ts`
- Test: `src/app/fighter-combat/combat.service.spec.ts`

**Interfaces:**
- Consumes: `getMaxHp`, `SixStats` (Task 1); `EquipmentService` with `getEffectiveStats()`, `getBonusDamage()`, `getDamageReduction()`, `getExtraAttackChance()`, `addToInventory(itemId, count?)` (Task 2); `CombatCombatant`, `CombatTurnResult`, `resolveTurn`, `rollInitiative` (Task 3); `WalletService.add(resourceId, delta)` (existing); `StatisticsService.recordAction(actionId)` (existing); `ActivityLogService.log(text, type)` (existing); `resourceAmountToken(resourceId, amount)` (existing, `../shared/resource-token`); `getEquipmentFlavor(id)` (Task 2, `../configs/flavor-text`).
- Produces: `EnemyConfig`, `LootDrop`, `FighterAreaConfig`, `FIGHTER_ENEMIES: EnemyConfig[]`, `FIGHTER_AREAS: FighterAreaConfig[]`, `COMBAT_CHECK_MS`, `COMBAT_TURN_MS`, `FIGHTER_DEFEAT_LOCKOUT_MS` (all from `game-config.ts`); `getFighterEnemyFlavor(id)`, `getFighterAreaFlavor(id)`, `FIGHTER_COMBAT_ASCII` (all from `flavor-text.ts`); `CombatService` with `fighterMaxHp: number`, `currentFighterHp: number`, `lockedOutRemainingMs: number`, `canFight: boolean`, `activeEncounter: ActiveEncounter | null`, `start(areaId): void`, `flee(): void`, `getSnapshot(): CombatSnapshot`, `restore(snapshot)`, `changes$: Observable<void>`. `ActiveEncounter` shape: `{ areaId: string; enemyId: string; enemyHp: number; actorTurn: 'fighter' | 'enemy'; turns: CombatTurnResult[] }`. All consumed by Task 5 (save integration) and Tasks 6–10 (UI).

- [ ] **Step 1: Append the enemy/area config to `game-config.ts`**

Add at the end of `src/app/configs/game-config.ts`:

```ts
// ── Fighter Combat: enemies & areas ────────────────────────────
// Areas and enemies are decoupled so either can be extended independently — an area is
// just a named pool of enemy ids.

export interface EnemyConfig {
  id: string;
  stats: SixStats;
  loot: LootDrop[];
}

export type LootDrop =
  | { type: 'resource'; resourceId: string; chance: number; min: number; max: number }
  | { type: 'equipment'; equipmentId: string; chance: number };

export interface FighterAreaConfig {
  id: string;
  enemyIds: string[];
}

export const FIGHTER_ENEMIES: EnemyConfig[] = [
  {
    id: 'kobold',
    stats: {
      strength: 8,
      dexterity: 10,
      constitution: 6,
      intelligence: 6,
      wisdom: 10,
      charisma: 6,
    },
    loot: [
      { type: 'resource', resourceId: 'gold', chance: 1.0, min: 5, max: 15 },
      { type: 'resource', resourceId: 'kobold-ears', chance: 0.6, min: 1, max: 1 },
      { type: 'equipment', equipmentId: 'ring-swift-strike', chance: 0.05 },
    ],
  },
];

export const FIGHTER_AREAS: FighterAreaConfig[] = [
  { id: 'kobold-den', enemyIds: ['kobold'] },
];

// ── Fighter Combat: timing & lockout ───────────────────────────

/** How often CombatService checks whether the next turn is due — its own constant,
 *  independently tunable from TIMED_ACTION_TICK_MS. */
export const COMBAT_CHECK_MS = 100;

/** Pacing between resolved turns once a fight is active. */
export const COMBAT_TURN_MS = 1_000;

/** How long Fight! stays disabled after a loss. */
export const FIGHTER_DEFEAT_LOCKOUT_MS = 30_000;
```

- [ ] **Step 2: Append the enemy/area flavor to `flavor-text.ts`**

Add at the end of `src/app/configs/flavor-text.ts`:

```ts
// ── Fighter Combat: enemies & areas ────────────────────────────

export interface FighterEnemyFlavor {
  label: string;
  ascii: string;
}

// Keyed by EnemyConfig.id (game-config.ts).
export const FIGHTER_ENEMY_FLAVOR: Record<string, FighterEnemyFlavor> = {
  kobold: {
    label: 'Kobold',
    ascii: '  /\\_/\\\n ( o.o )\n  > ^ <',
  },
};

const DEFAULT_FIGHTER_ENEMY_FLAVOR: FighterEnemyFlavor = { label: '', ascii: '' };

export function getFighterEnemyFlavor(id: string): FighterEnemyFlavor {
  return FIGHTER_ENEMY_FLAVOR[id] ?? DEFAULT_FIGHTER_ENEMY_FLAVOR;
}

export interface FighterAreaFlavor {
  label: string;
}

// Keyed by FighterAreaConfig.id (game-config.ts).
export const FIGHTER_AREA_FLAVOR: Record<string, FighterAreaFlavor> = {
  'kobold-den': { label: 'Kobold Den' },
};

const DEFAULT_FIGHTER_AREA_FLAVOR: FighterAreaFlavor = { label: '' };

export function getFighterAreaFlavor(id: string): FighterAreaFlavor {
  return FIGHTER_AREA_FLAVOR[id] ?? DEFAULT_FIGHTER_AREA_FLAVOR;
}

// The Fighter's own combat-display art (only one Fighter, so a bare constant rather than
// a Record).
export const FIGHTER_COMBAT_ASCII = '  _O_\n //|\\\\\n  / \\';
```

- [ ] **Step 3: Extend `game-config.spec.ts` with enemy/area integrity checks**

Change the import from `./game-config` to also include `FIGHTER_ENEMIES, FIGHTER_AREAS`, and the import from `./flavor-text` to also include `FIGHTER_ENEMY_FLAVOR, FIGHTER_AREA_FLAVOR`. Then add these two `const` declarations right after the `equipmentIds` declaration added in Task 2:

```ts
  const fighterEnemyIds = FIGHTER_ENEMIES.map(e => e.id);
  const fighterAreaIds = FIGHTER_AREAS.map(a => a.id);
```

Then add this new `describe` block right before the final closing `});` of the outer `describe('game-config integrity', ...)` block (after the "Fighter Combat: equipment" block added in Task 2):

```ts
  describe('Fighter Combat: enemies & areas', () => {
    it('has no duplicate enemy or area ids', () => {
      expect(duplicateIds(fighterEnemyIds)).toEqual([]);
      expect(duplicateIds(fighterAreaIds)).toEqual([]);
    });

    it('every enemy has a FIGHTER_ENEMY_FLAVOR entry with a non-empty label and ascii', () => {
      expect(idsMissingFlavor(fighterEnemyIds, FIGHTER_ENEMY_FLAVOR)).toEqual([]);
      for (const enemy of FIGHTER_ENEMIES) {
        const flavor = FIGHTER_ENEMY_FLAVOR[enemy.id];
        expect(flavor.label).withContext(enemy.id).not.toBe('');
        expect(flavor.ascii).withContext(enemy.id).not.toBe('');
      }
    });

    it('every area has a FIGHTER_AREA_FLAVOR entry with a non-empty label', () => {
      expect(idsMissingFlavor(fighterAreaIds, FIGHTER_AREA_FLAVOR)).toEqual([]);
      for (const area of FIGHTER_AREAS) {
        expect(FIGHTER_AREA_FLAVOR[area.id].label).withContext(area.id).not.toBe('');
      }
    });

    it('every area references at least one real enemy', () => {
      for (const area of FIGHTER_AREAS) {
        expect(area.enemyIds.length).withContext(area.id).toBeGreaterThan(0);
        expect(danglingReferences(area.enemyIds, fighterEnemyIds)).withContext(area.id).toEqual([]);
      }
    });

    it('every enemy loot entry references a real resource or equipment item, with a sane chance', () => {
      for (const enemy of FIGHTER_ENEMIES) {
        for (const drop of enemy.loot) {
          expect(drop.chance).withContext(enemy.id).toBeGreaterThan(0);
          expect(drop.chance).withContext(enemy.id).toBeLessThanOrEqual(1);
          if (drop.type === 'resource') {
            expect(resourceIds).withContext(`${enemy.id} -> ${drop.resourceId}`).toContain(drop.resourceId);
            expect(drop.min).withContext(enemy.id).toBeGreaterThan(0);
            expect(drop.max).withContext(enemy.id).toBeGreaterThanOrEqual(drop.min);
          } else {
            expect(equipmentIds).withContext(`${enemy.id} -> ${drop.equipmentId}`).toContain(drop.equipmentId);
          }
        }
      }
    });

    it('every enemy stat block has non-negative stats', () => {
      for (const enemy of FIGHTER_ENEMIES) {
        for (const [stat, value] of Object.entries(enemy.stats)) {
          expect(value).withContext(`${enemy.id}.${stat}`).toBeGreaterThanOrEqual(0);
        }
      }
    });
  });
```

Note this block reuses `resourceIds` (declared at the top of the file already) and `equipmentIds` (declared in Task 2) — both already in scope from the outer `describe`.

- [ ] **Step 4: Run the config spec to verify it passes**

Run: `ng test --include=src/app/configs/game-config.spec.ts --watch=false`
Expected: PASS — all existing specs plus the new "Fighter Combat: enemies & areas" block.

- [ ] **Step 5: Write the failing tests for `CombatService.start()`/`flee()`**

```ts
// src/app/fighter-combat/combat.service.spec.ts
import { TestBed } from '@angular/core/testing';
import { CombatService } from './combat.service';
import { WalletService } from '../economy/wallet.service';
import { StatisticsService } from '../statistics/statistics.service';
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
});
```

- [ ] **Step 6: Run the tests to verify they fail**

Run: `ng test --include=src/app/fighter-combat/combat.service.spec.ts --watch=false`
Expected: FAIL — cannot find module `./combat.service`.

- [ ] **Step 7: Write the minimal implementation — construction, start(), flee()**

```ts
// src/app/fighter-combat/combat.service.ts
import { Injectable, inject } from '@angular/core';
import { Subject } from 'rxjs';
import { WalletService } from '../economy/wallet.service';
import { StatisticsService } from '../statistics/statistics.service';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { EquipmentService } from './equipment.service';
import { CombatCombatant, CombatTurnResult, resolveTurn, rollInitiative } from './combat-resolution';
import { getMaxHp } from '../shared/six-stats';
import {
  FIGHTER_AREAS,
  FIGHTER_ENEMIES,
  FIGHTER_BASE_STATS,
  EnemyConfig,
  COMBAT_CHECK_MS,
  COMBAT_TURN_MS,
  FIGHTER_DEFEAT_LOCKOUT_MS,
} from '../configs/game-config';
import { getEquipmentFlavor, getFighterEnemyFlavor } from '../configs/flavor-text';
import { resourceAmountToken } from '../shared/resource-token';

interface ActiveEncounter {
  areaId: string;
  enemyId: string;
  enemyHp: number;
  actorTurn: 'fighter' | 'enemy';
  turns: CombatTurnResult[];
}

export interface CombatSnapshot {
  fighterHp: number;
  lockedOutUntil: number | null;
  activeEncounter: ActiveEncounter | null;
}

/** Capped length of a live encounter's turn transcript — defensive bound against a
 *  future higher-HP/lower-damage enemy running an unbounded number of turns, same
 *  reasoning as MAX_LOG_MESSAGES. */
const MAX_TRANSCRIPT_TURNS = 50;

/**
 * Owns the Fighter's persistent combat HP, the post-defeat lockout, and at most one
 * active encounter. Modeled on TimedActionsService's absolute-timestamp-anchor pattern:
 * a dedicated interval checks whether the next turn is due and resolves exactly one
 * (`resolveTurn`, combat-resolution.ts) when it is — this is what keeps a fight running
 * even if the player switches to another character or screen, and what makes Flee
 * meaningful (nothing about the outcome is pre-decided).
 *
 * Reload does not fast-forward combat: unlike a TimedActionConfig's single deterministic
 * completion threshold, a turn's outcome is random, so bulk-resolving however many turns
 * would have happened during a closed tab would mean silently auto-battling an unbounded
 * number of them. restore() brings back the exact state and gives a fresh COMBAT_TURN_MS
 * countdown to the next turn from the moment of load. lockedOutUntil, being a plain
 * threshold like a timed action's duration, does correctly honor real elapsed time
 * across a closed tab.
 */
@Injectable({ providedIn: 'root' })
export class CombatService {
  private wallet = inject(WalletService);
  private equipment = inject(EquipmentService);
  private statistics = inject(StatisticsService);
  private activityLog = inject(ActivityLogService);

  private fighterHp = getMaxHp(FIGHTER_BASE_STATS);
  private lockedOutUntil: number | null = null;
  private encounter: ActiveEncounter | null = null;
  private nextTurnAt = 0;

  private changesSource = new Subject<void>();
  readonly changes$ = this.changesSource.asObservable();

  constructor() {
    setInterval(() => this.checkTurn(), COMBAT_CHECK_MS);
  }

  get fighterMaxHp(): number {
    return getMaxHp(this.equipment.getEffectiveStats());
  }

  get currentFighterHp(): number {
    return Math.min(this.fighterHp, this.fighterMaxHp);
  }

  get lockedOutRemainingMs(): number {
    if (!this.lockedOutUntil) return 0;
    return Math.max(0, this.lockedOutUntil - Date.now());
  }

  get canFight(): boolean {
    return this.encounter === null && this.lockedOutRemainingMs === 0;
  }

  get activeEncounter(): ActiveEncounter | null {
    return this.encounter;
  }

  /** No-op if a fight is already in progress, the area is unknown, or currently locked
   *  out. Picks uniformly at random among the area's enemyIds (today, always the only
   *  one), rolls initiative once, and schedules the first turn COMBAT_TURN_MS from now. */
  start(areaId: string): void {
    if (!this.canFight) return;
    const area = FIGHTER_AREAS.find(a => a.id === areaId);
    if (!area || area.enemyIds.length === 0) return;
    const enemyId = area.enemyIds[Math.floor(Math.random() * area.enemyIds.length)];
    const enemyConfig = FIGHTER_ENEMIES.find(e => e.id === enemyId);
    if (!enemyConfig) return;

    const fighter = this.fighterCombatant();
    const enemy = this.enemyCombatant(enemyConfig);
    const actorTurn = rollInitiative(fighter, enemy);

    this.encounter = { areaId, enemyId, enemyHp: enemy.hp, actorTurn, turns: [] };
    this.nextTurnAt = Date.now() + COMBAT_TURN_MS;
    this.changesSource.next();
  }

  /** Always succeeds immediately — ends the encounter with no loot and no lockout. */
  flee(): void {
    if (!this.encounter) return;
    this.encounter = null;
    this.activityLog.log('You disengage and flee the fight.', 'default');
    this.changesSource.next();
  }

  private fighterCombatant(): CombatCombatant {
    return {
      stats: this.equipment.getEffectiveStats(),
      hp: this.currentFighterHp,
      bonusDamage: this.equipment.getBonusDamage(),
      damageReduction: this.equipment.getDamageReduction(),
      extraAttackChance: this.equipment.getExtraAttackChance(),
    };
  }

  private enemyCombatant(config: EnemyConfig, hpOverride?: number): CombatCombatant {
    return {
      stats: config.stats,
      hp: hpOverride ?? getMaxHp(config.stats),
      bonusDamage: 0,
      damageReduction: 0,
      extraAttackChance: 0,
    };
  }

  private checkTurn(): void {
    // Populated in the next step.
  }

  getSnapshot(): CombatSnapshot {
    return {
      fighterHp: this.fighterHp,
      lockedOutUntil: this.lockedOutUntil,
      // Copied, not aliased — unlike TimedActionsService's instances (which are
      // replaced wholesale, never mutated in place), an ActiveEncounter's enemyHp/
      // actorTurn/turns are mutated in place turn by turn (see checkTurn below). A
      // snapshot that shared the live object by reference would silently drift if the
      // encounter kept ticking after the snapshot was taken.
      activeEncounter: this.encounter ? { ...this.encounter, turns: [...this.encounter.turns] } : null,
    };
  }

  restore(snapshot: CombatSnapshot | undefined): void {
    this.fighterHp = snapshot?.fighterHp ?? getMaxHp(FIGHTER_BASE_STATS);
    this.lockedOutUntil = snapshot?.lockedOutUntil ?? null;
    // Copied on the way in too, for the same reason as getSnapshot() above — never
    // alias the caller's snapshot object as this service's live, mutate-in-place state.
    this.encounter = snapshot?.activeEncounter
      ? { ...snapshot.activeEncounter, turns: [...snapshot.activeEncounter.turns] }
      : null;
    this.nextTurnAt = this.encounter ? Date.now() + COMBAT_TURN_MS : 0;
    this.changesSource.next();
  }
}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `ng test --include=src/app/fighter-combat/combat.service.spec.ts --watch=false`
Expected: PASS (6 specs) — `checkTurn` is still a stub, but nothing yet exercises it since no test has advanced the clock.

- [ ] **Step 9: Commit this intermediate state**

```bash
git add src/app/configs/game-config.ts src/app/configs/flavor-text.ts src/app/configs/game-config.spec.ts src/app/fighter-combat/combat.service.ts src/app/fighter-combat/combat.service.spec.ts
git commit -m "Add enemy/area config and CombatService scaffolding (start/flee)"
```

- [ ] **Step 10: Write the failing tests for turn resolution, victory, and defeat**

Add to `combat.service.spec.ts`, inside the outer `describe('CombatService', ...)`:

```ts
  describe('turn resolution', () => {
    it('a won fight grants gold, records the kill, and leaves Fight! immediately available', () => {
      spyOn(statistics, 'recordAction');
      service.restore({
        fighterHp: service.fighterMaxHp,
        lockedOutUntil: null,
        activeEncounter: { areaId: KOBOLD_DEN, enemyId: 'kobold', enemyHp: 1, actorTurn: 'fighter', turns: [] },
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
        activeEncounter: { areaId: KOBOLD_DEN, enemyId: 'kobold', enemyHp: 60, actorTurn: 'enemy', turns: [] },
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
        activeEncounter: { areaId: KOBOLD_DEN, enemyId: 'kobold', enemyHp: 60, actorTurn: 'enemy', turns: [] },
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
```

- [ ] **Step 11: Run the tests to verify they fail**

Run: `ng test --include=src/app/fighter-combat/combat.service.spec.ts --watch=false`
Expected: FAIL — the "does nothing" test passes trivially (checkTurn is a no-op stub), but the won/lost-fight tests fail: `activeEncounter` stays non-null and `wallet`/lockout are unchanged, since `checkTurn` doesn't do anything yet.

- [ ] **Step 12: Implement `checkTurn`, `resolveVictory`, and `resolveDefeat`**

Replace the `private checkTurn(): void { ... }` stub in `combat.service.ts` with:

```ts
  private checkTurn(): void {
    const encounter = this.encounter;
    if (!encounter) return;
    if (Date.now() < this.nextTurnAt) return;

    const enemyConfig = FIGHTER_ENEMIES.find(e => e.id === encounter.enemyId);
    if (!enemyConfig) return;

    const fighter = this.fighterCombatant();
    const enemy = this.enemyCombatant(enemyConfig, encounter.enemyHp);

    const actor = encounter.actorTurn;
    const [attacker, defender] = actor === 'fighter' ? [fighter, enemy] : [enemy, fighter];
    const results = resolveTurn(actor, attacker, defender);

    encounter.enemyHp = enemy.hp;
    this.fighterHp = fighter.hp;
    this.appendTurns(encounter, results);

    if (fighter.hp <= 0) {
      this.resolveDefeat(encounter);
      return;
    }
    if (enemy.hp <= 0) {
      this.resolveVictory(encounter, enemyConfig);
      return;
    }

    encounter.actorTurn = actor === 'fighter' ? 'enemy' : 'fighter';
    this.nextTurnAt = Date.now() + COMBAT_TURN_MS;
    this.changesSource.next();
  }

  private appendTurns(encounter: ActiveEncounter, results: CombatTurnResult[]): void {
    encounter.turns.push(...results);
    const excess = encounter.turns.length - MAX_TRANSCRIPT_TURNS;
    if (excess > 0) encounter.turns.splice(0, excess);
  }

  private resolveVictory(encounter: ActiveEncounter, enemyConfig: EnemyConfig): void {
    this.encounter = null;
    this.statistics.recordAction(`fighter-defeat-${enemyConfig.id}`);

    const grants: string[] = [];
    for (const drop of enemyConfig.loot) {
      if (Math.random() >= drop.chance) continue;
      if (drop.type === 'resource') {
        const amount = drop.min + Math.floor(Math.random() * (drop.max - drop.min + 1));
        this.wallet.add(drop.resourceId, amount);
        grants.push(resourceAmountToken(drop.resourceId, amount));
      } else {
        this.equipment.addToInventory(drop.equipmentId);
        grants.push(getEquipmentFlavor(drop.equipmentId).label);
      }
    }

    const enemyLabel = getFighterEnemyFlavor(enemyConfig.id).label;
    const lootText = grants.length > 0 ? ` (${grants.join(', ')})` : '';
    this.activityLog.log(`You defeat a ${enemyLabel}!${lootText}`, 'success');
    this.changesSource.next();
  }

  private resolveDefeat(encounter: ActiveEncounter): void {
    const enemyLabel = getFighterEnemyFlavor(encounter.enemyId).label;
    this.encounter = null;
    this.fighterHp = this.fighterMaxHp;
    this.lockedOutUntil = Date.now() + FIGHTER_DEFEAT_LOCKOUT_MS;
    this.activityLog.log(`You are defeated by a ${enemyLabel} and stumble back to recover.`, 'warn');
    this.changesSource.next();
  }
```

- [ ] **Step 13: Run the tests to verify they pass**

Run: `ng test --include=src/app/fighter-combat/combat.service.spec.ts --watch=false`
Expected: PASS (10 specs).

- [ ] **Step 14: Write the failing tests for snapshot/restore, including the no-fast-forward guarantee**

Add to `combat.service.spec.ts`:

```ts
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
```

- [ ] **Step 15: Run the tests to verify they fail**

Run: `ng test --include=src/app/fighter-combat/combat.service.spec.ts --watch=false`
Expected: These should already PASS given the Step 12 implementation (restore/getSnapshot were written in Step 7) — if either fails, re-check that `restore()` builds `nextTurnAt` from `Date.now()` at the moment it's called, not from any value baked into the snapshot itself.

- [ ] **Step 16: Run the full unit suite to check for regressions**

Run: `npm run test:unit`
Expected: PASS.

- [ ] **Step 17: Commit**

```bash
git add src/app/fighter-combat/combat.service.ts src/app/fighter-combat/combat.service.spec.ts
git commit -m "Implement CombatService turn resolution, victory loot, and defeat lockout"
```

---

### Task 5: Save integration for equipment and combat

**Files:**
- Modify: `src/app/save/save-data.ts`
- Modify: `src/app/save/save.service.ts`
- Modify: `src/app/save/save.service.spec.ts`

**Interfaces:**
- Consumes: `EquipmentSnapshot`, `EquipmentService` (Task 2); `CombatSnapshot`, `CombatService` (Task 4).
- Produces: `SaveData.equipment: EquipmentSnapshot` and `SaveData.combat: CombatSnapshot`, populated/restored by `SaveService`. No later task depends on this directly, but every subsequent UI task benefits from state surviving a reload during manual testing.

- [ ] **Step 1: Write the failing save round-trip assertions**

In `src/app/save/save.service.spec.ts`, add to the imports:

```ts
import { EquipmentService } from '../fighter-combat/equipment.service';
import { CombatService } from '../fighter-combat/combat.service';
```

Add `'equipment'` and `'combat'` to the end of the `EXPECTED_SAVE_KEYS` array:

```ts
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
```

In the `'every currently-known persisted service snapshot round-trips...'` test, add after the existing `TestBed.inject(...)` lines:

```ts
    const equipment = TestBed.inject(EquipmentService);
    const combat = TestBed.inject(CombatService);
```

and after the existing mutation calls (`crafting.click(...)`), add:

```ts
    equipment.addToInventory('ring-swift-strike');
    equipment.equip('ring-swift-strike', 'ring-1');
```

and after the existing `expect(decoded.crafting)...` assertion, add:

```ts
    expect(decoded.equipment).toEqual(equipment.getSnapshot());
    expect(decoded.combat).toEqual(combat.getSnapshot());
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `ng test --include=src/app/save/save.service.spec.ts --watch=false`
Expected: FAIL — `decoded.equipment`/`decoded.combat` are `undefined`, and the exact-keys assertion fails since `SaveData` doesn't have those fields yet (this also won't compile until Step 3/4 add the fields to `SaveData` and `SaveService`).

- [ ] **Step 3: Add the new fields to `SaveData`**

In `src/app/save/save-data.ts`, add to the imports:

```ts
import { EquipmentSnapshot } from '../fighter-combat/equipment.service';
import { CombatSnapshot } from '../fighter-combat/combat.service';
```

Add two fields at the end of the `SaveData` interface, right after the existing `crafting: CraftingSnapshot;` field:

```ts
  /** Fighter's equipped items + inventory. See EquipmentService.getSnapshot/restore. */
  equipment: EquipmentSnapshot;
  /** Fighter's combat HP, defeat lockout, and any in-progress encounter. See
   *  CombatService.getSnapshot/restore. */
  combat: CombatSnapshot;
```

- [ ] **Step 4: Wire the new services into `SaveService`**

In `src/app/save/save.service.ts`, add to the imports:

```ts
import { EquipmentService } from '../fighter-combat/equipment.service';
import { CombatService } from '../fighter-combat/combat.service';
```

Add two injected fields right after the existing `private crafting = inject(CraftingService);` line:

```ts
  private equipment = inject(EquipmentService);
  private combat = inject(CombatService);
```

In `exportBase64()`, add two lines to the `data` object literal right after the existing `crafting: this.crafting.getSnapshot(),` line:

```ts
      equipment: this.equipment.getSnapshot(),
      combat: this.combat.getSnapshot(),
```

In the private `parse()` method's `if (apply)` block, add two lines right after the existing `this.crafting.restore(data.crafting);` line:

```ts
      this.equipment.restore(data.equipment);
      this.combat.restore(data.combat);
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `ng test --include=src/app/save/save.service.spec.ts --watch=false`
Expected: PASS (3 specs).

- [ ] **Step 6: Run the full unit suite to check for regressions**

Run: `npm run test:unit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/app/save/save-data.ts src/app/save/save.service.ts src/app/save/save.service.spec.ts
git commit -m "Wire EquipmentService and CombatService into the save system"
```

---

### Task 6: UI — CombatantDisplayComponent and StatBlockComponent

Two small, presentational, reusable display components with no injected services — they only render `@Input()`s. `CombatantDisplayComponent` (ascii art + name + HP bar) is used for **both** the Fighter and the enemy side (zones 4 and 6 of the layout); `StatBlockComponent` (the six stats) is used for the enemy stats zone (zone 7).

**Files:**
- Create: `src/app/fighter-combat/combatant-display/combatant-display.component.ts`
- Create: `src/app/fighter-combat/combatant-display/combatant-display.component.html`
- Create: `src/app/fighter-combat/combatant-display/combatant-display.component.scss`
- Test: `src/app/fighter-combat/combatant-display/combatant-display.component.spec.ts`
- Create: `src/app/fighter-combat/stat-block/stat-block.component.ts`
- Create: `src/app/fighter-combat/stat-block/stat-block.component.html`
- Create: `src/app/fighter-combat/stat-block/stat-block.component.scss`
- Test: `src/app/fighter-combat/stat-block/stat-block.component.spec.ts`

**Interfaces:**
- Consumes: `SixStats` (Task 1).
- Produces: `<app-combatant-display [name] [ascii] [hp] [maxHp]>` and `<app-stat-block [stats]>`, both consumed by Task 9 (`FighterCombatComponent`).

- [ ] **Step 1: Write the failing tests for `CombatantDisplayComponent`**

```ts
// src/app/fighter-combat/combatant-display/combatant-display.component.spec.ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CombatantDisplayComponent } from './combatant-display.component';

describe('CombatantDisplayComponent', () => {
  let fixture: ComponentFixture<CombatantDisplayComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [CombatantDisplayComponent] });
    fixture = TestBed.createComponent(CombatantDisplayComponent);
  });

  it('computes hpPercent as a clamped 0-100 percentage', () => {
    fixture.componentInstance.hp = 30;
    fixture.componentInstance.maxHp = 60;
    expect(fixture.componentInstance.hpPercent).toBe(50);
  });

  it('clamps hpPercent to 0 when maxHp is 0 (avoids dividing by zero)', () => {
    fixture.componentInstance.hp = 0;
    fixture.componentInstance.maxHp = 0;
    expect(fixture.componentInstance.hpPercent).toBe(0);
  });

  it('renders the name and current/max HP in the template', () => {
    fixture.componentInstance.name = 'Kobold';
    fixture.componentInstance.hp = 30;
    fixture.componentInstance.maxHp = 60;
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.combatant-name')?.textContent).toContain('Kobold');
    expect(el.querySelector('.combatant-hp-label')?.textContent).toContain('30');
    expect(el.querySelector('.combatant-hp-label')?.textContent).toContain('60');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `ng test --include=src/app/fighter-combat/combatant-display/combatant-display.component.spec.ts --watch=false`
Expected: FAIL — cannot find module `./combatant-display.component`.

- [ ] **Step 3: Implement `CombatantDisplayComponent`**

```ts
// src/app/fighter-combat/combatant-display/combatant-display.component.ts
import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

/** Ascii art + name + HP bar for one side of an encounter — reused for both the Fighter
 *  and the enemy, parameterized entirely by inputs. */
@Component({
  selector: 'app-combatant-display',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './combatant-display.component.html',
  styleUrl: './combatant-display.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CombatantDisplayComponent {
  @Input() name = '';
  @Input() ascii = '';
  @Input() hp = 0;
  @Input() maxHp = 0;

  get hpPercent(): number {
    return this.maxHp > 0 ? Math.max(0, Math.min(100, (this.hp / this.maxHp) * 100)) : 0;
  }
}
```

```html
<!-- src/app/fighter-combat/combatant-display/combatant-display.component.html -->
<div class="combatant-display">
  <div class="combatant-name">{{ name }}</div>
  <pre class="combatant-ascii">{{ ascii }}</pre>
  <div class="combatant-hp-bar">
    <div class="combatant-hp-fill" [style.width.%]="hpPercent"></div>
    <div class="combatant-hp-label">{{ hp }} / {{ maxHp }}</div>
  </div>
</div>
```

```scss
// src/app/fighter-combat/combatant-display/combatant-display.component.scss
.combatant-display {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  font-family: 'Courier New', Courier, monospace;
  padding: 8px;
}

.combatant-name {
  font-size: 12px;
  color: #bbb;
  text-transform: uppercase;
}

.combatant-ascii {
  margin: 0;
  font-family: 'Courier New', Courier, monospace;
  font-size: 12px;
  color: #bbb;
  line-height: 1.2;
  white-space: pre;
}

.combatant-hp-bar {
  position: relative;
  width: 100%;
  min-width: 100px;
  height: 14px;
  border: 1px solid #333;
  background: #0a0a0a;
}

.combatant-hp-fill {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  background: #0f0;
  transition: width 0.2s ease-out;
}

.combatant-hp-label {
  position: relative;
  z-index: 1;
  text-align: center;
  font-size: 11px;
  color: #fff;
  line-height: 14px;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `ng test --include=src/app/fighter-combat/combatant-display/combatant-display.component.spec.ts --watch=false`
Expected: PASS (3 specs).

- [ ] **Step 5: Write the failing test for `StatBlockComponent`**

```ts
// src/app/fighter-combat/stat-block/stat-block.component.spec.ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { StatBlockComponent } from './stat-block.component';

describe('StatBlockComponent', () => {
  let fixture: ComponentFixture<StatBlockComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [StatBlockComponent] });
    fixture = TestBed.createComponent(StatBlockComponent);
  });

  it('renders all six stats with their values', () => {
    fixture.componentInstance.stats = {
      strength: 8, dexterity: 10, constitution: 6, intelligence: 6, wisdom: 10, charisma: 6,
    };
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('STR');
    expect(text).toContain('8');
    expect(text).toContain('DEX');
    expect(text).toContain('10');
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `ng test --include=src/app/fighter-combat/stat-block/stat-block.component.spec.ts --watch=false`
Expected: FAIL — cannot find module `./stat-block.component`.

- [ ] **Step 7: Implement `StatBlockComponent`**

```ts
// src/app/fighter-combat/stat-block/stat-block.component.ts
import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SixStats } from '../../shared/six-stats';

const ZERO_STATS: SixStats = {
  strength: 0, dexterity: 0, constitution: 0, intelligence: 0, wisdom: 0, charisma: 0,
};

@Component({
  selector: 'app-stat-block',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './stat-block.component.html',
  styleUrl: './stat-block.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatBlockComponent {
  @Input() stats: SixStats = ZERO_STATS;

  readonly rows: { label: string; key: keyof SixStats }[] = [
    { label: 'STR', key: 'strength' },
    { label: 'DEX', key: 'dexterity' },
    { label: 'CON', key: 'constitution' },
    { label: 'INT', key: 'intelligence' },
    { label: 'WIS', key: 'wisdom' },
    { label: 'CHA', key: 'charisma' },
  ];
}
```

```html
<!-- src/app/fighter-combat/stat-block/stat-block.component.html -->
<div class="stat-block">
  <div class="stat-row" *ngFor="let row of rows">
    <span class="stat-label">{{ row.label }}</span>
    <span class="stat-value">{{ stats[row.key] }}</span>
  </div>
</div>
```

```scss
// src/app/fighter-combat/stat-block/stat-block.component.scss
.stat-block {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-family: 'Courier New', Courier, monospace;
  font-size: 11px;
}

.stat-row {
  display: flex;
  justify-content: space-between;
  padding: 1px 4px;
}

.stat-label {
  color: #bbb;
}

.stat-value {
  color: #fff;
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `ng test --include=src/app/fighter-combat/stat-block/stat-block.component.spec.ts --watch=false`
Expected: PASS (1 spec).

- [ ] **Step 9: Run the full unit suite to check for regressions**

Run: `npm run test:unit`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/app/fighter-combat/combatant-display src/app/fighter-combat/stat-block
git commit -m "Add CombatantDisplay and StatBlock presentational components"
```

---

### Task 7: UI — InventoryPanelComponent and EquipmentPanelComponent

**Files:**
- Create: `src/app/fighter-combat/inventory-panel/inventory-panel.component.ts`
- Create: `src/app/fighter-combat/inventory-panel/inventory-panel.component.html`
- Create: `src/app/fighter-combat/inventory-panel/inventory-panel.component.scss`
- Test: `src/app/fighter-combat/inventory-panel/inventory-panel.component.spec.ts`
- Create: `src/app/fighter-combat/equipment-panel/equipment-panel.component.ts`
- Create: `src/app/fighter-combat/equipment-panel/equipment-panel.component.html`
- Create: `src/app/fighter-combat/equipment-panel/equipment-panel.component.scss`
- Test: `src/app/fighter-combat/equipment-panel/equipment-panel.component.spec.ts`

**Interfaces:**
- Consumes: `EquipmentService` (Task 2) — `inventoryEntries`, `getEquippedItemId`, `equip`, `unequip`, `changes$`; `EQUIPMENT_SLOTS`, `EQUIPMENT_ITEMS`, `EquipmentSlotInstance` (Task 2, `../../configs/game-config`); `getEquipmentFlavor`, `getRarityFlavor` (Task 2, `../../configs/flavor-text`); `EmptyStateComponent` (existing, `../../shared/empty-state/empty-state.component`).
- Produces: `<app-inventory-panel [disabled]>` and `<app-equipment-panel [disabled]>`, both consumed by Task 9 (`FighterCombatComponent`), which threads `disabled = combatService.activeEncounter !== null` into each.

- [ ] **Step 1: Write the failing tests for `InventoryPanelComponent`**

```ts
// src/app/fighter-combat/inventory-panel/inventory-panel.component.spec.ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { InventoryPanelComponent } from './inventory-panel.component';
import { EquipmentService } from '../equipment.service';

describe('InventoryPanelComponent', () => {
  let fixture: ComponentFixture<InventoryPanelComponent>;
  let equipment: EquipmentService;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [InventoryPanelComponent] });
    fixture = TestBed.createComponent(InventoryPanelComponent);
    equipment = TestBed.inject(EquipmentService);
    fixture.detectChanges();
  });

  it('shows the empty state when the bag is empty', () => {
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Bag is empty');
  });

  it('renders an item stack with its count once one is held', () => {
    equipment.addToInventory('ring-swift-strike', 2);
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Ring of Swift Strikes');
    expect(el.textContent).toContain('x2');
  });

  it('clicking an item equips it into a free compatible slot', () => {
    equipment.addToInventory('ring-swift-strike');
    fixture.detectChanges();

    (fixture.nativeElement.querySelector('.inventory-item') as HTMLElement).click();

    expect(equipment.getEquippedItemId('ring-1')).toBe('ring-swift-strike');
  });

  it('does nothing when disabled', () => {
    equipment.addToInventory('ring-swift-strike');
    fixture.componentInstance.disabled = true;
    fixture.detectChanges();

    (fixture.nativeElement.querySelector('.inventory-item') as HTMLElement).click();

    expect(equipment.getEquippedItemId('ring-1')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `ng test --include=src/app/fighter-combat/inventory-panel/inventory-panel.component.spec.ts --watch=false`
Expected: FAIL — cannot find module `./inventory-panel.component`.

- [ ] **Step 3: Implement `InventoryPanelComponent`**

```ts
// src/app/fighter-combat/inventory-panel/inventory-panel.component.ts
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
```

```html
<!-- src/app/fighter-combat/inventory-panel/inventory-panel.component.html -->
<div class="inventory-panel" [class.disabled]="disabled">
  <div class="zone-header">[ INVENTORY ]</div>
  <app-empty-state *ngIf="entries.length === 0" message="Bag is empty"></app-empty-state>

  <div
    class="inventory-item"
    *ngFor="let entry of entries"
    [style.borderColor]="rarityColor(entry.config.rarity)"
    (click)="equip(entry.config.id)">
    <div class="inventory-item-name" [style.color]="rarityColor(entry.config.rarity)">
      {{ label(entry.config.id) }}
    </div>
    <div class="inventory-item-count">x{{ entry.count }}</div>
    <div class="inventory-item-desc">{{ description(entry.config.id) }}</div>
  </div>
</div>
```

```scss
// src/app/fighter-combat/inventory-panel/inventory-panel.component.scss
.inventory-panel {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-family: 'Courier New', Courier, monospace;
  padding: 6px;
  border: 1px solid #222;

  &.disabled {
    opacity: 0.5;
    pointer-events: none;
  }
}

.zone-header {
  font-size: 11px;
  color: #bbb;
  text-transform: uppercase;
}

.inventory-item {
  border: 1px solid #333;
  padding: 4px;
  cursor: pointer;
  user-select: none;
}

.inventory-item-name {
  font-size: 12px;
}

.inventory-item-count {
  font-size: 11px;
  color: #bbb;
}

.inventory-item-desc {
  font-size: 10px;
  color: #888;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `ng test --include=src/app/fighter-combat/inventory-panel/inventory-panel.component.spec.ts --watch=false`
Expected: PASS (4 specs).

- [ ] **Step 5: Write the failing tests for `EquipmentPanelComponent`**

```ts
// src/app/fighter-combat/equipment-panel/equipment-panel.component.spec.ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EquipmentPanelComponent } from './equipment-panel.component';
import { EquipmentService } from '../equipment.service';

describe('EquipmentPanelComponent', () => {
  let fixture: ComponentFixture<EquipmentPanelComponent>;
  let equipment: EquipmentService;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [EquipmentPanelComponent] });
    fixture = TestBed.createComponent(EquipmentPanelComponent);
    equipment = TestBed.inject(EquipmentService);
    fixture.detectChanges();
  });

  it('renders all seven slot instances with their labels', () => {
    const el: HTMLElement = fixture.nativeElement;
    const labels = Array.from(el.querySelectorAll('.equipment-slot-label')).map(n => n.textContent);
    expect(labels).toEqual(['Helmet', 'Armor', 'Boots', 'Gauntlets', 'Ring', 'Ring', 'Necklace']);
  });

  it('shows "-- empty --" for every unoccupied slot', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelectorAll('.equipment-slot-empty').length).toBe(7);
  });

  it("shows the equipped item's label once a slot is filled", () => {
    equipment.addToInventory('ring-swift-strike');
    equipment.equip('ring-swift-strike', 'ring-1');
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Ring of Swift Strikes');
  });

  it('clicking a filled slot unequips it', () => {
    equipment.addToInventory('ring-swift-strike');
    equipment.equip('ring-swift-strike', 'ring-1');
    fixture.detectChanges();

    const slots = fixture.nativeElement.querySelectorAll('.equipment-slot');
    (slots[4] as HTMLElement).click(); // ring-1 is the 5th slot instance (index 4)

    expect(equipment.getEquippedItemId('ring-1')).toBeUndefined();
  });

  it('does nothing when disabled', () => {
    equipment.addToInventory('ring-swift-strike');
    equipment.equip('ring-swift-strike', 'ring-1');
    fixture.componentInstance.disabled = true;
    fixture.detectChanges();

    const slots = fixture.nativeElement.querySelectorAll('.equipment-slot');
    (slots[4] as HTMLElement).click();

    expect(equipment.getEquippedItemId('ring-1')).toBe('ring-swift-strike');
  });
});
```

- [ ] **Step 6: Run the tests to verify they fail**

Run: `ng test --include=src/app/fighter-combat/equipment-panel/equipment-panel.component.spec.ts --watch=false`
Expected: FAIL — cannot find module `./equipment-panel.component`.

- [ ] **Step 7: Implement `EquipmentPanelComponent`**

```ts
// src/app/fighter-combat/equipment-panel/equipment-panel.component.ts
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
```

```html
<!-- src/app/fighter-combat/equipment-panel/equipment-panel.component.html -->
<div class="equipment-panel" [class.disabled]="disabled">
  <div class="zone-header">[ EQUIPMENT ]</div>
  <div class="equipment-slot" *ngFor="let slot of slots" (click)="unequip(slot.id)">
    <div class="equipment-slot-label">{{ slot.label }}</div>
    <div
      class="equipment-slot-item"
      *ngIf="equippedItemId(slot.id) as itemId; else emptySlot"
      [style.color]="rarityColor(itemId)">
      {{ label(itemId) }}
    </div>
    <ng-template #emptySlot>
      <div class="equipment-slot-empty">-- empty --</div>
    </ng-template>
  </div>
</div>
```

```scss
// src/app/fighter-combat/equipment-panel/equipment-panel.component.scss
.equipment-panel {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-family: 'Courier New', Courier, monospace;
  padding: 6px;
  border: 1px solid #222;

  &.disabled {
    opacity: 0.5;
    pointer-events: none;
  }
}

.zone-header {
  font-size: 11px;
  color: #bbb;
  text-transform: uppercase;
}

.equipment-slot {
  border: 1px solid #333;
  padding: 4px;
  cursor: pointer;
  user-select: none;
}

.equipment-slot-label {
  font-size: 10px;
  color: #888;
}

.equipment-slot-item {
  font-size: 12px;
}

.equipment-slot-empty {
  font-size: 12px;
  color: #666;
}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `ng test --include=src/app/fighter-combat/equipment-panel/equipment-panel.component.spec.ts --watch=false`
Expected: PASS (5 specs).

- [ ] **Step 9: Run the full unit suite to check for regressions**

Run: `npm run test:unit`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/app/fighter-combat/inventory-panel src/app/fighter-combat/equipment-panel
git commit -m "Add InventoryPanel and EquipmentPanel components"
```

---

### Task 8: UI — CombatControlsComponent and CombatFeedComponent

**Files:**
- Create: `src/app/fighter-combat/combat-controls/combat-controls.component.ts`
- Create: `src/app/fighter-combat/combat-controls/combat-controls.component.html`
- Create: `src/app/fighter-combat/combat-controls/combat-controls.component.scss`
- Test: `src/app/fighter-combat/combat-controls/combat-controls.component.spec.ts`
- Create: `src/app/fighter-combat/combat-feed/combat-feed.component.ts`
- Create: `src/app/fighter-combat/combat-feed/combat-feed.component.html`
- Create: `src/app/fighter-combat/combat-feed/combat-feed.component.scss`
- Test: `src/app/fighter-combat/combat-feed/combat-feed.component.spec.ts`

**Interfaces:**
- Consumes: `CombatService` (Task 4) — `activeEncounter`, `canFight`, `lockedOutRemainingMs`, `start`, `flee`, `changes$`; `FIGHTER_AREAS` (Task 4, `../../configs/game-config`); `getFighterAreaFlavor`, `getFighterEnemyFlavor` (Task 4, `../../configs/flavor-text`); `CombatTurnResult` (Task 3, `../combat-resolution`).
- Produces: `<app-combat-controls>` and `<app-combat-feed>`, both consumed by Task 9 (`FighterCombatComponent`).

- [ ] **Step 1: Write the failing tests for `CombatControlsComponent`**

```ts
// src/app/fighter-combat/combat-controls/combat-controls.component.spec.ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CombatControlsComponent } from './combat-controls.component';
import { CombatService } from '../combat.service';

describe('CombatControlsComponent', () => {
  let fixture: ComponentFixture<CombatControlsComponent>;
  let combat: CombatService;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [CombatControlsComponent] });
    fixture = TestBed.createComponent(CombatControlsComponent);
    combat = TestBed.inject(CombatService);
    fixture.detectChanges();
  });

  it('renders a button for each configured area, defaulting to the first selected', () => {
    const buttons: HTMLElement[] = fixture.nativeElement.querySelectorAll('.area-button');
    expect(buttons.length).toBe(1); // only 'kobold-den' exists today
    expect(buttons[0].textContent).toContain('Kobold Den');
    expect((buttons[0] as HTMLElement).classList.contains('active')).toBeTrue();
  });

  it('clicking Fight! starts an encounter in the selected area', () => {
    (fixture.nativeElement.querySelector('.fight-button') as HTMLElement).click();
    expect(combat.activeEncounter?.enemyId).toBe('kobold');
  });

  it('shows Flee instead of Fight! once an encounter is active', () => {
    combat.start('kobold-den');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.fight-button')).toBeFalsy();
    expect(fixture.nativeElement.querySelector('.flee-button')).toBeTruthy();
  });

  it('clicking Flee ends the encounter', () => {
    combat.start('kobold-den');
    fixture.detectChanges();

    (fixture.nativeElement.querySelector('.flee-button') as HTMLElement).click();

    expect(combat.activeEncounter).toBeNull();
  });

  it('disables Fight! and shows a countdown while locked out', () => {
    combat.restore({ fighterHp: 1, lockedOutUntil: Date.now() + 15_000, activeEncounter: null });
    fixture.detectChanges();

    const fightButton = fixture.nativeElement.querySelector('.fight-button') as HTMLButtonElement;
    expect(fightButton.disabled).toBeTrue();
    expect(fightButton.textContent).toContain('Recovering');
  });

  it('renders two inert consumable slots', () => {
    expect(fixture.nativeElement.querySelectorAll('.consumable-slot').length).toBe(2);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `ng test --include=src/app/fighter-combat/combat-controls/combat-controls.component.spec.ts --watch=false`
Expected: FAIL — cannot find module `./combat-controls.component`.

- [ ] **Step 3: Implement `CombatControlsComponent`**

```ts
// src/app/fighter-combat/combat-controls/combat-controls.component.ts
import { Component, OnInit, OnDestroy, inject, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { FIGHTER_AREAS } from '../../configs/game-config';
import { getFighterAreaFlavor } from '../../configs/flavor-text';
import { CombatService } from '../combat.service';

@Component({
  selector: 'app-combat-controls',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './combat-controls.component.html',
  styleUrl: './combat-controls.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CombatControlsComponent implements OnInit, OnDestroy {
  private combat = inject(CombatService);
  private cdr = inject(ChangeDetectorRef);
  private sub = new Subscription();
  private countdownTimer?: ReturnType<typeof setInterval>;

  readonly areas = FIGHTER_AREAS;
  selectedAreaId = FIGHTER_AREAS[0]?.id ?? '';

  get inEncounter(): boolean {
    return this.combat.activeEncounter !== null;
  }

  get canFight(): boolean {
    return this.combat.canFight;
  }

  get lockedOutSecondsRemaining(): number {
    return Math.ceil(this.combat.lockedOutRemainingMs / 1000);
  }

  areaLabel(areaId: string): string {
    return getFighterAreaFlavor(areaId).label;
  }

  selectArea(areaId: string): void {
    if (this.inEncounter) return;
    this.selectedAreaId = areaId;
  }

  fight(): void {
    if (!this.selectedAreaId) return;
    this.combat.start(this.selectedAreaId);
  }

  flee(): void {
    this.combat.flee();
  }

  ngOnInit(): void {
    this.sub.add(this.combat.changes$.subscribe(() => this.cdr.markForCheck()));
    // The lockout countdown needs its own tick independent of changes$ (which only fires
    // on real state transitions, not every passing second) — purely cosmetic, same
    // "separate refresh loop for a live countdown" precedent as a timed action's progress
    // bar (see AGENTS.md §6).
    this.countdownTimer = setInterval(() => this.cdr.markForCheck(), 1000);
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
    if (this.countdownTimer) clearInterval(this.countdownTimer);
  }
}
```

```html
<!-- src/app/fighter-combat/combat-controls/combat-controls.component.html -->
<div class="combat-controls">
  <div class="zone-header">[ COMBAT ]</div>

  <div class="area-select">
    <button
      *ngFor="let area of areas"
      class="area-button"
      [class.active]="selectedAreaId === area.id"
      [disabled]="inEncounter"
      (click)="selectArea(area.id)">
      {{ areaLabel(area.id) }}
    </button>
  </div>

  <button class="fight-button" *ngIf="!inEncounter" [disabled]="!canFight" (click)="fight()">
    <ng-container *ngIf="canFight; else lockedOut">Fight!</ng-container>
    <ng-template #lockedOut>Recovering... {{ lockedOutSecondsRemaining }}s</ng-template>
  </button>

  <button class="flee-button" *ngIf="inEncounter" (click)="flee()">Flee</button>

  <div class="consumable-slots">
    <div class="consumable-slot" *ngFor="let i of [0, 1]">-- empty --</div>
  </div>
</div>
```

```scss
// src/app/fighter-combat/combat-controls/combat-controls.component.scss
.combat-controls {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-family: 'Courier New', Courier, monospace;
  padding: 6px;
  border: 1px solid #222;
}

.zone-header {
  font-size: 11px;
  color: #bbb;
  text-transform: uppercase;
}

.area-select {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.area-button {
  font-family: 'Courier New', Courier, monospace;
  font-size: 11px;
  text-transform: uppercase;
  padding: 4px 8px;
  border: 1px solid #444;
  background: #0a0a0a;
  color: #bbb;
  cursor: pointer;

  &.active {
    border-color: #0ff;
    color: #0ff;
  }

  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
}

.fight-button,
.flee-button {
  font-family: 'Courier New', Courier, monospace;
  font-size: 13px;
  padding: 8px;
  border: 1px solid #fff;
  background: #0a0a0a;
  color: #fff;
  cursor: pointer;

  &:disabled {
    opacity: 0.5;
    cursor: default;
    border-color: #444;
    color: #666;
  }
}

.consumable-slots {
  display: flex;
  gap: 4px;
}

.consumable-slot {
  flex: 1;
  border: 1px dashed #333;
  padding: 6px;
  text-align: center;
  font-size: 10px;
  color: #444;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `ng test --include=src/app/fighter-combat/combat-controls/combat-controls.component.spec.ts --watch=false`
Expected: PASS (5 specs).

- [ ] **Step 5: Write the failing tests for `CombatFeedComponent`**

```ts
// src/app/fighter-combat/combat-feed/combat-feed.component.spec.ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CombatFeedComponent } from './combat-feed.component';
import { CombatService } from '../combat.service';

describe('CombatFeedComponent', () => {
  let fixture: ComponentFixture<CombatFeedComponent>;
  let combat: CombatService;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [CombatFeedComponent] });
    fixture = TestBed.createComponent(CombatFeedComponent);
    combat = TestBed.inject(CombatService);
  });

  it('renders nothing when there is no active encounter', () => {
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.combat-feed-line').length).toBe(0);
  });

  it("renders each of the active encounter's turns", () => {
    combat.restore({
      fighterHp: 100,
      lockedOutUntil: null,
      activeEncounter: {
        areaId: 'kobold-den',
        enemyId: 'kobold',
        enemyHp: 50,
        actorTurn: 'enemy',
        turns: [
          { actor: 'fighter', attackRoll: 25, defenseRoll: 15, hit: true, damage: 8, followUp: false },
          { actor: 'enemy', attackRoll: 12, defenseRoll: 20, hit: false, followUp: false },
        ],
      },
    });
    fixture.detectChanges();

    // Hoisted into a typed local first — ComponentFixture.nativeElement is `any`, so
    // calling Array.from(...).map((n: Element) => ...) directly on it fails to compile
    // under this project's strict tsconfig (Array.from infers T=unknown with no mapfn
    // to help it, and an any-typed source doesn't rescue that).
    const el: HTMLElement = fixture.nativeElement;
    const lines: string[] = Array.from(el.querySelectorAll('.combat-feed-line')).map(
      (n: Element) => n.textContent ?? ''
    );
    expect(lines.length).toBe(2);
    expect(lines[0]).toContain('You');
    expect(lines[0]).toContain('8 damage');
    expect(lines[1]).toContain('Kobold');
    expect(lines[1]).toContain('miss');
  });
});
```

- [ ] **Step 6: Run the tests to verify they fail**

Run: `ng test --include=src/app/fighter-combat/combat-feed/combat-feed.component.spec.ts --watch=false`
Expected: FAIL — cannot find module `./combat-feed.component`.

- [ ] **Step 7: Implement `CombatFeedComponent`**

```ts
// src/app/fighter-combat/combat-feed/combat-feed.component.ts
import { Component, OnInit, OnDestroy, inject, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { CombatService } from '../combat.service';
import { CombatTurnResult } from '../combat-resolution';
import { getFighterEnemyFlavor } from '../../configs/flavor-text';

@Component({
  selector: 'app-combat-feed',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './combat-feed.component.html',
  styleUrl: './combat-feed.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CombatFeedComponent implements OnInit, OnDestroy {
  private combat = inject(CombatService);
  private cdr = inject(ChangeDetectorRef);
  private sub = new Subscription();

  get turns(): CombatTurnResult[] {
    return this.combat.activeEncounter?.turns ?? [];
  }

  get enemyLabel(): string {
    const enemyId = this.combat.activeEncounter?.enemyId;
    return enemyId ? getFighterEnemyFlavor(enemyId).label : '';
  }

  describe(turn: CombatTurnResult): string {
    const actorLabel = turn.actor === 'fighter' ? 'You' : this.enemyLabel;
    if (!turn.hit) {
      return `${actorLabel} miss${turn.actor === 'fighter' ? '' : 'es'}. (${turn.attackRoll} vs ${turn.defenseRoll})`;
    }
    const prefix = turn.followUp
      ? `${actorLabel} strike${turn.actor === 'fighter' ? '' : 's'} again!`
      : `${actorLabel} hit${turn.actor === 'fighter' ? '' : 's'}!`;
    return `${prefix} ${turn.damage} damage. (${turn.attackRoll} vs ${turn.defenseRoll})`;
  }

  ngOnInit(): void {
    this.sub.add(this.combat.changes$.subscribe(() => this.cdr.markForCheck()));
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }
}
```

```html
<!-- src/app/fighter-combat/combat-feed/combat-feed.component.html -->
<div class="combat-feed">
  <div class="zone-header">[ COMBAT LOG ]</div>
  <div class="combat-feed-body">
    <div class="combat-feed-line" *ngFor="let turn of turns">{{ describe(turn) }}</div>
  </div>
</div>
```

```scss
// src/app/fighter-combat/combat-feed/combat-feed.component.scss
.combat-feed {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-family: 'Courier New', Courier, monospace;
  border-top: 1px solid #222;
  padding: 6px;
  max-height: 120px;
}

.zone-header {
  font-size: 11px;
  color: #bbb;
  text-transform: uppercase;
}

.combat-feed-body {
  overflow-y: auto;
  max-height: 100px;
  scrollbar-width: thin;
  scrollbar-color: #333 #0a0a0a;
}

.combat-feed-body::-webkit-scrollbar {
  width: 6px;
}

.combat-feed-body::-webkit-scrollbar-thumb {
  background: #333;
}

.combat-feed-line {
  font-size: 11px;
  color: #bbb;
  padding: 1px 0;
}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `ng test --include=src/app/fighter-combat/combat-feed/combat-feed.component.spec.ts --watch=false`
Expected: PASS (2 specs).

- [ ] **Step 9: Run the full unit suite to check for regressions**

Run: `npm run test:unit`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/app/fighter-combat/combat-controls src/app/fighter-combat/combat-feed
git commit -m "Add CombatControls and CombatFeed components"
```

---

### Task 9: UI — FighterCombatComponent container

Assembles every component from Tasks 6–8 into the seven-zone layout plus the combat feed strip below it.

**Files:**
- Create: `src/app/fighter-combat/fighter-combat.component.ts`
- Create: `src/app/fighter-combat/fighter-combat.component.html`
- Create: `src/app/fighter-combat/fighter-combat.component.scss`
- Test: `src/app/fighter-combat/fighter-combat.component.spec.ts`

**Interfaces:**
- Consumes: `EquipmentService.getEffectiveStats()` (Task 2); `CombatService.currentFighterHp/fighterMaxHp/activeEncounter/changes$` (Task 4); `FIGHTER_ENEMIES` (Task 4, `../configs/game-config`); `getFighterEnemyFlavor`, `FIGHTER_COMBAT_ASCII`, `getCharacterFlavor` (Task 4 / existing, `../configs/flavor-text`); `getMaxHp`, `SixStats` (Task 1); `InventoryPanelComponent`, `EquipmentPanelComponent` (Task 7); `CombatantDisplayComponent`, `StatBlockComponent` (Task 6); `CombatControlsComponent`, `CombatFeedComponent` (Task 8); `TooltipDirective`, `TooltipContent` (existing, `../shared/tooltip/`); `EmptyStateComponent` (existing).
- Produces: `<app-fighter-combat>` selector, consumed by Task 10 (`MinigameZoneComponent`).

- [ ] **Step 1: Write the failing tests**

```ts
// src/app/fighter-combat/fighter-combat.component.spec.ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { FighterCombatComponent } from './fighter-combat.component';
import { CombatService } from './combat.service';
import { InventoryPanelComponent } from './inventory-panel/inventory-panel.component';

describe('FighterCombatComponent', () => {
  let fixture: ComponentFixture<FighterCombatComponent>;
  let combat: CombatService;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [FighterCombatComponent] });
    fixture = TestBed.createComponent(FighterCombatComponent);
    combat = TestBed.inject(CombatService);
    fixture.detectChanges();
  });

  it('shows "no enemy engaged" placeholders when no fight is active', () => {
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('No enemy engaged');
  });

  it('shows the enemy display once a fight starts', () => {
    combat.start('kobold-den');
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelectorAll('app-combatant-display').length).toBe(2); // fighter + enemy
    expect(el.textContent).not.toContain('No enemy engaged');
  });

  it('disables the inventory panel while a fight is in progress', () => {
    combat.start('kobold-den');
    fixture.detectChanges();

    const inventoryPanel = fixture.debugElement.query(By.directive(InventoryPanelComponent))
      .componentInstance as InventoryPanelComponent;
    expect(inventoryPanel.disabled).toBeTrue();
  });

  it('leaves the inventory panel enabled while no fight is active', () => {
    const inventoryPanel = fixture.debugElement.query(By.directive(InventoryPanelComponent))
      .componentInstance as InventoryPanelComponent;
    expect(inventoryPanel.disabled).toBeFalse();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `ng test --include=src/app/fighter-combat/fighter-combat.component.spec.ts --watch=false`
Expected: FAIL — cannot find module `./fighter-combat.component`.

- [ ] **Step 3: Implement `FighterCombatComponent`**

```ts
// src/app/fighter-combat/fighter-combat.component.ts
import { Component, OnInit, OnDestroy, inject, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { EmptyStateComponent } from '../shared/empty-state/empty-state.component';
import { TooltipDirective } from '../shared/tooltip/tooltip.directive';
import { TooltipContent } from '../shared/tooltip/tooltip-content';
import { InventoryPanelComponent } from './inventory-panel/inventory-panel.component';
import { EquipmentPanelComponent } from './equipment-panel/equipment-panel.component';
import { CombatantDisplayComponent } from './combatant-display/combatant-display.component';
import { StatBlockComponent } from './stat-block/stat-block.component';
import { CombatControlsComponent } from './combat-controls/combat-controls.component';
import { CombatFeedComponent } from './combat-feed/combat-feed.component';
import { EquipmentService } from './equipment.service';
import { CombatService } from './combat.service';
import { FIGHTER_ENEMIES, EnemyConfig } from '../configs/game-config';
import { FIGHTER_COMBAT_ASCII, getFighterEnemyFlavor, getCharacterFlavor } from '../configs/flavor-text';
import { getMaxHp, SixStats } from '../shared/six-stats';

const ZERO_STATS: SixStats = {
  strength: 0, dexterity: 0, constitution: 0, intelligence: 0, wisdom: 0, charisma: 0,
};

@Component({
  selector: 'app-fighter-combat',
  standalone: true,
  imports: [
    CommonModule,
    EmptyStateComponent,
    TooltipDirective,
    InventoryPanelComponent,
    EquipmentPanelComponent,
    CombatantDisplayComponent,
    StatBlockComponent,
    CombatControlsComponent,
    CombatFeedComponent,
  ],
  templateUrl: './fighter-combat.component.html',
  styleUrl: './fighter-combat.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FighterCombatComponent implements OnInit, OnDestroy {
  private equipment = inject(EquipmentService);
  private combat = inject(CombatService);
  private cdr = inject(ChangeDetectorRef);
  private sub = new Subscription();

  readonly fighterAscii = FIGHTER_COMBAT_ASCII;
  readonly fighterName = getCharacterFlavor('fighter').label;

  get fighterHp(): number {
    return this.combat.currentFighterHp;
  }

  get fighterMaxHp(): number {
    return this.combat.fighterMaxHp;
  }

  get inEncounter(): boolean {
    return this.combat.activeEncounter !== null;
  }

  get enemyName(): string {
    const enemyId = this.combat.activeEncounter?.enemyId;
    return enemyId ? getFighterEnemyFlavor(enemyId).label : '';
  }

  get enemyAscii(): string {
    const enemyId = this.combat.activeEncounter?.enemyId;
    return enemyId ? getFighterEnemyFlavor(enemyId).ascii : '';
  }

  get enemyHp(): number {
    return this.combat.activeEncounter?.enemyHp ?? 0;
  }

  get enemyMaxHp(): number {
    const config = this.currentEnemyConfig();
    return config ? getMaxHp(config.stats) : 0;
  }

  get enemyStats(): SixStats {
    return this.currentEnemyConfig()?.stats ?? ZERO_STATS;
  }

  get fighterTooltip(): TooltipContent {
    const stats = this.equipment.getEffectiveStats();
    return {
      title: this.fighterName,
      rows: [
        { label: 'STR', value: `${stats.strength}` },
        { label: 'DEX', value: `${stats.dexterity}` },
        { label: 'CON', value: `${stats.constitution}` },
        { label: 'INT', value: `${stats.intelligence}` },
        { label: 'WIS', value: `${stats.wisdom}` },
        { label: 'CHA', value: `${stats.charisma}` },
      ],
    };
  }

  ngOnInit(): void {
    this.sub.add(this.equipment.changes$.subscribe(() => this.cdr.markForCheck()));
    this.sub.add(this.combat.changes$.subscribe(() => this.cdr.markForCheck()));
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  private currentEnemyConfig(): EnemyConfig | undefined {
    const enemyId = this.combat.activeEncounter?.enemyId;
    return FIGHTER_ENEMIES.find(e => e.id === enemyId);
  }
}
```

```html
<!-- src/app/fighter-combat/fighter-combat.component.html -->
<div class="fighter-combat">
  <div class="fighter-combat-zones">
    <app-inventory-panel [disabled]="inEncounter"></app-inventory-panel>
    <app-equipment-panel [disabled]="inEncounter"></app-equipment-panel>

    <div class="jacks-slot">
      <div class="zone-header">[ JACKS ]</div>
      <app-empty-state message="No Jack assigned"></app-empty-state>
    </div>

    <div class="fighter-side" [appTooltip]="fighterTooltip">
      <app-combatant-display
        [name]="fighterName"
        [ascii]="fighterAscii"
        [hp]="fighterHp"
        [maxHp]="fighterMaxHp">
      </app-combatant-display>
    </div>

    <app-combat-controls></app-combat-controls>

    <app-combatant-display
      *ngIf="inEncounter; else noEnemy"
      [name]="enemyName"
      [ascii]="enemyAscii"
      [hp]="enemyHp"
      [maxHp]="enemyMaxHp">
    </app-combatant-display>
    <ng-template #noEnemy>
      <div class="enemy-side-empty">
        <app-empty-state message="No enemy engaged"></app-empty-state>
      </div>
    </ng-template>

    <div class="enemy-stats">
      <div class="zone-header">[ ENEMY STATS ]</div>
      <app-stat-block *ngIf="inEncounter" [stats]="enemyStats"></app-stat-block>
      <app-empty-state *ngIf="!inEncounter" message="No enemy engaged"></app-empty-state>
    </div>
  </div>

  <app-combat-feed *ngIf="inEncounter"></app-combat-feed>
</div>
```

```scss
// src/app/fighter-combat/fighter-combat.component.scss
.fighter-combat {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-family: 'Courier New', Courier, monospace;
  height: 100%;
}

.fighter-combat-zones {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 6px;
  flex: 1;
}

.jacks-slot,
.enemy-stats,
.fighter-side,
.enemy-side-empty {
  border: 1px solid #222;
  padding: 6px;
}

.zone-header {
  font-size: 11px;
  color: #bbb;
  text-transform: uppercase;
  margin-bottom: 4px;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `ng test --include=src/app/fighter-combat/fighter-combat.component.spec.ts --watch=false`
Expected: PASS (4 specs).

- [ ] **Step 5: Run the full unit suite to check for regressions**

Run: `npm run test:unit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/fighter-combat/fighter-combat.component.ts src/app/fighter-combat/fighter-combat.component.html src/app/fighter-combat/fighter-combat.component.scss src/app/fighter-combat/fighter-combat.component.spec.ts
git commit -m "Assemble FighterCombatComponent from its child panels"
```

---

### Task 10: Integrate FighterCombatComponent into MinigameZoneComponent

**Files:**
- Modify: `src/app/game-area/minigame-zone/minigame-zone.component.ts` (currently 14 lines, empty-state-only stub — confirmed no existing `.spec.ts` for this component)
- Modify: `src/app/game-area/minigame-zone/minigame-zone.component.html`
- Create: `src/app/game-area/minigame-zone/minigame-zone.component.spec.ts`

**Interfaces:**
- Consumes: `FighterCombatComponent` (Task 9); `UnlocksService.isUnlocked('minigames')`/`state$` (existing, `../../shared/unlocks.service`); `CharacterSelectService.active`/`active$` (existing, `../../character-select/character-select.service`).
- Produces: nothing further downstream — this is the final integration point. `MinigameZoneComponent`'s public shape (no inputs/outputs) is unchanged from today, so nothing that references it (`GameAreaComponent`) needs to change.

- [ ] **Step 1: Write the failing tests**

```ts
// src/app/game-area/minigame-zone/minigame-zone.component.spec.ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MinigameZoneComponent } from './minigame-zone.component';
import { UnlocksService } from '../../shared/unlocks.service';
import { CharacterSelectService } from '../../character-select/character-select.service';

describe('MinigameZoneComponent', () => {
  let fixture: ComponentFixture<MinigameZoneComponent>;
  let unlocks: UnlocksService;
  let characters: CharacterSelectService;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [MinigameZoneComponent] });
    fixture = TestBed.createComponent(MinigameZoneComponent);
    unlocks = TestBed.inject(UnlocksService);
    characters = TestBed.inject(CharacterSelectService);
  });

  it('shows the empty state when minigames are locked', () => {
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Under construction');
  });

  it('shows Fighter Combat once minigames are unlocked and Fighter is active', () => {
    unlocks.unlock('minigames');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-fighter-combat')).toBeTruthy();
  });

  it('keeps showing the empty state for a different active character even once unlocked', () => {
    characters.unlock('ranger');
    characters.select('ranger');
    unlocks.unlock('minigames');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-fighter-combat')).toBeFalsy();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Under construction');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `ng test --include=src/app/game-area/minigame-zone/minigame-zone.component.spec.ts --watch=false`
Expected: FAIL — `app-fighter-combat` never renders, since `MinigameZoneComponent` doesn't reference it yet.

- [ ] **Step 3: Update `MinigameZoneComponent`**

Replace the full contents of `src/app/game-area/minigame-zone/minigame-zone.component.ts`:

```ts
import { Component, OnInit, OnDestroy, inject, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { EmptyStateComponent } from '../../shared/empty-state/empty-state.component';
import { UnlocksService } from '../../shared/unlocks.service';
import { CharacterSelectService } from '../../character-select/character-select.service';
import { FighterCombatComponent } from '../../fighter-combat/fighter-combat.component';

/** Bottom half of the game screen — hosts minigame content. The Fighter Combat minigame
 *  is the first (and, today, only) occupant, shown while minigames are unlocked and the
 *  Fighter is the active character — mirroring how Upgrades/Actions already filter to
 *  the active character. Other characters keep the empty state until they get their own
 *  minigame; a real multi-minigame switcher (mirroring SidePanelComponent's tab pattern)
 *  is a job for whenever a second one actually exists, not before. */
@Component({
  selector: 'app-minigame-zone',
  standalone: true,
  imports: [CommonModule, EmptyStateComponent, FighterCombatComponent],
  templateUrl: './minigame-zone.component.html',
  styleUrl: './minigame-zone.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MinigameZoneComponent implements OnInit, OnDestroy {
  private unlocks = inject(UnlocksService);
  private characters = inject(CharacterSelectService);
  private cdr = inject(ChangeDetectorRef);
  private sub = new Subscription();

  minigamesUnlocked = this.unlocks.isUnlocked('minigames');
  activeCharacterId = this.characters.active;

  get showFighterCombat(): boolean {
    return this.minigamesUnlocked && this.activeCharacterId === 'fighter';
  }

  ngOnInit(): void {
    this.sub.add(this.unlocks.state$.subscribe(s => {
      this.minigamesUnlocked = s.minigames;
      this.cdr.markForCheck();
    }));
    this.sub.add(this.characters.active$.subscribe(id => {
      this.activeCharacterId = id;
      this.cdr.markForCheck();
    }));
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }
}
```

Replace the full contents of `src/app/game-area/minigame-zone/minigame-zone.component.html`:

```html
<div class="minigame-zone">
  <div class="zone-header">[ MINIGAMES ]</div>
  <div class="zone-body">
    <app-fighter-combat *ngIf="showFighterCombat"></app-fighter-combat>
    <app-empty-state *ngIf="!showFighterCombat" message="Under construction"></app-empty-state>
  </div>
</div>
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `ng test --include=src/app/game-area/minigame-zone/minigame-zone.component.spec.ts --watch=false`
Expected: PASS (3 specs).

- [ ] **Step 5: Run the full unit suite to check for regressions**

Run: `npm run test:unit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/game-area/minigame-zone/minigame-zone.component.ts src/app/game-area/minigame-zone/minigame-zone.component.html src/app/game-area/minigame-zone/minigame-zone.component.spec.ts
git commit -m "Host Fighter Combat in the minigame zone when unlocked and Fighter is active"
```

---

### Task 11: E2E coverage

By this point every unit has its own tests with mocked/isolated dependencies (Tasks 1–10) — this task's job is to catch real wiring mistakes between them (a service not actually injected where expected, a selector that doesn't match what really renders) that only show up end-to-end in a real browser. Unlike earlier tasks, there's no "red" phase to force here in the usual TDD sense: every underlying piece these tests exercise is already implemented and unit-tested by the time this task starts, so a genuine failure here would mean an integration bug slipped past the unit-level specs, not a feature that hasn't been built yet.

Because Playwright drives a real, compiled, running app in a browser, it cannot install a `spyOn(Math, 'random')` the way a Karma/Jasmine unit test can — outcomes here are genuinely random. To keep these tests fast and non-flaky, the win/loss scenarios seed the encounter via `seedSave` with the losing side already at 1 HP, so victory/defeat is a near-certainty within a single resolved turn (the Fighter's base Strength (15) comfortably beats the Kobold's base Dexterity (10) on a to-hit roll, and any hit at all is lethal to 1 HP) — a generous timeout absorbs the rare unlucky miss without the test ever needing to force a specific dice outcome.

**Files:**
- Create: `e2e/fighter-combat.spec.ts`

**Interfaces:**
- Consumes: `gotoFreshGame`, `seedSave`, `trackConsoleErrors` (existing, `./helpers`). No new e2e helpers are needed — every seed this file needs is a plain partial `combat`/`unlocks` object, exactly like `seedRangerUnlockedSave` already does for `characters`/`objectives`/`upgrades`.
- Produces: nothing further downstream — this is the final task in the plan.

- [ ] **Step 1: Write the e2e spec**

```ts
// e2e/fighter-combat.spec.ts
import { test, expect } from '@playwright/test';
import { gotoFreshGame, seedSave, trackConsoleErrors } from './helpers';

test.describe('Fighter Combat minigame', () => {
  test('shows all seven zones once minigames are unlocked and Fighter is active', async ({ page }) => {
    const errors = trackConsoleErrors(page);
    await seedSave(page, { unlocks: { minigames: true } });
    await gotoFreshGame(page);

    await expect(page.locator('app-fighter-combat')).toBeVisible();
    await expect(page.locator('app-inventory-panel')).toBeVisible();
    await expect(page.locator('app-equipment-panel')).toBeVisible();
    await expect(page.locator('button.fight-button')).toBeVisible();

    expect(errors).toEqual([]);
  });

  test('Fight! starts an encounter against the Kobold', async ({ page }) => {
    await seedSave(page, { unlocks: { minigames: true } });
    await gotoFreshGame(page);

    await page.click('button.fight-button');

    await expect(page.locator('button.flee-button')).toBeVisible();
    await expect(page.locator('app-combat-feed')).toBeVisible();
  });

  test('winning grants gold and logs the victory', async ({ page }) => {
    await seedSave(page, {
      unlocks: { minigames: true },
      combat: {
        fighterHp: 140,
        lockedOutUntil: null,
        activeEncounter: { areaId: 'kobold-den', enemyId: 'kobold', enemyHp: 1, actorTurn: 'fighter', turns: [] },
      },
    });
    await gotoFreshGame(page);

    await expect(page.locator('.log-entry', { hasText: 'defeat a Kobold' })).toBeVisible({ timeout: 20_000 });

    const goldRow = page.locator('.vault-row', { hasText: 'GOLD' });
    await expect(goldRow.locator('.vault-amount')).not.toHaveText('0');
    await expect(page.locator('button.fight-button')).toBeEnabled();
  });

  test('losing revives the Fighter and shows the recovery lockout', async ({ page }) => {
    await seedSave(page, {
      unlocks: { minigames: true },
      combat: {
        fighterHp: 1,
        lockedOutUntil: null,
        // enemyHp is deliberately high (not the Kobold's real 60 max) so the fight
        // lasts long enough to make the Kobold landing its one lethal hit against the
        // Fighter a near-certainty rather than a coin flip — verified by simulation: an
        // enemyHp of 60 (~8-10 turns) carried a real ~3% chance of the Fighter
        // finishing the Kobold off first and winning by accident; 200 drives that down
        // to ~0.001% with no cost to how fast the intended (losing) path resolves.
        activeEncounter: { areaId: 'kobold-den', enemyId: 'kobold', enemyHp: 200, actorTurn: 'enemy', turns: [] },
      },
    });
    await gotoFreshGame(page);

    await expect(page.locator('.log-entry', { hasText: 'defeated by a Kobold' })).toBeVisible({ timeout: 40_000 });
    await expect(page.locator('button.fight-button', { hasText: 'Recovering' })).toBeVisible();
  });

  test('fleeing ends the encounter immediately with no loot and no lockout', async ({ page }) => {
    await seedSave(page, { unlocks: { minigames: true } });
    await gotoFreshGame(page);

    await page.click('button.fight-button');
    await page.click('button.flee-button');

    await expect(page.locator('button.fight-button')).toBeEnabled();
    await expect(page.locator('button.fight-button')).not.toHaveText(/Recovering/);
  });
});
```

- [ ] **Step 2: Run the e2e suite**

Run: `npm run test:e2e -- fighter-combat`
Expected: PASS (5 tests). If any of the win/loss tests occasionally fails on an unlucky roll despite the generous timeout, that's a signal the seeded HP margins are too tight for real dice variance — widen the timeout before considering the underlying feature broken, since `combat.service.spec.ts` (Task 4) already proves the win/loss/lockout logic deterministically.

- [ ] **Step 3: Run the full suite one final time**

Run: `npm run test:all`
Expected: PASS — every unit spec from Tasks 1–10 plus this task's e2e spec, with no regressions anywhere else in the app.

- [ ] **Step 4: Commit**

```bash
git add e2e/fighter-combat.spec.ts
git commit -m "Add e2e coverage for the Fighter Combat minigame"
```

---
