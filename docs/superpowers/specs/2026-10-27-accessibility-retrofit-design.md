# Accessibility (Screen Reader / Keyboard) Retrofit — Design

**Status:** Approved, ready for implementation planning.
**Scope:** Make every interactive element in the game operable by keyboard and
announced correctly by a screen reader — today almost nothing in the app carries any
ARIA role/label beyond two incidental spots (`[role="tooltip"]`, the top-bar title's
`aria-label`). Establish this as a permanent, checkable requirement (`AGENTS.md`), not a
one-time pass.

## Goals

- Every control a mouse user can activate must also be keyboard-focusable and
  keyboard-activatable, with a screen reader announcing its role, name, and state.
- Fix the gap at the two most-reused components first (`UiModalComponent`,
  `TooltipDirective`) so the fix compounds across every screen that uses them, rather
  than patching each modal/tooltip call site individually.
- Promote custom clickable `<div>`s to real `<button>` elements — this app already
  treats `<button>` as its sole interactive primitive everywhere else (filter bars,
  character select, Dev Tools, combat controls); the handful of exceptions are the gap,
  not a second pattern to design.
- Rare/discrete, already-noteworthy events (the ones the Activity Log already logs above
  `'default'` level) get announced via a live region, without adding new call sites to
  business-logic services.
- An automated accessibility scan (axe-core) in e2e so a future change can't silently
  regress this.

## Non-goals (explicitly deferred)

- **No live announcements for high-frequency/continuous content** — gold ticking up,
  HP during an active fight, running timers. These stay fully readable on demand (real
  DOM text, not canvas/image), just not auto-announced; making them live would spam a
  screen-reader user far worse than it helps.
- **No `role="progressbar"` on fill bars.** Every fill bar (timed-action, crafting,
  objective, combat HP) is a decorative visual reinforcement of information that
  already exists as real adjacent text (the button's own label, `.objective-progress`,
  `.combatant-hp-label`). Adding a second, redundant progressbar semantic is unnecessary
  complexity — the fills instead just get `aria-hidden="true"` so a screen reader never
  tries to describe an empty colored div.
- **No full ARIA `tablist`/roving-tabindex pattern** for button groups that act like
  single-select tabs (Character Select, Dev Tools area-select). `aria-pressed`/
  `aria-current` on plain buttons conveys state correctly without the added complexity
  (and extra arrow-key navigation wiring) of a formal tablist — consistent with this
  project's general preference for the simplest correct pattern.
- **No visual redesign.** Every change here is additive (attributes, a semantic tag
  swap, a hidden live region) — nothing about the terminal/ASCII visual style changes.

---

## 1. Centralized fixes

### 1a. `UiModalComponent` — real dialog semantics, for every modal at once

All 7 modals (Jacks, Crown, Stats, Options, Credits, Dev Tools, Confirm) already route
through this one component (`app.component.html`'s single `*ngIf="modalService.active$"`
gate — only one is ever mounted at a time). Fixing it here fixes all 7.

- `.modal-panel`: add `role="dialog"`, `aria-modal="true"`, `aria-labelledby="modal-title"`,
  `tabindex="-1"` (so it's a valid focus target with no visible focus ring needed, since
  focus is about to move to a real control inside it in the common case).
- `.modal-title` span: add `id="modal-title"` (static — safe since only one modal instance
  ever exists at a time).
- `.modal-close` span → `<button class="modal-close" aria-label="Close" (click)="closed.emit()">`
  (keep the visible `[x]` text; `aria-label` overrides the announced name so it doesn't
  read as "left bracket x right bracket").
- Focus management in `UiModalComponent` (`ui-modal.component.ts`):
  - `ngOnInit`: capture `document.activeElement` as `previouslyFocused`.
  - `ngAfterViewInit`: move focus to `.modal-panel` (`tabindex="-1"` + `.focus()`) — a
    generic "focus landed inside the dialog" default that works regardless of what
    content is projected in.
  - `ngOnDestroy`: `previouslyFocused?.focus()` — returns focus to whatever (nav button,
    etc.) opened the modal.
  - Focus trap: `@HostListener('keydown.tab')`/`@HostListener('keydown.shift.tab')` on
    the host, querying focusable descendants (a small shared
    `FOCUSABLE_SELECTOR` constant: `'button:not([disabled]), [href],
    input:not([disabled]), select:not([disabled]), textarea:not([disabled]),
    [tabindex]:not([tabindex="-1"])'`) and wrapping focus from last→first / first→last
    rather than letting Tab escape to the page behind the backdrop.
- Escape-to-close already works (`@HostListener('document:keydown.escape')`) — no change
  needed there.
