const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi'];

/** Abbreviates large numbers (e.g. 2147000000 -> "2.147B"). Placeholder formatting until
 *  the real numbers/economy system defines its own scaling rules. */
export function formatAmount(value: number): string {
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  if (abs < 1000) {
    return sign + (Number.isInteger(abs) ? abs.toString() : abs.toFixed(1));
  }

  const tier = Math.min(Math.floor(Math.log10(abs) / 3), SUFFIXES.length - 1);
  const scaled = abs / Math.pow(1000, tier);
  return sign + scaled.toFixed(3).replace(/0+$/, '').replace(/\.$/, '') + SUFFIXES[tier];
}

/** Formats a per-second rate with an explicit sign, e.g. "+55M/s" / "-1M/s". */
export function formatRate(value: number): string {
  const magnitude = formatAmount(Math.abs(value));
  return (value < 0 ? '-' : '+') + magnitude + '/s';
}

/** Formats a one-off gain/loss with an explicit sign, e.g. "+1" / "-3" — for log
 *  messages and other single-event deltas (as opposed to formatRate's "/s" rates). */
export function formatSigned(value: number): string {
  return (value < 0 ? '' : '+') + formatAmount(value);
}

/** Formats a millisecond duration compactly for display, e.g. 10000 -> "10s",
 *  9500 -> "9.5s" — rounds to one decimal place and drops a redundant trailing ".0"
 *  rather than always showing one. Used by tooltips to show a timed/crafting action's
 *  effective duration (see TooltipDirective consumers). */
export function formatDurationMs(ms: number): string {
  const rounded = Math.round(ms / 100) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}s`;
}
