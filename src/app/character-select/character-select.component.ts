import { Component, OnInit, OnDestroy, inject, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { CharacterSelectService } from './character-select.service';

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
  private cdr = inject(ChangeDetectorRef);
  private sub = new Subscription();

  readonly slots = this.characterService.slots;
  active = this.characterService.active;

  ngOnInit(): void {
    this.sub.add(this.characterService.active$.subscribe(id => {
      this.active = id;
      this.cdr.markForCheck();
    }));
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  select(id: string): void {
    this.characterService.select(id);
  }
}
