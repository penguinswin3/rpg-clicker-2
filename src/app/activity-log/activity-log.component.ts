import {
  Component,
  OnInit,
  OnDestroy,
  AfterViewChecked,
  ViewChild,
  ElementRef,
  inject,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { ActivityLogService, LogMessage, LogFilterType } from './activity-log.service';
// import { CURRENCY_FLAVOR } from '../flavor-text';

export interface LogTextSegment {
  text: string;
  color?: string;
}

/** Regex that matches {{currencyId|displayText}} tokens produced by cur(). */
const CUR_TOKEN = /\{\{([\w-]+)\|([^}]+)\}\}/g;

interface FilterOption {
  value: LogFilterType;
  label: string;
}

@Component({
  selector: 'app-activity-log',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './activity-log.component.html',
  styleUrl: './activity-log.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActivityLogComponent implements OnInit, OnDestroy, AfterViewChecked {
  @ViewChild('logBody') logBody?: ElementRef<HTMLDivElement>;

  private logService = inject(ActivityLogService);
  private cdr        = inject(ChangeDetectorRef);
  private sub = new Subscription();

  messages: LogMessage[] = [];
  minimized = false;
  activeFilters = new Set<LogFilterType>();
  private shouldScroll = false;

  /** Cache of parsed log text segments keyed by message ID. */
  private parseCache = new Map<number, LogTextSegment[]>();

  readonly filters: FilterOption[] = [
    { value: 'default', label: 'INFO'    },
    { value: 'success', label: 'SUCCESS' },
    { value: 'warn',    label: 'WARN'    },
    { value: 'error',   label: 'ERROR'   },
    { value: 'rare',    label: 'RARE'    },
  ];

  get allActive(): boolean {
    return this.activeFilters.size === 0;
  }

  isActive(f: LogFilterType): boolean {
    return this.allActive || this.activeFilters.has(f);
  }

  /** Pre-computed filtered message list — updated only when messages or filters change. */
  filteredMessages: LogMessage[] = [];

  private _refilter(): void {
    if (this.allActive) {
      this.filteredMessages = this.messages;
    } else {
      this.filteredMessages = this.messages.filter(m => this.activeFilters.has((m.type ?? 'default') as LogFilterType));
    }
  }

  toggleFilter(f: LogFilterType): void {
    this.logService.toggleFilter(f);
    this.shouldScroll = true;
  }

  clearFilters(): void {
    this.logService.clearFilters();
    this.shouldScroll = true;
  }

  /** If All is already active, enable every individual filter and disable All.
   *  Otherwise, clear individual filters to re-enable All. */
  toggleAllFilters(): void {
    if (this.allActive) {
      this.logService.setActiveFilters(new Set(this.filters.map(f => f.value)));
    } else {
      this.logService.clearFilters();
    }
    this.shouldScroll = true;
  }

  ngOnInit(): void {
    this.sub.add(this.logService.messages$.subscribe(msgs => {
      this.messages = msgs;
      this._refilter();
      // Trim the parse cache if it grows beyond the message buffer (keep last MAX entries)
      if (this.parseCache.size > 600) {
        const keep = new Set(msgs.map(m => m.id));
        for (const key of this.parseCache.keys()) {
          if (!keep.has(key)) this.parseCache.delete(key);
        }
      }
      if (!this.minimized) this.shouldScroll = true;
      this.cdr.markForCheck();
    }));
    this.sub.add(this.logService.minimized$.subscribe(v => { this.minimized = v; this.cdr.markForCheck(); }));
    this.sub.add(this.logService.activeFilters$.subscribe(f => {
      this.activeFilters = f;
      this._refilter();
      this.cdr.markForCheck();
    }));
  }

  ngAfterViewChecked(): void {
    if (this.shouldScroll && this.logBody?.nativeElement) {
      const el = this.logBody.nativeElement;
      el.scrollTop = el.scrollHeight;
      this.shouldScroll = false;
    }
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  toggle(): void {
    this.logService.toggleMinimized();
    if (!this.minimized) this.shouldScroll = true;
  }

  trackById(_: number, msg: LogMessage): number {
    return msg.id;
  }

  /**
   * Parse a log text string into segments (cached by message ID).
   * Plain text becomes colorless segments; `{{currencyId|display}}` tokens
   * become segments with the currency's accent color.
   */
  parseLogText(msg: LogMessage): LogTextSegment[] {
    const cached = this.parseCache.get(msg.id);
    if (cached) return cached;

    const text = msg.text;
    const segments: LogTextSegment[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    CUR_TOKEN.lastIndex = 0;  // reset regex state
    while ((match = CUR_TOKEN.exec(text)) !== null) {
      if (match.index > lastIndex) {
        segments.push({ text: text.slice(lastIndex, match.index) });
      }
      const currencyId  = match[1];
      const displayText = match[2];
      // const color = (CURRENCY_FLAVOR as Record<string, { color: string }>)[currencyId]?.color;
      const color = 'white';
      segments.push({ text: displayText, color });
      lastIndex = CUR_TOKEN.lastIndex;
    }
    if (lastIndex < text.length) {
      segments.push({ text: text.slice(lastIndex) });
    }

    this.parseCache.set(msg.id, segments);
    return segments;
  }
}


