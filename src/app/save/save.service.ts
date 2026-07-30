import { Injectable, inject } from '@angular/core';
import { WalletService } from '../economy/wallet.service';
import { CharacterSelectService } from '../character-select/character-select.service';
import { ObjectivesService } from '../objectives/objectives.service';
import { StatisticsService } from '../statistics/statistics.service';
import { PlaytimeService } from '../statistics/playtime.service';
import { SettingsService } from '../options/settings.service';
import { AttentionService } from '../shared/attention.service';
import { UnlocksService } from '../shared/unlocks.service';
import { UpgradesService } from '../upgrades/upgrades.service';
import { TimedActionsService } from '../timed-actions/timed-actions.service';
import { HoldHintService } from '../shared/hold-hint.service';
import { CraftingService } from '../crafting/crafting.service';
import { EquipmentService } from '../fighter-combat/equipment.service';
import { CombatService } from '../fighter-combat/combat.service';
import { VERSION, OBJECTIVES, UPGRADES } from '../configs/game-config';
import { SaveData, SCHEMA_VERSION } from './save-data';

const SAVE_KEY = 'rpg-clicker-2-save';
const AUTOSAVE_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Owns the save file lifecycle: boot-time load, 5-minute autosave, base64 export/import,
 * and reset. Every other stateful service exposes `getSnapshot()`/`restore()` — this is
 * the only place that composes them into one JSON blob, so adding a new persisted system
 * later means adding one field here + a getSnapshot/restore pair on that system, nothing
 * else needs to change.
 */
@Injectable({ providedIn: 'root' })
export class SaveService {
  private wallet = inject(WalletService);
  private characters = inject(CharacterSelectService);
  private objectives = inject(ObjectivesService);
  private statistics = inject(StatisticsService);
  private playtime = inject(PlaytimeService);
  private settings = inject(SettingsService);
  private attention = inject(AttentionService);
  private unlocks = inject(UnlocksService);
  private upgrades = inject(UpgradesService);
  private timedActions = inject(TimedActionsService);
  private holdHint = inject(HoldHintService);
  private crafting = inject(CraftingService);
  private equipment = inject(EquipmentService);
  private combat = inject(CombatService);

  private createdAt = Date.now();

  // Set right before a deliberate `location.reload()` that's meant to leave localStorage
  // in a specific state (reset's removeItem, import's overwrite) — without this, the
  // 'pagehide' handler below fires *during* that same reload and calls save(), which
  // re-serializes the still-running in-memory services (nothing in memory has been
  // cleared, only localStorage was touched) and writes the pre-reset/pre-import state
  // right back before the new page can load. That race is what made Reset/Delete Save
  // look like a no-op — the value came right back a moment after being removed.
  private suppressAutosave = false;

  constructor() {
    this.loadFromLocalStorage();
    setInterval(() => this.save(), AUTOSAVE_INTERVAL_MS);

    // Save on the way out too, not just every 5 minutes — 'visibilitychange' catches
    // tab switches/backgrounding (the reliable cross-browser signal for "player is
    // leaving"), 'pagehide' catches actual navigation/reload/close. Both call the same
    // synchronous save(), so there's no async work racing the page's teardown.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && !this.suppressAutosave) this.save();
    });
    window.addEventListener('pagehide', () => {
      if (!this.suppressAutosave) this.save();
    });
  }

  save(): void {
    try {
      localStorage.setItem(SAVE_KEY, this.exportBase64());
    } catch {
      // Storage unavailable/full — nothing else to do from here.
    }
  }

  exportBase64(): string {
    const data: SaveData = {
      schemaVersion: SCHEMA_VERSION,
      gameVersion: VERSION,
      createdAt: this.createdAt,
      updatedAt: Date.now(),
      wallet: this.wallet.getSnapshot(),
      characters: this.characters.getSnapshot(),
      objectives: this.objectives.getSnapshot(),
      statistics: this.statistics.getSnapshot(),
      playtimeSeconds: this.playtime.totalSeconds,
      settings: this.settings.state,
      unseenAttention: this.attention.getSnapshot(),
      upgrades: this.upgrades.getSnapshot(),
      unlocks: this.unlocks.getSnapshot(),
      timedActions: this.timedActions.getSnapshot(),
      holdHints: this.holdHint.getSnapshot(),
      crafting: this.crafting.getSnapshot(),
      equipment: this.equipment.getSnapshot(),
      combat: this.combat.getSnapshot(),
    };
    return btoa(JSON.stringify(data));
  }

  async copyToClipboard(): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(this.exportBase64());
      return true;
    } catch {
      return false;
    }
  }

  downloadAsFile(): void {
    const base64 = this.exportBase64();
    const blob = new Blob([base64], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `rpg-clicker-2-save-${Date.now()}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  }

  /** Persists the given base64 save and reloads the page so every service re-hydrates
   *  from a clean boot rather than trying to live-patch already-running state. */
  importBase64(base64: string): boolean {
    const trimmed = base64.trim();
    if (!this.parse(trimmed)) return false;
    this.suppressAutosave = true;
    localStorage.setItem(SAVE_KEY, trimmed);
    location.reload();
    return true;
  }

  /** Clears the save from localStorage and reloads to a fresh boot. */
  reset(): void {
    this.suppressAutosave = true;
    localStorage.removeItem(SAVE_KEY);
    if (this.settings.state.reducedMotion) {
      location.reload();
    } else {
      document.body.classList.add('screen-shake');
      setTimeout(() => location.reload(), 400);
    }
  }

  private loadFromLocalStorage(): void {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) {
      this.seedFreshGameAttention();
      return; // fresh game — createdAt already defaulted to now
    }
    this.parse(raw, /* apply */ true);
  }

  /**
   * One-time setup for a truly fresh game (no prior save at all): whatever's available
   * from the very start gets its shine seeded here, since there's no real "unlock"
   * event to hang it off. Every objective today has no prerequisite (available
   * immediately), so this is the only place that ever needs to seed 'tab:objectives' —
   * once objectives can be locked behind a prerequisite, whichever system reveals a
   * newly-available one should call `attention.markUnseen('tab:objectives')` there
   * instead, same as CharacterSelectService.unlock() already does for characters.
   */
  private seedFreshGameAttention(): void {
    if (OBJECTIVES.length > 0) {
      this.attention.markUnseen('tab:objectives');
    }
    if (UPGRADES.length > 0) {
      this.attention.markUnseen('tab:upgrades');
    }
  }

  /** Parses and validates a base64 save. Optionally applies it to every service. */
  private parse(base64: string, apply = false): boolean {
    let data: Partial<SaveData>;
    try {
      data = JSON.parse(atob(base64));
    } catch {
      return false;
    }
    if (!data || typeof data !== 'object') return false;

    if (apply) {
      this.createdAt = data.createdAt ?? Date.now();
      this.wallet.restore(data.wallet);
      this.characters.restore(data.characters);
      this.objectives.restore(data.objectives);
      this.statistics.restore(data.statistics);
      this.playtime.restore(data.playtimeSeconds);
      this.settings.restore(data.settings);
      this.attention.restore(data.unseenAttention);
      this.upgrades.restore(data.upgrades);
      this.unlocks.restore(data.unlocks);
      this.timedActions.restore(data.timedActions);
      this.holdHint.restore(data.holdHints);
      this.crafting.restore(data.crafting);
      this.equipment.restore(data.equipment);
      this.combat.restore(data.combat);
    }
    return true;
  }
}
