import { CommonModule } from "@angular/common";
import { Component, inject } from "@angular/core";

import { JslibModule } from "@bitwarden/angular/jslib.module";
import { CipherId } from "@bitwarden/common/types/guid";
import {
  DIALOG_DATA,
  DialogRef,
  AsyncActionsModule,
  ButtonModule,
  DialogModule,
  DialogService,
  TypographyModule,
  CenterPositionStrategy,
} from "@bitwarden/components";

export type DecryptionFailureDialogParams = {
  cipherIds: CipherId[];
};

// FIXME(https://bitwarden.atlassian.net/browse/CL-764): Migrate to OnPush
// eslint-disable-next-line @angular-eslint/prefer-on-push-component-change-detection
@Component({
  selector: "vault-decryption-failure-dialog",
  templateUrl: "./decryption-failure-dialog.component.html",
  imports: [
    DialogModule,
    CommonModule,
    TypographyModule,
    JslibModule,
    AsyncActionsModule,
    ButtonModule,
  ],
})
export class DecryptionFailureDialogComponent {
  protected dialogRef = inject(DialogRef);
  protected params = inject<DecryptionFailureDialogParams>(DIALOG_DATA);

  selectText(element: HTMLElement) {
    const selection = window.getSelection();
    if (selection == null) {
      return;
    }
    selection.removeAllRanges();
    const range = document.createRange();
    range.selectNodeContents(element);
    selection.addRange(range);
  }

  static open(dialogService: DialogService, params: DecryptionFailureDialogParams) {
    return dialogService.open(DecryptionFailureDialogComponent, {
      data: params,
      positionStrategy: new CenterPositionStrategy(),
    });
  }
}
