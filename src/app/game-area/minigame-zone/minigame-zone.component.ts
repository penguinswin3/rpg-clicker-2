import { Component, OnInit, OnDestroy, inject, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { EmptyStateComponent } from '../../shared/empty-state/empty-state.component';
import { UnlocksService } from '../../shared/unlocks.service';
import { CharacterSelectService } from '../../character-select/character-select.service';
import { FighterCombatComponent } from '../../fighter-combat/fighter-combat.component';
import { BlacksmithForgeComponent } from '../../blacksmith-forge/blacksmith-forge.component';

/** Bottom half of the game screen — hosts minigame content. The Fighter Combat minigame
 *  is the first (and, today, only) occupant, shown while minigames are unlocked and the
 *  Fighter is the active character — mirroring how Upgrades/Actions already filter to
 *  the active character. Other characters keep the empty state until they get their own
 *  minigame; a real multi-minigame switcher (mirroring SidePanelComponent's tab pattern)
 *  is a job for whenever a second one actually exists, not before. */
@Component({
  selector: 'app-minigame-zone',
  standalone: true,
  imports: [CommonModule, EmptyStateComponent, FighterCombatComponent, BlacksmithForgeComponent],
  templateUrl: './minigame-zone.component.html',
  styleUrl: './minigame-zone.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MinigameZoneComponent implements OnInit, OnDestroy {
  private unlocks = inject(UnlocksService);
  private characters = inject(CharacterSelectService);
  private cdr = inject(ChangeDetectorRef);
  private sub = new Subscription();

  minigamesUnlocked = this.unlocks.isUnlocked('minigames');
  activeCharacterId = this.characters.active;

  get showFighterCombat(): boolean {
    return this.minigamesUnlocked && this.activeCharacterId === 'fighter';
  }

  get showBlacksmithForge(): boolean {
    return this.minigamesUnlocked && this.activeCharacterId === 'blacksmith';
  }

  get showEmptyState(): boolean {
    return !this.showFighterCombat && !this.showBlacksmithForge;
  }

  ngOnInit(): void {
    this.sub.add(this.unlocks.state$.subscribe(s => {
      this.minigamesUnlocked = s.minigames;
      this.cdr.markForCheck();
    }));
    this.sub.add(this.characters.active$.subscribe(id => {
      this.activeCharacterId = id;
      this.cdr.markForCheck();
    }));
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }
}