- Backdrop click-to-close stays mouse-only, undocumented to assistive tech — Escape is
  the keyboard-equivalent path and already exists, so the backdrop itself doesn't need a
  button/keyboard affordance.

### 1b. `TooltipDirective`/`TooltipComponent` — keyboard parity

Every hover-detail tooltip in the game (Button Zone's three button families, Inventory
Panel) routes through this one directive. Today it only listens for pointer events — a
keyboard user tabbing to a button gets zero detail.

- `tooltip.directive.ts`: add `@HostListener('focus')` (calls the same `scheduleShow()`
  pointerenter already uses) and `@HostListener('blur')` (calls `hide()`).
- `TooltipComponent` gains an `id` input; the directive generates a unique id once per
  instance (e.g. a module-level counter) and binds `[id]` in `tooltip.component.html`.
- On `show()`, the directive sets `aria-describedby` on its host element to that id; on
  `hide()`, it removes the attribute.
- No change needed to positioning/show-delay/viewport-clamping logic.

### 1c. Live-region announcer — rare/discrete events, zero new call sites

New small component: `src/app/shared/live-announcer/live-announcer.component.ts` (+
`.html`), mounted once in `app.component.html` near `<app-activity-log>`.

- Template: a single visually-hidden element, `aria-live="polite"` `aria-atomic="true"`,
  bound to a plain-text `announcement` field. Add a `.sr-only` utility class to
  `src/styles.scss` (standard visually-hidden-but-present pattern: `position: absolute;
  width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap;`).
- Logic: subscribes to `ActivityLogService.messages$`. On each emission, diffs against
  the previously-seen message `id`s (captured at subscribe time, so existing history on
  mount is never re-announced) and, for every genuinely new message whose
  `type !== 'default'` (`'success'`/`'warn'`/`'error'`/`'rare'` — exactly what the
  Activity Log already reserves for "noteworthy, not routine play"), sets `announcement`
  to that message's text with its `{{currencyId|displayText}}` tokens stripped to plain
  text (reuse/extract the same regex `ActivityLogComponent.parseLogText` already uses,
  simplified to a `.replace(CUR_TOKEN, '$1')` rather than building colored segments).
- This one piece of plumbing covers, for free, with no changes to any business-logic
  service: objective claims (`'success'`), character unlocks (which happen via an
  objective claim and so are already covered), combat outcomes (`'success'`/`'warn'`),
  insufficient-cost errors (`'error'`), and rare double-payout messages (`'rare'`).
- Multiple messages arriving in the same tick (rare, but possible) — last one wins for
  the announcement text, matching `aria-atomic="true"`'s "re-read the whole region"
  behavior; acceptable since these are rare/discrete by construction, not bursty.

---

## 2. Per-screen retrofit

Promote each of these to a real `<button>` (removing the `<div>`/`<span>` + bare
`(click)`), carrying over all existing classes/bindings so CSS/e2e selectors (which are
all class-based, never tag-qualified — verified against `e2e/` and `*.spec.ts`) keep
working unchanged. Each needs a small SCSS reset alongside the existing class styles
(`border: none; background: none; font: inherit; text-align: inherit; cursor: pointer;
padding`/`display` kept as already defined) — the same discipline every other real
button in this app (`.filter-btn`, `.action-btn`, `.character-box`, `%zone-button`)
already applies.

