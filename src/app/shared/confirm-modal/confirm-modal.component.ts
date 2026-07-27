import { Component, OnDestroy, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ConfirmService } from '../confirm.service';
import { ModalService } from '../modal.service';

/** Renders whatever `ConfirmService` currently has pending inside the shared
 *  `UiModalComponent` shell (see app.component.html) — the in-app stand-in for
 *  `window.confirm()`. Clearing the pending request on destroy means Escape, a
 *  backdrop click, or the modal's own [x] all behave as Cancel for free, without each
 *  needing its own handler. */
@Component({
  selector: 'app-confirm-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './confirm-modal.component.html',
  styleUrl: './confirm-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfirmModalComponent implements OnDestroy {
  private confirmService = inject(ConfirmService);
  private modalService = inject(ModalService);

  get request() {
    return this.confirmService.request;
  }

  confirm(): void {
    this.confirmService.confirm();
    this.modalService.close();
  }

  cancel(): void {
    this.modalService.close();
  }

  ngOnDestroy(): void {
    this.confirmService.cancel();
  }
}
