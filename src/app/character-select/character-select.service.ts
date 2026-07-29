import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
import { CHARACTERS } from '../configs/game-config';
import { getCharacterFlavor } from '../configs/flavor-text';
import { StatisticsService } from '../statistics/statistics.service';
import { AttentionService } from '../shared/attention.service';

export interface CharacterSlot {
  id: string;
  label: string;
  color: string;
  unlocked: boolean;
}

export interface CharacterSelectSnapshot {
  unlockedIds: string[];
  activeId: string;
}

/** Tracks the active/displayed character and which characters are unlocked. Non-active
 *  characters keep generating in the background — this only controls what's shown. */
@Injectable({ providedIn: 'root' })
export class CharacterSelectService {
  private statistics = inject(StatisticsService);
  private attention = inject(AttentionService);

  private readonly allIds = CHARACTERS.map(c => c.id);
  private unlockedIds = new Set<string>(CHARACTERS.filter(c => c.unlocked).map(c => c.id));

  private activeSource = new BehaviorSubject<string>(CHARACTERS[0].id);
  readonly active$ = this.activeSource.asObservable();
  get active(): string { return this.activeSource.getValue(); }

  // Emits whenever unlock state changes (a new character unlocks) so components
  // re-read `slots` — unlike `active$`, this isn't itself a stream of the changed value.
  private changesSource = new Subject<void>();
  readonly changes$ = this.changesSource.asObservable();

  get slots(): CharacterSlot[] {
    return this.allIds.map(id => ({
      id,
      unlocked: this.unlockedIds.has(id),
      ...getCharacterFlavor(id),
    }));
  }

  select(id: string): void {
    if (this.unlockedIds.has(id)) {
      this.activeSource.next(id);
    }
  }

  /** Whether a character has actually been unlocked (not just whether it's active) —
   *  used by `ObjectivesService` to gate a prerequisite-locked objective (e.g.
   *  "unlock-blacksmith" needs Ranger unlocked first) the same way a locked
   *  character/upgrade renders no box/card at all until unlocked. */
  isUnlocked(id: string): boolean {
    return this.unlockedIds.has(id);
  }

  /** Idempotent — unlocking an already-unlocked character is a no-op. */
  unlock(id: string): void {
    if (this.unlockedIds.has(id)) return;
    this.unlockedIds.add(id);
    this.statistics.recordMajorUnlock(`character-${id}`, `${getCharacterFlavor(id).label} unlocked`);
    this.attention.markUnseen(`character:${id}`);
    this.changesSource.next();
  }

  getSnapshot(): CharacterSelectSnapshot {
    return { unlockedIds: [...this.unlockedIds], activeId: this.active };
  }

  restore(snapshot: CharacterSelectSnapshot | undefined): void {
    if (snapshot?.unlockedIds?.length) {
      this.unlockedIds = new Set(snapshot.unlockedIds);
    }
    if (snapshot?.activeId && this.unlockedIds.has(snapshot.activeId)) {
      this.activeSource.next(snapshot.activeId);
    }
    this.changesSource.next();
  }
}
