import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type LogFilterType = 'default' | 'success' | 'warn' | 'error' | 'rare';

export interface LogMessage {
  id: number;
  timestamp: string;
  text: string;
  type?: LogFilterType;
}

const MAX_MESSAGES = 500;

@Injectable({ providedIn: 'root' })
export class ActivityLogService {
  private counter = 0;
  private messagesSource = new BehaviorSubject<LogMessage[]>([]);

  /** Observable stream of all log messages. */
  readonly messages$ = this.messagesSource.asObservable();

  // ── UI State ──────────────────────────────────────────────────

  private minimizedSource = new BehaviorSubject<boolean>(false);
  readonly minimized$ = this.minimizedSource.asObservable();
  get minimized(): boolean { return this.minimizedSource.getValue(); }
  setMinimized(v: boolean): void { this.minimizedSource.next(v); }
  toggleMinimized(): void { this.minimizedSource.next(!this.minimizedSource.getValue()); }

  private activeFiltersSource = new BehaviorSubject<Set<LogFilterType>>(new Set());
  readonly activeFilters$ = this.activeFiltersSource.asObservable();
  get activeFilters(): Set<LogFilterType> { return this.activeFiltersSource.getValue(); }
  setActiveFilters(filters: Set<LogFilterType>): void { this.activeFiltersSource.next(new Set(filters)); }
  toggleFilter(f: LogFilterType): void {
    const next = new Set(this.activeFiltersSource.getValue());
    if (next.has(f)) { next.delete(f); } else { next.add(f); }
    this.activeFiltersSource.next(next);
  }
  clearFilters(): void { this.activeFiltersSource.next(new Set()); }

  // ── Logging ───────────────────────────────────────────────────

  /** Add a message to the activity log. */
  log(text: string, type: LogFilterType = 'default'): void {
    // Skip default messages if they're filtered out (optimization — don't process if not shown)
    const filters = this.activeFiltersSource.getValue();
    const shouldSkipDefaultMessage = type === 'default' && !(filters.has('default') || filters.size === 0);
    if (shouldSkipDefaultMessage) { return; }

    const now = new Date();
    const timestamp = now.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    const msg: LogMessage = { id: this.counter++, timestamp, text, type };
    const current = this.messagesSource.getValue();
    const updated = [...current, msg];

    if (updated.length > MAX_MESSAGES) {
      updated.splice(0, updated.length - MAX_MESSAGES);
    }

    this.messagesSource.next(updated);
  }
}

