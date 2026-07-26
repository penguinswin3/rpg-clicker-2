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
};

const DEFAULT_UPGRADE_FLAVOR: UpgradeFlavor = { label: '', description: '', logMessage: '' };

export function getUpgradeFlavor(id: string): UpgradeFlavor {
  return UPGRADE_FLAVOR[id] ?? DEFAULT_UPGRADE_FLAVOR;
}

export interface ResourceFlavor {
  name: string;
  color: string;
  symbol: string;
}

export const RESOURCE_FLAVOR: Record<string, ResourceFlavor> = {
  'gold': { name: 'GOLD', color: '#ffd700', symbol: 'G' },
  'herbs': { name: 'HERBS', color: '#0f0', symbol: 'H' },
  'kobold-ears': { name: 'KOBOLD EARS', color: '#f44', symbol: 'K' },
};

export const GAME_TITLE_ASCII =
  `  ___ ___  ___    ___ _    ___ ___ _  _____ ___   ___
 | _ \\ _ \\/ __|  / __| |  |_ _/ __| |/ / __| _ \\ |_  )
 |   /  _/ (_ | | (__| |__ | | (__| ' <| _||   /  / /
 |_|_\\_|  \\___|  \\___|____|___\\___|_|\\_\\___|_|\\_\\ /___|`;
