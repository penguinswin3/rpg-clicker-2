// This file is intended to hold all 'magic numbers' that can be pulled in elsewhere
// These should be grouped logically and use whatever data structures needed to represent this
// Some game balance tweaks might even get split out to other files in the future

export const VERSION = '0.0.1';

export const GAME_TITLE = 'RPG CLICKER 2';

export const DEV_TOOLS_ENABLED = true;

export const MAX_LOG_MESSAGES = 500;

// Amounts granted per click of a Dev Tools "add currency" button.
export const DEV_TOOLS_CURRENCY_GRANTS = [100, 10000, 1000000];

// ── Unlocks ───────────────────────────────────────────────────
// Single source of truth for which top-bar/game-area systems are revealed.

export const UNLOCKS = {
    jacks: false,
    crown: false,
    minigames: false,
    guildContract: false,
};

// ── Characters ────────────────────────────────────────────────

export interface CharacterConfig {
    id: string;
    unlocked: boolean;
}

// `unlocked` here means "starts the game unlocked" — Ranger unlocks dynamically via
// the OBJECTIVES entry below instead (see CharacterSelectService.unlock). A character
// only ever appears in Character Select once unlocked — there's no locked/empty
// placeholder box, so this list can just be "everyone who could ever exist."
export const CHARACTERS: CharacterConfig[] = [
    { id: 'fighter', unlocked: true },
    { id: 'ranger', unlocked: false },
    { id: 'blacksmith', unlocked: false },
];

// ── Resources ─────────────────────────────────────────────────
// Wallet amounts and unlock state are runtime concerns (see WalletService) — this is
// just the static list of known resources and the relation the Party Vault filter needs.

export interface ResourceConfig {
    id: string;
    /** Which character this resource is assigned to, for Party Vault filtering. */
    characterId: string;
}

export const RESOURCES: ResourceConfig[] = [
    { id: 'gold', characterId: 'fighter' },
    { id: 'herbs', characterId: 'ranger' },
    { id: 'kobold-ears', characterId: 'fighter' },
    { id: 'bait', characterId: 'ranger' },
    { id: 'raw-meat', characterId: 'ranger' },
    { id: 'pelt', characterId: 'ranger' },
    { id: 'ore', characterId: 'blacksmith' },
    { id: 'ingot', characterId: 'blacksmith' },
    { id: 'ironmongery', characterId: 'blacksmith' },
];

// ── Generators ────────────────────────────────────────────────
// Passive per-second income sources, aggregated per resource by
// PerSecondCalculatorService. None registered yet — Gold is manual-click-only via the
// Fighter's button, and Herbs/Kobold Ears stay locked until a real system produces them.

export interface GeneratorConfig {
    id: string;
    resourceId: string;
    label: string;
    ratePerSecond: number;
}

export const GENERATORS: GeneratorConfig[] = [];

// ── Character actions ─────────────────────────────────────────
// The resource + amount each character's primary button yields per click/hold-tick.

export interface CharacterActionConfig {
    /** Stable key for statistics (action press counts) and ACTION_FLAVOR — not shown
     *  to the player directly. */
    id: string;
    characterId: string;
    resourceId: string;
    amountPerAction: number;
}

export const CHARACTER_ACTIONS: CharacterActionConfig[] = [
    { id: 'fighter-hard-labor', characterId: 'fighter', resourceId: 'gold', amountPerAction: 1 },
    { id: 'ranger-cut-bait', characterId: 'ranger', resourceId: 'bait', amountPerAction: 1 },
    { id: 'blacksmith-mine-ore', characterId: 'blacksmith', resourceId: 'ore', amountPerAction: 1 },
];

// ── Timed actions ─────────────────────────────────────────────
// A character's "secondary" button: click to start a fixed-duration timer, collect the
// reward once it finishes. Unlike CHARACTER_ACTIONS (instant), running state is a start
// timestamp, so it keeps counting down (and finishes on time) no matter what screen the
// player is on, or even across a reload — see TimedActionsService. `unlockKey` gates
// visibility the same way GameAreaComponent gates minigames off UNLOCKS.

