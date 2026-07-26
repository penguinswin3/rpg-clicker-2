import { Injectable, inject } from '@angular/core';
import { WalletService } from './wallet.service';
import { PerSecondCalculatorService } from './per-second-calculator.service';

/**
 * Drives passive generation: once a second, applies every active generator's rate to
 * its resource. A single shared interval ticking every resource in one pass, rather
 * than a timer per resource, so cost scales with the number of *active* generators —
 * not with resource count or elapsed time. Instantiated eagerly from AppComponent so it
 * starts running as soon as the app boots, independent of which panels are on screen.
 */
@Injectable({ providedIn: 'root' })
export class GameLoopService {
  private wallet = inject(WalletService);
  private calculator = inject(PerSecondCalculatorService);

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
  }
}
