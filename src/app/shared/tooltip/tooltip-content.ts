/** One line of a tooltip's detail list — e.g. `{ label: 'Cost', value: '10 °', color:
 *  '#9a9a9a' }` renders as "Cost" in the default muted label color and "10 °" tinted the
 *  resource's own accent color. `color` is optional — omit it for a plain (uncolored)
 *  detail like a duration or click count that isn't tied to a specific resource. */
export interface TooltipRow {
  label: string;
  value: string;
  color?: string;
}

/** Full content for one `[appTooltip]` — `title` is the button's own name (optional,
 *  falls back to no header line); `rows` is the detail list, top to bottom. An empty
 *  `rows` array means "nothing to show," and `TooltipDirective` skips showing anything
 *  at all rather than rendering an empty box. */
export interface TooltipContent {
  title?: string;
  rows: TooltipRow[];
}