| File | Element | Change |
|---|---|---|
| `party-vault.component.html` | `.vault-row` | → `<button>`; add `aria-expanded` bound to `r.expanded` (only when `r.sources.length > 0`, else omit — nothing to expand) |
| `activity-log.component.html` | `.log-header` | → `<button>`; add `aria-expanded` bound to `!minimized`; `.log-toggle` bracket icon gets `aria-hidden="true"` (the button's own `aria-label`, e.g. "Activity Log", plus `aria-expanded`, already conveys state) |
| `options-panel.component.html` | `.toggle-row` | → `<button role="switch">`; `[attr.aria-checked]="settings[opt.key]"`; `.toggle-box` glyph (`X`/` `) gets `aria-hidden="true"` (redundant with `aria-checked`) |
| `objectives-panel.component.html` | `.objective-row` | → `<button>`, not disabled in any state — an in-progress/completed row stays focusable and readable (its progress/DONE text is real content a screen-reader user should be able to reach), activating it is simply a no-op when not claimable, same as a mouse click today via `claim()`'s existing guard |
| `equipment-panel.component.html` | `.equipment-slot` | → `<button>`; add `[disabled]="disabled"` (mirrors the existing `[class.disabled]`). No explicit `aria-label` needed — `.equipment-slot-label` ("Weapon") + `.equipment-slot-item`/`.equipment-slot-empty` ("Basic Sword" / "-- empty --") are both real text content inside the button, so its accessible name is already correct from content alone |
| `inventory-panel.component.html` | `.inventory-slot` | → `<button>`; **needs `aria-label`** (content is only a single symbol glyph, e.g. `†` — not self-describing). Build the label from the same data `tooltip()` already uses (item name) |
| `ui-modal.component.html` | `.modal-close` | → `<button aria-label="Close">` (§1a) |

Decorative content — add `aria-hidden="true"`, no label needed (adjacent real text
already covers the information, or there's nothing to convey):

- `combatant-display.component.html`: `.combatant-ascii` (`<pre>` art) — the name and
  HP are already separate real text elements right next to it.
- `activity-log.component.html`, `side-panel` column headers, any other bracket-glyph
  icon (`[-]`/`[+]`) living inside a button that already has (or gains) a proper label.
- Every fill-bar element named in the Non-goals section above
  (`.timed-button-fill`, `.crafting-button-fill`, `.objective-fill`,
  `.combatant-hp-fill`, `.craft-button-fill`).

State attributes on existing (already-real) `<button>` elements, so screen readers
announce current state instead of only conveying it via color/border:

- `party-vault.component.html` `.filter-btn`, `activity-log.component.html` `.filter-btn`
  → `[attr.aria-pressed]="...active state..."`.
- `character-select.component.html` `.character-box` → `[attr.aria-current]="slot.id === active ? 'true' : null"`.
- `combat-controls.component.html` `.area-button` → `[attr.aria-pressed]="selectedAreaId === area.id"`.

---

## 3. `AGENTS.md` — new standing section

Add a new numbered section (after Design Patterns, before Testing) stating the rule and
the concrete, checkable conventions decided here, e.g.:

> **Every interactive element must be keyboard-operable and screen-reader-announced —
> for all UI, present and future, not just what this pass covers.** Concretely:
> promote a clickable `<div>`/`<span>` to a real `<button>` rather than inventing a
> `role="button"`-plus-keydown pattern — this is the one interactive primitive the whole
> app uses. `UiModalComponent` already gives every modal dialog semantics + a focus trap
> + focus return for free; `TooltipDirective` already gives every tooltip keyboard parity
> for free — route through them rather than building a new modal/tooltip. Decorative
> content (ASCII art, bracket glyphs redundant with a labelled parent, fill bars
> redundant with adjacent real text) gets `aria-hidden="true"`. A rare/discrete event
> that already logs above `'default'` level in the Activity Log is announced for free via
> the shared live-region announcer — don't add a second announcement mechanism. The
> `@axe-core/playwright` e2e check (§Testing) is a regression gate, not the primary
> design tool — fix violations at the component level per the conventions above, not by
> suppressing the check.

(Exact section number/placement to be finalized at write-time against the current
`AGENTS.md`, since it was just renumbered in a prior session.)

---

## 4. Automated guard — `@axe-core/playwright`

- Add `@axe-core/playwright` as a dev dependency.
- New e2e spec, `e2e/accessibility.spec.ts`: runs an `AxeBuilder` scan against a small
  set of representative states (not every screen combinatorially — enough to cover each
  structurally-distinct surface):
  1. Fresh game, default screen (Fighter, no minigames unlocked).
  2. Minigames unlocked, Fighter Combat active.
  3. Blacksmith active, Blacksmith Forge active.
  4. Each modal open in turn (Options, Stats, Dev Tools at minimum — Jacks/Crown/Credits
     are thin wrappers around the same `UiModalComponent`, lower marginal value but
     cheap to include).
- Assert zero violations (`results.violations` empty) rather than a tolerance threshold
  — matches this repo's existing zero-tolerance style (`config-integrity` suite,
  `EXPECTED_SAVE_KEYS`).
- Document in `AGENTS.md`'s Testing section alongside the existing spec list.

---

## 5. Testing plan

- Existing unit/e2e suites must stay green — the `<div>`→`<button>` conversions are
  class-preserving, so no existing selector should need to change (verified during
  design: no tag-qualified selectors like `div.vault-row` exist anywhere in
  `src/**/*.spec.ts` or `e2e/`).
- New: the axe-core e2e spec (§4).
- No new unit specs are strictly required for the centralized fixes, but a small
  `ui-modal.component.spec.ts` addition (focus moves in on open, returns on close, Tab
  wraps at the boundary) is worth adding given how much now depends on this one
  component — left to implementation-planning to size.
