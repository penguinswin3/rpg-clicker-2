import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { CHARACTERS } from '../configs/game-config';
import { getCharacterFlavor } from '../configs/flavor-text';

export interface CharacterSlot {
  id: string;
  label: string;
  color: string;
  unlocked: boolean;
}

// Locked slots render as empty boxes (per RPG Clicker 1 feedback: visible empty slots
// signal "more are coming" without saying so).
const CHARACTER_SLOTS: CharacterSlot[] = CHARACTERS.map(c => ({
  id: c.id,
  unlocked: c.unlocked,
  ...getCharacterFlavor(c.id),
}));

/** Tracks the active/displayed character. Non-active characters keep generating in the
 *  background — this service only controls which one is currently shown. */
@Injectable({ providedIn: 'root' })
export class CharacterSelectService {
  readonly slots: CharacterSlot[] = CHARACTER_SLOTS;

  private activeSource = new BehaviorSubject<string>(CHARACTER_SLOTS[0].id);
  readonly active$ = this.activeSource.asObservable();
  get active(): string { return this.activeSource.getValue(); }

  select(id: string): void {
    const slot = this.slots.find(s => s.id === id);
    if (slot && slot.unlocked) {
      this.activeSource.next(id);
    }
  }
}
