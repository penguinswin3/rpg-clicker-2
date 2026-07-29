import { Component, OnInit, OnDestroy, inject, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { EmptyStateComponent } from '../shared/empty-state/empty-state.component';
import { formatAmount } from '../shared/number-format';
import { RESOURCE_FLAVOR, getUpgradeFlavor } from '../configs/flavor-text';
import { UpgradesService, UpgradeState } from './upgrades.service';
import { WalletService } from '../economy/wallet.service';
import { SettingsService } from '../options/settings.service';
import { CharacterSelectService } from '../character-select/character-select.service';

/** Upgrades modify button/minigame numbers and mechanics. `hideMaxedUpgrades`
 *  (Options) filters out anything already at its level cap. Each upgrade belongs to
 *  exactly one character (`UpgradeConfig.characterId`) and is filtered to whichever
 *  character is currently active, same as the Button Zone's own action filtering. */
@Component({
  selector: 'app-upgrades-panel',
  standalone: true,
  imports: [CommonModule, EmptyStateComponent],
  templateUrl: './upgrades-panel.component.html',
  styleUrl: './upgrades-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UpgradesPanelComponent implements OnInit, OnDestroy {
  private upgradesService = inject(UpgradesService);
  private wallet = inject(WalletService);
  private settings = inject(SettingsService);
  private characterService = inject(CharacterSelectService);
  private cdr = inject(ChangeDetectorRef);
  private sub = new Subscription();

  hideMaxed = this.settings.state.hideMaxedUpgrades;
  activeCharacterId = this.characterService.active;

  get upgrades(): UpgradeState[] {
    // Locked upgrades render no card at all — same "invisible until unlocked" treatment
    // Character Select gives a locked character (see AGENTS.md) — before hideMaxed even
    // applies.
    const forCharacter = this.upgradesService.upgrades.filter(u => u.config.characterId === this.activeCharacterId);
    const unlocked = forCharacter.filter(u => this.upgradesService.isUnlocked(u.config.id));
    return this.hideMaxed ? unlocked.filter(u => !u.maxed) : unlocked;
  }

  ngOnInit(): void {
    this.sub.add(this.upgradesService.changes$.subscribe(() => this.cdr.markForCheck()));
    this.sub.add(this.wallet.changes$.subscribe(() => this.cdr.markForCheck()));
    this.sub.add(this.settings.state$.subscribe(s => {
      this.hideMaxed = s.hideMaxedUpgrades;
      this.cdr.markForCheck();
    }));
    this.sub.add(this.characterService.active$.subscribe(id => {
      this.activeCharacterId = id;
      this.cdr.markForCheck();
    }));
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  flavor(upgradeId: string) {
    return getUpgradeFlavor(upgradeId);
  }

  resourceSymbol(resourceId: string): string {
    return RESOURCE_FLAVOR[resourceId]?.symbol ?? '';
  }

  resourceName(resourceId: string): string {
    return RESOURCE_FLAVOR[resourceId]?.name ?? '';
  }

  resourceColor(resourceId: string): string {
    return RESOURCE_FLAVOR[resourceId]?.color ?? '#bbb';
  }

  canAfford(u: UpgradeState): boolean {
    return !u.maxed && this.wallet.getAmount(u.config.resourceId) >= u.cost;
  }

  formatAmount(value: number): string {
    return formatAmount(value);
  }

  buy(upgradeId: string): void {
    this.upgradesService.purchase(upgradeId);
  }
}
