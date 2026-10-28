import { Injectable, inject } from '@angular/core';
import { Subject } from 'rxjs';
import { WalletService } from '../economy/wallet.service';
import { StatisticsService } from '../statistics/statistics.service';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { EquipmentService } from './equipment.service';
import { PatternCraftingService } from '../blacksmith-forge/pattern-crafting.service';
import { UpgradesService } from '../upgrades/upgrades.service';
import { CollectionLogService, CollectionLogDropItem } from '../collection-log/collection-log.service';
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
  FIGHTER_DEFEAT_REVIVE_HP,
  SHORT_REST,
  enemyDefeatActionId,
} from '../configs/game-config';
import { getEquipmentFlavor, getFighterEnemyFlavor, getPatternFlavor, SHORT_REST_FLAVOR } from '../configs/flavor-text';
import { resourceAmountToken } from '../shared/resource-token';

export interface ActiveEncounter {
  areaId: string;
  enemyId: string;
  enemyHp: number;
  actorTurn: 'fighter' | 'enemy';
}

export interface CombatSnapshot {
  fighterHp: number;
  lockedOutUntil: number | null;
  activeEncounter: ActiveEncounter | null;
  /** Optional for forward-compat with saves from before Short Rest existed. */
  resting?: boolean;
  /** The Auto Fight checkbox. Optional for saves from before it existed. */
  autoFight?: boolean;
}

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
 *
 * Also owns Short Rest (SHORT_REST in game-config.ts), since it's just another writer
 * of fighterHp. Regen is anchored the same way: `restAnchorAt` marks the last moment
 * whole HP points were credited, and each check credits however many whole points the
 * elapsed time has earned since, carrying the fractional remainder forward by advancing
 * the anchor only by the time those whole points cost.
 */
@Injectable({ providedIn: 'root' })
export class CombatService {
  private wallet = inject(WalletService);
  private equipment = inject(EquipmentService);
  private patternCrafting = inject(PatternCraftingService);
  private collectionLog = inject(CollectionLogService);
  private upgrades = inject(UpgradesService);
  private statistics = inject(StatisticsService);
  private activityLog = inject(ActivityLogService);

  private fighterHp = getMaxHp(FIGHTER_BASE_STATS);
  private lockedOutUntil: number | null = null;
  private encounter: ActiveEncounter | null = null;
  private nextTurnAt = 0;
  private restingState = false;
  /** The player's Auto Fight checkbox — only acted on while the Auto Fight upgrade is
   *  owned (see `autoFightActive`), so the preference survives without the upgrade
   *  rather than being cleared. */
  private autoFightEnabled = false;
  private restAnchorAt = 0;

  private changesSource = new Subject<void>();
  readonly changes$ = this.changesSource.asObservable();

