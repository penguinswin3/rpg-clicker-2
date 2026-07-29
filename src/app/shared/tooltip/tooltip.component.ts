import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TooltipRow } from './tooltip-content';

/** Pure presentational box — `TooltipDirective` creates one of these on hover, sets its
 *  inputs, and positions its host element (`position: fixed`, set inline by the
 *  directive) relative to the viewport. Never instantiate this directly from a template. */
@Component({
  selector: 'app-tooltip',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './tooltip.component.html',
  styleUrl: './tooltip.component.scss',
})
export class TooltipComponent {
  title?: string;
  rows: TooltipRow[] = [];
}
