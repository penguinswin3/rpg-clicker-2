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
