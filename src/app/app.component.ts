import { Component, OnInit, OnDestroy, inject, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';

import { ActivityLogComponent } from './activity-log/activity-log.component';
import { ActivityLogService } from './activity-log/activity-log.service';
import { TopBarComponent } from './top-bar/top-bar.component';
import { CharacterSelectComponent } from './character-select/character-select.component';
import { PartyVaultComponent } from './party-vault/party-vault.component';
import { GameAreaComponent } from './game-area/game-area.component';
import { SidePanelComponent } from './side-panel/side-panel.component';
import { GameLoopService } from './economy/game-loop.service';

import { UiModalComponent } from './shared/ui-modal/ui-modal.component';
import { ModalId, ModalService, MODAL_TITLES } from './shared/modal.service';
import { JacksPanelComponent } from './jacks/jacks-panel.component';
import { CrownPanelComponent } from './crown/crown-panel.component';
import { StatsPanelComponent } from './statistics/stats-panel.component';
import { OptionsPanelComponent } from './options/options-panel.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    RouterOutlet,
    CommonModule,
    ActivityLogComponent,
    TopBarComponent,
    CharacterSelectComponent,
    PartyVaultComponent,
    GameAreaComponent,
    SidePanelComponent,
    UiModalComponent,
    JacksPanelComponent,
    CrownPanelComponent,
    StatsPanelComponent,
    OptionsPanelComponent,
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent implements OnInit, OnDestroy {
  private logger = inject(ActivityLogService);
  private cdr = inject(ChangeDetectorRef);
  // Injected only to start the game loop at boot — the running interval is what matters,
  // not this reference (nothing else here calls into it).
  private gameLoop = inject(GameLoopService);
  modalService = inject(ModalService);

  private sub = new Subscription();
  logMinimized = false;

  ngOnInit(): void {
    this.sub.add(this.logger.minimized$.subscribe(v => {
      this.logMinimized = v;
      this.cdr.markForCheck();
    }));
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  modalTitle(id: ModalId): string {
    return MODAL_TITLES[id];
  }
}
