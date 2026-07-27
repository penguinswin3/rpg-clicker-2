# RPG Clicker 2 — Agent Design Guide

This file is the source of truth for visual style and system design decisions in this
project. It exists so that any agent (or contributor) working on a new feature makes the
same choices a human designer steeped in this game's taste would make, without having to
re-derive them from scratch each time.

**This file is a living document.** Whenever the developer makes an opinionated design
decision it must be added here. If a decision changes in the future, update this file so
the correction sticks. If a rule here turns out to be wrong or superseded, edit or remove
it rather than leaving it stale. It is not required to create a section for every single
feature or screen or request — focus on broad-scale design and specific, non-obvious
instructions, not a changelog of what got built.

---

## 1. Visual Style Baseline: The Activity Log

The [Activity Log](src/app/activity-log/) is the reference implementation for the whole
game's look. It currently has "no notes" from Brad — treat its actual CSS/markup as
ground truth over any prose description below. When building a new component, prefer
copying its patterns over inventing new ones.

Concretely, that means:

- **Font:** `'Courier New', Courier, monospace` everywhere. This is a terminal-styled
  game — no rounded, humanist, or decorative fonts.
- **No emojis, ever — anywhere, for anything.** Not in currency/resource symbols, not in
  log messages, not in UI chrome, not even as a "temporary" placeholder. Where an icon or
  symbol is needed (e.g. a currency's `RESOURCE_FLAVOR.symbol`, §7), use a plain Unicode
  text glyph instead — e.g. `ᱛ`, `§`, `<`, `~`, `¤`, `‡` — the same family of characters
  already in use, not a pictograph/emoji standing in for one.
- **Backgrounds:** near-black (`#000`, `#0a0a0a`, `#111`), never a "modern UI"
  light/gray-white surface. Panels are darker than their headers, headers darker than
  hover states.
- **Borders:** thin, 1px, mostly `#222`–`#333` for internal dividers, brighter (`#fff`)
  only for the outermost separating edge (e.g. `.log-panel`'s `border-top: 2px solid #fff`).
- **Bracket/terminal iconography:** section titles wrapped in literal brackets, e.g.
  `[ ACTIVITY LOG ]`; toggle affordances are literal characters: `[-]` to collapse,
  `[+]` to expand — see §2 for the unified convention.
- **Filter/segmented-button bar:** small, dense, uppercase, monospace buttons with a
  1px border that only lights up (color + border + subtle tinted background) when
  active; muted gray (`#444`) otherwise. This is the model for any toggle-group UI
  (filters, category tabs, on/off switches).
- **Scrollbars:** custom-styled thin (6px) dark scrollbars, not the OS default — apply
  this to any other internally-scrolling panel (log body, upgrade list, statistics list).
- **Density over whitespace:** tight `padding`, small `font-size` (11–12px body text),
  `line-height: 1.5`. This is a data-dense terminal UI, not a spacious modern SaaS
  dashboard. Prefer dense, multi-column layouts over single-column lists with dead space
  (see §4 Upgrades for the concrete example).
- **Inline colored tokens:** the log parses `{{currencyId|displayText}}` tokens and
  colors just that substring using the currency's accent color, leaving surrounding
  text uncolored. This "colored token inside plain sentence" pattern should be reused
  anywhere game text references a currency, resource, or character by name.

### Layout anchor points

- **Activity Log:** fixed to the bottom of the viewport, full width, collapsible.
  **Collapsing/expanding it must never move anything above it.** `.main-layout`
  (`app.component.scss`) reserves a constant `padding-bottom` sized for the log's
  *expanded* height regardless of its current collapsed/expanded state — that padding
  eats into `.main-layout`'s own box, so shrinking it to match a collapsed log (the
  original approach) visibly shifted every centered zone above it (Button Zone,
  minigames) on every toggle. A collapsed log now just leaves empty space below the
  reserved area instead of the reserved area itself shrinking — that trade-off (a gap
  vs. content jumping) is deliberate; don't "fix" the gap by resizing the padding again.
- **Top Bar:** fixed to the top — ASCII title centered, Jacks/Crown docked left
  (unlock-gated), Stats/Options docked right. Nav buttons stretch to fill the bar's full
  height (`align-items: stretch` on `.top-bar`/`.nav-group`) rather than sitting small
  and center-aligned within it — do this for any button added to the bar later.
- **Game Screen (center):** top half is reserved for the primary clicker button(s) and
  any unlocked timed-action buttons (see §6), bottom half for minigame content (§15).
- **Side panels** (Party Vault / wallet, Character Select): collapsible sidebars.
- **Header row alignment:** Party Vault's `.panel-header`, the Button Zone's
  `.zone-header`, and the side panel's `.tab-bar` all sit in the same visual row and
  must be the same height — same vertical padding (4px) and font-size (12px) on all
  three, even though the tab bar's buttons need their own active/inactive coloring.
  Check this by eye whenever any of the three changes; a mismatch here is immediately
  obvious since the whole row visibly steps.
- **Buttons keep running in the background regardless of what's on screen.** The primary
  click button's effect is instant, but anything with a duration (timed actions, §6;
  passive generators, §7) is owned by a service, not a component — switching character,
  opening a modal, or navigating away never pauses or resets one. See §6 for how this is
  guaranteed concretely.

---

## 2. Collapse Direction

**Rule:** collapse/expand affordances use `[-]`/`[+]` (state-based) project-wide — this
is the Activity Log's convention, the "no notes" baseline component. Party Vault and
Character Select's `[>]`-style directional arrows were an inconsistency, not a
deliberate distinction; sidebars adopt `[-]`/`[+]` rather than the reverse.

