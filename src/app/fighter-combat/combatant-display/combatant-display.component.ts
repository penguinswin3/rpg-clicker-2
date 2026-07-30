import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

/** Ascii art + name + HP bar for one side of an encounter — reused for both the Fighter
 *  and the enemy, parameterized entirely by inputs. */
@Component({
  selector: 'app-combatant-display',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './combatant-display.component.html',
  styleUrl: './combatant-display.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CombatantDisplayComponent {
  @Input() name = '';
  @Input() ascii = '';
  @Input() hp = 0;
  @Input() maxHp = 0;

  get hpPercent(): number {
    return this.maxHp > 0 ? Math.max(0, Math.min(100, (this.hp / this.maxHp) * 100)) : 0;
  }
}
