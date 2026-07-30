import { Component, OnInit, OnDestroy, inject, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { FIGHTER_AREAS } from '../../configs/game-config';
import { getFighterAreaFlavor } from '../../configs/flavor-text';
import { CombatService } from '../combat.service';

@Component({
  selector: 'app-combat-controls',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './combat-controls.component.html',
  styleUrl: './combat-controls.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CombatControlsComponent implements OnInit, OnDestroy {
  private combat = inject(CombatService);
  private cdr = inject(ChangeDetectorRef);
  private sub = new Subscription();
  private countdownTimer?: ReturnType<typeof setInterval>;

  readonly areas = FIGHTER_AREAS;
  selectedAreaId = FIGHTER_AREAS[0]?.id ?? '';

  get inEncounter(): boolean {
    return this.combat.activeEncounter !== null;
  }

  get canFight(): boolean {
    return this.combat.canFight;
  }

  get lockedOutSecondsRemaining(): number {
    return Math.ceil(this.combat.lockedOutRemainingMs / 1000);
  }

  areaLabel(areaId: string): string {
    return getFighterAreaFlavor(areaId).label;
  }

  selectArea(areaId: string): void {
    if (this.inEncounter) return;
    this.selectedAreaId = areaId;
  }

  fight(): void {
    if (!this.selectedAreaId) return;
    this.combat.start(this.selectedAreaId);
  }

  flee(): void {
    this.combat.flee();
  }

  ngOnInit(): void {
    this.sub.add(this.combat.changes$.subscribe(() => this.cdr.markForCheck()));
    // The lockout countdown needs its own tick independent of changes$ (which only fires
    // on real state transitions, not every passing second) — purely cosmetic, same
    // "separate refresh loop for a live countdown" precedent as a timed action's progress
    // bar (see AGENTS.md §6).
    this.countdownTimer = setInterval(() => this.cdr.markForCheck(), 1000);
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
    if (this.countdownTimer) clearInterval(this.countdownTimer);
  }
}
