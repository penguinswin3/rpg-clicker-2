// Cosmetic/flavor values — names, colors, symbols, decorative art. Game values
// (costs, unlock requirements, resource yields, relations) belong in game-config.ts instead.

export interface CharacterFlavor {
  label: string;
  color: string;
}

export const CHARACTER_FLAVOR: Record<string, CharacterFlavor> = {
  fighter: { label: 'Fighter', color: 'rgb(204, 119, 21)' },
  ranger: { label: 'Ranger', color: '#0f0' },
};

const DEFAULT_CHARACTER_FLAVOR: CharacterFlavor = { label: '', color: '#444' };

/** Flavor for a character id, falling back to a blank/gray look for a character that
 *  doesn't have flavor data yet. */
export function getCharacterFlavor(id: string): CharacterFlavor {
  return CHARACTER_FLAVOR[id] ?? DEFAULT_CHARACTER_FLAVOR;
}

export interface ActionFlavor {
  /** Title shown on the button. */
  label: string;
  /** Flavor sentence logged (INFO level) each time the action fires — the numeric
   *  gain is appended separately as a colored currency token, see ButtonZoneComponent. */
  logMessage: string;
}

// Keyed by CharacterActionConfig.id (game-config.ts), not characterId — a character
// could have more than one action some day, so this can't assume a 1:1 relationship.
export const ACTION_FLAVOR: Record<string, ActionFlavor> = {
  'fighter-hard-labor': {
    label: 'Hard Labor',
    logMessage: "You put in a hard day's work and earn some gold.",
  },
  'ranger-cut-bait': {
    label: 'Cut Bait',
    logMessage: 'You slice up scraps into fresh bait.',
  },
};

const DEFAULT_ACTION_FLAVOR: ActionFlavor = { label: '', logMessage: '' };

export function getActionFlavor(actionId: string): ActionFlavor {
  return ACTION_FLAVOR[actionId] ?? DEFAULT_ACTION_FLAVOR;
}

export interface UpgradeFlavor {
  label: string;
  description: string;
  /** Flavor sentence logged (INFO level) each time the upgrade is purchased — same
   *  convention as ActionFlavor.logMessage, see ButtonZoneComponent/UpgradesPanelComponent. */
  logMessage: string;
}

// Keyed by UpgradeConfig.id (game-config.ts).
export const UPGRADE_FLAVOR: Record<string, UpgradeFlavor> = {
  'hard-work': {
    label: 'Hard Work',
    description: '+1 Gold per Hard Labor click.',
    logMessage: 'You toughen up, putting more muscle behind every swing of Hard Labor.',
  },
  'high-quality-contracts': {
    label: 'High Quality Contracts',
    description: '+5 Gold per Guild Contract payout, per level.',
    logMessage: 'You negotiate better terms with the guild, padding out every contract payout.',
  },
  'faster-contracts': {
    label: 'Faster Contracts',
    description: 'Shortens Guild Contract duration per level, with diminishing returns.',
    logMessage: 'You streamline your paperwork with the guild, shaving time off every contract.',
  },
  'bonus-payout': {
    label: 'Bonus Payout',
    description: '+10% chance per level to double the gold from Hard Labor or a Guild Contract.',
    logMessage: "You've built a reputation that occasionally earns you a little extra.",
  },
  'better-offcuts': {
    label: 'Better Offcuts',
    description:
      "+5% chance per level to double Cut Bait's yield — over 100% guarantees a double and rolls the remainder for another.",
    logMessage: 'You learn to carve bait more efficiently, stretching every cut further.',
  },
  'extra-baiting': {
    label: 'Extra Baiting',
    description: '+1 Raw Meat per Bait Trap collection, per level.',
    logMessage: 'You rig your traps with richer bait, luring in bigger catches.',
  },
  'clean-traps': {
    label: 'Clean Traps',
    description:
      '+5% chance per level of a Pelt from Bait Trap — over 100% guarantees one and rolls the remainder for another.',
    logMessage: 'You keep your traps meticulously clean, preserving hides that would otherwise be ruined.',
  },
};

const DEFAULT_UPGRADE_FLAVOR: UpgradeFlavor = { label: '', description: '', logMessage: '' };

export function getUpgradeFlavor(id: string): UpgradeFlavor {
  return UPGRADE_FLAVOR[id] ?? DEFAULT_UPGRADE_FLAVOR;
}

