# RPG Clicker 2 — Agent Design Guide

This file is the source of truth for visual style and system design decisions in this
project. It exists so that any agent (or contributor) working on a new feature makes the
same choices a human designer steeped in this game's taste would make, without having to
re-derive them from scratch each time.

**This file is a living document.** Whenever the developer makes an opinionated design
decision it must be added here. If a decision changes in the future, update this file so the correction sticks. If a rule here turns out to be wrong or superseded, edit or remove
 it rather than leaving it stale.

---

## 1. Visual Style Baseline: The Activity Log

The [Activity Log](src/app/activity-log/) is the reference implementation for the whole
game's look. It currently has "no notes" from Brad — treat its actual CSS/markup as
ground truth over any prose description below. When building a new component, prefer
copying its patterns over inventing new ones.

Concretely, that means:

- **Font:** `'Courier New', Courier, monospace` everywhere. This is a terminal-styled
  game — no rounded, humanist, or decorative fonts.
- **Backgrounds:** near-black (`#000`, `#0a0a0a`, `#111`), never a "modern UI"
  light/gray-white surface. Panels are darker than their headers, headers darker than
  hover states.
- **Borders:** thin, 1px, mostly `#222`–`#333` for internal dividers, brighter (`#fff`)
  only for the outermost separating edge (e.g. `.log-panel`'s `border-top: 2px solid #fff`).
- **Bracket/terminal iconography:** section titles wrapped in literal brackets, e.g.
  `[ ACTIVITY LOG ]`; toggle affordances are literal characters: `[-]` to collapse,
  `[+]` to expand. See §2 below for a **direction bug to fix**: other panels currently use
  `[>]`/`[<]` for the same concept, which must be unified.
- **Filter/segmented-button bar:** small, dense, uppercase, monospace buttons with a
  1px border that only lights up (color + border + subtle tinted background) when
  active; muted gray (`#444`) otherwise. This is the model for any toggle-group UI
  (filters, category tabs, on/off switches).
- **Scrollbars:** custom-styled thin (6px) dark scrollbars, not the OS default — apply
  this to any other internally-scrolling panel (log body, upgrade list, statistics list).
- **Density over whitespace:** tight `padding`, small `font-size` (11–12px body text),
  `line-height: 1.5`. This is a data-dense terminal UI, not a spacious modern SaaS
  dashboard. Avoid the "dead space" problem called out in §3 (Upgrades) by keeping
  layouts dense and multi-column where content allows.
- **Inline colored tokens:** the log parses `{{currencyId|displayText}}` tokens and
  colors just that substring using the currency's accent color, leaving surrounding
  text uncolored. This "colored token inside plain sentence" pattern should be reused
  anywhere game text references a currency, resource, or character by name.

### Layout anchor points

- **Activity Log:** fixed to the bottom of the viewport, full width, collapsible.
- **Top Bar:** fixed to the top — ASCII title centered, Jacks/Crown docked left
  (unlock-gated), Stats/Options docked right. Nav buttons stretch to fill the bar's full
  height (`align-items: stretch` on `.top-bar`/`.nav-group`) rather than sitting small
  and center-aligned within it — do this for any button added to the bar later.
- **Game Screen (center):** top half is reserved for the primary clicker button(s),
  bottom half for minigame content (see §11).
- **Side panels** (Party Vault / wallet, Character Select): collapsible sidebars.
- **Header row alignment:** Party Vault's `.panel-header`, the Button Zone's
  `.zone-header`, and the side panel's `.tab-bar` all sit in the same visual row and
  must be the same height — same vertical padding (4px) and font-size (12px) on all
  three, even though the tab bar's buttons need their own active/inactive coloring.
  Check this by eye whenever any of the three changes; a mismatch here is immediately
  obvious since the whole row visibly steps.

---

## 2. Collapse Direction — Unify This

Party Vault and Character Select use `[>]`-style collapse arrows (directional, implying
"this points at where it opens"), while Activity Log uses `[-]`/`[+]` (state, not
direction). This as an inconsistency worth fixing, not a deliberate
distinction.

**Rule:** pick one convention project-wide. Default to the Activity Log's `[-]`/`[+]`
(state-based) since it's the "no notes" baseline component — sidebars should adopt
`[-]`/`[+]` rather than the reverse.

---

## 3. Color Hierarchy

There is a deliberate, tiered color language. Keep new UI inside this palette rather than
introducing arbitrary new colors:

| Color | Meaning |
|---|---|
| Gray (`#444`–`#aaa`) | Flavor text, dividers, timestamps, disabled/inactive state |
| White (`#bbb`–`#fff`) | Normal text, primary accents (e.g. the main button, active state) |
| Light blue / Cyan (`#0ff`) | Upgrades and other "impactful" interactive elements |
| Gold (`#ffd700`) | Rare, one-off upgrades and rare log messages (tier above cyan) |
| Purple | Reserved for **Relic**-tier items — the highest power tier (not yet implemented) |
| Green / Yellow-ish / Red | Semantic log message states: success / warn / error |

Notes and open issues to keep in mind (Brad's words, paraphrased):

- The gray-vs-white line is a little fuzzy today (e.g. headers) — when in doubt, white
  reads as "content", gray reads as "chrome/meta".
- **Correction:** top-bar nav buttons (Jacks/Crown/Stats/Options) use white label text,
  not gray — gray read as too muted/low-contrast for primary navigation specifically.
  Gray is still right for lower-emphasis chrome (dividers, timestamps, disabled state);
  this is scoped to top-bar nav, not a blanket reversal of the gray-chrome rule above.
- Rate/delta displays use color to carry meaning, not just currency identity: positive
  is green, negative is red, and **exactly zero is gray** (`#666`) — a `0/s` rate is
  inactive/informational, not a "positive" reading, so it shouldn't get the green
  treatment. Apply this anywhere a signed rate or delta is shown (Party Vault's rate
  column and per-source breakdown both do this).
- Collapse arrows currently being cyan (like upgrades) may be a mismatch — an
  interaction-chrome element competing visually with the "impactful upgrade" color. Bias
  new chrome-only affordances (arrows, toggles, borders) toward gray/white, and reserve
  cyan/gold/purple for things that represent in-game power/rarity, not for pure UI plumbing.
- **Deliberate exception:** the top-bar "Dev Tools" button (only rendered when
  `DEV_TOOLS_ENABLED` in `game-config.ts` is true) is cyan even though it's pure UI
  plumbing, not in-game power — it's a developer-only surface, and cyan was chosen
  specifically to make it visually distinct/alarming from real nav chrome, not to extend
  the "impactful upgrade" meaning to it.
- Every currency gets its own persistent color + symbol — this pairing is core to the
  game's identity (see §4/§7 Party Vault) and should extend to any new
  currency, upgrade tier, or resource-like entity (e.g. Crown jewels, Jack stats if they
  ever get symbols).
- Characters also have associated colors, but used far more sparingly than currency
  colors (e.g. a single letter/color badge in a collapsed selector) — don't over-apply
  character color the way currency color is applied everywhere.
- **Gotcha:** `body` has a fallback `color: #bbb` (`styles.scss`) specifically so plain
  text with no explicit color rule doesn't render invisible black-on-black — this bit
  the Objectives panel's "Obtain" text once already. Still give every new text element
  its own explicit color per this table; the fallback is a safety net, not a substitute.

---

## 4. Lessons Carried From RPG Clicker 1

These are Brad's retrospective notes on the first game. No immediate action is implied —
they're standing design opinions that should shape how each analogous system in RPG
Clicker 2 gets built.

### Party Vault
- Overall the strongest panel in game 1 (after Activity Log). Reuse its shape: name,
  color, symbol, and quantity per currency, with per-second rates once unlocked.
- EXP is the most shared/common currency across the whole game and probably deserves to
  be sticky/pinned at the top rather than sorted in with the rest.
- The EXP progress bar looked great but was never explained anywhere in-game — new
  mechanics need at least minimal in-context explanation (tooltip, log message, or
  objective tie-in), not just a bare UI element.
- The collapsed sidebar interaction ("goated") is a pattern worth reusing broadly.

### Character Select
- Showing read-only gameplay stats (e.g. Gold/Bounty) next to the character selector is
  good even though it needs no interaction — ambient information is valuable.
- Leaving visibly empty character slots when only one character exists is good — it
  signals "more are coming" without saying so.
- **Reversed:** locked characters no longer render an empty placeholder box at all —
  a box only appears once that character is actually unlocked (see §8). The "empty slot
  signals more is coming" idea above was the original call; this is a deliberate,
  explicit correction to it, not an oversight — don't quietly revert to placeholder
  boxes because this section still describes the old approach.
- Naming/framing risk: "Party" implies both (a) more characters are coming, and (b) that
  you assemble a sub-party like a traditional RPG. (b) has never actually been true — be
  careful that naming doesn't over-promise a mechanic (party assembly) that isn't
  planned. If it's not planned, prefer naming that doesn't imply it.
- Flavor text is cute but of questionable value — low priority, don't over-invest here.
- The collapsed color+letter badge for quick character selection is a good, reusable
  pattern (ties into §3's sparing use of character color).

### Activity Log
- No notes — this is the baseline (see §1).

### Game Screen — Top Logo
- Big ASCII logo looks cool but costs a lot of vertical space. When building the real
  top bar, weigh the logo's size against how much room it steals from gameplay content.
- **Resolved:** the top bar now uses a compact ASCII banner (figlet "Small" font, 4 lines,
  ~12px font-size — `GAME_TITLE_ASCII` in `flavor-text.ts`) instead of a giant logo or
  plain text, so it keeps the ASCII-art feel without reproducing game 1's vertical-space
  problem. If a bigger/different banner style is wanted later, swap the constant and
  restyle `.title` in `top-bar.component.scss` — don't hand-edit the string in place.
- The banner renders bright white (`#fff`), not the dimmer `#bbb` most static labels use
  — it's the game's namesake, and should read as the brightest thing in the top bar.

### Dividers
- Functional but there may be a better visual treatment; consider whether dividers
  between sections could themselves be collapsible, similar to panel collapsing
  elsewhere.

### Upgrades
- A single-column upgrade list leaves a lot of dead space — prefer a layout that fills
  width with multiple columns/cards when there's only one upgrade category unlocked yet,
  rather than a narrow list in a wide panel.
- Upgrade names should be more specific/descriptive than game 1's.
- Descriptions were intentionally terse (e.g. "+1") but too terse — ambiguous whether an
  effect is flat or will scale/change per level. Prefer descriptions that are still
  concise but unambiguous about what changes and whether it scales.
- The purchase button visual treatment worked well — reuse it.
- Players wanted tooltips explaining resource symbols, especially for symbols tied to
  "goal"/unlock-gated resources they haven't seen yet. Build symbol tooltips in from the
  start for upgrades (see §3's symbol-per-currency rule).
- Showing the current level is good, but game 1 only showed the *next* level's effect,
  never the currently-active effect. Prefer showing both current and next effect where
  space allows.
- Level caps: game 1 capped upgrades at 999, which was arbitrary and effectively
  unreachable. This needs to be revisited when upgrades are actually designed — default
  assumption should be no hard cap unless there's a specific design reason for one.

### The Button (primary clicker)
- Should be the obvious, unambiguous thing to click.
- Decorative "frills" (e.g. `>>> like this <<<`) around the button may be excessive —
  lean toward restraint over decoration.
- Hold-to-click (if implemented) must have a visible affordance — game 1 had none, and
  players had no way to discover it.
- Avoid a dashed border on the button; it read as visually off/unintentional.
- **Resolved (first demo button):** Fighter's button in `ButtonZoneComponent` is a
  solid-bordered, generously padded button — no dashed border, no decorative frills —
  and is only shown while Fighter is the active character (other characters currently
  see the empty state). Use this as the template for each character's future button.
- **Resolved (hold-to-click):** every primary button uses the shared
  `HoldToClickDirective` (`src/app/shared/hold-to-click.directive.ts`) — fires once
  immediately on press, then repeats every `AUTOCLICK_INTERVAL_MS` (`game-config.ts`,
  1000ms base) for as long as it's held. The visible affordance called out above is a
  small "hold to repeat" caption under the button — don't drop it when styling new
  buttons, that's the exact gap game 1 had. When upgrades/Jacks speed this up later,
  apply a multiplier on top of the base constant rather than editing it directly.
- **Resolved (hold-rate pulse):** the directive also toggles a pair of host-bound
  classes (`hold-pulse-a`/`hold-pulse-b`) on every fire — press and every repeat — via
  `HostBinding` + its own injected `ChangeDetectorRef` (needed because a `setInterval`
  tick doesn't otherwise dirty an `OnPush` ancestor). Alternating between two
  identically-defined classes, rather than toggling one boolean class, is what lets the
  CSS `animation` restart on every single tick even though the previous run already
  finished. `ButtonZoneComponent`'s `.primary-button.hold-pulse-a`/`.hold-pulse-b` briefly
  brightens the button's background — a quick, functional confirmation of the actual
  rate it's firing at, not decorative flourish, so it isn't gated behind
  `reducedMotion` the way the reset shake / attention glow are.
- **Button title vs. flavor:** a button's label ("action title", e.g. Fighter's "Hard
  Labor") and its log flavor sentence live in `flavor-text.ts`'s `ACTION_FLAVOR`, keyed
  by the action's own id (`CharacterActionConfig.id`, e.g. `'fighter-hard-labor'`) — not
  by character id, since a character could have more than one action some day. The
  resource + amount it actually yields lives in `game-config.ts` (`CHARACTER_ACTIONS`)
  — that's a game value. Don't hardcode either in the component.

### Options
- The popup/modal approach is good and should be reused for any settings-like surface.
- Showing the version number is good practice; keep doing it.
- Section headers styled like terminal comments (e.g. `// Save`) fit the aesthetic well
  — reuse this pattern for grouping settings.
- On/off toggles styled as a literal checkbox-like box are on-brand — prefer this over a
  modern rounded switch component.

### Save
- The save system's design/UX was well put together in game 1 — carry its shape forward
  (see §6 Save below for the concrete requirements).

### Credits
- Was well received — keep a similarly polished, low-effort-to-maintain credits screen.

### Statistics
- Well received overall, especially milestone entries and the fact that new stat
  sections appear dynamically as they become relevant (don't show empty/irrelevant
  sections up front).
- Milestone display is good enough that it could double as (or feed into) an achievement
  section.
- Stats were grouped by character in game 1; grouping by action/category instead is
  probably better and should be the default for RPG Clicker 2.
- "Time Played" is good to have in the Statistics screen but was questionable as a
  constantly-visible element on the main game screen — consider a toggle to show/hide it
  there rather than always-on.
- A speedrun-style angle on play time made the game meaningfully more interesting late —
  keep this in mind as a hook for Statistics/Objectives design later (e.g. timed
  milestones, speedrun categories), even though nothing needs to be built for it yet.

---

## 5. Upgrades (system spec)

- Upgrades modify the numbers and mechanics of buttons and minigames (multipliers,
  unlocks, mechanical changes — not just flat stat bumps).
- Costs are generally paid in currencies from the wallet/Party Vault.
- Upgrades can have **unlock requirements** independent of cost — e.g. reaching a certain
  level in a prerequisite upgrade, or an unrelated system-level unlock (a character, a
  minigame, a Jack, etc.). Unlock state and affordability are two separate gates and
  should be visually distinguishable (locked/hidden vs. visible-but-unaffordable).
- See §4 "Upgrades" above for concrete visual/UX carryovers from game 1.

### Implementation (`src/app/upgrades/`)

- **First real upgrade:** `hard-work` — +1 Gold per Hard Labor click, per level, max
  level 100, base cost 10 gold (`UPGRADES` in `game-config.ts`).
- **Config shape is a discriminated union on purpose** — `UpgradeConfig.effect` is
  `{ type: 'action-amount'; actionId; amountPerLevel } | { type: 'generator-rate';
  generatorId; ratePerLevel }`, not a single hardcoded "bumps a character action" shape,
  so an upgrade can target a passive generator's rate later without reshaping this
  again. Every number an upgrade needs — cost, cost curve, level cap, effect magnitude —
  lives in this config, never hardcoded in `UpgradesService` or the panel component.
- **Cost curve:** `cost(level) = ceil(baseCost * costScalingFactor^level)`, where `level`
  is the number of levels already owned. `costScalingFactor` (1.15 for `hard-work`, a
  common incremental-game default) is per-upgrade, not a global constant — tune it per
  upgrade if one should scale faster/slower than another.
- **`UpgradesService`** owns levels (`Map<upgradeId, level>`) and resolves each
  upgrade's effect into a bonus another service asks for by id —
  `getActionAmountBonus(actionId)` (read by `ButtonZoneComponent.onAction`) and
  `getGeneratorRateBonus(generatorId)` (read by `PerSecondCalculatorService.recompute`).
  Neither of those services is depended on *back* — `UpgradesService` only depends on
  `WalletService`, and `PerSecondCalculatorService` subscribes to `UpgradesService.changes$`
  to know when to re-derive an aggregate, rather than `UpgradesService` reaching into
  `PerSecondCalculatorService` to push a recompute. Two services depending on each other
  directly would be a circular DI error — this is why the dependency only ever points
  one way, same principle as `ObjectivesService` → `CharacterSelectService`.
- **Not exercised yet:** `generator-rate` effects and `getGeneratorRateBonus` are fully
  wired but `GENERATORS` is still empty, so nothing calls this path today. It exists so
  that registering a real generator later "just works" without touching
  `PerSecondCalculatorService` again.
- **Purchasing is a real game action** — `UpgradesPanelComponent.buy()` logs through
  `ActivityLogService` following the same convention as every other action (see "Game
  action log messages" below), using `UpgradeFlavor.logMessage` (`flavor-text.ts`,
  `UPGRADE_FLAVOR`) plus the exact cost charged (`UpgradesService.purchase()` returns the
  charged cost, not just a boolean, specifically so the log can report the real number
  rather than recomputing it after the level already changed).
- **`hideMaxedUpgrades` is now real** (`SettingsService` — was a stub) —
  `UpgradesPanelComponent` filters maxed upgrades out of its list when the setting is on.
- **"New upgrade available" shine:** same pattern as Objectives (§6) — since `hard-work`
  is available from the moment the game starts, the Upgrades tab is seeded once for a
  brand-new save (`SaveService.seedFreshGameAttention`) rather than triggered by an
  unlock event. Once upgrades can have real prerequisites, whichever system reveals a
  newly-available one should call `attention.markUnseen('tab:upgrades')` at that moment
  instead.
- **Layout:** a multi-column card grid (`.upgrades-panel`, `auto-fill, minmax(140px,
  1fr)`), not a single-column list — avoids the "dead space" problem called out in §4.
  Each card shows name, description, current level/cap, and a cyan Buy button (the
  in-game-power color per §3) with the cost + currency symbol, or a gray "MAXED" label.

## 6. Objectives

- Quest-like tasks: purchase N upgrades, click N times, acquire N of a resource, or
  complete a minigame in a specific way.
- Double as tutorialization and milestone pacing — an objective is often the first time
  a player is told a system exists, so its copy should teach, not just track.
- **Implemented so far:** only the "acquire N of a resource" type (`ObjectivesService`,
  `OBJECTIVES` in `game-config.ts`). The other types from the spec above (purchase N
  upgrades, click N times, complete a minigame a certain way) will need
  `ObjectiveConfig` to become a discriminated union (`type: 'resource-threshold' | ...`)
  when they're built — don't bolt them onto the resource-threshold shape.
- **Completion is sticky, not derived.** `ObjectivesService` tracks completed ids
  separately from wallet amount, so spending back down below the target after
  completing doesn't un-complete it. Evaluated reactively off `WalletService.changes$`,
  same change-pulse pattern as the economy (see §7's Performance subsection).
- **Progress updates live.** `evaluate()` emits `changes$` on every relevant wallet
  change, not just on completion — `ObjectivesPanelComponent` re-renders in near
  real time while the panel is open, rather than only refreshing when you next
  navigate to it. Don't gate that emission behind "did it just complete," that's the
  bug this was fixed from.
- **Progress bar:** each incomplete row fills left-to-right with the target resource's
  own color at low opacity (`.objective-fill`, width bound to
  `current / targetAmount`), sitting behind the text via `z-index`/`position:relative`.
  Completed rows drop the fill entirely — the "DONE" label + gray/shrink treatment
  already communicates completion.
- **Completed objectives shrink and gray out** rather than disappearing from the list —
  they stay as a visible checklist entry (`.objective-row.completed` in
  `objectives-panel.component.scss`), consistent with Statistics' "milestone" pattern
  being a good one (§11).
- **Rewards are a union, not a single `rewardCharacterId` field** — `ObjectiveConfig.reward`
  (`game-config.ts`) is `{ type: 'character' | 'system' | 'upgrade'; ... }` because
  completing an objective won't always unlock a character; sometimes it's a system
  (Jacks/Crown/minigames) or an upgrade instead. `'character'`
  (`ObjectivesService.applyReward` → `CharacterSelectService.unlock`) and `'system'`
  (→ `UnlocksService.unlock`, now that unlock flags are runtime-toggleable — see §16 Dev
  Tools) both do something today. `'upgrade'` is still a no-op stub — there's no
  "locked upgrade" concept yet, every entry in `UPGRADES` is visible from the start (§5)
  — wire it through `UpgradesService` the same way once that exists. Don't have
  `ObjectivesService` reach in and mutate any of this state directly, always route
  through the owning service.
- **"New objective available" shine:** the Objectives tab shines (see the Attention
  subsection under Design Patterns) until visited. Since every objective today is
  available from the moment the game starts (no prerequisite gating exists yet), this
  is seeded once for a brand-new save (`SaveService.seedFreshGameAttention`) rather than
  triggered by an unlock event. Once objectives can have real prerequisites, whichever
  system reveals a newly-available one should call
  `attention.markUnseen('tab:objectives')` at that moment instead — don't leave the
  fresh-game seed as the only trigger once that's true.

## 7. Party Vault

- Per currency: name, color, symbol, current quantity, and (once unlocked) rate/second.
- Clicking a resource shows a breakdown of its income sources.
- Carries forward all of §4's Party Vault notes above (EXP pinned at top, tooltips for
  unexplained mechanics like progress bars, collapsible sidebar).
- **Unlock rule:** a currency only appears once its amount has gone above zero at least
  once (`WalletService.isUnlocked`), and stays visible even if spent back down to zero —
  it never re-locks. Filtering by character (`ALL` + one filter button per unlocked
  character, Activity-Log filter-bar style) is a separate, independent concern from
  unlock state.
- **Live data, not static mock values:** amounts come from `WalletService` (mutated by
  clicks/generators), rates + source breakdowns come from `PerSecondCalculatorService`
  (aggregated from `GENERATORS` in `game-config.ts`). See the Performance subsection
  under Design Patterns below before changing either service — the aggregation and
  change-notification shape is deliberate, not incidental.

### Performance: the per-second calculator

The economy (`src/app/economy/`: `WalletService`, `PerSecondCalculatorService`,
`GameLoopService`) is built to stay cheap as the number of resources/generators grows,
because this is the one part of the game guaranteed to run continuously in the
background regardless of what screen the player is looking at:

- **Partial updates, not full recomputes.** `PerSecondCalculatorService` caches a
  `{ total, sources }` aggregate per resource id. Recomputing one resource
  (`recompute(resourceId)`) only touches that resource's own generator list — adding,
  removing, or changing one generator later (an upgrade, a Jack) must stay O(generators
  for that resource), never O(all generators/resources). Don't replace this with a
  "recalculate everything on every tick" approach even if it looks simpler.
- **Change-pulse, not snapshot cloning.** `WalletService.changes$` emits the *id* of the
  resource that changed, not a cloned map/array of the whole wallet. Components read
  current values imperatively (`getAmount`/`isUnlocked`) and call
  `ChangeDetectorRef.markForCheck()` (OnPush throughout) — this avoids allocating and
  diffing a new object on every tick.
- **One shared tick, not per-resource timers.** `GameLoopService` runs a single 1-second
  interval that walks every *active* generator's resource once — cost scales with active
  generators, not with resource count or wall-clock granularity. If sub-second precision
  is ever needed, switch this to a delta-time accumulator rather than adding more timers.
- Any future system that produces or consumes resources (Upgrades, Jacks, minigames)
  should register through `GENERATORS`/`WalletService.add`, not maintain its own parallel
  amount/rate state — that's what would break the partial-update guarantee above.

## 8. Character Select

- Selects the active/displayed character.
- Passive generation and automation for non-active characters continues in the
  background regardless of what's currently displayed — selection is a UI/view concern
  only, never a gameplay-pausing one.
- Carries forward §4's Character Select notes (ambient stats, empty-slot signaling,
  naming caution around "Party", sparing use of character color).
- **Dynamic unlocking:** Fighter starts unlocked; every other character unlocks at
  runtime via `CharacterSelectService.unlock(id)` (Ranger's is the objective in §6 —
  "obtain 100 gold"). `CHARACTERS` in `game-config.ts` only says which characters
  *start* unlocked, not the full unlock state — that's `CharacterSelectService`'s job,
  and it's what gets saved/restored.
- **Locked characters render no box at all** (`CharacterSelectComponent.slots` filters
  to `unlocked` before the template ever sees them) — see §4's "Reversed" note for why
  this isn't the original "show an empty placeholder" design.
- A newly-unlocked character's box shines (`AttentionService`, see the Attention
  subsection under Design Patterns) until the player clicks it.
- The character-select boxes are already reactive to this (`CharacterSelectService.slots`
  is a live getter + `changes$`) — a newly-unlocked character's box appears in place
  without a page reload. Any new component reading `.slots` must subscribe to
  `changes$` too, not just read it once at construction (see
  `CharacterSelectComponent`/`PartyVaultComponent` for the pattern).

## 9. Save

- Persists currencies, upgrades, active screens/configuration, minigame progress — full
  game state.
- Autosaves every 5 minutes to browser storage.
- **Forward-compatibility is a hard requirement**: the save format must be designed so
  that old saves keep loading correctly as the game evolves (additive/versioned schema,
  sensible defaults for fields that didn't exist yet, no silent breakage on new fields).
  Treat this as a constraint on every future system's data shape, not just the save
  system itself — when adding a new system, design its persisted shape to be
  extensible from day one.

### Implementation (`src/app/save/`)

- **Storage:** `SaveService` writes/reads a single localStorage key
  (`rpg-clicker-2-save`), holding the base64 encoding of the save JSON (`SaveData` in
  `save-data.ts`). Base64 isn't encryption or compression — it's just what makes the
  blob safe to copy/paste as plain text for export/import.
- **The snapshot/restore convention:** every stateful service
  (`WalletService`, `CharacterSelectService`, `ObjectivesService`, `StatisticsService`,
  `PlaytimeService`, `SettingsService`, `AttentionService`, `UpgradesService`,
  `UnlocksService`) exposes `getSnapshot()`/`restore(snapshot)`.
  `SaveService` is the *only* place that composes these into one `SaveData` object or
  decomposes one back out. Adding a new persisted system means adding a
  getSnapshot/restore pair to that system's own service + one field in `SaveData` +
  one line in `SaveService.serialize()`/`parse()` — never teach an existing service
  about another one's shape.
- **Forward-compat mechanics, concretely:** `SaveData.schemaVersion` is ours to bump for
  real migrations later; every field is read with `??`/optional-chaining fallbacks on
  the reader side (inside each service's own `restore()`), so a save missing a field
  that didn't exist yet just gets that service's default — never add a required field
  or repurpose an existing one, always add a new optional one.
- **`createdAt` vs `updatedAt`:** `createdAt` is set once (first boot with no existing
  save, or right after a reset) and carried forward on every subsequent save;
  `updatedAt` is stamped fresh on every save. This is what lets Statistics/Credits later
  show "playing since ___" accurately across many saves.
- **Export:** `copyToClipboard()` and `downloadAsFile()` both just call the same
  `exportBase64()` — one save representation, two delivery mechanisms. Don't let them
  drift into building the save data differently.
- **Import:** `importBase64()` validates, writes to localStorage, then does a full
  `location.reload()` rather than live-patching running services — safer than trying to
  hydrate an already-running app, and it's the same code path boot-time load already
  uses. Reset (`reset()`) follows the same reload pattern, plus the screen-shake class
  (skipped when `SettingsService.state.reducedMotion` is on — see §10).
- **Saves on the way out, not just every 5 minutes:** `visibilitychange` (tab hidden —
  the reliable cross-browser "player is leaving" signal) and `pagehide` (actual
  navigation/reload/close) both trigger an immediate `save()`, so a reload or closed tab
  never loses up to 5 minutes of progress. Both handlers call the same synchronous
  `save()` as the interval — don't make save async, a page teardown handler can't
  reliably await anything.

## 10. Options

- Player-facing tweaks, primarily save management and display settings.
- Reuse the game-1 popup/modal treatment (see §4 Options notes).
- **Settings live in `SettingsService`** (`src/app/options/settings.service.ts`), not as
  component-local state — they're part of the save (§9) and read by other components
  (`showPlaytime` gates the top-bar readout in §11, `reducedMotion` gates the reset
  screen-shake in §9, `hideMaxedUpgrades` gates `UpgradesPanelComponent`'s list — see §5).
  Any new toggle goes here, not as a local boolean on `OptionsPanelComponent`.
- **Credits is a button inside Options** ("// Credits" section) that opens the Credits
  modal (`modalService.open('credits')`) — it replaces the Options modal rather than
  stacking on top, since `ModalService` only tracks one active modal at a time. Follow
  this pattern for any other "modal launched from within a modal" case rather than
  extending `ModalService` to a stack.
- Export/import/reset are real (not disabled placeholders) — see §9 for the mechanics.
  Reset asks for confirmation (native `confirm()`) before clearing anything; that's a
  deliberate exception to "don't add validation for things that can't happen" since
  losing an entire save is high-cost and easy to trigger by accident.

## 11. Statistics

- Records lifetime totals, time played, major unlock timestamps, and other game actions.
- New sections should appear dynamically as they become relevant rather than all being
  present (possibly empty) from the start.
- Group by action/category, not by character (a deliberate change from game 1).
- Milestone-style entries are a good pattern; consider dual-use as an achievements view.
- Time Played belongs here for sure; keep it optional/toggleable on the main game screen.
- **Implemented:** `StatisticsService` tracks three category maps — action press counts,
  lifetime currency gained (positive gains only, not net of spending), and timestamped
  major unlocks — each rendered as its own `// Section` in `StatsPanelComponent` only
  when it has at least one entry (`*ngIf="x.length > 0"`), per the dynamic-sections rule
  above. Don't pre-seed any of these with zeroed/placeholder rows.
- **Recording convention:** whoever performs the action calls
  `statistics.recordAction(actionId)` directly (see `ButtonZoneComponent.onAction`) —
  lifetime-gained is the one exception, tracked automatically off
  `WalletService.changes$` (only when `delta > 0`) so nothing has to remember to call it
  manually. `recordMajorUnlock(id, label)` is idempotent — safe to call again for an
  already-recorded id (e.g. re-evaluated during save load) without duplicating the entry.
- **Playtime** (`PlaytimeService`) is its own service, not folded into
  `StatisticsService` — it needs to be read live from the top bar every second
  (`SettingsService.state.showPlaytime` gates that specific readout; the Stats screen
  itself always shows it regardless of the setting) whereas the rest of Statistics only
  changes on discrete events. It piggybacks on `GameLoopService.tick$` — see §7's
  Performance subsection on why that's a shared tick rather than its own timer.

## 12. Credits

- A polished, low-maintenance thanks/credits display. Not a high-iteration surface.
- **Implemented:** attributed to Brad Carlin for now (`CreditsPanelComponent`), opened
  from a button inside Options (§10) rather than the top bar directly.

## 13. Jacks (automation)

- A management pane reachable from the top bar, on the **left** side (mirroring Options
  on the right), unlocked rather than available from the start.
- Jacks are hired/unlocked individually, then assigned to a system to automate it.
  Assignment is per-Jack, per-system.
- Each Jack levels up independently and has 6 stats, each leveled individually:
  - **Strength** — click power / effectiveness of the primary action.
  - **Dexterity** — speed / time between primary actions.
  - **Constitution** — how long the Jack can act before needing to rest.
  - **Intelligence** — XP gain modifier.
  - **Wisdom** — strategy effectiveness (playing a minigame or using a button
    "correctly").
  - **Charisma** — resource gain multiplier.
- Leveling a stat costs normal resources **plus** Jack-specific XP as an additional cost
  — XP is not a substitute for resource cost, it's an added gate.
- Visual treatment: styled and displayed similarly to The Crown (§14) — both are
  top-bar-launched management panes over a roster of upgradeable entities. Keep their
  card/list UI consistent with each other, both in the Activity Log's terminal style.

## 14. The Crown (achievements)

- Functions as the game's achievement system, displayed with a UI similar to Jacks.
- Milestones, challenges, or random rolls award **jewels**.
- Jewels slot into "the Crown" to unlock powerups/upgrades — flat multipliers to start,
  with room for more significant system-level effects later.

## 15. Minigames

- Live in the bottom half of the game screen; the top half is reserved for the primary
  button(s) (see §1 Layout anchor points).
- Currently under construction — no established visual pattern yet. When designed, they
  should still follow §1's terminal/monospace baseline rather than introducing a
  visually distinct "minigame skin."
- **Gated like Jacks/Crown:** hidden until `UnlocksService.isUnlocked('minigames')` is
  true — when locked, the button zone simply fills the whole center column instead of
  splitting 50/50 (`GameAreaComponent`'s `.solo` state), rather than showing a locked
  placeholder in the bottom half. `GameAreaComponent` subscribes to
  `UnlocksService.state$` (not a one-time read) so unlocking at runtime — Dev Tools or a
  real unlock objective — reveals the minigame zone without a reload.

## 16. Dev Tools

- A testing-only surface, not a player-facing system — only exists to set up game
  states quickly during development. Gated at the entry point: the top-bar "Dev Tools"
  button (cyan — see §3's deliberate-exception note) only renders when
  `DEV_TOOLS_ENABLED` (`game-config.ts`) is true, and flipping that flag off removes the
  only way to reach it (`DevToolsPanelComponent` itself has no other gate).
- **Unlocks are now runtime-toggleable** — `UnlocksService`
  (`src/app/shared/unlocks.service.ts`) wraps the `UNLOCKS` defaults from
  `game-config.ts` in a `BehaviorSubject`, exposing `isUnlocked(key)` / `unlock(key)` /
  `unlockAll()` / `getSnapshot()` / `restore()`. This is what "set every unlockable flag
  to true" needed to exist at all — before Dev Tools, `UNLOCKS` was read once, statically,
  at construction (`TopBarComponent`, `GameAreaComponent`). Both now subscribe to
  `UnlocksService.state$` instead, so an unlock (from Dev Tools or a real objective, see
  §6) shows up immediately without a reload. This also finally gave
  `ObjectiveReward`'s `'system'` case (§6) something real to call.
- **Dev Tools actions bypass normal game rules on purpose** — granting currency skips
  the wallet's normal earn paths, and none of these five actions log through
  `ActivityLogService`. This is a deliberate exception to "every game action logs a
  message" (see below): these aren't game actions a player takes, they're test-state
  setup, so routing them through the Activity Log would misrepresent them as real play.
  Feedback instead uses the same transient `statusMessage` pattern as
  `OptionsPanelComponent`'s save actions.
- **The five tools**, each backed by a real service method rather than reaching into
  wallet/upgrade internals from the panel component:
  1. Add 100 / 10,000 / 1,000,000 of every currency (`DEV_TOOLS_CURRENCY_GRANTS`,
     `game-config.ts` — tune the three amounts there) — loops `RESOURCES` and calls
     `WalletService.add` for each.
  2. Unlock every system flag — `UnlocksService.unlockAll()`.
  3. Max every upgrade — `UpgradesService.maxAll()` (sets every upgrade to its
     `maxLevel`).
  4. Half every upgrade — `UpgradesService.halveAll()` (`ceil(maxLevel / 2)`, floored at
     1 so a `maxLevel` of 1 doesn't land on 0).
  5. Zero every upgrade — `UpgradesService.resetAll()`.

# Design Patterns

- Game values such as costs, unlock requirements, resource yields should be dynamic and
  extracted to a `game-config.ts` file. This includes cross-entity **relations** — e.g.
  which character a resource is assigned to for Party Vault filtering — not just
  scalar values and unlock flags.
- Flavor aspects such as resource symbols or themed colors should be extracted to a
  `flavor-text.ts` file. Character names/colors and the top-bar ASCII title
  (`GAME_TITLE_ASCII`) live here too — anything purely cosmetic, as opposed to a game
  value or relation.
- Each feature area gets its own `game-config.ts` export (e.g. `UNLOCKS`, `CHARACTERS`,
  `RESOURCES`, `GENERATORS`) and, where it has cosmetics, a matching `flavor-text.ts`
  export merged in at the point of use (see `CharacterSelectService`,
  `PartyVaultComponent`) — don't merge the two concerns into one object. Mutable runtime
  state derived from that config (wallet amounts, unlock flags, computed rates) lives in
  its own service (`src/app/economy/`) instead — config is static data, not state.
- Every service holding persisted runtime state exposes `getSnapshot()`/`restore()` (see
  §9 Save) — this is what makes it possible for `SaveService` to compose/decompose the
  whole game's state without any service needing to know about any other's shape.
- UI components should generally not be selectable with the cursor. Implemented via a
  global `button { user-select: none; }` in `styles.scss` (covers every button-based
  control) plus explicit `user-select: none` on non-`<button>` clickable chrome (modal
  close, options toggle rows, expandable resource rows). Content meant to be copied
  (Activity Log entries) opts back in explicitly and should keep doing so.

### Attention (the "shine" indicator)

`AttentionService` (`src/app/shared/attention.service.ts`) is the one place that tracks
"there's something new here" — a shared flat set of string keys (`tab:objectives`,
`character:ranger`, ...), not a bespoke boolean per feature:

- **Two visual states, not one:** `.has-attention` (animated glow,
  `@keyframes attention-glow` in `styles.scss`) is the default; `.has-attention-static`
  (a plain constant highlight, no animation) is what components fall back to when
  `SettingsService.state.reducedMotion` is on. Bind both classes off the same
  `isUnseen(key)` check — don't just hide the indicator under reduced motion, tone the
  motion down instead (same principle as the reset screen-shake, just the opposite
  choice: keep *a* signal, drop the animation).
- **Mark unseen at the real transition**, not on every render — e.g.
  `CharacterSelectService.unlock(id)` calls `markUnseen('character:'+id)` exactly once,
  the moment that character actually unlocks. Calling `markUnseen` on every evaluation
  of "is this available" would fight the persisted seen/unseen state after a reload —
  `markUnseen` is idempotent (safe to call repeatedly) but only because callers are
  expected to call it at a genuine state transition, not speculatively.
- **Mark seen on navigation/selection** — `SidePanelComponent.selectTab()` and
  `CharacterSelectComponent.select()` both call `markSeen()` for the thing being
  navigated to, in addition to whatever else that click already did.
- **Persisted** (`SaveService` includes `AttentionService.getSnapshot()`/`restore()` as
  `unseenAttention`) — an unseen indicator survives a reload; once cleared, it stays
  cleared. See §6 Objectives for how a fresh game seeds its initial shine, since there's
  no real "just unlocked" event for something available from the start.

### Game action log messages

Every game action (clicking a button, purchasing an upgrade, completing an objective,
etc.) logs a message through `ActivityLogService`, in this consistent shape:

```
<flavor sentence, present tense, ends with a period>. ({{resourceId|<signed amount> <symbol>}})
```

e.g. Fighter's button logs `You put in a hard day's work and earn some gold. ({{gold|+1 G}})`.

- **Log level:** normal actions log at `'default'` (the INFO filter in the Activity Log's
  filter bar) — reserve `'success'`/`'warn'`/`'error'`/`'rare'` for things that are
  actually noteworthy, not routine play. This is what makes the INFO filter meaningfully
  filterable — if routine actions used `'success'`, filtering it out would hide normal
  play along with the log spam.
- **Currency formatting:** the numeric delta is always the `{{resourceId|displayText}}`
  token (already parsed by `ActivityLogComponent`/`RESOURCE_FLAVOR` — see §1 "Inline
  colored tokens"), with `displayText` built from `formatSigned()`
  (`shared/number-format.ts`) plus the resource's symbol, e.g. `+1 G`. Never hand-format
  a bare number into a log string — it won't pick up the currency's color.
- **Flavor sentence source:** lives in `flavor-text.ts` next to whatever it describes
  (e.g. `CharacterFlavor.actionLogMessage` for a character's button) — not inline in the
  component — so the same "config vs. flavor" split applies to log copy as to
  everything else.
- **Consistency:** every new action type should follow this exact shape (flavor sentence
  + parenthesized colored delta, INFO level) rather than inventing a new phrasing
  pattern — see `ButtonZoneComponent.logAction` for the reference implementation.
  `UpgradesPanelComponent.buy()` is the second reference implementation (a spend instead
  of a gain — same token shape, just a negative `formatSigned` value).
- **Exception:** Dev Tools actions (§16) deliberately don't log anything — they aren't
  real game actions a player performed, so logging them would misrepresent test-state
  setup as play. Don't treat this as license to skip logging elsewhere; it's scoped to
  the Dev Tools panel specifically.