import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EmptyStateComponent } from '../shared/empty-state/empty-state.component';

/** Upgrades modify button/minigame numbers and mechanics. No upgrade data yet. */
@Component({
  selector: 'app-upgrades-panel',
  standalone: true,
  imports: [CommonModule, EmptyStateComponent],
  templateUrl: './upgrades-panel.component.html',
  styleUrl: './upgrades-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UpgradesPanelComponent {}