---

## 3. Color Hierarchy

There is a deliberate, tiered color language. Keep new UI inside this palette rather than
introducing arbitrary new colors:

| Color | Meaning |
|---|---|
| Gray (`#444`–`#aaa`) | Flavor text, dividers, timestamps, disabled/inactive state |
| White (`#bbb`–`#fff`) | Normal text, primary accents (e.g. the main button, active state) |
| Light blue / Cyan (`#0ff`) | Upgrades and other "impactful" interactive elements |
| Gold (`#ffd700`) | Rare, one-off upgrades, a reward waiting to be claimed, and rare log messages (tier above cyan) |
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
- Collapse arrows / pure interaction-chrome should bias toward gray/white, not cyan —
  reserve cyan/gold/purple for things that represent in-game power/rarity, not UI
  plumbing. **Deliberate exception:** the top-bar "Dev Tools" button (only rendered when
  `DEV_TOOLS_ENABLED` in `game-config.ts` is true) is cyan specifically to look
  distinct/alarming from real nav chrome, not to extend "impactful upgrade" meaning to it.
- A claimable Objective row (§5) uses gold, not gray/white chrome, even though it's
  arguably "just UI" — a reward sitting there waiting to be collected reads closer to a
  rare/noteworthy event than to pure interaction chrome.
- Every currency gets its own persistent color + symbol — this pairing is core to the
  game's identity (see §7 Party Vault) and should extend to any new currency, upgrade
  tier, or resource-like entity. Characters also have associated colors, but used far
  more sparingly than currency colors (e.g. a single letter/color badge in a collapsed
  selector) — don't over-apply character color the way currency color is applied
  everywhere.
- **Gotcha:** `body` has a fallback `color: #bbb` (`styles.scss`) specifically so plain
  text with no explicit color rule doesn't render invisible black-on-black. Still give
  every new text element its own explicit color per this table; the fallback is a safety
  net, not a substitute.

---

## 4. Upgrades

- Upgrades modify the numbers and mechanics of buttons and minigames (multipliers,
  unlocks, mechanical changes — not just flat stat bumps), paid from wallet currencies.
- **Unlock requirements are independent from cost/affordability** — e.g. a prerequisite
  upgrade level, or a system-level unlock. Visually distinguish locked/hidden vs.
  visible-but-unaffordable.
- **Locked upgrades render no card at all** (`UpgradeConfig.unlocked` — "starts the game
  unlocked", same meaning as `CharacterConfig.unlocked` — vs. `UpgradesService.unlock()`
  for everything else) — `UpgradesPanelComponent` filters to unlocked before the
  template sees them, same "invisible until unlocked" precedent Character Select set for
  a locked character (§8), rather than a dimmed/locked placeholder card. Unlocking
  re-shines the Upgrades tab (`AttentionService`) since that's exactly the "a newly
  available upgrade was just revealed" moment §6/Attention describes.
- **Layout:** a multi-column card grid (`auto-fill, minmax(140px, 1fr)`), not a
  single-column list — a single column leaves a lot of dead space when only one upgrade
  category is unlocked yet. Each card shows name, description, current level/cap, and a
  cyan Buy button (in-game-power color, §3) with cost + currency symbol, or a gray
  "MAXED" label.
- Descriptions should be concise but unambiguous about whether an effect is flat or
  scales per level (game 1's terse "+1" was ambiguous on this). Prefer showing both the
  current and next level's effect where space allows — game 1 only ever showed next.
- **No hard level cap by default** unless there's a specific design reason for one (game
  1's cap of 999 was arbitrary and effectively unreachable).
- Build resource-symbol tooltips in from the start, especially for goal/unlock-gated
  symbols the player hasn't seen yet (§7's symbol-per-currency rule).
- **Config shape is a discriminated union on purpose** — `UpgradeConfig.effect` covers
  `action-amount`, `generator-rate`, `timed-action-yield` (flat bonus to a timed
  action's payout — High Quality Contracts), `timed-action-duration` (see below —
  Faster Contracts), and `payout-double-chance` (chance to double a gold payout,
  rolled independently each time any of `targetActionIds` grants a reward — Bonus
  Payout, shared across Hard Labor *and* Guild Contract via one upgrade). Every number
  an upgrade needs — cost, cost curve, level cap, effect magnitude — lives in
  `game-config.ts`, never hardcoded in `UpgradesService` or the panel component.
- **`timed-action-duration` is multiplicative decay, not a flat "-Nms per level."**
  `durationMs *= (1 - decayPerLevel) ^ level` — a flat per-level subtraction would hit
  zero/negative at high levels; decaying toward (never reaching) zero is what makes each
  additional level a genuinely smaller absolute improvement than the last. Faster
  Contracts' `decayPerLevel: 0.1` on Guild Contract's 10s base reads as "~1s faster" at
  level 1 (10s → 9s) while still diminishing every level after — tune `decayPerLevel`
  per upgrade to roughly `1 / baseDurationMs` if a future one wants that same "~1 unit
  faster at level 1" feel.
- **A doubled payout logs at `'rare'`, not `'default'`** — `payout-double-chance` is
  rolled at the exact moment a payout is granted (`ButtonZoneComponent.onAction`,
  `TimedActionsService.complete`), not baked into the base amount, and a lucky double is
  noteworthy enough to earn the louder log level (see "Game action log messages" below).
