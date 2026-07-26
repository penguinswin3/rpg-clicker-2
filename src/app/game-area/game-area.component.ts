import { Component, OnInit, OnDestroy, inject, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { ButtonZoneComponent } from './button-zone/button-zone.component';
import { MinigameZoneComponent } from './minigame-zone/minigame-zone.component';
import { UnlocksService } from '../shared/unlocks.service';

/** Center column: top half for the primary button(s), bottom half for minigames
 *  (hidden — button zone fills the column — until minigames are unlocked). */
@Component({
  selector: 'app-game-area',
  standalone: true,
  imports: [CommonModule, ButtonZoneComponent, MinigameZoneComponent],
  templateUrl: './game-area.component.html',
  styleUrl: './game-area.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GameAreaComponent implements OnInit, OnDestroy {
  private unlocks = inject(UnlocksService);
  private cdr = inject(ChangeDetectorRef);
  private sub = new Subscription();

  minigamesUnlocked = this.unlocks.isUnlocked('minigames');

  ngOnInit(): void {
    this.sub.add(this.unlocks.state$.subscribe(s => {
      this.minigamesUnlocked = s.minigames;
      this.cdr.markForCheck();
    }));
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }
}
