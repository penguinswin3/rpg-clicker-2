import { Component, OnInit, OnDestroy, inject, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription, interval } from 'rxjs';
import { SettingsService } from '../options/settings.service';
import { WalletService } from '../economy/wallet.service';
import { TooltipDirective } from '../shared/tooltip/tooltip.directive';
import { TooltipContent } from '../shared/tooltip/tooltip-content';
import { PatternCraftingService, PatternState } from './pattern-crafting.service';
import { EQUIPMENT_SLOTS, PatternConfig, TIMED_ACTION_TICK_MS } from '../configs/game-config';
import { getPatternFlavor, getRarityFlavor, RESOURCE_FLAVOR } from '../configs/flavor-text';
import { formatAmount, formatDurationMs } from '../shared/number-format';

/** One cost entry rendered inline — pre-colored via the resource's own accent color, the
 *  same "colored token" idiom used everywhere else a resource amount is shown. */
export interface CostDisplayEntry {
  text: string;
  color: string;
  /** Hover text naming the resource — same native-`title` treatment as an upgrade's
   *  cost icon (UpgradesPanelComponent). */
  name: string;
}

/** Every possible statusLabel() string — real data, not a hand-counted length, so
 *  craftButtonMinWidthPx can't silently drift out of sync if the wording ever changes. */
const CRAFT_BUTTON_LABELS = ['Craft', 'Crafting...', 'Forge Busy', 'OWNED'];

/** .craft-button's own horizontal padding (2 * 10px) + border (2 * 1px) —
 *  blacksmith-forge.component.scss. A min-width sized purely off character count (`ch`)
 *  has no effect until it's large enough to also cover this chrome too, since the button
 *  is `box-sizing: border-box` — same reasoning as ButtonZoneComponent's own
 *  `timedActionMinWidthPx`. Keep in sync if `.craft-button`'s padding/border change. */
const CRAFT_BUTTON_HORIZONTAL_CHROME_PX = 22;

/** .craft-button's own font-size/letter-spacing — same file. A `ch` unit only measures
 *  one glyph, not the letter-spacing gap after it, so the raw character count
 *  underestimates a long label's real width without this correction. Keep in sync if
 *  `.craft-button`'s font-size/letter-spacing change. */
const CRAFT_BUTTON_FONT_SIZE_PX = 12;
const CRAFT_BUTTON_LETTER_SPACING_EM = 0.05;

/** The Blacksmith's second minigame-zone occupant (see MinigameZoneComponent) — a fixed
 *  list of equipment slot-lines, each craftable once known and not yet owned. Only one
 *  craft can be active across the whole list; see PatternCraftingService. */
