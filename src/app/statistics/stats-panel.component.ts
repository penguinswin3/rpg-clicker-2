import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EmptyStateComponent } from '../shared/empty-state/empty-state.component';

/** Lifetime totals, time played, milestone timestamps. No stat tracking wired up yet. */
@Component({
  selector: 'app-stats-panel',
  standalone: true,
  imports: [CommonModule, EmptyStateComponent],
  templateUrl: './stats-panel.component.html',
  styleUrl: './stats-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatsPanelComponent {}
