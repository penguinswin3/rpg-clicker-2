import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GAME_TITLE, UNLOCKS } from '../configs/game-config';
import { GAME_TITLE_ASCII } from '../configs/flavor-text';
import { ModalId, ModalService } from '../shared/modal.service';

interface NavButton {
  id: ModalId;
  label: string;
  unlocked: boolean;
}

@Component({
  selector: 'app-top-bar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './top-bar.component.html',
  styleUrl: './top-bar.component.scss',
})
export class TopBarComponent {
  private modalService = inject(ModalService);

  readonly gameTitle = GAME_TITLE;
  readonly gameTitleAscii = GAME_TITLE_ASCII;

  // Data-driven so flipping `unlocked` (from the eventual unlock system) is all
  // that's needed to reveal a button — Jacks/Crown are spec'd as unlock-gated,
  // Stats/Options are always available.
  private readonly leftButtonDefs: NavButton[] = [
    { id: 'jacks', label: 'Jacks', unlocked: UNLOCKS.jacks },
    { id: 'crown', label: 'Crown', unlocked: UNLOCKS.crown },
  ];

  private readonly rightButtonDefs: NavButton[] = [
    { id: 'stats', label: 'Stats', unlocked: true },
    { id: 'options', label: 'Options', unlocked: true },
  ];

  get leftButtons(): NavButton[] {
    return this.leftButtonDefs.filter(b => b.unlocked);
  }

  get rightButtons(): NavButton[] {
    return this.rightButtonDefs.filter(b => b.unlocked);
  }

  open(id: ModalId): void {
    this.modalService.open(id);
  }
}
