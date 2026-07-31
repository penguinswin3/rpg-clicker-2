# Blacksmith Forge (Pattern Crafting Minigame) — Design

**Status:** Approved, ready for implementation planning.
**Scope:** The Blacksmith's first minigame — crafting Fighter equipment from known
Patterns, paid for in resources and real time, one craft active at a time. Occupies the
`MinigameZoneComponent` slot while Blacksmith is the active character (currently hardcoded
to Fighter Combat only — this is the second occupant).

## Goals

- Config-driven, same conventions as the rest of the game: static data in
  `game-config.ts`, cosmetics in `flavor-text.ts`, mutable runtime state in an owning
  service with `getSnapshot()`/`restore()`.
- A generic Pattern + rarity-upgrade mechanism that a future Uncommon+ tier can slot into
  as pure config, without reshaping the crafting service or `MinigameZoneComponent` again.
- Reuses existing primitives rather than inventing new ones: `TimedActionsService`'s
  absolute-timestamp-anchor pattern for the craft timer, `EquipmentService`'s fungible-item
  model for the crafted items themselves, `LootDrop`'s independent-roll shape for future
  pattern drops.

## Non-goals (explicitly deferred)

- **Uncommon+ patterns and their currencies.** Only the 5 Common patterns
  (Weapon/Helmet/Armor/Boots/Gauntlets) ship with real config. The upgrade mechanism
  (`upgradesFromEquipmentId`, `EquipmentService.replaceInventoryItem`) is built and
  generic, but nothing exercises it yet — same "fully wired but unexercised" precedent as
  `GENERATORS`/`generator-rate` (AGENTS.md §7).
- **Ring/Necklace patterns.** Explicitly out of scope per the original request.
- **A multi-minigame registry/switcher.** `MinigameZoneComponent` gains a simple
  per-active-character conditional (Fighter → Fighter Combat, Blacksmith → Blacksmith
  Forge), not a real tab/registry system — still just two hardcoded occupants.
- **A dedicated Dev Tools hook.** The existing "grant 100/10k/1M of every currency" tool
  already covers Ironmongery/Ingot/Pelt affordability for testing; no new tool is added.
- **Pattern discovery via objectives or purchase.** "Various ways" to unlock a pattern is
  reduced, for this version, to "starts known" (the 5 Commons) or "combat drop" (wired,
  unexercised — see §4). Other unlock paths are not built now.

---

## 1. Pattern data model (`game-config.ts`)

