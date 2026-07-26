import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EmptyStateComponent } from '../shared/empty-state/empty-state.component';

/** The Crown: achievements that award jewels, slotted in for powerups. No entries yet. */
@Component({
  selector: 'app-crown-panel',
  standalone: true,
  imports: [CommonModule, EmptyStateComponent],
  templateUrl: './crown-panel.component.html',
  styleUrl: './crown-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CrownPanelComponent {}
