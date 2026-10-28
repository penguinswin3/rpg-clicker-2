import { Component, OnInit, OnDestroy, inject, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { EmptyStateComponent } from '../shared/empty-state/empty-state.component';
import { formatAmount } from '../shared/number-format';
import { RESOURCE_FLAVOR, getObjectiveFlavor } from '../configs/flavor-text';
import { ObjectivesService, ObjectiveState } from './objectives.service';
import { SettingsService } from '../options/settings.service';

/** How long the completion flash plays — must match the `.flashing` keyframe duration
 *  in objectives-panel.component.scss, since the class is removed on this timer rather
 *  than an animationend listener. */
const FLASH_DURATION_MS = 1000;

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
  private settings = inject(SettingsService);
  private cdr = inject(ChangeDetectorRef);
  private sub = new Subscription();

  /** Ids already completed as of the last check — diffed against the live list to catch
   *  the exact tick an objective flips to completed, so the flash fires once per claim
   *  rather than replaying every time the panel re-renders. */
  private previousCompletedIds = new Set<string>();
  private flashingIds = new Set<string>();

  /** Options -> "Hide completed objectives". */
  hideCompleted = this.settings.state.hideCompletedObjectives;

  /** A just-claimed objective stays visible until its claim flash finishes, even with
   *  hideCompleted on — otherwise the flash (the only confirmation of the claim) would
   *  never be seen. */
  get objectives(): ObjectiveState[] {
    const all = this.objectivesService.objectives;
    return this.hideCompleted ? all.filter(o => !o.completed || this.flashingIds.has(o.config.id)) : all;
  }

  ngOnInit(): void {
    this.previousCompletedIds = new Set(
      this.objectivesService.objectives.filter(o => o.completed).map(o => o.config.id)
    );
    this.sub.add(this.objectivesService.changes$.subscribe(() => {
      this.detectNewlyCompleted();
      this.cdr.markForCheck();
    }));
    this.sub.add(this.settings.state$.subscribe(s => {
      this.hideCompleted = s.hideCompletedObjectives;
      this.cdr.markForCheck();
    }));
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  isFlashing(o: ObjectiveState): boolean {
    return this.flashingIds.has(o.config.id);
  }

  private detectNewlyCompleted(): void {
    const current = this.objectivesService.objectives;
    for (const o of current) {
      if (o.completed && !this.previousCompletedIds.has(o.config.id)) {
        this.flashingIds.add(o.config.id);
        setTimeout(() => {
          this.flashingIds.delete(o.config.id);
          this.cdr.markForCheck();
        }, FLASH_DURATION_MS);
      }
    }
    this.previousCompletedIds = new Set(current.filter(o => o.completed).map(o => o.config.id));
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

  /** Flavor-supplied full row text, if any — overrides the auto-generated shapes below. */
  objectiveDescription(o: ObjectiveState): string | undefined {
    return getObjectiveFlavor(o.config.id).description;
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