```ts
export interface PatternConfig {
  id: string;
  characterId: string;              // 'blacksmith'
  slotType: EquipmentSlotType;      // weapon | helmet | armor | boots | gauntlets
  rarity: EquipmentRarity;
  equipmentId: string;              // the EquipmentConfig this pattern produces
  /** Set only for an upgrade-tier pattern (none in this version). Craft requires the
   *  Fighter currently owns this item (equipped or in inventory) and consumes one copy
   *  of it — see EquipmentService.replaceInventoryItem in §3. */
  upgradesFromEquipmentId?: string;
  cost: { resourceId: string; amount: number }[];
  durationMs: number;
  /** Whether this pattern is known from the start, same meaning as
   *  UpgradeConfig.unlocked/CharacterConfig.unlocked. All 5 Common patterns are true;
   *  a future Uncommon+ pattern would ship false and rely on PatternCraftingService.unlock(). */
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
Costs/durations above are a first-pass proposal, easily retuned — they aren't load-bearing
for the design itself. Boots/Gauntlets deliberately draw on Pelt (a Ranger resource) rather
than pure Blacksmith output, the same kind of cross-character resource dependency Bait
already has on Cut Bait.

Five new `EQUIPMENT_ITEMS` entries, common rarity, one small effect each (exact numbers
tunable, kept modest/on par with the existing Basic Sword):
```ts
{ id: 'forged-sword', slotType: 'weapon', rarity: 'common', effects: [{ type: 'bonus-damage', amount: 1 }] },
{ id: 'forged-helmet', slotType: 'helmet', rarity: 'common', effects: [{ type: 'stat-bonus', stat: 'wisdom', amount: 1 }] },
{ id: 'forged-armor', slotType: 'armor', rarity: 'common', effects: [{ type: 'damage-reduction', reduction: 0.05 }] },
{ id: 'forged-boots', slotType: 'boots', rarity: 'common', effects: [{ type: 'stat-bonus', stat: 'dexterity', amount: 1 }] },
{ id: 'forged-gauntlets', slotType: 'gauntlets', rarity: 'common', effects: [{ type: 'stat-bonus', stat: 'strength', amount: 1 }] },
```
Each gets an `EQUIPMENT_FLAVOR` entry (`label`, `description`, `symbol`) and each pattern
gets a `PATTERN_FLAVOR` entry (`label`, `logMessage`) in `flavor-text.ts`, following the
existing config-vs-flavor split.

---

## 2. Pattern lifecycle & the "one item per slot-line" rule

- A pattern, once known, is known **forever** — not consumed by crafting. This is a
  recipe-unlock, the same permanence as an unlocked Upgrade.
- All 5 Common patterns are known from the moment the Blacksmith Forge unlocks (no
  additional gate beyond the existing `minigames` system unlock, which already implies
  Blacksmith exists — see `craft-10-ironmongery` in `OBJECTIVES`).
- **Each pattern represents a single equipment slot-line for the Fighter, not a
  repeatable stack.** Once the Fighter owns `forged-sword` (any source — crafted or, in
  principle, dropped), `pattern-common-weapon` shows as owned/complete and can't be
  crafted again. This is what makes "you cannot have both a common and uncommon version of
  the same item" true by construction: there is exactly one item occupying that line at
  any time, and a future upgrade pattern replaces it rather than adding a second copy.
- A future upgrade-tier pattern (`upgradesFromEquipmentId` set) requires the Fighter
  currently owns the prerequisite item (equipped or in inventory) to even attempt the
  craft. On completion, the prerequisite item is consumed and the new item takes its
  place — **in the same equip slot if it was equipped**, otherwise just replacing it in
  inventory. See `EquipmentService.replaceInventoryItem` below.
- A freshly-crafted **base-tier** item (no prerequisite) lands in inventory only — the
  player equips it manually, same as a combat-dropped item. It does not auto-equip.

`PatternCraftingService.isOwned(pattern)` — derived by checking whether the Fighter holds
or has equipped `pattern.equipmentId` (via `EquipmentService`), not separately tracked
state — so it can't drift from the equipment system's own truth.

---

## 3. Crafting mechanics

New module `src/app/blacksmith-forge/`, new `PatternCraftingService`
(`providedIn: 'root'`), modeled directly on `TimedActionsService`, not `CraftingService`:
passive real-time wait, not active hold/click engagement.

```ts
interface ActivePatternCraft {
  patternId: string;
  startedAt: number; // absolute timestamp, same anchor-and-recompute convention as
                      // TimedActionsService — survives navigation/reload for free.
}
```

- `knownPatternIds: Set<string>` — seeded from `PATTERNS.filter(p => p.unlocked)` at
  construction; grows via `unlock(patternId)` (idempotent), the future hook for pattern
  drops (§4).
- `active: ActivePatternCraft | undefined` — at most one craft in the whole service, since
  there's only one Blacksmith.
- `start(patternId)`:
  1. No-ops (with the same insufficient-cost/blocked-action error path as a
     `TimedActionConfig`) unless: the pattern is known, no craft is currently active,
     the prerequisite item is owned if this is an upgrade pattern, the item isn't already
     owned at this tier or higher, and every `cost` entry is affordable.
  2. Charges the full `cost` immediately (matches Guild Contract's "cost charged on
     start," not on completion).
  3. If `upgradesFromEquipmentId` is set, consumes one copy of it right away too (so the
     "you already own the upgraded slot" state is unambiguous while the craft is running).
  4. Sets `active = { patternId, startedAt: Date.now() }`.
- `checkCompletions()`, ticked on the existing `TIMED_ACTION_TICK_MS` interval (100ms,
  shared constant — no new tick needed): when `Date.now() - active.startedAt >=
  pattern.durationMs`, grants the item —
  - base-tier: `EquipmentService.addToInventory(pattern.equipmentId)`.
  - upgrade-tier: `EquipmentService.replaceInventoryItem(oldItemId, pattern.equipmentId)`
    (new method — removes one copy of `oldItemId`, and if it was equipped in some slot
    instance, equips `newItemId` into that same instance; otherwise just adds `newItemId`
    to inventory).
  Then logs completion (§5), calls `statistics.recordAction(patternId)` (on completion,
  the same "count on payout, not on start" convention `TimedActionsService`/
  `CraftingService` already use), and clears `active` — freeing the Forge for the next
  craft.
- `getProgress(patternId)` — live-computed fraction for the fill rendering (§5), `0` for
  any pattern that isn't the active one.
- `getSnapshot()` / `restore()` — persists `knownPatternIds` (the full set, forward-compat
  — a save from before a new pattern existed just won't have it, defaulting to "not
  known" via the usual `??` fallback) and `active` (raw `startedAt`, same restore-as-
  literally-elapsed-real-time convention as `TimedActionsService.restore`).

### `EquipmentService.replaceInventoryItem` (new method)

```ts
/** Rarity-tier upgrade primitive: removes one copy of oldItemId — unequipping and
 *  re-equipping newItemId into the exact same slot instance if oldItemId was worn there
 *  — and adds one copy of newItemId. No-ops if oldItemId isn't held at all. */
replaceInventoryItem(oldItemId: string, newItemId: string): void
```
Kept generic and reusable rather than baked into `PatternCraftingService`, consistent with
`EquipmentService` already owning every inventory/equip-state mutation.

---

## 4. Combat drops (wired, unexercised)

```ts
export type LootDrop =
  | { type: 'resource'; resourceId: string; chance: number; min: number; max: number }
  | { type: 'equipment'; equipmentId: string; chance: number }
  | { type: 'pattern'; patternId: string; chance: number }; // new
