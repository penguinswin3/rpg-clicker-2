import { Component, OnInit, OnDestroy, inject, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { EmptyStateComponent } from '../shared/empty-state/empty-state.component';
import { formatAmount } from '../shared/number-format';
import { RESOURCE_FLAVOR } from '../configs/flavor-text';
import { ObjectivesService, ObjectiveState } from './objectives.service';

/** Quest/tutorial milestones — "acquire N of a resource" is the only type implemented
 *  so far. Completed objectives stay visible but shrink and gray out rather than
 *  disappearing, so progress reads like a checklist. */
@Component({
  selector: 'app-objectives-panel',
  standalone: true,
  imports: [CommonModule, EmptyStateComponent],
  templateUrl: './objectives-panel.component.html',
  styleUrl: './objectives-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ObjectivesPanelComponent implements OnInit, OnDestroy {
  private objectivesService = inject(ObjectivesService);
  private cdr = inject(ChangeDetectorRef);
  private sub = new Subscription();

  get objectives(): ObjectiveState[] {
    return this.objectivesService.objectives;
  }

  ngOnInit(): void {
    this.sub.add(this.objectivesService.changes$.subscribe(() => this.cdr.markForCheck()));
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  resourceColor(resourceId: string): string {
    return RESOURCE_FLAVOR[resourceId]?.color ?? '#bbb';
  }

  progressPercent(o: ObjectiveState): number {
    return o.config.targetAmount > 0 ? (o.current / o.config.targetAmount) * 100 : 0;
  }

  resourceSymbol(resourceId: string): string {
    return RESOURCE_FLAVOR[resourceId]?.symbol ?? '';
  }

  formatAmount(value: number): string {
    return formatAmount(value);
  }
}
