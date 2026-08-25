import { mock, MockProxy } from "jest-mock-extended";

import { SelfHostedEnvConfigDialogComponent } from "@bitwarden/angular/auth/self-hosted-env-config-dialog/self-hosted-env-config-dialog.component";
import { DialogService } from "@bitwarden/components";

import { BrowserEnvironmentService } from "../../../platform/services/browser-environment.service";

import { BrowserEnvironmentSelectorComponent } from "./browser-environment-selector.component";

describe("BrowserEnvironmentSelectorComponent", () => {
  let environmentService: MockProxy<BrowserEnvironmentService>;
  let dialogService: MockProxy<DialogService>;
  let component: BrowserEnvironmentSelectorComponent;

  const originalForkBuild = process.env.FIREFOX_FORK_BUILD;
  const originalDefaultServer = process.env.FIREFOX_FORK_DEFAULT_SERVER;

  beforeEach(() => {
    environmentService = mock<BrowserEnvironmentService>();
    dialogService = mock<DialogService>();
    component = new BrowserEnvironmentSelectorComponent(environmentService, dialogService);
    process.env.FIREFOX_FORK_BUILD = "true";
    process.env.FIREFOX_FORK_DEFAULT_SERVER = "self-hosted";
    jest.spyOn(SelfHostedEnvConfigDialogComponent, "open").mockResolvedValue(true);
  });

  afterEach(() => {
    if (originalForkBuild == null) {
      delete process.env.FIREFOX_FORK_BUILD;
    } else {
      process.env.FIREFOX_FORK_BUILD = originalForkBuild;
    }
    if (originalDefaultServer == null) {
      delete process.env.FIREFOX_FORK_DEFAULT_SERVER;
    } else {
      process.env.FIREFOX_FORK_DEFAULT_SERVER = originalDefaultServer;
    }
    jest.restoreAllMocks();
  });

  it("opens Self-hosted configuration for an unconfigured fork install", async () => {
    environmentService.hasExplicitGlobalEnvironment.mockResolvedValue(false);

    await component.ngOnInit();

    expect(SelfHostedEnvConfigDialogComponent.open).toHaveBeenCalledWith(dialogService);
  });

  it("preserves an explicitly saved environment", async () => {
    environmentService.hasExplicitGlobalEnvironment.mockResolvedValue(true);

    await component.ngOnInit();

    expect(SelfHostedEnvConfigDialogComponent.open).not.toHaveBeenCalled();
  });

  it("defers to a managed environment", async () => {
    environmentService.hasExplicitGlobalEnvironment.mockResolvedValue(false);
    environmentService.hasManagedEnvironment.mockResolvedValue(true);

    await component.ngOnInit();

    expect(SelfHostedEnvConfigDialogComponent.open).not.toHaveBeenCalled();
  });

  it("does not change upstream browser startup", async () => {
    process.env.FIREFOX_FORK_BUILD = "false";
    environmentService.hasExplicitGlobalEnvironment.mockResolvedValue(false);

    await component.ngOnInit();

    expect(environmentService.hasExplicitGlobalEnvironment).not.toHaveBeenCalled();
    expect(SelfHostedEnvConfigDialogComponent.open).not.toHaveBeenCalled();
  });

  it("does not prompt when the fork policy does not request Self-hosted", async () => {
    process.env.FIREFOX_FORK_DEFAULT_SERVER = "";
    environmentService.hasExplicitGlobalEnvironment.mockResolvedValue(false);

    await component.ngOnInit();

    expect(environmentService.hasExplicitGlobalEnvironment).not.toHaveBeenCalled();
    expect(SelfHostedEnvConfigDialogComponent.open).not.toHaveBeenCalled();
  });
});
