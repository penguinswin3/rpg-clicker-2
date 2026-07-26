import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { UNLOCKS } from '../configs/game-config';

export type UnlockKey = keyof typeof UNLOCKS;
export type UnlocksState = Record<UnlockKey, boolean>;

/**
 * Runtime-toggleable wrapper around the `UNLOCKS` defaults in `game-config.ts`. Nothing
 * flips one of these at runtime yet except Dev Tools (`DevToolsPanelComponent.unlockAllSystems`)
 * and `ObjectivesService`'s 'system' reward type — both now exist as real routes, so a
 * future Jacks/Crown/Minigames unlock objective can just call `unlock(key)` the same way
 * `CharacterSelectService.unlock()` already works for characters.
 */
@Injectable({ providedIn: 'root' })
export class UnlocksService {
  private stateSource = new BehaviorSubject<UnlocksState>({ ...UNLOCKS });
  readonly state$ = this.stateSource.asObservable();

  get state(): UnlocksState {
    return this.stateSource.getValue();
  }

  isUnlocked(key: UnlockKey): boolean {
    return this.state[key];
  }

  unlock(key: UnlockKey): void {
    if (this.state[key]) return;
    this.stateSource.next({ ...this.state, [key]: true });
  }

  unlockAll(): void {
    const next = { ...this.state };
    for (const key of Object.keys(next) as UnlockKey[]) next[key] = true;
    this.stateSource.next(next);
  }

  getSnapshot(): UnlocksState {
    return this.state;
  }

  restore(snapshot: Partial<UnlocksState> | undefined): void {
    this.stateSource.next({ ...UNLOCKS, ...snapshot });
  }
}
