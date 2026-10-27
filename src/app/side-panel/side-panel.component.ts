import { Component, ChangeDetectionStrategy } from '@angular/core';
import { UpgradesPanelComponent } from '../upgrades/upgrades-panel.component';
import { ObjectivesPanelComponent } from '../objectives/objectives-panel.component';

/** Right side of the screen: Upgrades and Objectives sit in their own always-visible
 *  columns, Upgrades on the left, Objectives on the right. */
@Component({
  selector: 'app-side-panel',
  standalone: true,
  imports: [UpgradesPanelComponent, ObjectivesPanelComponent],
  templateUrl: './side-panel.component.html',
  styleUrl: './side-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SidePanelComponent {}