export interface ObjectiveFlavor {
  /** Only used by 'action-count' objectives — the verb phrase before "N times", e.g.
   *  "Work" -> "Work 15 times". 'resource-threshold' objectives build their own
   *  "Obtain N <symbol>" text from RESOURCE_FLAVOR instead and don't need this. */
  verb?: string;
  /** Logged (INFO level) the moment the player clicks to claim this objective's reward. */
  logMessage: string;
}

// Keyed by ObjectiveConfig.id (game-config.ts).
export const OBJECTIVE_FLAVOR: Record<string, ObjectiveFlavor> = {
  'work-15-times': {
    verb: 'Work',
    logMessage: 'You report back to the guild for your effort and they open up a new contract for you.',
  },
  'unlock-ranger': {
    logMessage: 'Word of your gold spreads, and a wandering Ranger offers to join you.',
  },
};

const DEFAULT_OBJECTIVE_FLAVOR: ObjectiveFlavor = { logMessage: '' };

export function getObjectiveFlavor(id: string): ObjectiveFlavor {
  return OBJECTIVE_FLAVOR[id] ?? DEFAULT_OBJECTIVE_FLAVOR;
}

export interface TimedActionFlavor {
  /** Title shown on the button by default. */
  label: string;
  /** Shown instead of `label` while the timer is counting down — falls back to `label`
   *  if unset (Guild Contract keeps its name up the whole time, just disabled + filled). */
  runningLabel?: string;
  /** Shown instead of `label` once the timer has elapsed and the player must click again
   *  to collect (`TimedActionConfig.requiresCollection`) — falls back to `label` if unset. */
  readyLabel?: string;
  /** Flavor sentence logged (INFO level) when the reward pays out — on completion for an
   *  auto-completing action, on collection for one that `requiresCollection`. */
  logMessage: string;
}

// Keyed by TimedActionConfig.id (game-config.ts).
export const TIMED_ACTION_FLAVOR: Record<string, TimedActionFlavor> = {
  'fighter-guild-contract': {
    label: 'Guild Contract',
    logMessage: 'You complete your Fighter Guild contract and are rewarded for a job well done.',
  },
  'ranger-bait-trap': {
    label: 'Bait Trap',
    // No trailing dots here — ButtonZoneComponent cycles 1-3 of its own on a timer
    // (Bait Trap's random duration is hidden from the player, see TimedActionConfig.duration,
    // so this is a "still working" pulse rather than a real progress readout).
    runningLabel: 'Waiting',
    readyLabel: 'Collect Prey',
    logMessage: 'You check your trap and haul in the catch.',
  },
};

const DEFAULT_TIMED_ACTION_FLAVOR: TimedActionFlavor = { label: '', logMessage: '' };

export function getTimedActionFlavor(id: string): TimedActionFlavor {
  return TIMED_ACTION_FLAVOR[id] ?? DEFAULT_TIMED_ACTION_FLAVOR;
}

export interface ResourceFlavor {
  name: string;
  color: string;
  symbol: string;
}

// Symbols are plain Unicode text glyphs, never emoji — see AGENTS.md's "No emojis, ever" rule.
export const RESOURCE_FLAVOR: Record<string, ResourceFlavor> = {
  'gold': { name: 'GOLD', color: '#ffd700', symbol: 'ᱛ' },
  'herbs': { name: 'HERBS', color: '#0f0', symbol: '§' },
  'kobold-ears': { name: 'KOBOLD EARS', color: '#f44', symbol: '<' },
  'bait': { name: 'BAIT', color: '#c9974a', symbol: '~' },
  'raw-meat': { name: 'RAW MEAT', color: '#e0654c', symbol: '¤' },
  'pelt': { name: 'PELT', color: '#9b8267', symbol: '‡' },
};

export const GAME_TITLE_ASCII =
  `  ___ ___  ___    ___ _    ___ ___ _  _____ ___   ___
 | _ \\ _ \\/ __|  / __| |  |_ _/ __| |/ / __| _ \\ |_  )
 |   /  _/ (_ | | (__| |__ | | (__| ' <| _||   /  / /
 |_|_\\_|  \\___|  \\___|____|___\\___|_|\\_\\___|_|\\_\\ /___|`;
