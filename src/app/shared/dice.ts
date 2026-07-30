
/** Uniform random integer in [1, sides], inclusive of both ends. */
export function rollDie(sides: number): number {
  return Math.floor(Math.random() * sides) + 1;
}

/** Shorthand for the d20 roll used throughout Fighter Combat (initiative, to-hit). */
export function rollD20(): number {
  return rollDie(20);
}
