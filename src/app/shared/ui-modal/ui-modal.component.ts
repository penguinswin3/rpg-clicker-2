import {
  Component,
  EventEmitter,
  HostListener,
  Input,
  Output,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * Generic terminal-styled modal shell: dimmed backdrop + bordered panel with a
 * bracketed title bar. Reused by every top-bar modal (Jacks, Crown, Stats, Options) —
 * panel-specific content is projected in via <ng-content>.
 */
@Component({
  selector: 'app-ui-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './ui-modal.component.html',
  styleUrl: './ui-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiModalComponent {
  @Input() title = '';
  @Output() closed = new EventEmitter<void>();

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closed.emit();
  }

  onBackdropClick(): void {
    this.closed.emit();
  }
}
