# Fighter Combat Minigame — Design

**Status:** Approved, ready for implementation planning.
**Scope:** The Fighter's first minigame — a turn-based combat loop against a single enemy
(the Kobold), with equipment, inventory, and a dynamic loot table. Occupies the existing
`MinigameZoneComponent` slot.

## Goals

- A clean, config-driven combat system in this codebase's established style (see
  `AGENTS.md`'s Design Patterns section): static data in `game-config.ts`, cosmetics in
  `flavor-text.ts`, mutable runtime state in owning services with `getSnapshot()`/`restore()`.
- Genuinely dynamic: new enemies, areas, equipment, and loot entries should be addable as
  pure config, never requiring a reshape of existing code.
- Shares foundations with the (not-yet-built) Jacks system where the two genuinely
  overlap (the six-stat model), without building Jacks itself.

## Non-goals (explicitly deferred)

- **Consumables** — the Combat Controls zone reserves slot(s) for them, but no real
  consumable item exists yet; the slots render inert/disabled.
- **Jacks integration** — a slot is reserved in the layout (`EmptyStateComponent`, "No
  Jack assigned"), but there's no `JacksService` to assign from yet.
- **A proactive heal button** — HP persists across fights and only decreases from combat
  damage; the one exception is defeat, which fully revives the Fighter (see Combat
  Engine). A future button to top off HP without losing first is anticipated but not
  built now — the persisted `fighterHp` field is exactly what it would modify.
- **A multi-minigame registry/switcher** — `MinigameZoneComponent` hosts the Fighter
  Combat panel directly (one slot, one occupant), the same way it's a single hardcoded
  slot today. A real switcher (mirroring `SidePanelComponent`'s tab pattern) should be
  built the day a second minigame actually exists, not speculatively now.
- **Weapon damage dice** — damage is `random(1, effective STR)` plus flat equipment
  bonuses, exactly as specified; no per-weapon damage dice.
- **Enemy equipment** — only the Fighter equips gear; enemies are pure stat blocks + loot
  tables.
- **Rarity-based mechanical scaling** — rarity is classification + display color only;
  nothing currently reads it to scale effect magnitude.
- **Unique-rarity ownership cap** — "Unique" is treated as just the top color/display
  tier for now; items stack by count like every other rarity unless/until a real
  single-copy rule is wanted.

---

## 1. Shared foundations

`src/app/shared/six-stats.ts` (new):
```ts
export type SixStat =
  | 'strength' | 'dexterity' | 'constitution'
  | 'intelligence' | 'wisdom' | 'charisma';

export interface SixStats {
  strength: number; dexterity: number; constitution: number;
  intelligence: number; wisdom: number; charisma: number;
}

/** Max HP is derived, never stored redundantly — Constitution x 10. */
export function getMaxHp(stats: SixStats): number {
  return stats.constitution * 10;
}
```
This is deliberately shared, not Fighter-only: Jacks (`AGENTS.md` §13) is speced with the
identical six-stat model. Fighter Combat is the first consumer, not the only intended one.

`src/app/shared/dice.ts` (new), with its own `.spec.ts` (matching `chance.ts`'s pattern):
```ts
export function rollDie(sides: number): number; // 1..sides inclusive
export function rollD20(): number;               // rollDie(20)
```
Generic and reusable — e.g. a future Jacks "Wisdom — strategy effectiveness" roll.

**Rolls use the raw stat value directly** — `1d20 + strength`, `1d20 + dexterity` — not a
converted D&D-style ability modifier. This is a deliberate reading of "roll a 1d20 + dex
score," not an oversight: it also means equipment stat bonuses are meaningfully impactful
(a flat +2 visibly shifts a 1-20 roll), which suits an incremental game.

`game-config.ts` addition:
```ts
export const FIGHTER_BASE_STATS: SixStats = {
  strength: 15, dexterity: 13, constitution: 14,
  intelligence: 8, wisdom: 10, charisma: 12,
};
```

---

## 2. Equipment & inventory

### Slots

Slots are a config **list of slot instances**, not just slot types, because "Ring" needs
two concurrent equip positions:
```ts
export type EquipmentSlotType =
  'helmet' | 'armor' | 'boots' | 'gauntlets' | 'ring' | 'necklace';

export interface EquipmentSlotInstance {
  id: string;             // 'helmet' | 'armor' | 'boots' | 'gauntlets' | 'ring-1' | 'ring-2' | 'necklace'
  slotType: EquipmentSlotType;
  label: string;           // both ring-1 and ring-2 display as 'Ring'
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
```
A future new slot (e.g. "Cloak") is one new slot type + one new instance entry — no reshape.

### Items, effects & rarity

Items are **fungible by id**, like a second, typed wallet — a given item is always
identical; the player holds copies as a count (`Map<string, number>`, same shape as
`WalletService`), not individually-rolled instances.

```ts
export type EquipmentRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'unique';

export type EquipmentEffect =
  | { type: 'stat-bonus'; stat: SixStat; amount: number }
  | { type: 'bonus-damage'; amount: number }
  | { type: 'damage-reduction'; reduction: number } // 0..1 fraction of incoming damage absorbed
  | { type: 'extra-attack-chance'; chance: number }; // 0..1+, cascades via resolveExcessCount (see Combat Engine)

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
Exactly **one** starter item ships with this version — a ring, not a stat stick, so the
combat engine's follow-up-attack path (see §3) has a real consumer from day one. More
items are expected to arrive as pure config later, the same way new upgrades/resources do.

`flavor-text.ts` additions:
```ts
export const EQUIPMENT_FLAVOR: Record<string, { label: string; description: string }> = {
  'ring-swift-strike': {
    label: 'Ring of Swift Strikes',
    description: '5% chance to attack again immediately after landing a hit.',
  },
};

// Configurable rarity -> color mapping, positional match to AGENTS.md's own
// gray/white/cyan/gold/purple color-hierarchy ladder (§3). Purple had no concrete value
// anywhere in the codebase before this — first realization of that reserved "Relic-tier" slot.
export const RARITY_FLAVOR: Record<EquipmentRarity, { label: string; color: string }> = {
  common:   { label: 'Common',   color: '#aaa' },
  uncommon: { label: 'Uncommon', color: '#fff' },
  rare:     { label: 'Rare',     color: '#0ff' },
  epic:     { label: 'Epic',     color: '#ffd700' },
  unique:   { label: 'Unique',   color: '#b266ff' },
};
```

### EquipmentService (`fighter-combat/equipment.service.ts`)

One service owns both inventory and equip-state together — equip/unequip is one atomic
move between "in bag" and "worn," not two services reaching into each other.

- `inventory: Map<string, number>` — unequipped item counts.
- `equipped: Record<string /* slot instance id */, string | null>` — item id worn in
  each slot instance.
- `getEffectiveStats(): SixStats` — `FIGHTER_BASE_STATS` + sum of every equipped item's
  `stat-bonus` effects, computed live on every read (same "recompute from config + current
  state" convention as `UpgradesService`, not cached/snapshotted).
- `getBonusDamage()`, `getDamageReduction()`, `getExtraAttackChance()` — same live-sum
  pattern, each feeding the combat engine (§3).
- `equip(itemId, slotInstanceId)` / `unequip(slotInstanceId)` — validates the item's
  `slotType` matches the target instance and that the player actually holds a copy;
  moves exactly one copy between inventory and the slot.
- Equipment/Inventory panels are non-interactive while a fight is in progress — gear
  can't change mid-fight, so "live" vs. "snapshotted" effective stats are behaviorally
  identical here; live is simply the established pattern.
- `getSnapshot()` / `restore()` — see §6 Persistence.

---

## 3. Combat engine

### Architecture

A dedicated `CombatService` (`fighter-combat/combat.service.ts`), `providedIn: 'root'`,
holding at most one active encounter, modeled on `TimedActionsService`'s absolute-timestamp-
anchor pattern: the encounter stores `nextTurnAt`, and a dedicated check interval
(`COMBAT_CHECK_MS`, e.g. 100ms — its own constant, not reused from `TIMED_ACTION_TICK_MS`,
so either can be retuned independently later) resolves exactly one turn once
`Date.now() >= nextTurnAt`, then reschedules `nextTurnAt = Date.now() + COMBAT_TURN_MS`
(e.g. 1000ms).

This is what makes combat keep running if the player switches to Options or another
character — nothing about a turn resolving depends on a component staying mounted — and
what makes Flee meaningful (nothing is pre-decided the way it would be under an
instant-resolve-then-animate design).

```ts
export const COMBAT_CHECK_MS = 100;
export const COMBAT_TURN_MS = 1000;
export const FIGHTER_DEFEAT_LOCKOUT_MS = 30_000;
```

### Symmetric combatant shape

Both sides resolve through the same shape rather than special-casing "if this is the
Fighter" inside the resolution logic — the enemy's equipment-derived fields are simply
always zero:
```ts
interface CombatCombatant {
  stats: SixStats;                 // effective — base + equipment, for the Fighter
  maxHp: number;
  hp: number;
  bonusDamage: number;              // 0 for enemies
  damageReduction: number;          // 0..1 fraction, 0 for enemies
  extraAttackChance: number;        // 0 for enemies
}
```

### Turn order & resolution

- **Initiative:** rolled once at encounter start — each side rolls `1d20 + effective DEX`;
  winner acts first; a tie favors the Fighter (mirroring "tie goes to the attacker" — the
  Fighter is the one who initiated the encounter). Order then strictly alternates for the
  rest of the fight, *unless* the follow-up-attack rule below keeps the same side going.
- **One turn = one attack**, matching "take turns attacking" literally:
  1. Attacker rolls `1d20 + effective STR`; defender rolls `1d20 + effective DEX`. Tie
     or better for the attacker = hit.
  2. On a hit: `damage = random(1, attacker's effective STR) + attacker.bonusDamage`,
     then reduced by `defender.damageReduction` (floored, **minimum 1** — a hit is never
     a true no-op), applied to the defender's HP.
  3. **Follow-up attacks:** after any hit, run `resolveExcessCount(attacker.extraAttackChance)`
     (reusing `shared/chance.ts`'s existing "excess percent" cascade rather than a bare
     `Math.random()` check — the same helper already handles a chance that can exceed
     100%, which is exactly what stacking two swift-strike rings would produce). If it
     returns ≥ 1, the same attacker goes again immediately — checked again after *that*
     hit too, so a chained sequence of follow-up attacks falls out for free with no
     special-case code. Otherwise the turn passes to the other side.
  4. Check for defeat (HP ≤ 0) before scheduling the next turn.
- Each resolved turn appends one `CombatTurnResult` to the active encounter's transcript
  (rendered locally — see §5):
  ```ts
  interface CombatTurnResult {
    actor: 'fighter' | 'enemy';
    attackRoll: number; defenseRoll: number;
    hit: boolean;
    damage?: number;          // present only when hit
    followUp?: boolean;       // true if this turn was itself a swift-strike bonus attack
  }
  ```

### Flee

Available any time an encounter is active; always succeeds immediately; ends the
encounter with no loot and no lockout.

### Victory

Encounter ends; loot is granted (§4); `fighterHp` is **not** reset — it persists exactly
as combat left it; `statistics.recordAction('fighter-defeat-<enemyId>')` is called; one
milestone-level line logs to the global Activity Log.

### Defeat

Fighter's HP reaching 0 ends the encounter with no loot, and:
1. `fighterHp` resets to full (`getMaxHp(effectiveStats)`) — the Fighter "revives."
2. `lockedOutUntil = Date.now() + FIGHTER_DEFEAT_LOCKOUT_MS` — Fight! is disabled with a
   live countdown until this passes. Equipment/Inventory remain usable during the
   lockout; only starting a new fight is blocked.
3. One milestone-level line logs to the global Activity Log, distinct from a win.

Losing is the only path with a real cost (30s), but it always resolves to a fresh start
rather than a dead end — Fight! never needs a separate HP-greater-than-0 guard, since
defeat itself guarantees the Fighter is back at full HP well before the lockout expires.

### Persistence & reload semantics

`fighterHp` and `lockedOutUntil` are standing state (exist whether or not a fight is
active); an `ActiveEncounter` exists only mid-fight. All of it is real, persisted state —
see §6.

**Reload does not fast-forward combat.** A `TimedActionConfig`'s completion is a single
deterministic threshold, safe to evaluate against arbitrary elapsed real time (however
long the tab was closed). Combat is a *sequence* of random events — bulk-resolving
"however many turns would have happened" during a closed tab would mean silently
auto-battling a potentially large, unbounded number of turns (and possibly multiple full
encounters) the instant the page reopens, which isn't what "persist" should mean here.
So: **combat only advances while the app is open.** `restore()` brings back the exact
state (HP, whose turn, transcript so far) and gives a fresh `COMBAT_TURN_MS` countdown to
the next turn from the moment of load — it never retroactively resolves turns for elapsed
offline time. `lockedOutUntil`, by contrast, *is* a plain threshold and correctly honors
real elapsed time even across a closed tab, the same as a timed action would.

`enemyMaxHp` and `fighterMaxHp` are **not** persisted — both are pure functions of
current config/gear (`getMaxHp`), recomputed live rather than stored and risking drift.
One consequence worth noting: if max HP changes between sessions (re-gearing to a
different Constitution bonus while not in combat), current HP is **clamped** to the new
max, never rescaled proportionally — simple, and the scenario can't occur mid-fight since
gear is locked during one.

The turn transcript on an active encounter is capped to a fixed recent count (mirroring
`MAX_LOG_MESSAGES`'s defensive cap) — self-limiting for the Kobold's current HP/damage
numbers, but a defensive bound worth having before a future higher-HP/lower-damage enemy
could otherwise run an unbounded number of turns.

---

## 4. Areas, enemies & loot

Areas and enemies are decoupled, so adding either is an independent, additive config change:
```ts
export interface EnemyConfig { id: string; stats: SixStats; loot: LootDrop[]; }
export type LootDrop =
  | { type: 'resource'; resourceId: string; chance: number; min: number; max: number }
  | { type: 'equipment'; equipmentId: string; chance: number };
export interface FighterAreaConfig { id: string; enemyIds: string[]; }

export const FIGHTER_ENEMIES: EnemyConfig[] = [
  {
    id: 'kobold',
    stats: { strength: 8, dexterity: 10, constitution: 6, intelligence: 6, wisdom: 10, charisma: 6 },
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
```
```ts
// flavor-text.ts
export const FIGHTER_ENEMY_FLAVOR: Record<string, { label: string; ascii: string }> = {
  kobold: {
    label: 'Kobold',
    ascii: '  /\\_/\\\n ( o.o )\n  > ^ <',
  },
};
export const FIGHTER_AREA_FLAVOR: Record<string, { label: string }> = {
  'kobold-den': { label: 'Kobold Den' },
};
```
A first-pass placeholder in spirit only — genuinely renderable art, not a `TBD` marker, but expect it to get refined once it's on screen. Same treatment applies to `FIGHTER_COMBAT_ASCII` (§5).

- Each `LootDrop` rolls **independently** (`Math.random() < chance`, the same simple-chance
  idiom `payout-double-chance` already uses) — a single kill can yield gold *and* a
  monster part *and*, rarely, the ring, all at once. Resource drops roll a uniform
  quantity in `[min, max]` on success.
- If an area ever lists more than one enemy id, engaging it picks uniformly at random
  which enemy is faced — unexercised today (one enemy) but implemented correctly from
  day one rather than hardcoded to "the one enemy."
- `gold` and `kobold-ears` already exist as Fighter-owned resources (`RESOURCES` in
  `game-config.ts`) — no new resource needed for this version.

---

## 5. UI layout & components

New folder `src/app/fighter-combat/`. `MinigameZoneComponent` renders it when
`UnlocksService.isUnlocked('minigames')` is true **and** the Fighter is the active
character (`CharacterSelectService.active === 'fighter'`) — the same per-character
filtering Upgrades/Actions already apply. Ranger/Blacksmith continue to see today's
"Under construction" empty state in that slot until they get their own minigame.

Seven zones, left to right, matching the requested layout:

| # | Zone | Component |
|---|---|---|
| 1 | Inventory | `inventory-panel/` — unequipped item stacks, click to equip |
| 2 | Equipment | `equipment-panel/` — 7 slot instances, click to unequip |
| 3 | Jacks slot | inline `EmptyStateComponent`, "No Jack assigned" |
| 4 | Fighter display | `combatant-display/` (ascii art, name, HP bar — always visible, not just mid-fight) |
| 5 | Combat controls | `combat-controls/` — area select, Fight!/Flee, reserved consumable slot(s) |
| 6 | Enemy display | `combatant-display/` (same component, reused) |
| 7 | Enemy stats | `stat-block/` — six stats, always visible |

Notes:
- `combatant-display/` is shared between zones 4 and 6, parameterized by combatant —
  ascii art + name + HP bar for either side.
- The Fighter's own effective stats surface via a hover tooltip (reusing the existing
  `TooltipDirective`/`TooltipContent`), not a dedicated always-on zone, since only the
  enemy gets one of those in the requested layout.
- **Area select** renders as a segmented-button bar (AGENTS.md's existing small/dense/
  uppercase toggle-group styling for "pick one of a small set") — one option today,
  built as a real (if currently trivial) list rather than hardcoded.
- **Fight! button states:** enabled by default; disabled with a live countdown while
  `Date.now() < lockedOutUntil`. That is now the *only* disabled state — no 0-HP guard
  (see §3, Defeat).
- **Consumable slots (2, fixed):** rendered, visually consistent with an empty equipment
  slot, but inert/non-interactive — reserved space, no backing data model, per the
  deferred-scope note above. The count is an arbitrary, easily-adjusted placeholder.
- **Combat feed:** a full-width strip *below* the seven-column row, inside the Fighter
  Combat panel — the active encounter's turn-by-turn transcript, echoing the outer app's
  own "content above, log below" shape at a smaller scale. Only the encounter's outcome
  (victory + loot / flee / defeat) logs to the *global* Activity Log — per-turn detail
  stays local so a single fight's 10-30+ lines don't bury unrelated game activity in the
  shared log (consistent with "reserve rare/noteworthy... not routine play").
- Terminal styling throughout: bracketed zone titles (`[ INVENTORY ]` etc.), thin
  `#222`/`#333` borders, no emoji (plain Unicode glyphs only), matching every other panel.
- Ascii art lives in `flavor-text.ts` as purely cosmetic data, not hardcoded into a
  component template — swappable without touching logic:
  ```ts
  export const FIGHTER_COMBAT_ASCII = '  _O_\n //|\\\\\n  / \\';
  ```
  Per-enemy art lives alongside each enemy's own flavor entry (`FIGHTER_ENEMY_FLAVOR.ascii`,
  §4). Both are first-pass, genuinely renderable art, not placeholders — expect them to
  get refined once actually on screen.

---

## 6. Persistence

```ts
// save-data.ts additions
equipment: EquipmentSnapshot;  // EquipmentService.getSnapshot() — inventory counts + slot -> itemId
combat: CombatSnapshot;        // CombatService.getSnapshot() — fighterHp, lockedOutUntil, activeEncounter
```
```ts
interface CombatSnapshot {
  fighterHp: number;
  lockedOutUntil: number | null;
  activeEncounter: {
    areaId: string;
    enemyId: string;
    enemyHp: number;
    actorTurn: 'fighter' | 'enemy'; // whose turn acts next
    turns: CombatTurnResult[]; // capped transcript, see §3
  } | null;
}
```
Both wired into `SaveService.exportBase64()`/`parse()` and `EXPECTED_SAVE_KEYS`
(`save.service.spec.ts`), same as every other persisted system. No new `UNLOCKS` key —
this reuses the existing `minigames` flag, already reachable via the Blacksmith
`craft-10-ironmongery` objective.

---

## 7. Testing

Extending the existing suite (`npm run test:all`), not writing throwaway scripts:

- **Unit:**
  - `dice.spec.ts` — range/distribution sanity for `rollDie`/`rollD20`.
  - `combat-resolution.spec.ts` — turn resolution, the damage pipeline (bonus damage,
    damage reduction, minimum-1 floor), tie-break rules, and the follow-up-attack
    cascade. Highest-value tests here since it's pure logic.
  - `combat.service.spec.ts` — ticking/turn pacing, lockout timing, revive-on-defeat,
    loot granting on victory, snapshot/restore round-trip (including mid-encounter).
  - `equipment.service.spec.ts` — equip/unequip validation (slot-type matching, copy
    count), effective-stats computation, snapshot/restore round-trip.
- **`game-config.spec.ts` extension:** every `EquipmentConfig.slotType` is a real
  `EquipmentSlotType`; every `rarity` is one of the five valid values with a
  `RARITY_FLAVOR` entry; every `EquipmentConfig`/`EnemyConfig`/`FighterAreaConfig` id has
  a flavor counterpart; every loot entry's `resourceId`/`equipmentId` resolves to a real
  config entry; every `FighterAreaConfig.enemyIds` entry resolves to a real enemy; chances
  are in sane ranges; no-emoji symbols — reusing `src/testing/invariants.ts` helpers
  where they fit, extending it where a genuinely new shape of check is needed.
- **`save.service.spec.ts`:** add `equipment` and `combat` to `EXPECTED_SAVE_KEYS`.
- **E2E (`e2e/fighter-combat.spec.ts`, new):** unlocking minigames and selecting Fighter
  reveals the panel; winning grants gold/loot and logs a milestone entry; fleeing ends
  the encounter with no loot; losing revives HP to full, starts the lockout, and
  re-enables Fight! once it expires.