- **Cost curve:** `cost(level) = ceil(baseCost * costScalingFactor^level)`, where `level`
  is the number of levels already owned. `costScalingFactor` is per-upgrade, not global
  (1.15 for `hard-work`, a common incremental-game default) — tune it per upgrade.
- `UpgradesService` only depends on `WalletService`; `ButtonZoneComponent`
  (`getActionAmountBonus`) and `PerSecondCalculatorService` (`getGeneratorRateBonus`) ask
  it for a bonus by id, and it never reaches back into either — two services depending on
  each other directly would be a circular DI error, same principle as
  `ObjectivesService` → `CharacterSelectService`.
- `generator-rate` effects and `getGeneratorRateBonus` are fully wired but unexercised
  (`GENERATORS` is still empty) — registering a real generator later should "just work"
  without touching `PerSecondCalculatorService` again.
- Purchasing logs like any other game action (see "Game action log messages" below).
  `UpgradesService.purchase()` returns the cost actually charged (not just a boolean) so
  the log can report the real number without recomputing it after the level changed.
- `hideMaxedUpgrades` (`SettingsService`) filters maxed upgrades out of the list when on.
- **Every upgrade belongs to exactly one character** (`UpgradeConfig.characterId`) —
  `UpgradesPanelComponent` filters to whichever character is currently active
  (`CharacterSelectService.active`/`active$`), the same per-character filtering the
  Button Zone already does for `CHARACTER_ACTIONS`/`TIMED_ACTIONS`. An upgrade never
  shows while its character isn't selected, even if unlocked.

---

## 5. Objectives

- Quest-like tasks: purchase N upgrades, act N times, acquire N of a resource, or
  complete a minigame in a specific way. Doubles as tutorialization and milestone
  pacing — an objective's copy should teach, not just track.
- **Implemented types**, a discriminated union on `ObjectiveConfig.type`:
  - `resource-threshold` — acquire N of a resource *lifetime*, not "currently hold N in
    the wallet" — reads `StatisticsService.getLifetimeGainedFor(resourceId)`, not
    `WalletService.getAmount`. Spending gold on an upgrade must never undo progress
    toward "obtain 100 gold"; tracking the wallet balance directly would let it. This is
    also why `ObjectivesService` doesn't depend on `WalletService` at all.
  - `action-count` — perform N actions, summed across *every* recorded action
    (`StatisticsService.getActionCounts()`), not one specific character/button, so it
    stays meaningful as more characters/actions are added.
  - Purchase-N-upgrades and minigame-specific types still need their own union member
    when built — don't bolt them onto either existing shape.
- **Reaching a target is not the same as completing it.** Hitting the target makes an
  objective *claimable*; the player must click the row (`ObjectivesService.claim`) to
  actually apply the reward and mark it done — an objective's reward never fires
  silently the instant a number crosses a threshold. "Reached" and "claimed" are both
  sticky, tracked independently of the live current/target numbers — spending back down
  (or however a future counter might regress) never un-reaches or un-claims something
  already past that point.
- Claiming is a real player action and logs through the Activity Log at `'success'`
  level — a deliberate exception to the usual flavor-sentence-plus-colored-token shape
  (see "Game action log messages" below), since an objective's reward is often a
  character/system unlock, not a currency amount, so there's no token to append.
- **`ObjectiveConfig.rewards` is a *list*, not a single value** — one objective can
  unlock several things at once. Each entry is still a single-purpose union
  (`character` | `system` | `upgrade`) since completing an objective won't always unlock
  a character — sometimes it's a system (Jacks, Crown, Minigames, Guild Contract, ...),
  an upgrade, or several of each. `'upgrade'` unlocks via `UpgradesService.unlock()` now
  that upgrades have a real locked/unlocked concept (§4). Never have `ObjectivesService`
  mutate another service's state directly — always route through the owning service
  (`CharacterSelectService`, `UnlocksService`, `UpgradesService`).
- **"Work 15 times" is the first objective** (`work-15-times` in `OBJECTIVES` — array
  order is display order), an `action-count` objective whose four rewards unlock the
  Guild Contract timed-action button (§6) *and* its three upgrades (High Quality
  Contracts, Faster Contracts, Bonus Payout — §4) all at once. Its target count is a
  config number (`targetCount`), not a magic number in code or copy — any future
  "do N things" objective should be built the same way.
- **Progress bar / completed-row treatment:** each unclaimed row fills left-to-right in
  the target's color (a neutral white for objectives with no single resource, e.g.
  `action-count`) at low opacity, behind the text. A claimable-but-unclaimed row gets a
  gold border and a "CLAIM" label instead of the live progress numbers (§3 on why gold
  here, not gray/white chrome). Completed rows drop the fill and shrink/gray out
  entirely rather than disappearing — a persistent checklist, consistent with
  Statistics' milestone pattern (§11).
- **"New objective available" shine:** seeded once for a brand-new save
  (`SaveService.seedFreshGameAttention`) since every objective today has no prerequisite.
  Once objectives can be locked behind a prerequisite, whichever system reveals a
  newly-available one should call `attention.markUnseen('tab:objectives')` at that
  moment instead of relying on the fresh-game seed.

---

## 6. Timed Actions (second buttons)

A character's "second button" — Guild Contract (Fighter, 10s duration, +15 Gold,
`TIMED_ACTIONS` in `game-config.ts`) is the first, unlocked by the "Work 15 times"
objective (§5). Click to start a fixed-duration timer; collect a flat reward once it
finishes.

- **Progress renders as the button, not below it** — a low-opacity fill grows
  left-to-right *behind* the button's own label while running (`.timed-button-fill`,
  same layered-fill-behind-text shape as the Objectives row's `.objective-fill`, §5),
  rather than a separate progress bar underneath. A disabled/running button already
  reads as "busy"; the fill communicates how much longer, in the same space.
