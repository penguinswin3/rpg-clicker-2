import { Component, OnInit, OnDestroy, inject, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { VERSION } from '../configs/game-config';
import { SettingsService, SettingsState } from './settings.service';
import { SaveService } from '../save/save.service';
import { ModalService } from '../shared/modal.service';
import { ConfirmService } from '../shared/confirm.service';

interface ToggleOption {
  key: keyof SettingsState;
  label: string;
}

/**
 * Save management + display settings. Toggles read/write through SettingsService (so
 * they persist in the save file); Export/Import/Reset go through SaveService.
 */
@Component({
  selector: 'app-options-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './options-panel.component.html',
  styleUrl: './options-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OptionsPanelComponent implements OnInit, OnDestroy {
  private settingsService = inject(SettingsService);
  private saveService = inject(SaveService);
  private modalService = inject(ModalService);
  private confirmService = inject(ConfirmService);
  private cdr = inject(ChangeDetectorRef);
  private sub = new Subscription();

  readonly version = VERSION;

  readonly toggles: ToggleOption[] = [
    { key: 'showPlaytime', label: 'Show playtime on game screen' },
    { key: 'hideMaxedUpgrades', label: 'Hide maxed-out upgrades' },
    { key: 'reducedMotion', label: 'Reduced motion' },
  ];

  settings = this.settingsService.state;

  importText = '';
  statusMessage = '';

  ngOnInit(): void {
    this.sub.add(this.settingsService.state$.subscribe(s => {
      this.settings = s;
      this.cdr.markForCheck();
    }));
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  toggle(key: keyof SettingsState): void {
    this.settingsService.set({ [key]: !this.settings[key] });
  }

  openCredits(): void {
    this.modalService.open('credits');
  }

  async copySave(): Promise<void> {
    const ok = await this.saveService.copyToClipboard();
    this.showStatus(ok ? 'Copied save to clipboard.' : 'Could not access clipboard.');
  }

  downloadSave(): void {
    this.saveService.downloadAsFile();
    this.showStatus('Save downloaded.');
  }

  importSave(): void {
    if (!this.importText.trim()) return;
    const ok = this.saveService.importBase64(this.importText);
    if (!ok) {
      this.showStatus('That doesn\'t look like a valid save.');
    }
    // On success importBase64() reloads the page, so there's nothing left to update here.
  }

  resetSave(): void {
    this.confirmService.ask({
      message: 'Reset all progress? This cannot be undone.',
      confirmLabel: 'Reset',
      onConfirm: () => this.saveService.reset(),
    });
    this.modalService.open('confirm');
  }

  private showStatus(message: string): void {
    this.statusMessage = message;
    this.cdr.markForCheck();
    setTimeout(() => {
      this.statusMessage = '';
      this.cdr.markForCheck();
    }, 3000);
  }
}
