// This file is intended to hold all 'magic numbers' that can be pulled in elsewhere
// These should be grouped logically and use whatever data structures needed to represent this
// Some game balance tweaks might even get split out to other files in the future

export const VERSION = '0.0.1';

export const GAME_TITLE = 'RPG CLICKER 2';

export const DEV_TOOLS_ENABLED = true;

export const MAX_LOG_MESSAGES = 500;

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

export const CHARACTERS: CharacterConfig[] = [
  { id: 'fighter', unlocked: true },
  { id: 'ranger',  unlocked: true },
  { id: 'slot-3',  unlocked: false },
  { id: 'slot-4',  unlocked: false },
  { id: 'slot-5',  unlocked: false },
  { id: 'slot-6',  unlocked: false },
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
  { id: 'gold',        characterId: 'fighter' },
  { id: 'herbs',       characterId: 'ranger' },
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
  characterId: string;
  resourceId: string;
  amountPerAction: number;
}

export const CHARACTER_ACTIONS: CharacterActionConfig[] = [
  { characterId: 'fighter', resourceId: 'gold', amountPerAction: 1 },
];

// ── Autoclick ─────────────────────────────────────────────────
// Base time (ms) between repeats while a button is held down. Upgrades will lower this
// later via a multiplier on top of this base rather than editing the constant directly.

export const AUTOCLICK_INTERVAL_MS = 1000;