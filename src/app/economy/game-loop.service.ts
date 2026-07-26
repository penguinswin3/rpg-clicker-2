import { Injectable, inject } from '@angular/core';
import { Subject } from 'rxjs';
import { WalletService } from './wallet.service';
import { PerSecondCalculatorService } from './per-second-calculator.service';

/**
 * Drives passive generation: once a second, applies every active generator's rate to
 * its resource. A single shared interval ticking every resource in one pass, rather
 * than a timer per resource, so cost scales with the number of *active* generators —
 * not with resource count or elapsed time. Instantiated eagerly from AppComponent so it
 * starts running as soon as the app boots, independent of which panels are on screen.
 *
 * `tick$` lets other once-a-second concerns (PlaytimeService) piggyback on this same
 * interval instead of starting their own timer — one shared tick for the whole app.
 */
@Injectable({ providedIn: 'root' })
export class GameLoopService {
  private wallet = inject(WalletService);
  private calculator = inject(PerSecondCalculatorService);

  private tickSource = new Subject<void>();
  readonly tick$ = this.tickSource.asObservable();

  constructor() {
    setInterval(() => this.tick(), 1000);
  }

  private tick(): void {
    for (const resourceId of this.calculator.activeResourceIds) {
      const rate = this.calculator.getRate(resourceId);
      if (rate !== 0) {
        this.wallet.add(resourceId, rate);
      }
    }
    this.tickSource.next();
  }
}
