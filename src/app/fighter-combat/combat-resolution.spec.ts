import {
  CombatCombatant,
  resolveAttack,
  resolveTurn,
  rollDamage,
  rollInitiative,
  rollsFollowUpAttack,
} from './combat-resolution';

function combatant(overrides: Partial<CombatCombatant> = {}): CombatCombatant {
  return {
    stats: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
    hp: 100,
    bonusDamage: 0,
    damageReduction: 0,
    extraAttackChance: 0,
    ...overrides,
  };
}

describe('rollDamage', () => {
  it('returns 1 when Math.random returns 0', () => {
    spyOn(Math, 'random').and.returnValue(0);
    expect(rollDamage(15)).toBe(1);
  });

  it('returns strength when Math.random returns just under 1', () => {
    spyOn(Math, 'random').and.returnValue(0.9999999);
    expect(rollDamage(15)).toBe(15);
  });
});

describe('rollInitiative', () => {
  it('picks whichever side rolled higher', () => {
    spyOn(Math, 'random').and.returnValues(0.1, 0.9); // fighter d20 low, enemy d20 high
    const fighter = combatant();
    const enemy = combatant();
    expect(rollInitiative(fighter, enemy)).toBe('enemy');
  });

  it('a tie favors the fighter', () => {
    spyOn(Math, 'random').and.returnValue(0.5); // identical roll both sides
    const fighter = combatant();
    const enemy = combatant();
    expect(rollInitiative(fighter, enemy)).toBe('fighter');
  });
});

describe('resolveAttack', () => {
  it('is a hit when the attack roll is greater than or equal to the defense roll', () => {
    // attacker d20=19 (+10=29), defender d20=1 (+10=11), then a damage roll (any hit
    // needs a 3rd Math.random() call inside rollDamage — omitting it leaves the damage
    // math NaN once the mock sequence is exhausted).
    spyOn(Math, 'random').and.returnValues(0.9, 0, 0.999);
    const attacker = combatant();
    const defender = combatant();
    const result = resolveAttack('fighter', attacker, defender, false);
    expect(result.hit).toBeTrue();
    expect(defender.hp).toBeLessThan(100);
  });

  it('a tie is a hit (favors the attacker)', () => {
    spyOn(Math, 'random').and.returnValue(0.5); // identical roll both sides -> equal totals
    const attacker = combatant();
    const defender = combatant();
    const result = resolveAttack('fighter', attacker, defender, false);
    expect(result.hit).toBeTrue();
  });

  it("a miss leaves the defender's hp untouched", () => {
    spyOn(Math, 'random').and.returnValues(0, 0.9); // attacker d20=1, defender d20=19
    const attacker = combatant();
    const defender = combatant();
    const result = resolveAttack('fighter', attacker, defender, false);
    expect(result.hit).toBeFalse();
    expect(result.damage).toBeUndefined();
    expect(defender.hp).toBe(100);
  });

  it('damage is floored at a minimum of 1 even with high damage reduction', () => {
    // attacker d20=19, defender d20=1 (hit), damage roll near-max
    spyOn(Math, 'random').and.returnValues(0.9, 0, 0.999);
    const attacker = combatant();
    const defender = combatant({ damageReduction: 0.99 });
    const result = resolveAttack('fighter', attacker, defender, false);
    expect(result.hit).toBeTrue();
    expect(result.damage).toBe(1);
  });

  it('adds bonusDamage on top of the rolled amount before applying reduction', () => {
    // attacker d20=19, defender d20=1 (hit), damage roll at max (10 at strength 10)
    spyOn(Math, 'random').and.returnValues(0.9, 0, 0.999);
    const attacker = combatant({ bonusDamage: 5 });
    const defender = combatant();
    const result = resolveAttack('fighter', attacker, defender, false);
    expect(result.damage).toBe(15); // 10 (max roll at str 10) + 5 bonus
  });
});

describe('rollsFollowUpAttack', () => {
  it('returns false when extraAttackChance is 0', () => {
    spyOn(Math, 'random').and.returnValue(0);
    expect(rollsFollowUpAttack(combatant({ extraAttackChance: 0 }))).toBeFalse();
  });

  it('returns true when the roll lands under the chance', () => {
    spyOn(Math, 'random').and.returnValue(0.01);
    expect(rollsFollowUpAttack(combatant({ extraAttackChance: 0.05 }))).toBeTrue();
  });

  it('returns false when the roll lands over the chance', () => {
    spyOn(Math, 'random').and.returnValue(0.5);
    expect(rollsFollowUpAttack(combatant({ extraAttackChance: 0.05 }))).toBeFalse();
  });
});

describe('resolveTurn', () => {
  it('resolves exactly one attack when the attacker has no follow-up chance', () => {
    // hit (attacker d20=19, defender d20=1), damage roll, then the follow-up chance's
    // own Math.random() call (resolveExcessCount always consumes one, even at chance 0)
    spyOn(Math, 'random').and.returnValues(0.9, 0, 0.5, 0.5);
    const attacker = combatant(); // extraAttackChance defaults to 0
    const defender = combatant();
    const results = resolveTurn('fighter', attacker, defender);
    expect(results.length).toBe(1);
    expect(results[0].followUp).toBeFalse();
  });

  it('chains a follow-up attack when the proc succeeds, marking it as such', () => {
    spyOn(Math, 'random').and.returnValues(
      0.9, 0, 0.5, 0.01, // attack 1: hit, damage, follow-up proc succeeds
      0.9, 0, 0.5, 0.9   // attack 2 (follow-up): hit, damage, follow-up proc fails -> stop
    );
    const attacker = combatant({ extraAttackChance: 0.05 });
    const defender = combatant({ hp: 1000 }); // plenty of hp so it doesn't die mid-chain
    const results = resolveTurn('fighter', attacker, defender);
    expect(results.length).toBe(2);
    expect(results[0].followUp).toBeFalse();
    expect(results[1].followUp).toBeTrue();
  });

  it('stops immediately once the defender is defeated, even mid-chain', () => {
    spyOn(Math, 'random').and.returnValues(0.9, 0, 0.999); // hit for max damage (10) against 5 hp
    const attacker = combatant({ extraAttackChance: 0.05 });
    const defender = combatant({ hp: 5 });
    const results = resolveTurn('fighter', attacker, defender);
    expect(results.length).toBe(1);
    expect(defender.hp).toBe(0);
  });
});
