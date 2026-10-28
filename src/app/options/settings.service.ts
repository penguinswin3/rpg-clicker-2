import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface SettingsState {
  /** Playtime readout in the top bar. Always shown on the Statistics screen regardless. */
  showPlaytime: boolean;
  /** Suppresses the reset-save screen-shake and any other future incidental motion. */
  reducedMotion: boolean;
  /** Hides maxed-out upgrade cards (UpgradesPanelComponent). */
  hideMaxedUpgrades: boolean;
  /** Hides already-claimed objectives (ObjectivesPanelComponent). */
  hideCompletedObjectives: boolean;
  /** Hides Blacksmith Forge rows whose item is already owned (BlacksmithForgeComponent). */
  hideCraftedItems: boolean;
  /** Collection Log drop rates as "5%" instead of the default "1/20". */
  dropRateAsPercent: boolean;
}

const DEFAULT_SETTINGS: SettingsState = {
  showPlaytime: true,
  reducedMotion: false,
  hideMaxedUpgrades: false,
  hideCompletedObjectives: false,
  hideCraftedItems: false,
  dropRateAsPercent: false,
};

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private stateSource = new BehaviorSubject<SettingsState>(DEFAULT_SETTINGS);
  readonly state$ = this.stateSource.asObservable();

  get state(): SettingsState {
    return this.stateSource.getValue();
  }

  set(partial: Partial<SettingsState>): void {
    this.stateSource.next({ ...this.state, ...partial });
  }

  restore(snapshot: Partial<SettingsState> | undefined): void {
    this.stateSource.next({ ...DEFAULT_SETTINGS, ...snapshot });
  }
}
