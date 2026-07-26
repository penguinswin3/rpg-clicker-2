import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { UpgradesPanelComponent } from '../upgrades/upgrades-panel.component';
import { ObjectivesPanelComponent } from '../objectives/objectives-panel.component';

type SideTab = 'upgrades' | 'objectives';

interface TabDef {
  id: SideTab;
  label: string;
}

/** Right column: tab-switches between Upgrades and Objectives. */
@Component({
  selector: 'app-side-panel',
  standalone: true,
  imports: [CommonModule, UpgradesPanelComponent, ObjectivesPanelComponent],
  templateUrl: './side-panel.component.html',
  styleUrl: './side-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SidePanelComponent {
  readonly tabs: TabDef[] = [
    { id: 'upgrades', label: 'Upgrades' },
    { id: 'objectives', label: 'Objectives' },
  ];

  activeTab: SideTab = 'upgrades';

  selectTab(id: SideTab): void {
    this.activeTab = id;
  }
}
