# RPG Clicker 2 — Agent Design Guide

Source of truth for this project's visual style and system architecture. Read before
building a new feature so choices match existing conventions instead of re-deriving them.
Living document — add new decisions here, correct/remove stale ones. Record only broad,
reusable decisions, not a changelog of what got built.

---

## 1. Visual Style Baseline

The [Activity Log](src/app/activity-log/) is the reference implementation — copy its
CSS/markup patterns for new components rather than inventing new ones.

- **Font:** `'Courier New', Courier, monospace` everywhere. Terminal-styled game, no
  decorative fonts.
- **No emojis, anywhere.** Use plain Unicode text glyphs for symbols (`ᱛ`, `§`, `<`, `~`,
  `¤`, `‡`), never pictographs.
- **Backgrounds:** near-black (`#000`/`#0a0a0a`/`#111`), panels darker than headers,
  headers darker than hover states.
- **Borders:** thin 1px, `#222`–`#333` for internal dividers; `#fff` only for the
  outermost separating edge.
- **Bracket iconography:** section titles in literal brackets (`[ ACTIVITY LOG ]`);
  collapse/expand uses `[-]`/`[+]` project-wide (§2) — not `[>]`-style arrows.
- **Filter/toggle bars:** small, dense, uppercase monospace buttons, 1px border, lit up
  only when active, gray (`#444`) otherwise — the model for any toggle-group UI.
- **Scrollbars:** custom thin (6px) dark scrollbars on every internally-scrolling panel.
- **Density over whitespace:** tight padding, 11–12px body text, multi-column layouts
  over single-column-with-dead-space.
- **Inline colored tokens:** log text parses `{{currencyId|displayText}}` and colors just
  that substring with the currency's accent color — reuse this "colored token inside
  plain sentence" pattern anywhere game text references a currency/resource/character.

**Layout:** Top Bar fixed to the top (title centered, Jacks/Crown docked left, Stats/
Options docked right). Center column: primary/timed-action buttons on the top half,
minigame content on the bottom half (§15). Party Vault and Character Select are
collapsible side panels. Activity Log is fixed to the bottom, full width, collapsible —
`.main-layout` reserves a constant `padding-bottom` sized for its *expanded* height so
collapsing it never shifts content above. Party Vault's header, the Button Zone's header,
and the right-hand side panel's column headers all share the same height (4px vertical
padding, 12px font) — check this by eye on any change.

Anything with a duration (timed actions §6, passive generators §8) is owned by a service,
not a component — switching character/screen/modal never pauses or resets it.

---

## 2. Collapse Direction

Collapse/expand affordances use `[-]`/`[+]` (state-based) everywhere, project-wide.

---

## 3. Color Hierarchy

| Color | Meaning |
|---|---|
| Gray (`#444`–`#aaa`) | Flavor text, dividers, timestamps, disabled/inactive state |
| White (`#bbb`–`#fff`) | Normal text, primary accents |
| Cyan (`#0ff`) | Upgrades and other "impactful" interactive elements |
| Gold (`#ffd700`) | Rare/one-off upgrades, an unclaimed reward, rare log messages |
| Purple | Relic-tier items — highest power tier |
| Green / Yellow / Red | Semantic log states: success / warn / error |

- Rate/delta displays: positive green, negative red, **exactly zero is gray** (`#666`) —
  zero is informational, not "positive."
- Pure interaction chrome (collapse arrows, etc.) biases gray/white — reserve
  cyan/gold/purple for in-game power/rarity, not UI plumbing. Exception: the Dev Tools
  nav button is cyan deliberately, to look alarming/distinct from real nav chrome.
- A claimable Objective row uses gold even though it's "just UI" — a waiting reward reads
  as rare/noteworthy.
- Every currency has a persistent color + symbol pairing; characters have colors too but
  used far more sparingly (a badge letter, not everywhere).
- `body`'s fallback `color: #bbb` is a black-on-black safety net only — always give new
  text its own explicit color.

---

## 4. Upgrades

- Modify button/minigame numbers and mechanics, paid from wallet currencies.
- Unlock requirements (prerequisite level, system unlock) are independent from
  cost/affordability.
