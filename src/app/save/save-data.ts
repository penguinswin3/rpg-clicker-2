import { WalletSnapshot } from '../economy/wallet.service';
import { CharacterSelectSnapshot } from '../character-select/character-select.service';
import { StatisticsSnapshot } from '../statistics/statistics.service';
import { SettingsState } from '../options/settings.service';
import { ObjectivesSnapshot } from '../objectives/objectives.service';
import { TimedActionsSnapshot } from '../timed-actions/timed-actions.service';
import { UpgradesSnapshot } from '../upgrades/upgrades.service';

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
  objectives: ObjectivesSnapshot;
  statistics: StatisticsSnapshot;
  playtimeSeconds: number;
  settings: SettingsState;
  /** Keys from AttentionService still showing a shine (unvisited tab, unselected new
   *  character) — persisted so a reload doesn't clear a notification the player hasn't
   *  actually seen yet. */
  unseenAttention: string[];
  /** Upgrade levels + unlock state. See UpgradesService.getSnapshot/restore — `restore`
   *  also accepts the older flat `Record<string, number>` shape from before upgrades
   *  had a lock/unlock concept, for saves created before this field existed. */
  upgrades: UpgradesSnapshot;
  /** Unlock key -> unlocked. See UnlocksService.getSnapshot/restore. */
  unlocks: Record<string, boolean>;
  /** Timed-action id -> start timestamp, for whichever are mid-run. See
   *  TimedActionsService.getSnapshot/restore. */
  timedActions: TimedActionsSnapshot;
  /** Action ids whose "hold to repeat" hint the player has already dismissed by
   *  actually holding the button. See HoldHintService.getSnapshot/restore. */
  holdHints: string[];
}

export const SCHEMA_VERSION = 1;
