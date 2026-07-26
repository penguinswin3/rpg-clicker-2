import { Component, OnInit, OnDestroy, inject, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { EmptyStateComponent } from '../shared/empty-state/empty-state.component';
import { formatAmount } from '../shared/number-format';
import { formatPlaytime } from '../shared/time-format';
import { CHARACTER_ACTIONS } from '../configs/game-config';
import { getCharacterFlavor, getActionFlavor, RESOURCE_FLAVOR } from '../configs/flavor-text';
import { StatisticsService } from './statistics.service';
import { PlaytimeService } from './playtime.service';

/** Lifetime totals, grouped by category (not character — a deliberate change from
 *  game 1). Each section only appears once there's data for it. */
@Component({
  selector: 'app-stats-panel',
  standalone: true,
  imports: [CommonModule, EmptyStateComponent],
  templateUrl: './stats-panel.component.html',
  styleUrl: './stats-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatsPanelComponent implements OnInit, OnDestroy {
  private statistics = inject(StatisticsService);
  private playtime = inject(PlaytimeService);
  private cdr = inject(ChangeDetectorRef);
  private sub = new Subscription();

  get playtimeDisplay(): string {
    return formatPlaytime(this.playtime.totalSeconds);
  }

  get actionCounts(): { label: string; count: number }[] {
    return this.statistics.getActionCounts().map(([id, count]) => ({
      label: this.actionLabel(id),
      count,
    }));
  }

  get lifetimeGained(): { color: string; name: string; amount: string }[] {
    return this.statistics.getLifetimeGained().map(([resourceId, amount]) => ({
      color: RESOURCE_FLAVOR[resourceId]?.color ?? '#bbb',
      name: RESOURCE_FLAVOR[resourceId]?.name ?? resourceId,
      amount: formatAmount(amount),
    }));
  }

  get majorUnlocks() {
    return this.statistics.getMajorUnlocks();
  }

  get hasAnyData(): boolean {
    return this.actionCounts.length > 0 || this.lifetimeGained.length > 0 || this.majorUnlocks.length > 0;
  }

  ngOnInit(): void {
    this.sub.add(this.statistics.changes$.subscribe(() => this.cdr.markForCheck()));
    this.sub.add(this.playtime.changes$.subscribe(() => this.cdr.markForCheck()));
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  formatTimestamp(ms: number): string {
    return new Date(ms).toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    });
  }

  private actionLabel(actionId: string): string {
    const action = CHARACTER_ACTIONS.find(a => a.id === actionId);
    if (!action) return actionId;
    const characterLabel = getCharacterFlavor(action.characterId).label;
    return `${getActionFlavor(actionId).label} (${characterLabel})`;
  }
}