- **Locked upgrades render no card at all** (`UpgradeConfig.unlocked` = starts unlocked,
  vs. `UpgradesService.unlock()` for everything else) — filtered before the template sees
  them, same "invisible until unlocked" treatment as Character Select (§9) and Objectives
  (§5).
- Layout: multi-column card grid, not single-column.
- No hard level cap by default.
- **`UpgradeConfig.effect` is a discriminated union** (`action-amount`, `generator-rate`,
  `timed-action-*`, the chance effects, `auto-start-timed-action`, `bonus-amount-chance`,
  `crafting-speed`, `crafting-refund-chance`, ...). Every tunable number (cost, cost
  curve, cap, magnitude) lives in `game-config.ts`, never hardcoded in the
  service/component.
- **`UpgradeConfig.costs` is a list** — one entry per currency, each on its own curve;
  purchase is all-or-nothing (never a partial charge).
- **`UpgradeConfig.prerequisite`** (a system or character) is a *live* gate on top of
  `unlocked`, checked by `UpgradesService.isAvailable` — prefer it over an objective
  reward when the gate is "this other thing exists", so existing saves that already meet
  it see the upgrade immediately. `restore()` always unions config-default-unlocked ids
  into the saved list, so a newly added `unlocked: true` upgrade shows up for old saves.
- `timed-action-duration` decays multiplicatively (`durationMs *= (1 - decayPerLevel) ^
  level`), never a flat per-level subtraction, so it approaches but never reaches zero.
- Cost curve: `cost(level) = ceil(baseCost * costScalingFactor^level)`, tuned per upgrade.
- `UpgradesService` depends only on `WalletService` plus the read-only unlock-state
  services its prerequisites check (`UnlocksService`, `CharacterSelectService`);
  consumers (`ButtonZoneComponent`, `PerSecondCalculatorService`, `CraftingService`,
  `TimedActionsService`) ask it for a bonus by id — never a two-way dependency between
  services (circular DI).
- A rate/speed bonus that can change mid-run (e.g. Faster Smelting during a hold)
  re-anchors in-progress state on `upgrades.changes$` rather than applying
  retroactively — same absolute-anchor convention as Timed Actions (§6).
- Every upgrade belongs to exactly one character (`UpgradeConfig.characterId`) and is
  filtered to the active character, same convention as Button Zone actions.

---

## 5. Objectives

- Quest-like tasks (purchase N upgrades, act N times, acquire N resource, minigame
  milestone) — copy should teach, not just track.
- **`ObjectiveConfig.type` is a discriminated union:** `resource-threshold` (lifetime
  gained, not current wallet balance — spending must never undo progress), `action-count`
  (every recorded action, summed), `specific-action-count` (one exact action id only —
  includes enemy kills via `enemyDefeatActionId`), `equipment-equipped` (every listed item
  worn at once; needs a flavor `description`, since it has no auto-generated row text).
  Any objective can override its row text with a flavor `description`.
- **Reaching a target ≠ completing it.** Hitting target makes it *claimable*; the player
  must click to claim (`ObjectivesService.claim`) — a reward never fires silently. Both
  "reached" and "claimed" are sticky, independent of the live current/target numbers.
- **`ObjectiveConfig.rewards` is a list** — one objective can unlock several things at
  once, each a single-purpose union (`character`/`system`/`upgrade`). `ObjectivesService`
  never mutates another service's state directly — always routes through the owning one.
- **Prerequisite-gated objectives** (`ObjectiveConfig.prerequisiteCharacterId` and/or
  `prerequisiteSystemId`) stay completely absent until the prerequisite unlocks, same "invisible until unlocked"
  treatment as a locked character/upgrade.
- Claiming logs at `'success'` level — an exception to the usual flavor+token log shape
  (§18), since the reward is often an unlock, not a currency amount.

---

## 6. Timed Actions (second buttons)

A character's "second button" (e.g. Guild Contract) — click to start a fixed-duration
timer, collect a flat reward on completion. Build new ones on `TimedActionsService`,
never a one-off component timer.

- Config (duration, reward, unlock gate) lives in `game-config.ts`; label/flavor in
  `flavor-text.ts` — same config/flavor split as everywhere (§18).
- **Running state is a single absolute start timestamp**, not a countdown/`setTimeout`.
  Completion = comparing real elapsed time against the *effective* duration (upgrades
  applied) on a shared interval. This is what keeps a timer running regardless of which
  screen is active, and lets it survive a reload for free.
