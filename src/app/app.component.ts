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
import { CreditsPanelComponent } from './credits/credits-panel.component';
import { DevToolsPanelComponent } from './dev-tools/dev-tools-panel.component';
import { SaveService } from './save/save.service';

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
    CreditsPanelComponent,
    DevToolsPanelComponent,
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent implements OnInit, OnDestroy {
  // Injected purely for their construction-time side effects (load-on-boot, autosave
  // timer, generation tick) — nothing here calls into them again, so order matters:
  // SaveService must construct (and hydrate every other service) before anything reads
  // game state, which is guaranteed as long as it's injected somewhere in this component.
  private saveService = inject(SaveService);
  private gameLoop = inject(GameLoopService);

  private logger = inject(ActivityLogService);
  private cdr = inject(ChangeDetectorRef);
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
