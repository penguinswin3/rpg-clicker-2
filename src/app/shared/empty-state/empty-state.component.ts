import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

/** Reusable "-- nothing here yet --" placeholder, styled after the Activity Log's empty state. */
@Component({
  selector: 'app-empty-state',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './empty-state.component.html',
  styleUrl: './empty-state.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmptyStateComponent {
  @Input() message = 'Nothing here yet';
  /** Tighter padding for placeholders inside small/narrow cards (e.g. a sidebar slot)
   *  where the default generous padding would dominate the card's whole height. */
  @Input() compact = false;
}
