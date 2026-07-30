import { Component, OnInit, OnDestroy, inject, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { EmptyStateComponent } from '../shared/empty-state/empty-state.component';
import { TooltipDirective } from '../shared/tooltip/tooltip.directive';
import { TooltipContent } from '../shared/tooltip/tooltip-content';
import { InventoryPanelComponent } from './inventory-panel/inventory-panel.component';
import { EquipmentPanelComponent } from './equipment-panel/equipment-panel.component';
import { CombatantDisplayComponent } from './combatant-display/combatant-display.component';
import { StatBlockComponent } from './stat-block/stat-block.component';
import { CombatControlsComponent } from './combat-controls/combat-controls.component';
import { CombatFeedComponent } from './combat-feed/combat-feed.component';
import { EquipmentService } from './equipment.service';
import { CombatService } from './combat.service';
import { FIGHTER_ENEMIES, EnemyConfig } from '../configs/game-config';
import { FIGHTER_COMBAT_ASCII, getFighterEnemyFlavor, getCharacterFlavor } from '../configs/flavor-text';
import { getMaxHp, SixStats } from '../shared/six-stats';

const ZERO_STATS: SixStats = {
  strength: 0, dexterity: 0, constitution: 0, intelligence: 0, wisdom: 0, charisma: 0,
};

@Component({
  selector: 'app-fighter-combat',
  standalone: true,
  imports: [
    CommonModule,
    EmptyStateComponent,
    TooltipDirective,
    InventoryPanelComponent,
    EquipmentPanelComponent,
    CombatantDisplayComponent,
    StatBlockComponent,
    CombatControlsComponent,
    CombatFeedComponent,
  ],
  templateUrl: './fighter-combat.component.html',
  styleUrl: './fighter-combat.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FighterCombatComponent implements OnInit, OnDestroy {
  private equipment = inject(EquipmentService);
  private combat = inject(CombatService);
  private cdr = inject(ChangeDetectorRef);
  private sub = new Subscription();

  readonly fighterAscii = FIGHTER_COMBAT_ASCII;
  readonly fighterName = getCharacterFlavor('fighter').label;

  get fighterHp(): number {
    return this.combat.currentFighterHp;
  }

  get fighterMaxHp(): number {
    return this.combat.fighterMaxHp;
  }

  get inEncounter(): boolean {
    return this.combat.activeEncounter !== null;
  }

  get enemyName(): string {
    const enemyId = this.combat.activeEncounter?.enemyId;
    return enemyId ? getFighterEnemyFlavor(enemyId).label : '';
  }

  get enemyAscii(): string {
    const enemyId = this.combat.activeEncounter?.enemyId;
    return enemyId ? getFighterEnemyFlavor(enemyId).ascii : '';
  }

  get enemyHp(): number {
    return this.combat.activeEncounter?.enemyHp ?? 0;
  }

  get enemyMaxHp(): number {
    const config = this.currentEnemyConfig();
    return config ? getMaxHp(config.stats) : 0;
  }

  get enemyStats(): SixStats {
    return this.currentEnemyConfig()?.stats ?? ZERO_STATS;
  }

  get fighterTooltip(): TooltipContent {
    const stats = this.equipment.getEffectiveStats();
    return {
      title: this.fighterName,
      rows: [
        { label: 'STR', value: `${stats.strength}` },
        { label: 'DEX', value: `${stats.dexterity}` },
        { label: 'CON', value: `${stats.constitution}` },
        { label: 'INT', value: `${stats.intelligence}` },
        { label: 'WIS', value: `${stats.wisdom}` },
        { label: 'CHA', value: `${stats.charisma}` },
      ],
    };
  }

  ngOnInit(): void {
    this.sub.add(this.equipment.changes$.subscribe(() => this.cdr.markForCheck()));
    this.sub.add(this.combat.changes$.subscribe(() => this.cdr.markForCheck()));
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  private currentEnemyConfig(): EnemyConfig | undefined {
    const enemyId = this.combat.activeEncounter?.enemyId;
    return FIGHTER_ENEMIES.find(e => e.id === enemyId);
  }
}