```
`CombatService.resolveVictory()` gains one more case in its loot loop, calling
`PatternCraftingService.unlock(drop.patternId)`. No `EnemyConfig` references this variant
yet — Kobold's loot table is unchanged — so this ships exactly like `GENERATORS` did:
correct and ready, with its first real config entry arriving alongside the first
Uncommon+ pattern.

---

## 5. UI

`MinigameZoneComponent` changes from unconditionally hosting `FighterCombatComponent` to a
per-active-character conditional:
```
Fighter    -> FighterCombatComponent (existing)
Blacksmith -> BlacksmithForgeComponent (new)
Ranger     -> today's "Under construction" empty state (unchanged)
```

`BlacksmithForgeComponent` (new folder `blacksmith-forge/`), sitting below the Blacksmith's
existing button-zone actions (Mine Ore, Forge Ingots, Smith Metal — those don't move):

- One row per equipment slot-line (Weapon/Helmet/Armor/Boots/Gauntlets, fixed display
  order matching `EQUIPMENT_SLOTS`), each showing:
  - Slot label, and the owned item's rarity label/color (`RARITY_FLAVOR`) once one exists
    — blank/dash if nothing's been crafted for that slot yet.
  - A "Craft" button, labeled from `PATTERN_FLAVOR`, showing cost + duration via the
    existing `TooltipDirective`/`TooltipContent` (same live-numbers convention as the
    Button Zone's tooltips).
  - Button states: normal (affordable, nothing else crafting) → active fill (this row's
    own craft in progress, `.crafting-button-fill`-style layered fill behind the label,
    same visual family as every other progress button in the game) → disabled/"Forge
    busy" (a *different* pattern is currently crafting) → disabled/"OWNED" (this slot's
    item already exists and there's no higher tier available yet — the terminal state for
    every row in this version, since no Uncommon+ pattern ships).
- No separate "currently crafting" banner — the one active row's own fill communicates
  it, and every other row's disabled "Forge busy" state communicates the rest, mirroring
  how Guild Contract's own button is the only progress indicator it needs.
- Terminal styling throughout (`[ BLACKSMITH FORGE ]` bracketed header, thin `#222`/`#333`
  borders, no emoji), matching every other panel.

### Logging

Craft completion logs at `'success'` (a noteworthy, non-routine event — same tier as an
Objective claim or a combat victory), flavor sentence plus the item's plain label in
parens — matching how a combat equipment drop already logs
(`You defeat a Kobold! (Ring of Swift Strikes)`), not the colored-currency-token shape,
since there's no currency amount involved:
```
You finish shaping the blade and admire your work. (Forged Sword)
```

---

## 6. Persistence

```ts
// save-data.ts addition
patternCrafting: PatternCraftingSnapshot; // PatternCraftingService.getSnapshot()
```
```ts
interface PatternCraftingSnapshot {
  knownPatternIds: string[];
  active: { patternId: string; startedAt: number } | null;
}
```
Wired into `SaveService.exportBase64()`/`parse()` and `EXPECTED_SAVE_KEYS`
(`save.service.spec.ts`), same as every other persisted system. No new `UNLOCKS` key — the
Forge reuses the existing `minigames` flag.

---

## 7. Testing

Extending the existing suite (`npm run test:all`):

- **Unit:**
  - `pattern-crafting.service.spec.ts` — `start()` validation (unknown pattern, already
    active, already owned, unaffordable, missing upgrade prerequisite), cost charged on
    start not completion, completion timing/tick behavior, `statistics.recordAction`
    fired on completion not start, snapshot/restore round-trip (including mid-craft).
  - `equipment.service.spec.ts` extension — `replaceInventoryItem`: swaps an equipped
    item in place, replaces an unequipped item in inventory, no-ops when the old item
    isn't held.
  - `combat.service.spec.ts` extension — a `'pattern'` loot entry calls
    `PatternCraftingService.unlock`.
- **`game-config.spec.ts` extension:** every `PatternConfig.equipmentId` /
  `upgradesFromEquipmentId` resolves to a real `EquipmentConfig`; every pattern has a
  `PATTERN_FLAVOR` entry; every new `forged-*` equipment id has an `EQUIPMENT_FLAVOR`
  entry with a non-emoji symbol; every `cost` resourceId resolves to a real resource;
  `durationMs` is positive.
- **`save.service.spec.ts`:** add `patternCrafting` to `EXPECTED_SAVE_KEYS`.
- **E2E (`e2e/blacksmith-forge.spec.ts`, new):** granting currency via Dev Tools and
  selecting Blacksmith reveals the Forge panel with all 5 Common patterns craftable;
  starting a craft charges cost immediately and disables the other rows; completion (seed
  a short-duration scenario or advance fake time, matching the existing timed-action e2e
  approach) grants the item into Fighter's inventory and logs a `'success'` entry;
  starting a second craft while one is active is rejected.
