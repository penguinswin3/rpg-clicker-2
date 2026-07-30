import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SixStats } from '../../shared/six-stats';

const ZERO_STATS: SixStats = {
  strength: 0, dexterity: 0, constitution: 0, intelligence: 0, wisdom: 0, charisma: 0,
};

@Component({
  selector: 'app-stat-block',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './stat-block.component.html',
  styleUrl: './stat-block.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatBlockComponent {
  @Input() stats: SixStats = ZERO_STATS;

  readonly rows: { label: string; key: keyof SixStats }[] = [
    { label: 'STR', key: 'strength' },
    { label: 'DEX', key: 'dexterity' },
    { label: 'CON', key: 'constitution' },
    { label: 'INT', key: 'intelligence' },
    { label: 'WIS', key: 'wisdom' },
    { label: 'CHA', key: 'charisma' },
  ];
}
