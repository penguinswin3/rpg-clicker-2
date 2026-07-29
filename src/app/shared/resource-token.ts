import { RESOURCE_FLAVOR } from '../configs/flavor-text';
import { formatSigned } from './number-format';

/**
 * Builds the `{{resourceId|displayText}}` log token `ActivityLogComponent.parseLogText`
 * colors with the resource's own accent color (see AGENTS.md "Game action log
 * messages") — factored out here so every place a log message names or amounts a
 * resource goes through the same two builders instead of hand-assembling the token
 * (and forgetting the symbol/color) inline.
 */

/** A signed amount gained/spent, with its symbol — e.g. "+1 ¤". This is the shape every
 *  game action's parenthesized delta already follows. */
export function resourceAmountToken(resourceId: string, amount: number): string {
  const flavor = RESOURCE_FLAVOR[resourceId];
  return `{{${resourceId}|${formatSigned(amount)} ${flavor.symbol}}}`;
}

/** A bare reference to a resource by name, no amount — e.g. "Not enough {{ore|° ORE}}
 *  to start Forge Ingots." — so a log message that just *names* a resource still gets
 *  its symbol + color instead of reading as a colorless plain word. */
export function resourceNameToken(resourceId: string): string {
  const flavor = RESOURCE_FLAVOR[resourceId];
  return `{{${resourceId}|${flavor.symbol} ${flavor.name}}}`;
}
