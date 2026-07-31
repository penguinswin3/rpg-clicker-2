import { Component, OnInit, OnDestroy, inject, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription, interval } from 'rxjs';
import { TooltipDirective } from '../shared/tooltip/tooltip.directive';
import { TooltipContent, TooltipRow } from '../shared/tooltip/tooltip-content';
import { PatternCraftingService, PatternState } from './pattern-crafting.service';
import { EQUIPMENT_SLOTS, PatternConfig, TIMED_ACTION_TICK_MS } from '../configs/game-config';
import { getPatternFlavor, getRarityFlavor, RESOURCE_FLAVOR } from '../configs/flavor-text';
import { formatAmount, formatDurationMs } from '../shared/number-format';

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
  private cdr = inject(ChangeDetectorRef);
  private sub = new Subscription();

  /** Same "invisible until unlocked" convention as a locked Upgrade/Character — an
   *  unknown pattern (none exist yet; reserved for a future Uncommon+ tier) renders no
   *  row at all rather than a dimmed placeholder. */
  get visiblePatterns(): PatternState[] {
    return this.patternCrafting.patterns.filter(p => p.known);
  }

  get anyActive(): boolean {
    return this.visiblePatterns.some(p => p.active);
  }

  ngOnInit(): void {
    this.sub.add(this.patternCrafting.changes$.subscribe(() => this.cdr.markForCheck()));
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

  tooltip(config: PatternConfig): TooltipContent {
    const rows: TooltipRow[] = config.cost.map(entry => {
      const resource = RESOURCE_FLAVOR[entry.resourceId];
      return { label: 'Cost', value: `${formatAmount(entry.amount)} ${resource.symbol}`, color: resource.color };
    });
    rows.push({ label: 'Duration', value: formatDurationMs(config.durationMs) });
    return { title: getPatternFlavor(config.id).label, rows };
  }
}
