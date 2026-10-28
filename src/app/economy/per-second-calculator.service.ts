import { Injectable, inject } from '@angular/core';
import { GENERATORS, GeneratorConfig, UPGRADES } from '../configs/game-config';
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
 *
 * The generator -> resource index, the active-resource list the game loop walks every
 * tick, and the set of resources any 'generator-rate' upgrade can touch are all built
 * once at construction (config is static) — so a tick allocates nothing, and an upgrade
 * purchase only recomputes resources an upgrade could actually have changed (a Hard
 * Work purchase recomputes nothing at all).
 */
@Injectable({ providedIn: 'root' })
export class PerSecondCalculatorService {
  private upgrades = inject(UpgradesService);

  private generatorsByResource = new Map<string, GeneratorConfig[]>();
  private aggregates = new Map<string, ResourceAggregate>();
  /** Every resource id with at least one registered generator — what the game loop
   *  ticks. Built once; never re-spread per tick. */
  readonly activeResourceIds: readonly string[];
  /** Resources owning a generator targeted by at least one 'generator-rate' upgrade —
   *  the only aggregates an upgrade change can affect. */
  private readonly upgradeAffectedResourceIds: readonly string[];

  constructor() {
    for (const generator of GENERATORS) {
      const list = this.generatorsByResource.get(generator.resourceId) ?? [];
      list.push(generator);
      this.generatorsByResource.set(generator.resourceId, list);
    }
    this.activeResourceIds = [...this.generatorsByResource.keys()];
    for (const resourceId of this.activeResourceIds) {
      this.recompute(resourceId);
    }

    const resourceByGenerator = new Map(GENERATORS.map(g => [g.id, g.resourceId]));
    const affected = new Set<string>();
    for (const upgrade of UPGRADES) {
      if (upgrade.effect.type !== 'generator-rate') continue;
      const resourceId = resourceByGenerator.get(upgrade.effect.generatorId);
      if (resourceId) affected.add(resourceId);
    }
    this.upgradeAffectedResourceIds = [...affected];

    // An upgrade with a 'generator-rate' effect changes a resource's aggregate without
    // WalletService ever emitting — re-derive just the resources an upgrade can reach,
    // instead of GameLoopService having to know upgrades exist.
    this.upgrades.changes$.subscribe(() => {
      for (const resourceId of this.upgradeAffectedResourceIds) {
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
