import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { VERSION } from '../configs/game-config';

interface ToggleOption {
  id: string;
  label: string;
  enabled: boolean;
}

/**
 * Save management + display settings. Toggles are local-only placeholders until the
 * real settings/persistence system exists — nothing here is wired to actual game state.
 */
@Component({
  selector: 'app-options-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './options-panel.component.html',
  styleUrl: './options-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OptionsPanelComponent {
  readonly version = VERSION;

  displayToggles: ToggleOption[] = [
    { id: 'show-playtime', label: 'Show time played on game screen', enabled: false },
    { id: 'reduced-motion', label: 'Reduced motion', enabled: false },
  ];

  toggle(option: ToggleOption): void {
    option.enabled = !option.enabled;
  }
}
