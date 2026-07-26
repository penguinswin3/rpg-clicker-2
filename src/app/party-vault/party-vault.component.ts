import { Component, OnInit, OnDestroy, inject, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { CharacterSelectService } from '../character-select/character-select.service';
import { formatAmount, formatRate } from '../shared/number-format';
import { RESOURCES } from '../configs/game-config';
import { RESOURCE_FLAVOR } from '../configs/flavor-text';
import { WalletService } from '../economy/wallet.service';
import { PerSecondCalculatorService, ResourceSource } from '../economy/per-second-calculator.service';
import { EmptyStateComponent } from '../shared/empty-state/empty-state.component';

export interface VaultEntry {
  id: string;
  characterId: string;
  name: string;
  color: string;
  symbol: string;
  amount: number;
  ratePerSecond: number;
  sources: ResourceSource[];
  expanded: boolean;
}

@Component({
  selector: 'app-party-vault',
  standalone: true,
  imports: [CommonModule, EmptyStateComponent],
  templateUrl: './party-vault.component.html',
  styleUrl: './party-vault.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PartyVaultComponent implements OnInit, OnDestroy {
  private characterService = inject(CharacterSelectService);
  private wallet = inject(WalletService);
  private calculator = inject(PerSecondCalculatorService);
  private cdr = inject(ChangeDetectorRef);
  private sub = new Subscription();

  get characters() {
    return this.characterService.slots.filter(s => s.unlocked);
  }

  // Same filter-set model as ActivityLogService/ActivityLogComponent: an empty set
  // means "show everything", otherwise only entries matching an active character id.
  activeFilters = new Set<string>();
  private expandedIds = new Set<string>();

  get allActive(): boolean {
    return this.activeFilters.size === 0;
  }

  get filteredResources(): VaultEntry[] {
    const unlocked = RESOURCES
      .filter(r => this.wallet.isUnlocked(r.id))
      .map(r => this.buildEntry(r.id, r.characterId));

    return this.allActive
      ? unlocked
      : unlocked.filter(r => this.activeFilters.has(r.characterId));
  }

  ngOnInit(): void {
    // The wallet emits on every amount change (including passive per-second ticks) —
    // OnPush just needs a nudge to re-read the getters above.
    this.sub.add(this.wallet.changes$.subscribe(() => this.cdr.markForCheck()));
    this.sub.add(this.characterService.active$.subscribe(() => this.cdr.markForCheck()));
    this.sub.add(this.characterService.changes$.subscribe(() => this.cdr.markForCheck()));
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  private buildEntry(id: string, characterId: string): VaultEntry {
    const flavor = RESOURCE_FLAVOR[id];
    return {
      id,
      characterId,
      name: flavor.name,
      color: flavor.color,
      symbol: flavor.symbol,
      amount: this.wallet.getAmount(id),
      ratePerSecond: this.calculator.getRate(id),
      sources: this.calculator.getSources(id),
      expanded: this.expandedIds.has(id),
    };
  }

  toggleFilter(characterId: string): void {
    if (this.activeFilters.has(characterId)) {
      this.activeFilters.delete(characterId);
    } else {
      this.activeFilters.add(characterId);
    }
  }

  toggleAllFilters(): void {
    this.activeFilters = this.allActive
      ? new Set(this.characters.map(c => c.id))
      : new Set();
  }

  toggleExpanded(id: string): void {
    if (this.expandedIds.has(id)) {
      this.expandedIds.delete(id);
    } else {
      this.expandedIds.add(id);
    }
  }

  formatAmount(value: number): string {
    return formatAmount(value);
  }

  formatRate(value: number): string {
    return formatRate(value);
  }
}
