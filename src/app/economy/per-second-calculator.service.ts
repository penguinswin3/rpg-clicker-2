import { Injectable, inject } from '@angular/core';
import { GENERATORS, GeneratorConfig } from '../configs/game-config';
import { UpgradesService } from '../upgrades/upgrades.service';

export interface ResourceSource {
  label: string;
  ratePerSecond: number;
}

interface ResourceAggregate {
  total: number;
  sources: ResourceSource[];
}

/**
 * Aggregates generators into a per-resource rate + source breakdown.
 *
 * Performance note: aggregates are cached per resource id and only ever recomputed for
 * the single resource affected by a change (`recompute`), never the whole table — so
 * this stays cheap as the generator count grows, regardless of how a generator's rate
 * later comes to change at runtime (an upgrade, a Jack, etc.). There is no per-frame or
 * per-tick recalculation; GameLoopService just reads the cached `getRate`/`getSources`.
 */
@Injectable({ providedIn: 'root' })
export class PerSecondCalculatorService {
  private upgrades = inject(UpgradesService);

  private generatorsByResource = new Map<string, GeneratorConfig[]>();
  private aggregates = new Map<string, ResourceAggregate>();

  constructor() {
    for (const generator of GENERATORS) {
      const list = this.generatorsByResource.get(generator.resourceId) ?? [];
      list.push(generator);
      this.generatorsByResource.set(generator.resourceId, list);
    }
    for (const resourceId of this.generatorsByResource.keys()) {
      this.recompute(resourceId);
    }

    // An upgrade with a 'generator-rate' effect changes a resource's aggregate without
    // WalletService ever emitting — re-derive every active resource's aggregate off this
    // instead of GameLoopService having to know upgrades exist.
    this.upgrades.changes$.subscribe(() => {
      for (const resourceId of this.generatorsByResource.keys()) {
        this.recompute(resourceId);
      }
    });
  }

  getRate(resourceId: string): number {
    return this.aggregates.get(resourceId)?.total ?? 0;
  }

  getSources(resourceId: string): ResourceSource[] {
    return this.aggregates.get(resourceId)?.sources ?? [];
  }

  /** Every resource id with at least one registered generator — what the game loop ticks. */
  get activeResourceIds(): string[] {
    return [...this.generatorsByResource.keys()];
  }

  /** O(generators for this resource) — never touches any other resource's aggregate. */
  private recompute(resourceId: string): void {
    const generators = this.generatorsByResource.get(resourceId) ?? [];
    const rateFor = (g: GeneratorConfig) => g.ratePerSecond + this.upgrades.getGeneratorRateBonus(g.id);
    this.aggregates.set(resourceId, {
      total: generators.reduce((sum, g) => sum + rateFor(g), 0),
      sources: generators.map(g => ({ label: g.label, ratePerSecond: rateFor(g) })),
    });
  }
}
