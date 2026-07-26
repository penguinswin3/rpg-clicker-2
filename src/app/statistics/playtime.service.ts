import { Injectable, inject } from '@angular/core';
import { Subject } from 'rxjs';
import { GameLoopService } from '../economy/game-loop.service';

/** Lifetime playtime, in whole seconds. Piggybacks on GameLoopService's shared 1s tick
 *  rather than starting its own timer. */
@Injectable({ providedIn: 'root' })
export class PlaytimeService {
  private gameLoop = inject(GameLoopService);

  private seconds = 0;

  private changesSource = new Subject<void>();
  readonly changes$ = this.changesSource.asObservable();

  constructor() {
    this.gameLoop.tick$.subscribe(() => {
      this.seconds++;
      this.changesSource.next();
    });
  }

  get totalSeconds(): number {
    return this.seconds;
  }

  restore(seconds: number | undefined): void {
    this.seconds = seconds ?? 0;
    this.changesSource.next();
  }
}
