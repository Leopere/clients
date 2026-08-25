import { CommonModule } from "@angular/common";
import { Component, inject } from "@angular/core";

import { JslibModule } from "@bitwarden/angular/jslib.module";
import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import { ButtonModule, LinkModule } from "@bitwarden/components";

// FIXME(https://bitwarden.atlassian.net/browse/CL-764): Migrate to OnPush
// eslint-disable-next-line @angular-eslint/prefer-on-push-component-change-detection
@Component({
  selector: "dirt-phishing-protected-by",
  standalone: true,
  templateUrl: "protected-by-component.html",
  imports: [CommonModule, CommonModule, JslibModule, ButtonModule, LinkModule],
})
export class ProtectedByComponent {
  private readonly i18nService = inject(I18nService);
  protected readonly phishingBlockerName = `${this.i18nService.t("appName")} ${this.i18nService.t(
    "phishingBlocker",
  )}`;
}
