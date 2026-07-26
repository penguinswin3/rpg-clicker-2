import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EmptyStateComponent } from '../shared/empty-state/empty-state.component';

/** Jacks are hireable automation units with 6 individually-leveled stats. No roster yet. */
@Component({
  selector: 'app-jacks-panel',
  standalone: true,
  imports: [CommonModule, EmptyStateComponent],
  templateUrl: './jacks-panel.component.html',
  styleUrl: './jacks-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class JacksPanelComponent {}
