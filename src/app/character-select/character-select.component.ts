import { Component, OnInit, OnDestroy, inject, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { CharacterSelectService, CharacterSlot } from './character-select.service';
import { AttentionService } from '../shared/attention.service';
import { SettingsService } from '../options/settings.service';

@Component({
  selector: 'app-character-select',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './character-select.component.html',
  styleUrl: './character-select.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CharacterSelectComponent implements OnInit, OnDestroy {
  private characterService = inject(CharacterSelectService);
  private attention = inject(AttentionService);
  private settings = inject(SettingsService);
  private cdr = inject(ChangeDetectorRef);
  private sub = new Subscription();

  active = this.characterService.active;
  reducedMotion = this.settings.state.reducedMotion;

  // Only unlocked characters ever get a box — no locked/empty placeholders.
  get slots(): CharacterSlot[] {
    return this.characterService.slots.filter(s => s.unlocked);
  }

  ngOnInit(): void {
    this.sub.add(this.characterService.active$.subscribe(id => {
      this.active = id;
      this.cdr.markForCheck();
    }));
    // A character unlocking changes `slots` without necessarily changing the active
    // id, so it needs its own nudge to re-render.
    this.sub.add(this.characterService.changes$.subscribe(() => this.cdr.markForCheck()));
    this.sub.add(this.attention.changes$.subscribe(() => this.cdr.markForCheck()));
    this.sub.add(this.settings.state$.subscribe(s => {
      this.reducedMotion = s.reducedMotion;
      this.cdr.markForCheck();
    }));
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  /** No shine for the character already selected/active — only for a different one
   *  that's newly unlocked. */
  hasAttention(id: string): boolean {
    return id !== this.active && this.attention.isUnseen(`character:${id}`);
  }

  select(id: string): void {
    this.characterService.select(id);
    this.attention.markSeen(`character:${id}`);
  }
}