- **Buttons in the Button Zone lay out left-to-right, not stacked.** The primary button
  and every unlocked timed-action button are siblings in one row (`.zone-body`,
  wrapping if there isn't room) — a new second/third button for a character extends the
  row, it doesn't add a new vertical section.
- **Every button in this zone shares one visual size**, not just a family resemblance —
  the primary button and every timed-action button extend the same `%zone-button` Sass
  placeholder (`button-zone.component.scss`: font-size, padding, border all come from
  there), so a new button type is never smaller/larger than Hard Labor by accident. Only
  layer on top of it (fill overlay, disabled state, hold-pulse) — don't redeclare the
  shared properties on a new button class.
- **The "hold to repeat" hint retires itself once it's done its job — permanently, not
  just for the session.** Hold-to-click buttons (`HoldToClickDirective`) must have a
  visible affordance — game 1 had none and players never discovered the mechanic — but
  once the player has actually held one (not just tapped it: the directive's
  `holdRepeat` output only fires the first time a press produces a real repeat, distinct
  from `appHoldToClick`'s per-tick output), that action id is marked in
  `HoldHintService` (`src/app/shared/hold-hint.service.ts`, keyed by
  `CharacterActionConfig.id`) and the hint stops rendering for that action for good —
  persisted (`SaveData.holdHints`) so it doesn't come back after a reload. Keeps the UI
  teaching the mechanic exactly once, ever, then getting out of the way.

**This is the pattern for every timed/manual "start it and wait" button in the game,
not just Guild Contract** — build new ones on `TimedActionsService`
(`src/app/timed-actions/`) rather than a one-off component timer:

- **All the numbers are config, not code** — `TimedActionConfig` (duration, reward
  resource + amount, which `UnlocksService` key gates visibility) lives in
  `game-config.ts`; the button label and completion log flavor live in `flavor-text.ts`
  (`TIMED_ACTION_FLAVOR`) — same config-vs-flavor split as everything else.
- **Running state is a single absolute start timestamp**, not a countdown or a
  `setTimeout`. Completion is resolved by comparing real elapsed time
  (`Date.now() - startedAt`) against the *effective* duration
  (`UpgradesService.getTimedActionDurationMs`, §4) on `TIMED_ACTION_TICK_MS`'s interval —
  this is what makes a timer keep running, and finish on time, no matter which
  character/screen is currently displayed: nothing about completion depends on the
  button's component staying mounted. It's also what makes a timer survive a page reload
  mid-run for free — a restored start timestamp just means "more time has already
  elapsed" on the very next tick.
- **Completion checks run on their own fast interval, deliberately not
  `GameLoopService`'s shared 1s tick.** `TIMED_ACTION_TICK_MS` (`game-config.ts`, 100ms)
  is one constant shared by `TimedActionsService.checkCompletions()` *and*
  `ButtonZoneComponent`'s progress-bar refresh, specifically so the fill hitting 100%
  and the action actually completing land within one tick of each other. Piggybacking on
  the 1s economy tick (the original design) let the bar sit at a "done-looking" 100% for
  up to a second before the button re-enabled and the reward paid out — a visible hang at
  the end. `GENERATORS`' shared-tick performance rationale (§7) is about keeping cost
  proportional to *how many* generators are active, which doesn't apply here — there are
  only ever a handful of timed actions, so polling them every 100ms is cheap regardless,
  and getting the visual/actual completion moment to line up matters more than sharing
  the tick.
- Persisted via the usual `getSnapshot()`/`restore()` pair (start timestamps only,
  `SaveData.timedActions`).
- A running timer never blocks anything else — the primary click button, other timed
  actions, navigation, all keep working normally while one is in progress.
- The visible progress-bar animation is a separate, purely cosmetic refresh loop owned
  by the consuming component (`ButtonZoneComponent`, on `TIMED_ACTION_TICK_MS`) — it only
  makes already-current state look smooth; it never drives whether or when the action
  actually completes.
- **A `TimedActionConfig.duration` of type `'random'` (Bait Trap) never shows the
  progress fill** — the fill's whole value is showing real elapsed/total info, and a
  random duration is deliberately hidden from the player (§ below), so filling it would
  leak the ratio and let an attentive player estimate the range. Its running button
  instead cycles 1-3 trailing dots on the label (`ButtonZoneComponent.waitingDots`, purely
  a function of wall-clock time, no extra state) — a "still working" pulse, not a
  readout. A `'fixed'` duration (Guild Contract) keeps the real fill, since its length is
  already known/stable.
- **A `requiresCollection` action's "ready to collect" button (Bait Trap's Collect Prey)
  stays plain white, not gold** — a deliberate exception to §3/§5's "a reward waiting to
  be collected reads gold" rule. That rule is for a *rare, one-off* moment (an Objective
  claim); a timed action can cycle through ready/collected indefinitely as a routine part
  of play, so treating it as a rare-tier event would be misleading and would visually
  compete with genuinely rare moments elsewhere.