// How often TimedActionsService checks for completion *and* how often the progress bar
// re-renders (ButtonZoneComponent) — one constant so the two can never drift apart.
// Deliberately its own fast interval rather than GameLoopService's 1s tick: piggybacking
// on that shared tick meant the fill could sit at 100% width for up to a second before
// the action actually completed (button re-enable, payout) — a visible "hang" at the
// end. A handful of timed actions polled every 100ms is cheap regardless, unlike the
// per-resource generator sweep GameLoopService exists to keep O(active generators) for.
export const TIMED_ACTION_TICK_MS = 100;

export type TimedActionDuration =
    | { type: 'fixed'; ms: number }
    /** A value in [minMs, maxMs] is rolled once when the timer starts (see
     *  TimedActionsService) and stored alongside the start timestamp, rather than being
     *  re-rolled — the roll must be unknown to the player (e.g. Bait Trap) but stable and
     *  reload-safe for the run it belongs to. `timed-action-duration` upgrades still
     *  apply live on top of the rolled value, same as they do for a 'fixed' duration. */
    | { type: 'random'; minMs: number; maxMs: number };

export interface TimedActionConfig {
    id: string;
    characterId: string;
    duration: TimedActionDuration;
    /** Resource consumed the instant the timer starts — undefined for a free-to-start
     *  action like Guild Contract. `TimedActionsService.start` no-ops if unaffordable. */
    cost?: { resourceId: string; amount: number };
    reward: { resourceId: string; amount: number };
    /** A second, independently-rolled reward alongside `reward` — e.g. Bait Trap's chance
     *  at a Pelt. `chance` is a fraction (0.1 = 10%) that a 'bonus-reward-chance' upgrade
     *  can push over 1.0 — see the "excess percent" cascade in shared/chance.ts. */
    bonusReward?: { resourceId: string; chance: number };
    /** When true, the timer elapsing doesn't pay out automatically — the button instead
     *  enters a "ready" state (TimedActionFlavor.readyLabel) and the player must click
     *  again to collect. Guild Contract leaves this unset (auto-completes, the original
     *  behavior); Bait Trap sets it since "Collect Prey" is an explicit second click. */
    requiresCollection?: boolean;
    /** Undefined means always visible once the owning character is selectable — same
     *  "no gate" meaning CharacterActionConfig has by omitting the field entirely. */
    unlockKey?: keyof typeof UNLOCKS;
}

export const TIMED_ACTIONS: TimedActionConfig[] = [
    {
        id: 'fighter-guild-contract',
        characterId: 'fighter',
        duration: { type: 'fixed', ms: 10_000 },
        reward: { resourceId: 'gold', amount: 15 },
        unlockKey: 'guildContract',
    },
    {
        id: 'ranger-bait-trap',
        characterId: 'ranger',
        duration: { type: 'random', minMs: 5_000, maxMs: 20_000 },
        cost: { resourceId: 'bait', amount: 1 },
        reward: { resourceId: 'raw-meat', amount: 1 },
        bonusReward: { resourceId: 'pelt', chance: 0.1 },
        requiresCollection: true,
    },
];

// ── Crafting actions (Blacksmith's third+ buttons) ────────────
// Unlike CHARACTER_ACTIONS (instant) or TIMED_ACTIONS (passive real-time wait that keeps
// running unattended), a crafting action needs sustained, active player engagement to
// complete — see CraftingService (src/app/crafting/). Two mechanics so far, a
// discriminated union on `mechanic.type`:
//  - 'hold': charge a progress meter by holding the button down over `holdMs`.
//    Releasing before it fills drains it back down at `decayMultiplier`x the charge
//    rate rather than pausing in place — a skill/patience mechanic, not "start and walk
//    away." `holdMs` is meant to be shortenable by a future upgrade (not yet
//    implemented) the same way `timed-action-duration` shortens a TimedActionConfig's
//    duration — kept as plain config data now so that slots in later without a reshape.
//  - 'clicks': the button must be clicked `clicksRequired` times to complete; progress
//    is a plain step counter, not time-based, and never decays while idle.
// `cost` is charged once, the moment progress first leaves 0 — not per click/tick — and
// `reward` pays out only once progress reaches its target.
export type CraftingMechanic =
    | { type: 'hold'; holdMs: number; decayMultiplier: number }
    | { type: 'clicks'; clicksRequired: number };

