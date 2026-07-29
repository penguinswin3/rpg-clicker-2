import { Component, OnInit, OnDestroy, inject, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { UpgradesPanelComponent } from '../upgrades/upgrades-panel.component';
import { ObjectivesPanelComponent } from '../objectives/objectives-panel.component';
import { AttentionService } from '../shared/attention.service';
import { SettingsService } from '../options/settings.service';

type SideTab = 'upgrades' | 'objectives';

interface TabDef {
  id: SideTab;
  label: string;
}

/** Right column: tab-switches between Upgrades and Objectives. Tabs shine
 *  (AttentionService) when something new is available there until the player visits. */
@Component({
  selector: 'app-side-panel',
  standalone: true,
  imports: [CommonModule, UpgradesPanelComponent, ObjectivesPanelComponent],
  templateUrl: './side-panel.component.html',
  styleUrl: './side-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SidePanelComponent implements OnInit, OnDestroy {
  private attention = inject(AttentionService);
  private settings = inject(SettingsService);
  private cdr = inject(ChangeDetectorRef);
  private sub = new Subscription();

  readonly tabs: TabDef[] = [
    { id: 'upgrades', label: '[ Upgrades ]' },
    { id: 'objectives', label: '[ Objectives ]' },
  ];

  activeTab: SideTab = 'upgrades';
  reducedMotion = this.settings.state.reducedMotion;

  ngOnInit(): void {
    this.sub.add(this.attention.changes$.subscribe(() => this.cdr.markForCheck()));
    this.sub.add(this.settings.state$.subscribe(s => {
      this.reducedMotion = s.reducedMotion;
      this.cdr.markForCheck();
    }));
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  /** No shine for the tab you're already looking at — only for a different one that
   *  has something new. */
  hasAttention(id: SideTab): boolean {
    return id !== this.activeTab && this.attention.isUnseen(`tab:${id}`);
  }

  selectTab(id: SideTab): void {
    this.activeTab = id;
    this.attention.markSeen(`tab:${id}`);
  }
}
