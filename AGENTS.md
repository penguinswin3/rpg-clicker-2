# RPG Clicker 2 — Agent Design Guide

This file is the source of truth for visual style and system design decisions in this
project. It exists so that any agent (or contributor) working on a new feature makes the
same choices a human designer steeped in this game's taste would make, without having to
re-derive them from scratch each time.

**This file is a living document.** Whenever the user (Brad) makes an opinionated design
call — a color choice, a naming decision, a "no, do it like X instead" — that decision
must be added here, not just applied once and forgotten. If you make a judgment call on
his behalf that he later corrects, update this file so the correction sticks. If a rule
here turns out to be wrong or superseded, edit or remove it rather than leaving stale
guidance.

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
- **Top Bar:** fixed to the top. Currently a placeholder (ASCII logo + dead link) — not
  yet aligned to the terminal style and should be brought in line with §1 when built out
  for real (see §7, Jacks, and §8, The Crown, both of which dock into the top bar).
- **Game Screen (center):** top half is reserved for the primary clicker button(s),
  bottom half for minigame content (see §11).
- **Side panels** (Party Vault / wallet, Character Select): collapsible sidebars.

---

## 2. Collapse Direction — Unify This

Party Vault and Character Select use `[>]`-style collapse arrows (directional, implying
"this points at where it opens"), while Activity Log uses `[-]`/`[+]` (state, not
direction). Brad flagged this as an inconsistency worth fixing, not a deliberate
distinction.

**Rule:** pick one convention project-wide. Default to the Activity Log's `[-]`/`[+]`
(state-based) since it's the "no notes" baseline component — sidebars should adopt
`[-]`/`[+]` rather than the reverse, unless Brad says otherwise when this is actually
tackled.

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
- Collapse arrows currently being cyan (like upgrades) may be a mismatch — an
  interaction-chrome element competing visually with the "impactful upgrade" color. Bias
  new chrome-only affordances (arrows, toggles, borders) toward gray/white, and reserve
  cyan/gold/purple for things that represent in-game power/rarity, not for pure UI plumbing.
- Every currency gets its own persistent color + symbol — this pairing is core to the
  game's identity (see §4 Resource Overview / Party Vault) and should extend to any new
  currency, upgrade tier, or resource-like entity (e.g. Crown jewels, Jack stats if they
  ever get symbols).
- Characters also have associated colors, but used far more sparingly than currency
  colors (e.g. a single letter/color badge in a collapsed selector) — don't over-apply
  character color the way currency color is applied everywhere.

---

## 4. Lessons Carried From RPG Clicker 1

These are Brad's retrospective notes on the first game. No immediate action is implied —
they're standing design opinions that should shape how each analogous system in RPG
Clicker 2 gets built.

### Party Vault (→ now "Resource Overview")
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
- Costs are generally paid in currencies from the wallet/Resource Overview.
- Upgrades can have **unlock requirements** independent of cost — e.g. reaching a certain
  level in a prerequisite upgrade, or an unrelated system-level unlock (a character, a
  minigame, a Jack, etc.). Unlock state and affordability are two separate gates and
  should be visually distinguishable (locked/hidden vs. visible-but-unaffordable).
- See §4 "Upgrades" above for concrete visual/UX carryovers from game 1.

## 6. Objectives

- Quest-like tasks: purchase N upgrades, click N times, acquire N of a resource, or
  complete a minigame in a specific way.
- Double as tutorialization and milestone pacing — an objective is often the first time
  a player is told a system exists, so its copy should teach, not just track.

## 7. Resource Overview (formerly "Party Vault")

- Per currency: name, color, symbol, current quantity, and (once unlocked) rate/second.
- Clicking a resource shows a breakdown of its income sources.
- Carries forward all of §4's Party Vault notes above (EXP pinned at top, tooltips for
  unexplained mechanics like progress bars, collapsible sidebar).

## 8. Character Select

- Selects the active/displayed character.
- Passive generation and automation for non-active characters continues in the
  background regardless of what's currently displayed — selection is a UI/view concern
  only, never a gameplay-pausing one.
- Carries forward §4's Character Select notes (ambient stats, empty-slot signaling,
  naming caution around "Party", sparing use of character color).

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

## 10. Options

- Player-facing tweaks, primarily save management and display settings.
- Reuse the game-1 popup/modal treatment (see §4 Options notes).

## 11. Statistics

- Records lifetime totals, time played, major unlock timestamps, and other game actions.
- New sections should appear dynamically as they become relevant rather than all being
  present (possibly empty) from the start.
- Group by action/category, not by character (a deliberate change from game 1).
- Milestone-style entries are a good pattern; consider dual-use as an achievements view.
- Time Played belongs here for sure; keep it optional/toggleable on the main game screen.

## 12. Credits

- A polished, low-maintenance thanks/credits display. Not a high-iteration surface.

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
