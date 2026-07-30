import { Injectable, inject } from '@angular/core';
import { Subject } from 'rxjs';
import { WalletService } from '../economy/wallet.service';
import { StatisticsService } from '../statistics/statistics.service';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { EquipmentService } from './equipment.service';
import { CombatCombatant, CombatTurnResult, resolveTurn, rollInitiative } from './combat-resolution';
import { getMaxHp } from '../shared/six-stats';
import {
  FIGHTER_AREAS,
  FIGHTER_ENEMIES,
  FIGHTER_BASE_STATS,
  EnemyConfig,
  COMBAT_CHECK_MS,
  COMBAT_TURN_MS,
  FIGHTER_DEFEAT_LOCKOUT_MS,
} from '../configs/game-config';
import { getEquipmentFlavor, getFighterEnemyFlavor } from '../configs/flavor-text';
import { resourceAmountToken } from '../shared/resource-token';

interface ActiveEncounter {
  areaId: string;
  enemyId: string;
  enemyHp: number;
  actorTurn: 'fighter' | 'enemy';
  turns: CombatTurnResult[];
}

export interface CombatSnapshot {
  fighterHp: number;
  lockedOutUntil: number | null;
  activeEncounter: ActiveEncounter | null;
}

/** Capped length of a live encounter's turn transcript — defensive bound against a
 *  future higher-HP/lower-damage enemy running an unbounded number of turns, same
 *  reasoning as MAX_LOG_MESSAGES. */
const MAX_TRANSCRIPT_TURNS = 50;

/**
 * Owns the Fighter's persistent combat HP, the post-defeat lockout, and at most one
 * active encounter. Modeled on TimedActionsService's absolute-timestamp-anchor pattern:
 * a dedicated interval checks whether the next turn is due and resolves exactly one
 * (`resolveTurn`, combat-resolution.ts) when it is — this is what keeps a fight running
 * even if the player switches to another character or screen, and what makes Flee
 * meaningful (nothing about the outcome is pre-decided).
 *
 * Reload does not fast-forward combat: unlike a TimedActionConfig's single deterministic
 * completion threshold, a turn's outcome is random, so bulk-resolving however many turns
 * would have happened during a closed tab would mean silently auto-battling an unbounded
 * number of them. restore() brings back the exact state and gives a fresh COMBAT_TURN_MS
 * countdown to the next turn from the moment of load. lockedOutUntil, being a plain
 * threshold like a timed action's duration, does correctly honor real elapsed time
 * across a closed tab.
 */
@Injectable({ providedIn: 'root' })
export class CombatService {
  private wallet = inject(WalletService);
  private equipment = inject(EquipmentService);
  private statistics = inject(StatisticsService);
  private activityLog = inject(ActivityLogService);

  private fighterHp = getMaxHp(FIGHTER_BASE_STATS);
  private lockedOutUntil: number | null = null;
  private encounter: ActiveEncounter | null = null;
  private nextTurnAt = 0;

  private changesSource = new Subject<void>();
  readonly changes$ = this.changesSource.asObservable();

  constructor() {
    setInterval(() => this.checkTurn(), COMBAT_CHECK_MS);
  }

  get fighterMaxHp(): number {
    return getMaxHp(this.equipment.getEffectiveStats());
  }

  get currentFighterHp(): number {
    return Math.min(this.fighterHp, this.fighterMaxHp);
  }

  get lockedOutRemainingMs(): number {
    if (!this.lockedOutUntil) return 0;
    return Math.max(0, this.lockedOutUntil - Date.now());
  }

  get canFight(): boolean {
    return this.encounter === null && this.lockedOutRemainingMs === 0;
  }

  get activeEncounter(): ActiveEncounter | null {
    return this.encounter;
  }

  /** No-op if a fight is already in progress, the area is unknown, or currently locked
   *  out. Picks uniformly at random among the area's enemyIds (today, always the only
   *  one), rolls initiative once, and schedules the first turn COMBAT_TURN_MS from now. */
  start(areaId: string): void {
    if (!this.canFight) return;
    const area = FIGHTER_AREAS.find(a => a.id === areaId);
    if (!area || area.enemyIds.length === 0) return;
    const enemyId = area.enemyIds[Math.floor(Math.random() * area.enemyIds.length)];
    const enemyConfig = FIGHTER_ENEMIES.find(e => e.id === enemyId);
    if (!enemyConfig) return;

    const fighter = this.fighterCombatant();
    const enemy = this.enemyCombatant(enemyConfig);
    const actorTurn = rollInitiative(fighter, enemy);

    this.encounter = { areaId, enemyId, enemyHp: enemy.hp, actorTurn, turns: [] };
    this.nextTurnAt = Date.now() + COMBAT_TURN_MS;
    this.changesSource.next();
  }

  /** Always succeeds immediately — ends the encounter with no loot and no lockout. */
  flee(): void {
    if (!this.encounter) return;
    this.encounter = null;
    this.activityLog.log('You disengage and flee the fight.', 'default');
    this.changesSource.next();
  }

  private fighterCombatant(): CombatCombatant {
    return {
      stats: this.equipment.getEffectiveStats(),
      hp: this.currentFighterHp,
      bonusDamage: this.equipment.getBonusDamage(),
      damageReduction: this.equipment.getDamageReduction(),
      extraAttackChance: this.equipment.getExtraAttackChance(),
    };
  }

  private enemyCombatant(config: EnemyConfig, hpOverride?: number): CombatCombatant {
    return {
      stats: config.stats,
      hp: hpOverride ?? getMaxHp(config.stats),
      bonusDamage: 0,
      damageReduction: 0,
      extraAttackChance: 0,
    };
  }

  private checkTurn(): void {
    // Populated in the next step.
  }

  getSnapshot(): CombatSnapshot {
    return {
      fighterHp: this.fighterHp,
      lockedOutUntil: this.lockedOutUntil,
      activeEncounter: this.encounter,
    };
  }

  restore(snapshot: CombatSnapshot | undefined): void {
    this.fighterHp = snapshot?.fighterHp ?? getMaxHp(FIGHTER_BASE_STATS);
    this.lockedOutUntil = snapshot?.lockedOutUntil ?? null;
    this.encounter = snapshot?.activeEncounter ?? null;
    this.nextTurnAt = this.encounter ? Date.now() + COMBAT_TURN_MS : 0;
    this.changesSource.next();
  }
}
