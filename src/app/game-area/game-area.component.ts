import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonZoneComponent } from './button-zone/button-zone.component';
import { MinigameZoneComponent } from './minigame-zone/minigame-zone.component';
import { UNLOCKS } from '../configs/game-config';

/** Center column: top half for the primary button(s), bottom half for minigames
 *  (hidden — button zone fills the column — until minigames are unlocked). */
@Component({
  selector: 'app-game-area',
  standalone: true,
  imports: [CommonModule, ButtonZoneComponent, MinigameZoneComponent],
  templateUrl: './game-area.component.html',
  styleUrl: './game-area.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GameAreaComponent {
  readonly minigamesUnlocked = UNLOCKS.minigames;
}