@Component({
  selector: 'app-blacksmith-forge',
  standalone: true,
  imports: [CommonModule, TooltipDirective],
  templateUrl: './blacksmith-forge.component.html',
  styleUrl: './blacksmith-forge.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BlacksmithForgeComponent implements OnInit, OnDestroy {
  private patternCrafting = inject(PatternCraftingService);
  private settings = inject(SettingsService);
  private wallet = inject(WalletService);
  private cdr = inject(ChangeDetectorRef);
  private sub = new Subscription();

  /** Same "invisible until unlocked" convention as a locked Upgrade/Character — an
   *  unknown pattern (none exist yet; reserved for a future Uncommon+ tier) renders no
   *  row at all rather than a dimmed placeholder. */
  get visiblePatterns(): PatternState[] {
    const known = this.patternCrafting.patterns.filter(p => p.known);
    return this.hideCrafted ? known.filter(p => !p.owned) : known;
  }

  /** Options -> "Hide crafted items" — an owned row has nothing left to do. */
  hideCrafted = this.settings.state.hideCraftedItems;

  /** Across every known pattern, not just the visible ones — hiding owned rows must
   *  never hide the fact that the forge is busy. */
  get anyActive(): boolean {
    return this.patternCrafting.patterns.some(p => p.active);
  }

  /** Fixed width sized for the longest possible status label ("Crafting...") — every
   *  Craft button shares this one width, so a button never resizes/shifts as its own
   *  label cycles between Craft/Crafting.../Forge Busy/OWNED, or as a *different* row's
   *  button switches to "Forge Busy" while this one is active. Same `ch` + chrome +
   *  letter-spacing technique as ButtonZoneComponent.timedActionMinWidthPx, just constant
   *  across every row here rather than computed per-row, since the label set is fixed
   *  rather than varying per pattern. */
  readonly craftButtonMinWidthPx: string = (() => {
    const chars = Math.max(...CRAFT_BUTTON_LABELS.map(l => l.length));
    const letterSpacingPx = CRAFT_BUTTON_FONT_SIZE_PX * CRAFT_BUTTON_LETTER_SPACING_EM * Math.max(chars - 1, 0);
    return `calc(${chars}ch + ${CRAFT_BUTTON_HORIZONTAL_CHROME_PX + letterSpacingPx}px)`;
  })();

  ngOnInit(): void {
    this.sub.add(this.patternCrafting.changes$.subscribe(() => this.cdr.markForCheck()));
    // Affordability (the grayed-out Craft look) changes whenever a cost resource does.
    this.sub.add(this.wallet.changes$.subscribe(() => this.cdr.markForCheck()));
    this.sub.add(this.settings.state$.subscribe(s => {
      this.hideCrafted = s.hideCraftedItems;
      this.cdr.markForCheck();
    }));
    // Re-renders the active row's progress fill on the same cadence
    // PatternCraftingService checks completion on — purely visual, same reasoning as
    // ButtonZoneComponent's own TIMED_ACTION_TICK_MS refresh (AGENTS.md §6).
    this.sub.add(
      interval(TIMED_ACTION_TICK_MS).subscribe(() => {
        if (this.anyActive) this.cdr.markForCheck();
      })
    );
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  trackPattern(_: number, p: PatternState): string {
    return p.config.id;
  }

  label(p: PatternState): string {
    return getPatternFlavor(p.config.id).label;
  }

  slotLabel(p: PatternState): string {
    return EQUIPMENT_SLOTS.find(s => s.slotType === p.config.slotType)?.label ?? p.config.slotType;
  }

  rarityLabel(p: PatternState): string {
    return getRarityFlavor(p.config.rarity).label;
  }

  rarityColor(p: PatternState): string {
    return getRarityFlavor(p.config.rarity).color;
  }

  /** Disabled unless this exact pattern can be started right now — already owned, or
   *  any craft (including this one) currently in progress, both block it. */
  craftDisabled(p: PatternState): boolean {
    return p.owned || this.anyActive;
  }

  /** Can't pay for it right now — grayed like a disabled button, but deliberately left
   *  clickable (aria-disabled, not `disabled`): a click still logs which resource is
   *  short (PatternCraftingService.start), and the hover tooltip keeps working. Only
   *  meaningful while the row would otherwise be craftable. */
  isUnaffordable(p: PatternState): boolean {
    return !this.craftDisabled(p) && !this.patternCrafting.canAfford(p.config);
  }

  statusLabel(p: PatternState): string {
    if (p.active) return 'Crafting...';
    if (p.owned) return 'OWNED';
    if (this.anyActive) return 'Forge Busy';
    return 'Craft';
  }

  craft(p: PatternState): void {
    if (this.craftDisabled(p)) return;
    this.patternCrafting.start(p.config.id);
  }

  /** The inline on-row cost display. */
  costEntries(config: PatternConfig): CostDisplayEntry[] {
    return config.cost.map(entry => {
      const resource = RESOURCE_FLAVOR[entry.resourceId];
      return { text: `${formatAmount(entry.amount)} ${resource.symbol}`, color: resource.color, name: resource.name };
    });
  }

  /** Only what the row doesn't already show — cost is displayed inline to the left
   *  (`costEntries`), so repeating it here would just be noise. */
  tooltip(config: PatternConfig): TooltipContent {
    return { title: getPatternFlavor(config.id).label, rows: [{ label: 'Duration', value: formatDurationMs(config.durationMs) }] };
  }
}
