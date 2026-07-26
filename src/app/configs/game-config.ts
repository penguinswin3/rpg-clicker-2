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
];

// ── Upgrades ──────────────────────────────────────────────────
// Purchased with a resource, leveled 0..maxLevel. Cost rises each level already owned:
// cost(level) = ceil(baseCost * costScalingFactor^level). Effects are their own union
// so an upgrade can target something other than a character action (e.g. a generator's
// rate) later without reshaping this again — see UpgradesService for how each effect
// type is resolved.

export type UpgradeEffect =
    | { type: 'action-amount'; actionId: string; amountPerLevel: number }
    | { type: 'generator-rate'; generatorId: string; ratePerLevel: number };

export interface UpgradeConfig {
    id: string;
    resourceId: string;
    baseCost: number;
    /** Multiplies the cost per level already owned. 1.15 is a common incremental-game
     *  default (a "Cookie Clicker"-style curve) — tune freely per upgrade. */
    costScalingFactor: number;
    maxLevel: number;
    effect: UpgradeEffect;
}

export const UPGRADES: UpgradeConfig[] = [
    {
        id: 'hard-work',
        resourceId: 'gold',
        baseCost: 10,
        costScalingFactor: 1.15,
        maxLevel: 100,
        effect: { type: 'action-amount', actionId: 'fighter-hard-labor', amountPerLevel: 1 },
    },
];

// ── Autoclick ─────────────────────────────────────────────────
// Base time (ms) between repeats while a button is held down. Upgrades will lower this
// later via a multiplier on top of this base rather than editing the constant directly.

export const AUTOCLICK_INTERVAL_MS = 1000;

// ── Objectives ────────────────────────────────────────────────
// "Acquire N of a resource" is the only objective type implemented so far — a
// discriminated union (purchase-N-upgrades, click-N-times, etc.) can extend this
// later per the original Objectives spec.
//
// Rewards are their own union because completing an objective won't always unlock a
// character — sometimes it'll be a system (Jacks/Crown/minigames) or an upgrade
// instead. 'system'/'upgrade' are typed now but stubbed at the point of use
// (ObjectivesService.applyReward) since UNLOCKS isn't runtime-toggleable yet and
// there's no upgrade data model yet either — see AGENTS.md §6.

export type ObjectiveReward =
    | { type: 'character'; characterId: string }
    | { type: 'system'; systemId: keyof typeof UNLOCKS }
    | { type: 'upgrade'; upgradeId: string };

export interface ObjectiveConfig {
    id: string;
    resourceId: string;
    targetAmount: number;
    reward?: ObjectiveReward;
}

export const OBJECTIVES: ObjectiveConfig[] = [
    { id: 'unlock-ranger', resourceId: 'gold', targetAmount: 100, reward: { type: 'character', characterId: 'ranger' } },
];
