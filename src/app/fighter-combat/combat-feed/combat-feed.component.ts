import { Component, OnInit, OnDestroy, inject, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { CombatService } from '../combat.service';
import { CombatTurnResult } from '../combat-resolution';
import { getFighterEnemyFlavor } from '../../configs/flavor-text';

@Component({
  selector: 'app-combat-feed',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './combat-feed.component.html',
  styleUrl: './combat-feed.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CombatFeedComponent implements OnInit, OnDestroy {
  private combat = inject(CombatService);
  private cdr = inject(ChangeDetectorRef);
  private sub = new Subscription();

  get turns(): CombatTurnResult[] {
    return this.combat.activeEncounter?.turns ?? [];
  }

  get enemyLabel(): string {
    const enemyId = this.combat.activeEncounter?.enemyId;
    return enemyId ? getFighterEnemyFlavor(enemyId).label : '';
  }

  describe(turn: CombatTurnResult): string {
    const actorLabel = turn.actor === 'fighter' ? 'You' : this.enemyLabel;
    if (!turn.hit) {
      return `${actorLabel} miss${turn.actor === 'fighter' ? '' : 'es'}. (${turn.attackRoll} vs ${turn.defenseRoll})`;
    }
    const prefix = turn.followUp
      ? `${actorLabel} strike${turn.actor === 'fighter' ? '' : 's'} again!`
      : `${actorLabel} hit${turn.actor === 'fighter' ? '' : 's'}!`;
    return `${prefix} ${turn.damage} damage. (${turn.attackRoll} vs ${turn.defenseRoll})`;
  }

  ngOnInit(): void {
    this.sub.add(this.combat.changes$.subscribe(() => this.cdr.markForCheck()));
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }
}