export interface CraftingActionConfig {
    id: string;
    characterId: string;
    mechanic: CraftingMechanic;
    cost: { resourceId: string; amount: number };
    reward: { resourceId: string; amount: number };
}

export const CRAFTING_ACTIONS: CraftingActionConfig[] = [
    {
        id: 'blacksmith-forge-ingots',
        characterId: 'blacksmith',
        mechanic: { type: 'hold', holdMs: 10_000, decayMultiplier: 3 },
        cost: { resourceId: 'ore', amount: 10 },
        reward: { resourceId: 'ingot', amount: 1 },
    },
    {
        id: 'blacksmith-smith-metal',
        characterId: 'blacksmith',
        mechanic: { type: 'clicks', clicksRequired: 10 },
        cost: { resourceId: 'ingot', amount: 10 },
        reward: { resourceId: 'ironmongery', amount: 1 },
    },
];

// ── Upgrades ──────────────────────────────────────────────────
// Purchased with a resource, leveled 0..maxLevel. Cost rises each level already owned:
// cost(level) = ceil(baseCost * costScalingFactor^level). Effects are their own union
// so an upgrade can target something other than a character action (e.g. a generator's
// rate) later without reshaping this again — see UpgradesService for how each effect
// type is resolved.

export type UpgradeEffect =
    | { type: 'action-amount'; actionId: string; amountPerLevel: number }
    | { type: 'generator-rate'; generatorId: string; ratePerLevel: number }
    /** Flat bonus added to a timed action's payout, per level (e.g. Guild Contract gold). */
    | { type: 'timed-action-yield'; timedActionId: string; amountPerLevel: number }
    /** Multiplicative decay on a timed action's duration: durationMs *=
     *  (1 - decayPerLevel) ^ level. Deliberately not a flat "-Nms per level" — that
     *  would hit zero/negative at high levels. Decaying toward (never reaching) zero is
     *  what makes each additional level a smaller absolute improvement than the last,
     *  i.e. real diminishing returns, while still reading as "~1s faster" at level 1 for
     *  a decayPerLevel tuned to roughly 1/durationMs. */
    | { type: 'timed-action-duration'; timedActionId: string; decayPerLevel: number }
    /** Chance per level to double whatever gold amount an action just paid out — rolled
     *  independently at the moment each listed action grants its reward, not baked into
     *  the base amount. Clamped to 100% total across every upgrade targeting the same
     *  action id (see UpgradesService.getPayoutDoubleChance). */
    | { type: 'payout-double-chance'; targetActionIds: string[]; chancePerLevel: number }
    /** Chance per level to double an action's yield, uncapped — unlike
     *  'payout-double-chance' above, going over 100% guarantees a double and rolls the
     *  excess percent for another (see shared/chance.ts's resolveExcessCount and
     *  UpgradesService.getCascadingDoubleChance). Better Offcuts (Cut Bait) uses this. */
    | { type: 'cascading-double-chance'; targetActionIds: string[]; chancePerLevel: number }
    /** Chance per level added on top of a TimedActionConfig.bonusReward's base chance,
     *  uncapped and cascading the same "excess percent" way as 'cascading-double-chance'
     *  above (see TimedActionsService.payout). Clean Traps (Bait Trap's Pelt) uses this. */
    | { type: 'bonus-reward-chance'; timedActionId: string; chancePerLevel: number };

