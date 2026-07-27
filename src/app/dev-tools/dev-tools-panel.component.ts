import { Component, inject, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WalletService } from '../economy/wallet.service';
import { UnlocksService } from '../shared/unlocks.service';
import { UpgradesService } from '../upgrades/upgrades.service';
import { SaveService } from '../save/save.service';
import { RESOURCES, DEV_TOOLS_CURRENCY_GRANTS } from '../configs/game-config';
import { formatAmount } from '../shared/number-format';

/**
 * Testing tools — only reachable via the top-bar "Dev Tools" button, which itself only
 * renders when `DEV_TOOLS_ENABLED` (game-config.ts) is true. These bypass normal game
 * rules on purpose (no affordability checks, no logging as a real game action) since
 * they exist to set up test states quickly, not to be played through.
 */
@Component({
  selector: 'app-dev-tools-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dev-tools-panel.component.html',
  styleUrl: './dev-tools-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DevToolsPanelComponent {
  private wallet = inject(WalletService);
  private unlocks = inject(UnlocksService);
  private upgrades = inject(UpgradesService);
  private saveService = inject(SaveService);
  private cdr = inject(ChangeDetectorRef);

  readonly currencyGrants = DEV_TOOLS_CURRENCY_GRANTS;

  statusMessage = '';

  formatAmount(value: number): string {
    return formatAmount(value);
  }

  grantCurrency(amount: number): void {
    for (const resource of RESOURCES) this.wallet.add(resource.id, amount);
    this.showStatus(`Granted ${formatAmount(amount)} of every currency.`);
  }

  unlockAllSystems(): void {
    this.unlocks.unlockAll();
    this.showStatus('Unlocked every system flag.');
  }

  maxAllUpgrades(): void {
    this.upgrades.maxAll();
    this.showStatus('Maxed every upgrade.');
  }

  halveAllUpgrades(): void {
    this.upgrades.halveAll();
    this.showStatus('Set every upgrade to half its max level.');
  }

  zeroAllUpgrades(): void {
    this.upgrades.resetAll();
    this.showStatus('Reset every upgrade to level 0.');
  }

  /** No confirmation, unlike OptionsPanelComponent.resetSave() — Dev Tools actions
   *  bypass normal game rules on purpose (see class doc). The page reloads almost
   *  immediately, so there's no status message to show. */
  deleteSave(): void {
    this.saveService.reset();
  }

  private showStatus(message: string): void {
    this.statusMessage = message;
    this.cdr.markForCheck();
    setTimeout(() => {
      this.statusMessage = '';
      this.cdr.markForCheck();
    }, 3000);
  }
}
