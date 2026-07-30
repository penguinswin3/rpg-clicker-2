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

/** 1d20 + effective DEX for each side; the higher total acts first. A tie favors the
 *  Fighter, mirroring "tie goes to the attacker" — the Fighter is the one who initiated
 *  the encounter. */
export function rollInitiative(fighter: CombatCombatant, enemy: CombatCombatant): 'fighter' | 'enemy' {
  const fighterRoll = rollD20() + fighter.stats.dexterity;
  const enemyRoll = rollD20() + enemy.stats.dexterity;
  return enemyRoll > fighterRoll ? 'enemy' : 'fighter';
}

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