export interface UpgradeConfig {
    id: string;
    /** Which character this upgrade belongs to — an upgrade always targets one
     *  character's action/mechanic, so the Upgrades panel filters to whichever character
     *  is currently active, same as the Button Zone does for CHARACTER_ACTIONS/TIMED_ACTIONS. */
    characterId: string;
    resourceId: string;
    baseCost: number;
    /** Multiplies the cost per level already owned. 1.15 is a common incremental-game
     *  default (a "Cookie Clicker"-style curve) — tune freely per upgrade. */
    costScalingFactor: number;
    maxLevel: number;
    /** Whether this upgrade is visible/purchasable from the very start of the game, as
     *  opposed to hidden until some `ObjectiveReward` of type 'upgrade' unlocks it (see
     *  UpgradesService.unlock) — same "starts unlocked" meaning as CharacterConfig.unlocked. */
    unlocked: boolean;
    effect: UpgradeEffect;
}

export const UPGRADES: UpgradeConfig[] = [
    {
        id: 'hard-work',
        characterId: 'fighter',
        resourceId: 'gold',
        baseCost: 10,
        costScalingFactor: 1.15,
        maxLevel: 100,
        unlocked: true,
        effect: { type: 'action-amount', actionId: 'fighter-hard-labor', amountPerLevel: 1 },
    },
    // The next three unlock together as a reward for the "Work 15 times" objective (see
    // OBJECTIVES below) — hidden from the Upgrades panel until then, same "invisible
    // until unlocked" treatment Character Select gives a locked character.
    {
        id: 'high-quality-contracts',
        characterId: 'fighter',
        resourceId: 'gold',
        baseCost: 100,
        costScalingFactor: 1.15,
        maxLevel: 100,
        unlocked: false,
        effect: { type: 'timed-action-yield', timedActionId: 'fighter-guild-contract', amountPerLevel: 5 },
    },
    {
        id: 'faster-contracts',
        characterId: 'fighter',
        resourceId: 'gold',
        baseCost: 500,
        costScalingFactor: 1.6,
        maxLevel: 10,
        unlocked: false,
        // 0.1 decay/level on Guild Contract's 10s base duration ≈ -1s at level 1
        // (10s -> 9s), then diminishing every level after — see UpgradeEffect's doc above.
        effect: { type: 'timed-action-duration', timedActionId: 'fighter-guild-contract', decayPerLevel: 0.1 },
    },
    {
        id: 'bonus-payout',
        characterId: 'fighter',
        resourceId: 'gold',
        baseCost: 1000,
        costScalingFactor: 1.6,
        maxLevel: 10,
        unlocked: false,
        effect: {
            type: 'payout-double-chance',
            targetActionIds: ['fighter-hard-labor', 'fighter-guild-contract'],
            chancePerLevel: 0.1,
        },
    },
    // The next three unlock together as a reward for "unlock-ranger" below — same
    // all-at-once treatment as work-15-times' three Fighter upgrades, hidden until then
    // so they don't spoil Ranger mechanics before the character even exists.
    {
        id: 'better-offcuts',
        characterId: 'ranger',
        resourceId: 'gold',
        baseCost: 15,
        costScalingFactor: 1.15,
        maxLevel: 100,
        unlocked: false,
        effect: { type: 'cascading-double-chance', targetActionIds: ['ranger-cut-bait'], chancePerLevel: 0.05 },
    },
    {
        id: 'extra-baiting',
        characterId: 'ranger',
        resourceId: 'bait',
        baseCost: 20,
        costScalingFactor: 1.15,
        maxLevel: 100,
        unlocked: false,
        effect: { type: 'timed-action-yield', timedActionId: 'ranger-bait-trap', amountPerLevel: 1 },
    },
    {
        id: 'clean-traps',
        characterId: 'ranger',
        resourceId: 'gold',
        baseCost: 50,
        costScalingFactor: 1.2,
        maxLevel: 100,
        unlocked: false,
        effect: { type: 'bonus-reward-chance', timedActionId: 'ranger-bait-trap', chancePerLevel: 0.05 },
    },
];

// ── Autoclick ─────────────────────────────────────────────────
// Base time (ms) between repeats while a button is held down. Upgrades will lower this
// later via a multiplier on top of this base rather than editing the constant directly.

export const AUTOCLICK_INTERVAL_MS = 1000;

