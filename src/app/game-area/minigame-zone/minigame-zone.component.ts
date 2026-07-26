import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EmptyStateComponent } from '../../shared/empty-state/empty-state.component';

/** Bottom half of the game screen — hosts minigame content. Under construction. */
@Component({
  selector: 'app-minigame-zone',
  standalone: true,
  imports: [CommonModule, EmptyStateComponent],
  templateUrl: './minigame-zone.component.html',
  styleUrl: './minigame-zone.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MinigameZoneComponent {}
