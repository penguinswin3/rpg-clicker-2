import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ActivityLogComponent } from './activity-log/activity-log.component';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, CommonModule, ActivityLogComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  // Mock global resources
  resources: Record<string, number> = {
    Wood: 10,
    Gold: 0
  };


  canAfford(costs?: Record<string, number>): boolean {
    if (!costs) return true;
    for (const [resource, amount] of Object.entries(costs)) {
      if ((this.resources[resource] || 0) < amount) {
        return false;
      }
    }
    return true;
  }

  onActionStart(costs?: Record<string, number>) {
    if (!costs) return;
    for (const [resource, amount] of Object.entries(costs)) {
      this.resources[resource] -= amount;
    }
  }

  onActionComplete(yields?: Record<string, number>) {
    if (!yields) return;
    for (const [resource, amount] of Object.entries(yields)) {
      if (this.resources[resource] === undefined) {
        this.resources[resource] = 0;
      }
      this.resources[resource] += amount;
    }
  }
}
