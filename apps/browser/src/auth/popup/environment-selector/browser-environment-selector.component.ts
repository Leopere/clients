import { ChangeDetectionStrategy, Component, OnInit } from "@angular/core";

import { EnvironmentSelectorComponent } from "@bitwarden/angular/auth/environment-selector/environment-selector.component";
import { SelfHostedEnvConfigDialogComponent } from "@bitwarden/angular/auth/self-hosted-env-config-dialog/self-hosted-env-config-dialog.component";
import { DialogService } from "@bitwarden/components";

import { BrowserEnvironmentService } from "../../../platform/services/browser-environment.service";

@Component({
  selector: "app-browser-environment-selector",
  template: "<environment-selector />",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EnvironmentSelectorComponent],
})
export class BrowserEnvironmentSelectorComponent implements OnInit {
  constructor(
    private environmentService: BrowserEnvironmentService,
    private dialogService: DialogService,
  ) {}

  async ngOnInit(): Promise<void> {
    if (
      process.env.FIREFOX_FORK_BUILD !== "true" ||
      process.env.FIREFOX_FORK_DEFAULT_SERVER !== "self-hosted" ||
      (await this.environmentService.hasExplicitGlobalEnvironment()) ||
      (await this.environmentService.hasManagedEnvironment())
    ) {
      return;
    }

    await SelfHostedEnvConfigDialogComponent.open(this.dialogService);
  }
}
