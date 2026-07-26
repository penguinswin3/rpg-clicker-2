import { Component, OnInit, OnDestroy, inject, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { EmptyStateComponent } from '../shared/empty-state/empty-state.component';
import { formatAmount, formatSigned } from '../shared/number-format';
import { RESOURCE_FLAVOR, getUpgradeFlavor } from '../configs/flavor-text';
import { UpgradesService, UpgradeState } from './upgrades.service';
import { WalletService } from '../economy/wallet.service';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { SettingsService } from '../options/settings.service';

/** Upgrades modify button/minigame numbers and mechanics. `hideMaxedUpgrades`
 *  (Options) filters out anything already at its level cap. */
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
  private activityLog = inject(ActivityLogService);
  private settings = inject(SettingsService);
  private cdr = inject(ChangeDetectorRef);
  private sub = new Subscription();

  hideMaxed = this.settings.state.hideMaxedUpgrades;

  get upgrades(): UpgradeState[] {
    const all = this.upgradesService.upgrades;
    return this.hideMaxed ? all.filter(u => !u.maxed) : all;
  }

  ngOnInit(): void {
    this.sub.add(this.upgradesService.changes$.subscribe(() => this.cdr.markForCheck()));
    this.sub.add(this.wallet.changes$.subscribe(() => this.cdr.markForCheck()));
    this.sub.add(this.settings.state$.subscribe(s => {
      this.hideMaxed = s.hideMaxedUpgrades;
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
    const cost = this.upgradesService.purchase(upgradeId);
    if (cost === undefined) return;

    const upgrade = this.upgradesService.upgrades.find(u => u.config.id === upgradeId);
    if (!upgrade) return;

    const { logMessage } = getUpgradeFlavor(upgradeId);
    const resource = RESOURCE_FLAVOR[upgrade.config.resourceId];
    const costToken = `{{${upgrade.config.resourceId}|${formatSigned(-cost)} ${resource.symbol}}}`;
    this.activityLog.log(`${logMessage} (${costToken})`, 'default');
  }
}
