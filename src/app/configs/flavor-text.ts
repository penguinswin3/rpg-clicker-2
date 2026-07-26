// Cosmetic/flavor values — names, colors, symbols, decorative art. Game values
// (costs, unlock requirements, resource yields, relations) belong in game-config.ts instead.

export interface CharacterFlavor {
  label: string;
  color: string;
  /** Title shown on the character's primary button. */
  actionLabel: string;
  /** Flavor sentence logged (INFO level) each time the action fires — the numeric
   *  gain is appended separately as a colored currency token, see ButtonZoneComponent. */
  actionLogMessage: string;
}

export const CHARACTER_FLAVOR: Record<string, CharacterFlavor> = {
  fighter: {
    label: 'Fighter', color: 'rgb(204, 119, 21)',
    actionLabel: 'Hard Labor',
    actionLogMessage: "You put in a hard day's work and earn some gold.",
  },
  ranger: { label: 'Ranger', color: '#0f0', actionLabel: '', actionLogMessage: '' },
};

const DEFAULT_CHARACTER_FLAVOR: CharacterFlavor = {
  label: '', color: '#444', actionLabel: '', actionLogMessage: '',
};

/** Flavor for a character id, falling back to a blank/gray look for locked slots
 *  that don't have a character assigned yet. */
export function getCharacterFlavor(id: string): CharacterFlavor {
  return CHARACTER_FLAVOR[id] ?? DEFAULT_CHARACTER_FLAVOR;
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
