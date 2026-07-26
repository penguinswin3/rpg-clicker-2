import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { VERSION } from '../configs/game-config';

/** Simple thanks/attribution screen, opened from Options. Low-iteration surface. */
@Component({
  selector: 'app-credits-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './credits-panel.component.html',
  styleUrl: './credits-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreditsPanelComponent {
  readonly version = VERSION;
}