// ── Objectives ────────────────────────────────────────────────
// Discriminated union on `type` — "acquire N of a resource" and "perform N actions"
// (any action counted by StatisticsService, not one specific character/button, so this
// stays meaningful as more characters/actions are added) are both implemented.
// Reaching an objective's target makes it claimable, not completed — the player must
// click it (ObjectivesService.claim) to actually collect the reward.
//
// Rewards are a *list*, not a single value, because one objective can unlock several
// things at once (see "Work 15 times" below: a system unlock plus three upgrades) —
// each entry is still its own single-purpose ObjectiveReward, same union as before.
// 'upgrade' now does something real (UpgradesService.unlock) now that upgrades have a
// real locked/unlocked concept — see AGENTS.md.

export type ObjectiveReward =
    | { type: 'character'; characterId: string }
    | { type: 'system'; systemId: keyof typeof UNLOCKS }
    | { type: 'upgrade'; upgradeId: string };

// `prerequisiteCharacterId`, common to every variant, is what lets an objective stay
// hidden until another one's character reward has actually been claimed — e.g.
// "unlock-blacksmith" has no reason to appear before Ranger (and Bait Trap) even exist.
// Undefined means always available, same "no gate" meaning omitting a field has
// elsewhere in these configs (TimedActionConfig.unlockKey, etc). See ObjectivesService
// for how this is enforced (filtered out of `.objectives` and skipped in `evaluateAll`,
// same "invisible until unlocked" precedent as a locked character/upgrade) and
// ObjectivesService.applyReward for the "just became available" attention re-shine.
export type ObjectiveConfig =
    | {
        id: string;
        type: 'resource-threshold';
        resourceId: string;
        targetAmount: number;
        rewards?: ObjectiveReward[];
        prerequisiteCharacterId?: string;
    }
    | {
        id: string;
        type: 'action-count';
        targetCount: number;
        rewards?: ObjectiveReward[];
        prerequisiteCharacterId?: string;
    }
    // Like 'action-count', but scoped to one specific action id rather than summed
    // across every recorded action — e.g. "collect prey 25 times" must count only
    // ranger-bait-trap's own completions, not Hard Labor/Cut Bait/etc mixed in.
    | {
        id: string;
        type: 'specific-action-count';
        actionId: string;
        targetCount: number;
        rewards?: ObjectiveReward[];
        prerequisiteCharacterId?: string;
    };

// Order here is display order in the Objectives panel — "Work 15 times" is meant to be
// the very first thing a new player sees and completes.
export const OBJECTIVES: ObjectiveConfig[] = [
    {
        id: 'work-15-times',
        type: 'action-count',
        targetCount: 15,
        rewards: [
            { type: 'system', systemId: 'guildContract' },
            { type: 'upgrade', upgradeId: 'high-quality-contracts' },
            { type: 'upgrade', upgradeId: 'faster-contracts' },
            { type: 'upgrade', upgradeId: 'bonus-payout' },
        ],
    },
    {
        id: 'unlock-ranger',
        type: 'resource-threshold',
        resourceId: 'gold',
        targetAmount: 1000,
        rewards: [
            { type: 'character', characterId: 'ranger' },
            { type: 'upgrade', upgradeId: 'better-offcuts' },
            { type: 'upgrade', upgradeId: 'extra-baiting' },
            { type: 'upgrade', upgradeId: 'clean-traps' },
        ],
    },
    {
        id: 'unlock-blacksmith',
        type: 'specific-action-count',
        actionId: 'ranger-bait-trap',
        targetCount: 10,
        prerequisiteCharacterId: 'ranger',
        rewards: [{ type: 'character', characterId: 'blacksmith' }],
    },
    {
        id: 'craft-10-ironmongery',
        type: 'resource-threshold',
        resourceId: 'ironmongery',
        targetAmount: 1,
        prerequisiteCharacterId: 'blacksmith',
        rewards: [{ type: 'system', systemId: 'minigames' }],
    },
];

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
  | 'weapon'
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
  { id: 'weapon', slotType: 'weapon', label: 'Weapon' },
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
  {
    id: 'basic-sword',
    slotType: 'weapon',
    rarity: 'common',
    effects: [{ type: 'stat-bonus', stat: 'strength', amount: 1 }],
  },
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
];

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
