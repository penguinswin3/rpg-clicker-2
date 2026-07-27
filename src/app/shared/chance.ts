/** Shared "excess percent" cascade for chance-based bonuses that can exceed 100%: a
 *  chance fraction of 1.5 guarantees 1 success and rolls 50% for a 2nd; 2.3 guarantees 2
 *  and rolls 30% for a 3rd, and so on. Used for Better Offcuts' Cut Bait double chance
 *  and Clean Traps' Bait Trap pelt chance (see UpgradesService/TimedActionsService) —
 *  distinct from the simpler `payout-double-chance` upgrade effect, which just clamps at
 *  100% and rolls once. */
export function resolveExcessCount(chance: number): number {
  const guaranteed = Math.floor(chance);
  const remainder = chance - guaranteed;
  return guaranteed + (Math.random() < remainder ? 1 : 0);
}
