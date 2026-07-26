import { Component, OnInit, OnDestroy, inject, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { GAME_TITLE, DEV_TOOLS_ENABLED } from '../configs/game-config';
import { GAME_TITLE_ASCII } from '../configs/flavor-text';
import { ModalId, ModalService } from '../shared/modal.service';
import { PlaytimeService } from '../statistics/playtime.service';
import { SettingsService } from '../options/settings.service';
import { UnlocksService } from '../shared/unlocks.service';
import { formatPlaytime } from '../shared/time-format';

interface NavButton {
  id: ModalId;
  label: string;
  unlocked: boolean;
}

@Component({
  selector: 'app-top-bar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './top-bar.component.html',
  styleUrl: './top-bar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TopBarComponent implements OnInit, OnDestroy {
  private modalService = inject(ModalService);
  private playtime = inject(PlaytimeService);
  private settings = inject(SettingsService);
  private unlocks = inject(UnlocksService);
  private cdr = inject(ChangeDetectorRef);
  private sub = new Subscription();

  readonly gameTitle = GAME_TITLE;
  readonly gameTitleAscii = GAME_TITLE_ASCII;
  readonly devToolsEnabled = DEV_TOOLS_ENABLED;

  showPlaytime = this.settings.state.showPlaytime;

  get playtimeDisplay(): string {
    return formatPlaytime(this.playtime.totalSeconds);
  }

  // Data-driven off UnlocksService (runtime-toggleable) so unlocking Jacks/Crown at
  // runtime — via Dev Tools or a real unlock objective — reveals the button without a
  // reload. Stats/Options are always available.
  get leftButtons(): NavButton[] {
    const defs: NavButton[] = [
      { id: 'jacks', label: 'Jacks', unlocked: this.unlocks.isUnlocked('jacks') },
      { id: 'crown', label: 'Crown', unlocked: this.unlocks.isUnlocked('crown') },
    ];
    return defs.filter(b => b.unlocked);
  }

  get rightButtons(): NavButton[] {
    const defs: NavButton[] = [
      { id: 'stats', label: 'Stats', unlocked: true },
      { id: 'options', label: 'Options', unlocked: true },
    ];
    return defs.filter(b => b.unlocked);
  }

  ngOnInit(): void {
    this.sub.add(this.playtime.changes$.subscribe(() => this.cdr.markForCheck()));
    this.sub.add(this.settings.state$.subscribe(s => {
      this.showPlaytime = s.showPlaytime;
      this.cdr.markForCheck();
    }));
    this.sub.add(this.unlocks.state$.subscribe(() => this.cdr.markForCheck()));
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  open(id: ModalId): void {
    this.modalService.open(id);
  }
}
