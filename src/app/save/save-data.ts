import { WalletSnapshot } from '../economy/wallet.service';
import { CharacterSelectSnapshot } from '../character-select/character-select.service';
import { StatisticsSnapshot } from '../statistics/statistics.service';
import { SettingsState } from '../options/settings.service';

/**
 * The full persisted shape. `schemaVersion` is ours to bump for migrations;
 * `gameVersion` is just the VERSION string that produced the save, for display/debugging.
 *
 * Forward-compatibility rule (see AGENTS.md "Save"): every field here must be optional
 * from the reader's point of view — every `restore()` this feeds into already treats a
 * missing/undefined value as "use the default", so adding a field later never breaks
 * loading an older save. Never rename or repurpose an existing field; add a new one.
 */
export interface SaveData {
  schemaVersion: number;
  gameVersion: string;
  createdAt: number;
  updatedAt: number;
  wallet: WalletSnapshot;
  characters: CharacterSelectSnapshot;
  objectives: { completedIds: string[] };
  statistics: StatisticsSnapshot;
  playtimeSeconds: number;
  settings: SettingsState;
  /** Keys from AttentionService still showing a shine (unvisited tab, unselected new
   *  character) — persisted so a reload doesn't clear a notification the player hasn't
   *  actually seen yet. */
  unseenAttention: string[];
  /** Upgrade id -> level owned. See UpgradesService.getSnapshot/restore. */
  upgrades: Record<string, number>;
  /** Unlock key -> unlocked. See UnlocksService.getSnapshot/restore. */
  unlocks: Record<string, boolean>;
}

export const SCHEMA_VERSION = 1;
