import { Component, OnInit, OnDestroy, inject, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { Subscription } from 'rxjs';
import { ActivityLogService, LogMessage } from '../../activity-log/activity-log.service';

/** Matches the same {{currencyId|displayText}} tokens ActivityLogComponent.parseLogText
 *  colors — here they're just stripped down to the plain displayText, since a screen
 *  reader announcement has no concept of inline color. */
const CUR_TOKEN = /\{\{[\w-]+\|([^}]+)\}\}/g;

/**
 * Visually-hidden aria-live region that announces rare/discrete game events to a screen
 * reader — objective claims, character unlocks (which happen via an objective claim),
 * combat outcomes, errors, rare payout doubles. Deliberately reuses ActivityLogService's
 * own message levels rather than adding a second announcement mechanism: anything
 * already logged above 'default' (see AGENTS.md's "Game action log messages") is, by
 * this codebase's own convention, already "noteworthy, not routine" — exactly what
 * should interrupt a screen reader with a polite announcement. High-frequency content
 * (gold ticking, HP during combat, running timers) is never logged above 'default' in
 * the first place, so it's excluded for free, no extra filtering needed here.
 */
@Component({
  selector: 'app-live-announcer',
  standalone: true,
  templateUrl: './live-announcer.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LiveAnnouncerComponent implements OnInit, OnDestroy {
  private logService = inject(ActivityLogService);
  private cdr = inject(ChangeDetectorRef);
  private sub = new Subscription();

  private lastSeenId = -1;
  private sawInitialBatch = false;

  announcement = '';

  ngOnInit(): void {
    this.sub.add(this.logService.messages$.subscribe(msgs => this.onMessages(msgs)));
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  private onMessages(msgs: LogMessage[]): void {
    if (!this.sawInitialBatch) {
      // The first emission is whatever history already existed (e.g. restored on boot)
      // — never announce it, only genuinely new messages from here on.
      this.sawInitialBatch = true;
      this.lastSeenId = msgs.length > 0 ? msgs[msgs.length - 1].id : -1;
      return;
    }

    const newOnes = msgs.filter(m => m.id > this.lastSeenId && m.type && m.type !== 'default');
    if (msgs.length > 0) this.lastSeenId = msgs[msgs.length - 1].id;
    if (newOnes.length === 0) return;

    const latest = newOnes[newOnes.length - 1];
    this.announcement = latest.text.replace(CUR_TOKEN, '$1');
    this.cdr.markForCheck();
  }
}