- Completion checks run on their own fast interval (`TIMED_ACTION_TICK_MS`, 100ms) —
  deliberately not the shared 1s economy tick, so the progress fill and actual completion
  land within one tick of each other.
- Progress renders as a low-opacity fill *behind* the button's own label, not a separate
  bar underneath.
- `costScalesWithYield` (Bait Trap): a yield upgrade raises the cost proportionally, and
  an "Extra Bait [X]" checkbox above the button (absolutely positioned — it must never
  shift the button out of line) picks the full batch vs one-at-a-time. What a run
  paid for (`yieldBonus`) is locked in at start(), so toggling or buying mid-run never
  changes that run's payout.
- A `'random'`-duration action (Bait Trap) never shows the progress fill (would leak the
  hidden range) — cycles trailing dots instead. A `'fixed'`-duration action keeps the
  real fill.
- Every button in the Button Zone shares one visual size (`%zone-button` Sass
  placeholder) — only layer on top of it, never redeclare the shared properties.

---

## 7. Crafting Actions (Blacksmith-style buttons)

An action needing sustained active engagement (vs. an instant click or a passive timed
wait). Built on `CraftingService`, config in `CraftingActionConfig`.

- **Two mechanics**, a discriminated union on `mechanic.type`: `'hold'` (charge a meter
  by holding; releasing early decays it back down, doesn't pause in place) and
  `'clicks'` (plain step counter, never decays).
- **Cost is charged once**, the moment progress first leaves 0 — not refunded by
  releasing/abandoning. For `'hold'`, that payment is *staged*: decaying back to 0 after
  release doesn't require re-charging on the next press. Only a successful completion
  consumes the staged payment.
- Progress renders as the button's own background fill, same convention as Timed Actions
  (§6). A staged-but-unconsumed payment (`CraftingActionState.costPaid`) shows as a
  dashed border tinted the cost resource's color, plus "Paid" in the tooltip's Cost row —
  the fill alone can't show it once a hold has decayed back to 0. The same cue marks a
  ready-to-collect timed action (§6), tinted the reward resource's color: "dashed border
  + resource color" means "waiting on you" across the Button Zone.
- Persisted via the usual `getSnapshot()`/`restore()` pair; a `'hold'` instance's decay
  is replayed on restore using real elapsed time, same convention as Timed Actions.

---

## 8. Party Vault & Economy Performance

- Per currency: name, color, symbol, quantity, rate/second once unlocked. A currency
  appears once its amount has ever gone above zero (`WalletService.isUnlocked`) and never
  re-locks.
- Live data only: amounts from `WalletService`, rates from `PerSecondCalculatorService` —
  never static/mock values.

**Performance (`src/app/economy/`)** — this is the one subsystem guaranteed to run
continuously regardless of what's on screen, so it's built to stay cheap as
resources/generators grow:

- **Partial updates, not full recomputes** — `PerSecondCalculatorService` caches a
  per-resource `{total, sources}` aggregate; `recompute(resourceId)` only touches that
  resource's own generators. Must stay O(generators for that resource), never
  O(everything). An upgrade change only recomputes the resources a `generator-rate`
  upgrade can reach (precomputed once), and `activeResourceIds` is a fixed array built
  at construction — a game-loop tick allocates nothing.
- **Change-pulse, not snapshot cloning** — `WalletService.changes$` emits the *id* that
  changed, not a cloned wallet. Components read values imperatively and call
  `markForCheck()` (OnPush throughout).
- **One shared tick, not per-resource timers** — `GameLoopService` runs a single 1s
  interval walking every *active* generator once; cost scales with active generators,
  not resource count. Timed Actions piggyback on this same tick.
- Any future resource producer/consumer registers through `GENERATORS`/`WalletService.add`,
  never its own parallel amount/rate state.

---

## 9. Character Select

- Selects the active/displayed character only — a UI/view concern. Passive generation
  for non-active characters continues regardless of what's displayed.
- **Locked characters render no box at all** — filtered before the template sees them.
- Fighter starts unlocked; everyone else unlocks at runtime via
  `CharacterSelectService.unlock(id)`, which owns actual unlock state (saved/restored)
  independent of `game-config.ts`'s "starts unlocked" list.
- A newly-unlocked character's box shines (`AttentionService`, §18) until clicked.

---

## 10. Save

- Persists full game state: currencies, upgrades, settings, minigame/timed-action
  progress.
- Autosaves every 5 minutes, plus immediately on `visibilitychange`/`pagehide` — both
  call the same *synchronous* `save()` (a teardown handler can't reliably await
  anything).
- **Forward-compatibility is a hard requirement**: every field must be optional from the
  reader's side (sensible defaults), never repurposed — only ever add new fields. Applies
  to every future system's data shape, not just save itself.
- **Snapshot/restore convention:** every stateful service exposes
  `getSnapshot()`/`restore(snapshot)`. `SaveService` is the *only* place that
  composes/decomposes these into `SaveData` — a new persisted system means a
  getSnapshot/restore pair + one `SaveData` field + one line each in `SaveService`, never
  teaching one service about another's shape.
- **Renaming a config id** (they're save keys): add old -> new to `RENAMED_IDS`
  (`shared/renamed-ids.ts`) — every `restore()` reading id-keyed data runs it through
  `migrateId`/`migrateKeys`. Never remove an entry. A service that newly starts storing
  id-keyed data must migrate the same way.
- Storage: a single localStorage key, base64-encoded JSON (for safe copy/paste export,
  not encryption).
- Import/Reset both write to localStorage then `location.reload()` rather than
  live-patching running services.
- **Gotcha:** `location.reload()` itself fires `pagehide` on the old page before
  unloading, which would otherwise re-trigger the autosave handler and silently
  overwrite a delete/import a moment later. `SaveService.suppressAutosave` is a one-way
  flag both methods set first — any future method that touches localStorage then
  reloads must set it too.

---

## 11. Options

- Settings live in `SettingsService` (part of the save, §10), not component-local state.
- A modal launched from within another modal (e.g. Credits from Options) replaces the
  current modal rather than stacking, since `ModalService` tracks only one active modal.
- **Confirmation uses an in-app modal, never `window.confirm()`/`alert()`** (unreliable
  in embedded/automated contexts) — route every "are you sure?" through `ConfirmService`
  + `ConfirmModalComponent`. `OptionsPanelComponent.resetSave()` is the reference
  implementation.

---

## 12. Statistics

- Records lifetime totals, playtime, major-unlock timestamps, other actions. Sections
  appear only once they have an entry — no pre-seeded placeholders.
- **Recording convention:** whoever performs the action calls
  `statistics.recordAction(actionId)` directly. Lifetime-gained is auto-tracked off
  `WalletService.changes$` (only on positive delta, so a restore doesn't inflate it).
  `recordMajorUnlock` is idempotent.
- `PlaytimeService` is its own service (read live every second from the top bar), not
  folded into Statistics.

---

## 13. Jacks (automation) — design spec, not yet built

- Management pane from the top bar, left side (mirrors Options on the right); unlocked
  rather than available from the start.
- Jacks are hired/unlocked individually, then assigned per-system to automate it.
- Six stats per Jack (Strength/Dexterity/Constitution/Intelligence/Wisdom/Charisma —
  shared model, see Fighter Combat §17), each leveled individually, costing resources
  *plus* Jack-specific XP as an added gate (not a substitute).

---

## 14. The Crown (achievements) — design spec, not yet built

- Achievement system, UI similar to Jacks. Milestones/challenges/rolls award jewels;
  jewels slot in to unlock upgrades (flat multipliers to start).

---

## 14b. Collection Log

Comprehensive "everything found" checklist (`COLLECTION_LOG_SETS`, `CollectionLogService`).

- Categories (filter-bar tabs) contain sets (grid blocks) contain entries. **Uncollected
  entries show as `???`, not hidden** — the one deliberate exception to "invisible until
  unlocked", since visible gaps and real set/overall totals are the point.
- **One item = one entry.** Drops live in the set of the monster that drops them; crafted
  gear lives in its item-set. Crafting is just *how* you got something, not its own
  category. Unlocks/systems are not tracked.
- Entries are keyed on the real event (`source`: `craft`/`kill`/`drop`), recorded by
  whoever performs it (`recordCraft`/`recordKill`/`recordDrop`) — an item reaching the
  bag/wallet some other way doesn't count. Unmatched events are silent no-ops.
- Tracking runs from game start regardless of the `collectionLog` unlock (which only
  gates the modal). No backfill from before the system existed.
- Counts are always kept; `showCount` only controls display (monster drops yes, a
  once-ever crafted piece no). A first collection logs at `'rare'` — but only once
  the `collectionLog` system is unlocked; entries collected before that are recorded
  silently and never announced retroactively.
- Future rewards (per entry, per complete set, per overall %) should key off these ids
  and `CollectionLogService`'s progress methods.
- Fixed-size modal: tabs/overall pinned, only the body scrolls — new content scrolls,
  never resizes the window. Detail views (monster ASCII + stats + full loot table; item
  glyph + stats + sources) replace the grid *inside* the same modal, never a second one,
  with focus moved in on open and back to the opener on Back.
- Drop rates appear only in a monster's detail loot table (every row, collected or not —
  a `???` row still shows its rate), not on the top-level grid. Format via `formatDropRate` (`1/N` default, `%` with the `dropRateAsPercent` setting) —
  use it anywhere else a drop chance is displayed.

## 15. Minigames

- Live in the bottom half of the game screen (top half reserved for buttons, §1).
- Gated like Jacks/Crown behind `UnlocksService` — when locked, the button zone fills
  the whole center column instead of splitting.
- **`MinigameZoneComponent` hosts exactly one minigame directly** — no registry or
  tab-switcher. Gates on the active character, so a second minigame needs no "which one
  to show" decision.

---

## 16. Dev Tools

- Testing-only surface, gated behind `DEV_TOOLS_ENABLED` (`game-config.ts`).
- **Unlocks are runtime-toggleable** — `UnlocksService` wraps `UNLOCKS` in a
  `BehaviorSubject`; components subscribe to `state$`, never read the static config once,
  so an unlock (Dev Tools or a real objective) shows up immediately.
- **Dev Tools actions bypass normal game rules on purpose** — they don't log through
  `ActivityLogService` (they aren't real player actions), and Delete Save skips the
  `ConfirmService` confirmation (§11) every other destructive action requires —
  deliberate exceptions, not precedent to extend elsewhere.

---

## 17. Fighter Combat

First minigame: turn-based fight vs. a single enemy, built to extend as pure config
(`FIGHTER_ENEMIES`/`FIGHTER_AREAS`/`EQUIPMENT_ITEMS`) rather than code changes.

- **Six stats** (`shared/six-stats.ts`) are shared with Jacks (§13), not
  Fighter-combat-specific.
- **Rolls:** raw stat value added directly to `1d20` (not a D&D-style modifier) — a
  deliberate simplification that makes equipment bonuses feel impactful.
- **Max HP = Constitution × 10**, persists across fights (not reset) — a real
  risk/reward. Defeat revives at 1 HP (`FIGHTER_DEFEAT_REVIVE_HP`) plus a timed
  Fight-disabled lockout — losing costs time (lockout, then Short Rest back up), never
  progress, and is never a shortcut to full HP.
- **Combat does not fast-forward on reload — deliberately, unlike Timed Actions.** A
  turn's outcome is a dice roll; bulk-resolving elapsed offline turns would mean silently
  auto-battling an unbounded number of them. `restore()` brings back exact state and a
  fresh countdown to the next turn; the lockout timer (a plain threshold, not a dice
  roll) is the one part that *does* honor real elapsed time.
- **Short Rest** (`SHORT_REST`, owned by `CombatService` as another writer of HP): a
  Fighter Button Zone toggle, revealed with minigames, that regens a flat HP/s
  (meant to be upgradeable). Exclusive with fighting (Fight! ends it; can't start mid-fight or at full
  HP), auto-off at full HP, and disables the Fighter's other buttons while on (UI-layer
  enforcement, like gear-lock). Starting a rest interrupts the Fighter's running timed
  actions via `TimedActionsService.cancel` — no reward, no cost refund. Its on/off state persists, but regen does *not* honor
  closed-tab time — a deliberate choice, not an oversight.
- **Auto Fight** (a `'feature'` upgrade — `UpgradesService.hasFeature`): a checkbox beside
  Fight!/Flee that restarts the next encounter in the same area after a *victory* only.
  Defeat and Flee always break the chain; it never heals or protects the Fighter. The
  checkbox preference is saved on `CombatSnapshot.autoFight` independent of ownership.
- **Equipment items are fungible by id** (`EquipmentService`) — a bag count, never an
  individually-rolled instance. Slots are typed instances (not just types), since Ring
  needs two concurrent positions.
- **Gear-locked-during-combat is enforced by the UI layer**, not `EquipmentService` — the
  panels disable themselves while a fight is active; `equip()`/`unequip()` don't check
  combat state themselves. A future direct caller bypassing those components would
  silently break the invariant.
- **Rarity is display-only** — a color/label lookup, not a mechanical multiplier.
- Chance-to-attack-again and similar >100%-capable chances resolve through the shared
  "excess percent" cascade (`shared/chance.ts`), not a bespoke `Math.random()` check.
- Round-by-round attack detail logs at `'default'` level, same as any routine action —
  only the encounter's outcome logs louder.

---

## 18. Design Patterns (cross-cutting)

- **Config vs. flavor split:** game values/relations (costs, unlock requirements,
  yields, which character owns what) go in `game-config.ts`; purely cosmetic data
  (symbols, colors, names, ASCII art) goes in `flavor-text.ts`. Mutable runtime state
  derived from config lives in its own service — config is static data, never state.
- **Snapshot/restore convention:** see §10 Save.
- **`*ngFor` over a getter that returns freshly-built objects needs an explicit
  `trackBy`** keyed on a stable id. Without one, Angular's default identity-based
  diffing destroys/recreates DOM nodes on every change-detection cycle (several services
  tick every 100ms–1s regardless of OnPush), which silently breaks anything relying on
  DOM identity — hover tooltips, CSS `:hover`, element-tied timers. Reference fix:
  `ButtonZoneComponent.trackTimedAction`/`trackCraftingAction`,
  `InventoryPanelComponent.trackByItemId`.
- UI chrome is not text-selectable (`user-select: none` globally on buttons + explicit
  on non-button clickable chrome); content meant to be copied (Activity Log entries)
  opts back in.

**Attention (the "shine" indicator):** `AttentionService` tracks "there's something new
here" as a flat set of string keys (e.g. `character:ranger`) — mark unseen at the real
state transition (not speculatively), mark seen on navigation/selection, suppress the
glow for the thing currently selected (the underlying flag isn't cleared by suppression,
only by an explicit select). Two visual states bound off the same `isUnseen(key)` check:
animated glow by default, a static highlight under `reducedMotion`. Persisted in the
save.

**Tooltips:** `TooltipDirective` + `TooltipComponent` — content is a plain data object
(`{title?, rows: {label, value, color?}[]}`), not markup; the directive only owns
show/hide/positioning. Numbers shown must be live (computed through the same service
methods the real action uses), not the bare config value, so a tooltip always matches
what actually happens next. A ~350ms show delay, `pointer-events: none`, and viewport
clamping keep it unobtrusive; torn down immediately on `pointerdown`.

**Game action log messages:** every game action logs through `ActivityLogService` in one
consistent shape: `<flavor sentence, present tense>. ({{resourceId|<signed amount>
<symbol>}})`. Normal actions log at `'default'` (INFO) — reserve
`'success'/'warn'/'error'/'rare'` for genuinely noteworthy events, or the INFO filter
stops being meaningful. Flavor sentences live in `flavor-text.ts`, keyed by the thing's
own config id. Named exceptions: Dev Tools actions don't log at all; claiming an
Objective logs at `'success'` with no token.

---

## 19. Accessibility (keyboard + screen reader)

Every interactive element must be keyboard-operable and screen-reader-announced — for
all UI, present and future, not just what the initial retrofit covered.

- **Promote a clickable `<div>`/`<span>` to a real `<button>`**, rather than inventing a
  `role="button"`-plus-keydown pattern — `<button>` is the one interactive primitive
  this whole app already uses everywhere else, and it gets keyboard focus/activation for
  free. Only skip this when the element isn't actually interactive (e.g. a resource row
  with nothing to expand stays a plain `<div>`, never a focusable no-op).
- **`UiModalComponent` already gives every modal dialog semantics, a focus trap, and
  focus-return-on-close for free** (`role="dialog"`, `aria-modal`, `aria-labelledby`,
  Tab/Shift+Tab wrapped inside the panel, focus moved in on open and restored to the
  trigger on close) — route any new modal-like surface through it rather than building a
  new one.
- **`TooltipDirective` already gives every tooltip keyboard parity for free** (shows on
  focus the same as pointerenter, wires `aria-describedby`) — route any new hover-detail
  UI through it rather than building a new one.
- **Decorative content gets `aria-hidden="true"`**: ASCII art, a bracket glyph that's
  redundant with its already-labelled parent button, and every progress-fill bar
  (redundant with the adjacent real text that already states the same number/state).
  Don't add `role="progressbar"` to a fill bar — see §Design Patterns and the
  accessibility retrofit's design doc (`docs/superpowers/specs/`) for why.
- **A rare/discrete event that already logs above `'default'` level in the Activity Log
  is announced for free** via the shared live-region announcer
  (`LiveAnnouncerComponent`) — don't add a second announcement mechanism, and don't log
  high-frequency/continuous content (ticking currency, HP during a fight, running
  timers) above `'default'` just to make it live-announced; that content stays readable
  on demand as real text, not auto-announced.
- **A toggle-style button's current state gets `aria-pressed`/`aria-current`/
  `aria-checked`/`aria-expanded`** (whichever fits — see Party Vault/Activity Log filter
  bars, Character Select, Options toggles, the combat area-select for reference
  implementations) in addition to its `.active`/`.on`-style CSS class — color/border
  alone never conveys state to a screen reader.
- **"Can't afford it" ≠ disabled** when a click has something useful to say: a Blacksmith
  Forge Craft button you can't pay for is grayed via a class + `aria-disabled="true"` but
  stays clickable, so the click logs which resource is short and the tooltip still works.
  (Playwright treats `aria-disabled` as disabled — e2e clicks it with `force`.)
- **`@axe-core/playwright` runs in e2e** (`e2e/accessibility.spec.ts`, §Testing) as a
  regression gate, not the primary design tool — fix a violation at the component level
  per the conventions above, not by suppressing the check. It deliberately excludes the
  `color-contrast` rule (a pre-existing property of this game's dark terminal palette,
  out of scope for this retrofit — see the design doc's Non-goals) — don't disable any
  other rule without updating that doc's reasoning.

---

## Testing

Two layers, run after any change that could plausibly touch them:

- **Unit** (Karma/Jasmine): `npm run test:unit`. Specs co-located (`*.spec.ts`).
- **E2E** (Playwright): `npm run test:e2e`, under `e2e/`. Drives the real rendered app —
  reserve for things only observable end-to-end, not logic a unit test could exercise
  faster.
- `npm run test:all` runs both.

Key specs to extend rather than re-derive:

- **`src/testing/invariants.ts`** — reusable assertion helpers (missing-flavor,
  duplicate-id, dangling-reference, emoji-symbol checks).
- **`src/app/configs/game-config.spec.ts`** — the config-integrity suite: every id
  cross-references a real target, every id has a flavor-text counterpart, no-emoji rule,
  sane duration/cost/reward shapes. Extend for any new resource/action/upgrade/objective
  type.
- **`save.service.spec.ts`** — asserts the exported save has exactly
  `EXPECTED_SAVE_KEYS` and every service's `getSnapshot()` round-trips byte-for-byte.
  Update `EXPECTED_SAVE_KEYS` in the same change that adds a new persisted field —
  nothing else enforces it.
- **`e2e/helpers.ts`** — reusable page interactions; extend rather than re-deriving
  inline.
- **`e2e/accessibility.spec.ts`** — runs `@axe-core/playwright` against a handful of
  representative screens/states (fresh game, Fighter Combat active, Blacksmith Forge
  active, each of Options/Stats/Dev Tools open) and asserts zero violations
  (`color-contrast` excluded — see §19 Accessibility). Extend the state list whenever a
  new structurally-distinct screen is added, same spirit as the config-integrity suite.
- Locate a timed-action button by `data-testid="timed-action-<id>"`, never by label text
  (labels change across idle/running/ready phases).
- Seed exact-amount scenarios via `seedSave` (writes straight to localStorage pre-boot),
  not Dev Tools' currency grant, whenever a test asserts a specific small amount — Dev
  Tools grants a uniform million of everything.

---

## Running the app

The app is typically already running on `localhost:4200` — check there before starting a
new instance.
