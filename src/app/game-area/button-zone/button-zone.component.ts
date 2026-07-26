import { Component, OnInit, OnDestroy, inject, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { EmptyStateComponent } from '../../shared/empty-state/empty-state.component';
import { HoldToClickDirective } from '../../shared/hold-to-click.directive';
import { formatSigned } from '../../shared/number-format';
import { CharacterSelectService } from '../../character-select/character-select.service';
import { WalletService } from '../../economy/wallet.service';
import { ActivityLogService } from '../../activity-log/activity-log.service';
import { CHARACTER_ACTIONS, CharacterActionConfig, AUTOCLICK_INTERVAL_MS } from '../../configs/game-config';
import { getCharacterFlavor, RESOURCE_FLAVOR } from '../../configs/flavor-text';

/** Top half of the game screen — hosts the primary clicker button(s), one per
 *  character. Only Fighter has an action configured so far; everyone else sees the
 *  empty state (see CHARACTER_ACTIONS in game-config.ts). */
@Component({
  selector: 'app-button-zone',
  standalone: true,
  imports: [CommonModule, EmptyStateComponent, HoldToClickDirective],
  templateUrl: './button-zone.component.html',
  styleUrl: './button-zone.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ButtonZoneComponent implements OnInit, OnDestroy {
  private characterService = inject(CharacterSelectService);
  private wallet = inject(WalletService);
  private activityLog = inject(ActivityLogService);
  private cdr = inject(ChangeDetectorRef);
  private sub = new Subscription();

  readonly autoClickIntervalMs = AUTOCLICK_INTERVAL_MS;
  activeCharacterId = this.characterService.active;

  get action(): CharacterActionConfig | undefined {
    return CHARACTER_ACTIONS.find(a => a.characterId === this.activeCharacterId);
  }

  get actionLabel(): string {
    return this.activeCharacterId ? getCharacterFlavor(this.activeCharacterId).actionLabel : '';
  }

  ngOnInit(): void {
    this.sub.add(this.characterService.active$.subscribe(id => {
      this.activeCharacterId = id;
      this.cdr.markForCheck();
    }));
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  onAction(): void {
    const action = this.action;
    if (!action) return;

    this.wallet.add(action.resourceId, action.amountPerAction);
    this.logAction(action);
  }

  private logAction(action: CharacterActionConfig): void {
    const { actionLogMessage } = getCharacterFlavor(action.characterId);
    const resource = RESOURCE_FLAVOR[action.resourceId];
    const gainToken = `{{${action.resourceId}|${formatSigned(action.amountPerAction)} ${resource.symbol}}}`;
    this.activityLog.log(`${actionLogMessage} (${gainToken})`, 'default');
  }
}