- **Bait Trap** (Ranger's second button): costs 1 Bait to start (`TimedActionConfig.cost`),
  rolls a random 5-20s duration once at start (hidden from the player), then requires an
  explicit collect click for 1 Raw Meat + a 10% chance at 1 Pelt
  (`TimedActionConfig.bonusReward`, cascading past 100% the same "excess percent" way as
  Better Offcuts, §4 above — see `shared/chance.ts`).

---

## 7. Party Vault

- Per currency: name, color, symbol, current quantity, and (once unlocked) rate/second.
  Clicking a resource shows a breakdown of its income sources.
- EXP (once it exists) is the most shared currency in the game and should be pinned at
  the top rather than sorted in with the rest.
- Any new mechanic needs at least minimal in-context explanation (tooltip, log message,
  or objective tie-in) — game 1's EXP progress bar looked great but was never explained
  anywhere in-game.
- **Unlock rule:** a currency only appears once its amount has gone above zero at least
  once (`WalletService.isUnlocked`), and stays visible even if spent back down to zero —
  it never re-locks. Filtering by character (`ALL` + one filter button per unlocked
  character, Activity-Log filter-bar style) is a separate, independent concern from
  unlock state.
- **Live data, not static mock values:** amounts come from `WalletService`, rates +
  source breakdowns from `PerSecondCalculatorService`. See the Performance subsection
  below before changing either — the aggregation and change-notification shape is
  deliberate, not incidental.
- The collapsed sidebar interaction is a pattern worth reusing broadly elsewhere too.

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
  generators, not with resource count or wall-clock granularity. Timed Actions (§6) piggy
  back on this same tick rather than starting their own timer. If sub-second precision
  is ever needed, switch this to a delta-time accumulator rather than adding more timers.
- Any future system that produces or consumes resources (Upgrades, Jacks, minigames)
  should register through `GENERATORS`/`WalletService.add`, not maintain its own parallel
  amount/rate state — that's what would break the partial-update guarantee above.

---

## 8. Character Select

- Selects the active/displayed character. Passive generation and automation for
  non-active characters continues in the background regardless of what's currently
  displayed — selection is a UI/view concern only, never a gameplay-pausing one.
- Showing read-only ambient stats (e.g. Gold/Bounty) next to the selector is good even
  though it needs no interaction.
- **Locked characters render no box at all** (`CharacterSelectComponent.slots` filters
  to `unlocked` before the template ever sees them) — a deliberate reversal from "leave
  a visibly empty slot to signal more is coming"; don't quietly revert to placeholder
  boxes.
- Naming/framing risk: "Party" implies both (a) more characters are coming, and (b) that
  you assemble a sub-party like a traditional RPG. (b) isn't planned — be careful that
  naming doesn't over-promise a mechanic that isn't planned; prefer naming that doesn't
  imply it if it's not planned.
- Flavor text is cute but of questionable value — low priority, don't over-invest here.
- The collapsed color+letter badge for quick character selection is a good, reusable
  pattern (ties into §3's sparing use of character color).
- **Dynamic unlocking:** Fighter starts unlocked; every other character unlocks at
  runtime via `CharacterSelectService.unlock(id)` (Ranger's is the "unlock-ranger"
  objective, §5). `CHARACTERS` in `game-config.ts` only says which characters *start*
  unlocked — `CharacterSelectService` owns actual unlock state, and it's what gets
  saved/restored.
- A newly-unlocked character's box shines (`AttentionService`, see Attention below)
  until the player clicks it. `.slots` is a live getter + `changes$` — any new component
  reading it must subscribe to `changes$` too, not just read it once at construction
  (see `CharacterSelectComponent`/`PartyVaultComponent`).

---

## 9. Save

- Persists currencies, upgrades, active screens/configuration, minigame progress, timed
  action running state — full game state.
- Autosaves every 5 minutes, plus immediately on `visibilitychange` (tab hidden) and
  `pagehide` (navigation/reload/close) so a closed tab never loses much progress. Both
  handlers call the same synchronous `save()` as the interval — don't make save async, a
  page teardown handler can't reliably await anything.
- **Forward-compatibility is a hard requirement**: the save format must be designed so
  old saves keep loading correctly as the game evolves (additive/versioned schema,
  sensible defaults for fields that didn't exist yet, no silent breakage on new fields).
  Treat this as a constraint on every future system's data shape, not just the save
  system itself.

### Implementation (`src/app/save/`)

- **Storage:** `SaveService` writes/reads a single localStorage key
  (`rpg-clicker-2-save`), holding the base64 encoding of the save JSON (`SaveData` in
  `save-data.ts`). Base64 isn't encryption or compression — it's just what makes the
  blob safe to copy/paste as plain text for export/import.
- **The snapshot/restore convention:** every stateful service exposes
  `getSnapshot()`/`restore(snapshot)`. `SaveService` is the *only* place that composes
  these into one `SaveData` object or decomposes one back out. Adding a new persisted
  system means adding a getSnapshot/restore pair to that system's own service + one
  field in `SaveData` + one line in `SaveService.serialize()`/`parse()` — never teach an
  existing service about another one's shape.
- **Forward-compat mechanics, concretely:** `SaveData.schemaVersion` is ours to bump for
  real migrations later; every field is read with `??`/optional-chaining fallbacks on
  the reader side (inside each service's own `restore()`), so a save missing a field
  that didn't exist yet just gets that service's default — never add a required field
  or repurpose an existing one, always add a new optional one.
- **`createdAt` vs `updatedAt`:** `createdAt` is set once (first boot with no existing
  save, or right after a reset) and carried forward on every subsequent save;
  `updatedAt` is stamped fresh on every save.
- **Export:** `copyToClipboard()` and `downloadAsFile()` both just call the same
  `exportBase64()` — one save representation, two delivery mechanisms.
- **Import:** `importBase64()` validates, writes to localStorage, then does a full
  `location.reload()` rather than live-patching running services — safer than trying to
  hydrate an already-running app, and the same code path boot-time load already uses.
  Reset follows the same reload pattern.
- **Gotcha — the pagehide autosave races a deliberate reload.** `reset()` and
  `importBase64()` both write to localStorage and then call `location.reload()`, but
  `location.reload()` itself fires `pagehide` on the still-running old page *before* it
  actually unloads — which would otherwise trigger the pagehide autosave handler above
  and immediately re-serialize the untouched in-memory services, silently overwriting
  the delete/import a moment after it happened (this is exactly why "Reset Save" used to
  look like a no-op). `SaveService.suppressAutosave` is a one-way flag both methods set
  right before reloading so that race can't happen — any future method that touches
  localStorage directly and then reloads must set it too.

---

## 10. Options

- Player-facing tweaks, primarily save management and display settings.
- Popup/modal treatment is reused for any settings-like surface. Credits is a button
  inside Options ("// Credits") that opens the Credits modal in place of the Options
  modal rather than stacking on top, since `ModalService` only tracks one active modal
  at a time — follow this pattern for any other "modal launched from within a modal"
  case rather than extending `ModalService` to a stack.
- Show the version number.
- Section headers styled like terminal comments (e.g. `// Save`) fit the aesthetic well
  — reuse for grouping settings. On/off toggles styled as a literal checkbox-like box,
  not a modern rounded switch.
- **Settings live in `SettingsService`**, not component-local state — they're part of
  the save (§9) and read by other components (`showPlaytime` gates the top-bar readout,
  §11; `reducedMotion` gates the reset screen-shake; `hideMaxedUpgrades` gates the
  upgrades list, §4). Any new toggle goes here.
- Export/import/reset are real, not disabled placeholders (§9). Reset asks for
  confirmation first — a deliberate exception to "don't add validation for things that
  can't happen," since losing an entire save is high-cost and easy to trigger by
  accident.
- **Confirmation uses an in-app modal, never `window.confirm()`/`alert()`.** Native
  dialogs are unreliable outside a plain browser tab — blocked or auto-dismissed in
  embedded/automated contexts — so every "are you sure?" moment routes through
  `ConfirmService` (`src/app/shared/confirm.service.ts`) + `ConfirmModalComponent`
  instead: a caller sets the pending message/action (`confirmService.ask(...)`) and opens
  it the same way Credits opens from Options (`modalService.open('confirm')`, replacing
  the current modal rather than stacking). `OptionsPanelComponent.resetSave()` is the
  reference implementation — any future destructive action should call this, not
  `confirm()`.

---

## 11. Statistics

- Records lifetime totals, time played, major unlock timestamps, and other game actions.
- New sections appear dynamically as they become relevant, only once they have at least
  one entry — don't pre-seed empty/placeholder sections or rows.
- Group by action/category, not by character (a deliberate change from game 1).
- Milestone-style entries are a good pattern and could double as an achievements view. A
  speedrun-style angle on play time made game 1 meaningfully more interesting late —
  keep this in mind as a hook for Statistics/Objectives design later (timed milestones,
  speedrun categories), even though nothing needs to be built for it yet.
- **Recording convention:** whoever performs the action calls
  `statistics.recordAction(actionId)` directly. Lifetime-gained is the one exception,
  tracked automatically off `WalletService.changes$` (only when `delta > 0`, so a
  save-load restore doesn't inflate it). `recordMajorUnlock(id, label)` is idempotent —
  safe to call again for an already-recorded id without duplicating the entry.
- Time Played belongs on this screen for sure, but is questionable as a
  constantly-visible element on the main game screen — keep it toggleable there
  (`SettingsService.state.showPlaytime`) rather than always-on; the Stats screen itself
  always shows it regardless of the setting.
- **`PlaytimeService` is its own service**, not folded into `StatisticsService` — it
  needs to be read live from the top bar every second, whereas the rest of Statistics
  only changes on discrete events. It piggybacks on `GameLoopService.tick$` (§7's
  Performance subsection) rather than starting its own timer.

---

## 12. Credits

- A polished, low-maintenance thanks/credits display. Not a high-iteration surface.
- Attributed to Brad Carlin for now (`CreditsPanelComponent`), opened from a button
  inside Options (§10) rather than the top bar directly.

---

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

---

## 14. The Crown (achievements)

- Functions as the game's achievement system, displayed with a UI similar to Jacks.
- Milestones, challenges, or random rolls award **jewels**.
- Jewels slot into "the Crown" to unlock powerups/upgrades — flat multipliers to start,
  with room for more significant system-level effects later.

---

## 15. Minigames

- Live in the bottom half of the game screen; the top half is reserved for the primary
  button(s) and timed-action buttons (§1 Layout anchor points, §6).
- Currently under construction — no established visual pattern yet. When designed, they
  should still follow §1's terminal/monospace baseline rather than introducing a
  visually distinct "minigame skin."
- **Gated like Jacks/Crown:** hidden until `UnlocksService.isUnlocked('minigames')` is
  true — when locked, the button zone simply fills the whole center column instead of
  splitting 50/50, rather than showing a locked placeholder in the bottom half.
  `GameAreaComponent` subscribes to `UnlocksService.state$` (not a one-time read) so
  unlocking at runtime reveals the minigame zone without a reload.

---

## 16. Dev Tools

- A testing-only surface, not a player-facing system — only exists to set up game
  states quickly during development. Gated at the entry point: the top-bar "Dev Tools"
  button (cyan — see §3's deliberate-exception note) only renders when
  `DEV_TOOLS_ENABLED` (`game-config.ts`) is true, and flipping that flag off removes the
  only way to reach it.
- **Unlocks are runtime-toggleable** — `UnlocksService` (`src/app/shared/unlocks.service.ts`)
  wraps the `UNLOCKS` defaults from `game-config.ts` in a `BehaviorSubject`, exposing
  `isUnlocked(key)` / `unlock(key)` / `unlockAll()` / `getSnapshot()` / `restore()`.
  Components subscribe to `UnlocksService.state$` rather than reading `UNLOCKS` once
  statically, so an unlock (from Dev Tools or a real objective, §5) shows up immediately
  without a reload.
- **Dev Tools actions bypass normal game rules on purpose** — granting currency skips
  the wallet's normal earn paths, and none of these five actions log through
  `ActivityLogService`. This is a deliberate exception to "every game action logs a
  message" (see below): these aren't game actions a player takes, they're test-state
  setup, so routing them through the Activity Log would misrepresent them as real play.
  Feedback instead uses the same transient `statusMessage` pattern as
  `OptionsPanelComponent`'s save actions.
- **The six tools**, each backed by a real service method rather than reaching into
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
  6. Delete the save — `SaveService.reset()`, with **no** confirmation step, unlike
     Options' Reset Save (§10). This is the one intentional exception to "every
     destructive action goes through `ConfirmService`" — Dev Tools exists specifically
     to blow away state quickly while iterating, so adding a confirm step here would
     fight the panel's own purpose.

---

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
  `RESOURCES`, `GENERATORS`, `TIMED_ACTIONS`) and, where it has cosmetics, a matching
  `flavor-text.ts` export merged in at the point of use — don't merge the two concerns
  into one object. Mutable runtime state derived from that config (wallet amounts,
  unlock flags, computed rates, timed-action start timestamps) lives in its own service
  instead — config is static data, not state.
- Every service holding persisted runtime state exposes `getSnapshot()`/`restore()` (see
  §9 Save) — this is what makes it possible for `SaveService` to compose/decompose the
  whole game's state without any service needing to know about any other's shape.
- UI components should generally not be selectable with the cursor. Implemented via a
  global `button { user-select: none; }` in `styles.scss` (covers every button-based
  control) plus explicit `user-select: none` on non-`<button>` clickable chrome (modal
  close, options toggle rows, expandable resource rows, objective rows). Content meant to
  be copied (Activity Log entries) opts back in explicitly and should keep doing so.

### Attention (the "shine" indicator)

`AttentionService` (`src/app/shared/attention.service.ts`) is the one place that tracks
"there's something new here" — a shared flat set of string keys (`tab:objectives`,
`character:ranger`, ...), not a bespoke boolean per feature:

- **Two visual states, not one:** `.has-attention` (animated glow,
  `@keyframes attention-glow` in `styles.scss`) is the default; `.has-attention-static`
  (a plain constant highlight, no animation) is what components fall back to when
  `SettingsService.state.reducedMotion` is on. Bind both classes off the same
  `isUnseen(key)` check — don't just hide the indicator under reduced motion, tone the
  motion down instead.
- **Mark unseen at the real transition**, not on every render — e.g.
  `CharacterSelectService.unlock(id)` calls `markUnseen('character:'+id)` exactly once,
  the moment that character actually unlocks. `markUnseen` is idempotent (safe to call
  repeatedly) but only because callers are expected to call it at a genuine state
  transition, not speculatively.
- **Mark seen on navigation/selection** — `SidePanelComponent.selectTab()` and
  `CharacterSelectComponent.select()` both call `markSeen()` for the thing being
  navigated to, in addition to whatever else that click already did.
- **Persisted** (`SaveService` includes `AttentionService.getSnapshot()`/`restore()` as
  `unseenAttention`) — an unseen indicator survives a reload; once cleared, it stays
  cleared. See §5 Objectives for how a fresh game seeds its initial shine, since there's
  no real "just unlocked" event for something available from the start.

### Game action log messages

Every game action (clicking a button, purchasing an upgrade, a timed action paying out,
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
  token, with `displayText` built from `formatSigned()` (`shared/number-format.ts`) plus
  the resource's symbol, e.g. `+1 G`. Never hand-format a bare number into a log string
  — it won't pick up the currency's color.
- **Flavor sentence source:** lives in `flavor-text.ts` next to whatever it describes
  (e.g. `ACTION_FLAVOR`/`UPGRADE_FLAVOR`/`TIMED_ACTION_FLAVOR`/`OBJECTIVE_FLAVOR`, keyed
  by the thing's own config id) — not inline in the component or service — so the same
  "config vs. flavor" split applies to log copy as to everything else.
- **Consistency:** every new action type should follow this exact shape (flavor sentence
  + parenthesized colored delta, INFO level) rather than inventing a new phrasing
  pattern — see `ButtonZoneComponent.logAction`/`TimedActionsService.logCompletion` for
  reference implementations.
- **Named exceptions** to the shape above, both deliberate: Dev Tools actions (§16)
  don't log at all (they aren't real game actions a player performed); claiming an
  Objective (§5) logs at `'success'` with no parenthesized token (the reward is often a
  character/system unlock, not a currency amount). Don't treat either as license to skip
  or bend the convention elsewhere — both are scoped to exactly the case described.

## Testing

Two layers, run after any change that could plausibly touch them — this is a *regression
suite* meant to be extended alongside every feature, not a one-time exercise:

- **Unit** (Karma/Jasmine): `npm run test:unit` (headless, single run) or `ng test`
  (interactive watch mode). Specs are co-located (`*.spec.ts` next to the file they test).
- **E2E/smoke** (Playwright): `npm run test:e2e`, spec files under `e2e/`. Drives the real
  rendered app in a headless browser against whatever dev server is already up on 4200
  (or starts one) — reserve this layer for things only observable end-to-end (rendered
  DOM/CSS state, full click-through flows across multiple components), not for logic a
  unit test could exercise faster.
- `npm run test:all` runs both.

### Unit suite

- **`src/testing/invariants.ts`** holds small, reusable assertion helpers shared across
  specs (missing-flavor / duplicate-id / dangling-reference / emoji-symbol checks so far)
  — add to it rather than re-deriving the same check inline in a new spec.
- **`src/app/configs/game-config.spec.ts` is the config-integrity suite** — the generic
  "did I forget to register X" safety net that should be extended for any new
  resource/action/timed action/upgrade/objective: every id cross-references a real target
  (resourceId, characterId, actionId, timedActionId, upgradeId...), every id has a
  flavor-text.ts counterpart with non-empty fields, every symbol is checked against the
  no-emoji rule (§1), a `requiresCollection` timed action has an explicit `readyLabel`,
  and duration/cost/reward shapes are sane (positive amounts, `minMs < maxMs`, etc). This
  is what catches a forgotten flavor-text entry before it ships as a blank button label,
  or a typo'd cross-reference before it silently no-ops at runtime.
- **`per-second-calculator.service.spec.ts`** guards "per-second rates are accounted
  for" — every resource returns a finite rate, `activeResourceIds` matches `GENERATORS`
  exactly, and a resource's rate is the sum of its generators (each bumped by
  `getGeneratorRateBonus`). `GENERATORS` is still empty (§7), so the one test that needs a
  real generator to mean anything calls `pending()` rather than faking an assertion —
  replace that with a real test the moment the first generator is registered, don't leave
  a placeholder passing for its own sake.
- **`save.service.spec.ts`** guards "every registered component is reflected in the
  save" — asserts the exported save has exactly `EXPECTED_SAVE_KEYS` (a hand-maintained
  checklist mirroring `SaveData`) and that every currently-known service's
  `getSnapshot()` round-trips through `exportBase64()` byte-for-byte.
  **`EXPECTED_SAVE_KEYS` must be updated in the same change that adds a new persisted
  field/service** — nothing can enforce that automatically (there's no service registry
  to reflect over), so this list is deliberately the forcing function.
- **"Statistic tracking is present" is guarded in two places, one per action family:**
  `button-zone.component.spec.ts` loops every `CHARACTER_ACTIONS` entry (not hardcoded by
  name) and asserts `onAction()` calls `StatisticsService.recordAction` with that exact
  id; `timed-actions.service.spec.ts` asserts the same for `TIMED_ACTIONS`, but on
  *completion/collection* (`TimedActionsService.payout()`), not on `start()` — a Guild
  Contract or Bait Trap only counts toward an `action-count` objective like "Work 15
  times" once it's actually paid out, the same way a primary-button press only counts
  once it's actually clicked, not "queued." (This was a real gap until reported and fixed
  during this suite's construction — `payout()` didn't call `recordAction` at all
  originally, so timed-action completions silently didn't count.)

### E2E suite (`e2e/`)

- **`e2e/helpers.ts`** has the reusable page interactions (Dev Tools grants, claiming
  objectives, selecting a character, tracking console errors, locating a timed-action
  button) — extend it rather than re-deriving a Dev Tools dance inline in a new spec.
- **Locate a timed-action button by `data-testid="timed-action-<id>"`
  (`timedActionButton` in helpers.ts, `button-zone.component.html`), never by its current
  label text.** A timed action's label is exactly what changes across its
  idle/running/ready phases (e.g. Bait Trap: "Bait Trap" -> "Waiting..." -> "Collect
  Prey") — a `hasText`-filtered locator stops matching the instant the very state a test
  is asserting on changes the label. Same reasoning gave the primary button a
  `primary-action-<id>` test id, for consistency, even though no primary label changes
  dynamically today.
- **Seed exact-amount scenarios via `seedRangerUnlockedSave`/`seedSave` (writes a save
  straight to localStorage before boot), not Dev Tools' currency grant, whenever a test
  asserts a specific small currency amount.** Dev Tools only grants a million of *every*
  resource at once — fine for reaching an unlock threshold, but it also pollutes
  Bait/Raw Meat/Pelt, and `formatAmount`'s 3-significant-digit rounding makes a later +1
  invisible on top of 1,000,000 (both display as "1M"). `seedSave` writes only the fields
  a scenario actually cares about — every field is optional from the reader's side per
  the Save section's forward-compat rule (§9), verified by `save.service.spec.ts` — so
  the rest defaults to a genuinely empty wallet.

### A real bug this suite already caught

**Any `*ngFor` over a live/computed array needs a `trackBy` if the array's items are
freshly-constructed objects on every read** — `TimedActionsService.actions` maps to new
`TimedActionState` objects on every call, so without `trackBy` Angular's default
identity-based diffing sees a "new" object every change-detection cycle and
destroys/recreates the DOM node instead of reusing it, including on the periodic
`TIMED_ACTION_TICK_MS` refresh while a timed action is running. Found via e2e flakiness
(Playwright's `boundingBox()` intermittently seeing a detached node mid-cycle), not by
inspection — `ButtonZoneComponent.trackTimedAction` (keyed on `config.id`) is the
reference fix. Apply the same pattern to any future `*ngFor` over a similarly-shaped live
getter.

## Running the app
- I will typically have the app running on localhost port 4200, try to use that if available. 