  constructor() {
    setInterval(() => {
      this.checkTurn();
      this.checkRest();
    }, COMBAT_CHECK_MS);
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

  get autoFight(): boolean {
    return this.autoFightEnabled;
  }

  /** Checkbox on *and* the upgrade owned — what actually decides a restart. */
  get autoFightActive(): boolean {
    return this.autoFightEnabled && this.upgrades.hasFeature('auto-fight');
  }

  setAutoFight(enabled: boolean): void {
    if (this.autoFightEnabled === enabled) return;
    this.autoFightEnabled = enabled;
    this.changesSource.next();
  }

  get resting(): boolean {
    return this.restingState;
  }

  /** Short Rest can only be turned *on* outside a fight and below full HP — turning it
   *  off is always allowed. */
  get canRest(): boolean {
    return this.encounter === null && this.currentFighterHp < this.fighterMaxHp;
  }

  toggleRest(): void {
    if (this.restingState) this.stopRest(SHORT_REST_FLAVOR.stopLogMessage);
    else this.startRest();
  }

  private startRest(): void {
    if (!this.canRest) return;
    this.restingState = true;
    this.restAnchorAt = Date.now();
    this.activityLog.log(SHORT_REST_FLAVOR.startLogMessage, 'default');
    this.changesSource.next();
  }

  private stopRest(logMessage: string): void {
    if (!this.restingState) return;
    this.restingState = false;
    this.activityLog.log(logMessage, 'default');
    this.changesSource.next();
  }

  private checkRest(): void {
    if (!this.restingState) return;
    const maxHp = this.fighterMaxHp;
    const msPerHp = 1000 / SHORT_REST.hpPerSecond;
    const points = Math.floor((Date.now() - this.restAnchorAt) / msPerHp);
    if (points > 0) {
      this.fighterHp = Math.min(this.currentFighterHp + points, maxHp);
      this.restAnchorAt += points * msPerHp;
      this.changesSource.next();
    }
    if (this.currentFighterHp >= maxHp) this.stopRest(SHORT_REST_FLAVOR.fullLogMessage);
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

    this.stopRest(SHORT_REST_FLAVOR.fightLogMessage);

    const fighter = this.fighterCombatant();
    const enemy = this.enemyCombatant(enemyConfig);
    const actorTurn = rollInitiative(fighter, enemy);

    this.encounter = { areaId, enemyId, enemyHp: enemy.hp, actorTurn };
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
    const encounter = this.encounter;
    if (!encounter) return;
    if (Date.now() < this.nextTurnAt) return;

    const enemyConfig = FIGHTER_ENEMIES.find(e => e.id === encounter.enemyId);
    if (!enemyConfig) {
      // Defensive second line: not reachable today (an encounter's enemyId can only
      // come from start(), which already validates against FIGHTER_ENEMIES, or from
      // restore(), which now drops a stale reference before it ever reaches here) —
      // but if FIGHTER_ENEMIES ever changed while an encounter was already active in
      // memory, silently returning every tick forever would freeze the fight rather
      // than surfacing anything. Clear it instead, same as the restore() case below.
      this.encounter = null;
      this.changesSource.next();
      return;
    }

    const fighter = this.fighterCombatant();
    const enemy = this.enemyCombatant(enemyConfig, encounter.enemyHp);

    const actor = encounter.actorTurn;
    const [attacker, defender] = actor === 'fighter' ? [fighter, enemy] : [enemy, fighter];
    const results = resolveTurn(actor, attacker, defender);

    encounter.enemyHp = enemy.hp;
    this.fighterHp = fighter.hp;
    this.logTurns(results, getFighterEnemyFlavor(enemyConfig.id).label);

    if (fighter.hp <= 0) {
      this.resolveDefeat(encounter);
      return;
    }
    if (enemy.hp <= 0) {
      this.resolveVictory(enemyConfig);
      return;
    }

    encounter.actorTurn = actor === 'fighter' ? 'enemy' : 'fighter';
    this.nextTurnAt = Date.now() + COMBAT_TURN_MS;
    this.changesSource.next();
  }

  /** Routine, per-turn combat detail logs straight to the shared Activity Log at
   *  'default' (INFO) level, same as any other routine game action — there's no
   *  separate local combat feed. A single fight's 10-30+ lines are exactly the kind of
   *  routine, filterable detail the INFO level exists for. */
  private logTurns(results: CombatTurnResult[], enemyLabel: string): void {
    for (const turn of results) {
      this.activityLog.log(this.describeTurn(turn, enemyLabel), 'default');
    }
  }

  private describeTurn(turn: CombatTurnResult, enemyLabel: string): string {
    const actorLabel = turn.actor === 'fighter' ? 'You' : enemyLabel;
    if (!turn.hit) {
      return `${actorLabel} miss${turn.actor === 'fighter' ? '' : 'es'}. (${turn.attackRoll} vs ${turn.defenseRoll})`;
    }
    const prefix = turn.followUp
      ? `${actorLabel} strike${turn.actor === 'fighter' ? '' : 's'} again!`
      : `${actorLabel} hit${turn.actor === 'fighter' ? '' : 's'}!`;
    return `${prefix} ${turn.damage} damage. (${turn.attackRoll} vs ${turn.defenseRoll})`;
  }

  private resolveVictory(enemyConfig: EnemyConfig): void {
    const areaId = this.encounter?.areaId;
    this.encounter = null;
    this.statistics.recordAction(enemyDefeatActionId(enemyConfig.id));

    const grants: string[] = [];
    const collected: CollectionLogDropItem[] = [];
    for (const drop of enemyConfig.loot) {
      if (Math.random() >= drop.chance) continue;
      if (drop.type === 'resource') {
        const amount = drop.min + Math.floor(Math.random() * (drop.max - drop.min + 1));
        this.wallet.add(drop.resourceId, amount);
        grants.push(resourceAmountToken(drop.resourceId, amount));
        collected.push({ type: 'resource', resourceId: drop.resourceId });
      } else if (drop.type === 'equipment') {
        this.equipment.addToInventory(drop.equipmentId);
        grants.push(getEquipmentFlavor(drop.equipmentId).label);
        collected.push({ type: 'equipment', equipmentId: drop.equipmentId });
      } else {
        this.patternCrafting.unlock(drop.patternId);
        grants.push(getPatternFlavor(drop.patternId).label);
      }
    }

    const enemyLabel = getFighterEnemyFlavor(enemyConfig.id).label;
    const lootText = grants.length > 0 ? ` (${grants.join(', ')})` : '';
    this.activityLog.log(`You defeat a ${enemyLabel}!${lootText}`, 'success');
    // After the victory line, so any "New collection log entry" lines read as its
    // consequence rather than preceding the fight's own outcome.
    this.collectionLog.recordKill(enemyConfig.id);
    for (const item of collected) this.collectionLog.recordDrop(enemyConfig.id, item);

    // Auto Fight: straight into the next encounter in the same area, through the normal
    // start() (so canFight etc. still apply). Victory only — resolveDefeat and flee()
    // never get here, so a loss or a deliberate retreat always stops the chain. HP is
    // *not* topped up; the chain can absolutely walk the Fighter into a defeat.
    if (this.autoFightActive && areaId) this.start(areaId);
    this.changesSource.next();
  }

  private resolveDefeat(encounter: ActiveEncounter): void {
    const enemyLabel = getFighterEnemyFlavor(encounter.enemyId).label;
    this.encounter = null;
    this.fighterHp = FIGHTER_DEFEAT_REVIVE_HP;
    this.lockedOutUntil = Date.now() + FIGHTER_DEFEAT_LOCKOUT_MS;
    this.activityLog.log(`You are defeated by a ${enemyLabel} and stumble back to recover.`, 'warn');
    this.changesSource.next();
  }

  getSnapshot(): CombatSnapshot {
    return {
      fighterHp: this.fighterHp,
      lockedOutUntil: this.lockedOutUntil,
      // Copied, not aliased — unlike TimedActionsService's instances (which are
      // replaced wholesale, never mutated in place), an ActiveEncounter's enemyHp/
      // actorTurn are mutated in place turn by turn (see checkTurn below). A snapshot
      // that shared the live object by reference would silently drift if the encounter
      // kept ticking after the snapshot was taken.
      activeEncounter: this.encounter ? { ...this.encounter } : null,
      resting: this.restingState,
      autoFight: this.autoFightEnabled,
    };
  }

  restore(snapshot: CombatSnapshot | undefined): void {
    this.fighterHp = snapshot?.fighterHp ?? getMaxHp(FIGHTER_BASE_STATS);
    this.lockedOutUntil = snapshot?.lockedOutUntil ?? null;
    // Copied on the way in too, for the same reason as getSnapshot() above — never
    // alias the caller's snapshot object as this service's live, mutate-in-place state.
    // A restored encounter whose enemyId no longer resolves in FIGHTER_ENEMIES (e.g. a
    // removed/renamed enemy) is dropped rather than restored frozen — checkTurn() would
    // otherwise silently no-op forever, every tick, with no way for the player to ever
    // fight again. Same stale-reference handling as CraftingService.restore().
    const restored = snapshot?.activeEncounter;
    const enemyStillExists = !!restored && FIGHTER_ENEMIES.some(e => e.id === restored.enemyId);
    this.encounter = restored && enemyStillExists ? { ...restored } : null;
    this.nextTurnAt = this.encounter ? Date.now() + COMBAT_TURN_MS : 0;
    // No offline regen (see SHORT_REST in game-config.ts) — a restored rest heals from
    // the moment of load. A save can't normally hold resting + an active encounter at
    // once (start() ends the rest), but guard it anyway rather than heal mid-fight.
    this.restingState = !!snapshot?.resting && this.encounter === null;
    this.restAnchorAt = Date.now();
    this.autoFightEnabled = snapshot?.autoFight ?? false;
    this.changesSource.next();
  }
}
