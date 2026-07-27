import { Component, OnInit, OnDestroy, inject, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { EmptyStateComponent } from '../shared/empty-state/empty-state.component';
import { formatAmount } from '../shared/number-format';
import { RESOURCE_FLAVOR, getObjectiveFlavor } from '../configs/flavor-text';
import { ObjectivesService, ObjectiveState } from './objectives.service';

/** Quest/tutorial milestones — "acquire N of a resource" and "perform N actions" are
 *  both implemented. Reaching a target makes a row claimable (click it to collect the
 *  reward); only after that does it shrink/gray into the completed checklist state. */
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

  claim(o: ObjectiveState): void {
    if (!o.claimable) return;
    this.objectivesService.claim(o.config.id);
  }

  isResourceObjective(o: ObjectiveState): boolean {
    return o.config.type === 'resource-threshold';
  }

  objectiveResourceId(o: ObjectiveState): string | undefined {
    return o.config.type === 'resource-threshold' ? o.config.resourceId : undefined;
  }

  objectiveVerb(o: ObjectiveState): string {
    return getObjectiveFlavor(o.config.id).verb ?? '';
  }

  resourceColor(resourceId: string): string {
    return RESOURCE_FLAVOR[resourceId]?.color ?? '#bbb';
  }

  resourceSymbol(resourceId: string): string {
    return RESOURCE_FLAVOR[resourceId]?.symbol ?? '';
  }

  /** Fill color for the progress bar — the target resource's own color for
   *  resource-threshold objectives, a neutral white for anything without one. */
  fillColor(o: ObjectiveState): string {
    const resourceId = this.objectiveResourceId(o);
    return resourceId ? this.resourceColor(resourceId) : '#fff';
  }

  progressPercent(o: ObjectiveState): number {
    return o.target > 0 ? (o.current / o.target) * 100 : 0;
  }

  formatAmount(value: number): string {
    return formatAmount(value);
  }
}
