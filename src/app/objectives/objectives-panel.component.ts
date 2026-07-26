import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EmptyStateComponent } from '../shared/empty-state/empty-state.component';

/** Objectives are quest/tutorial milestones. No objective data yet. */
@Component({
  selector: 'app-objectives-panel',
  standalone: true,
  imports: [CommonModule, EmptyStateComponent],
  templateUrl: './objectives-panel.component.html',
  styleUrl: './objectives-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ObjectivesPanelComponent {}
