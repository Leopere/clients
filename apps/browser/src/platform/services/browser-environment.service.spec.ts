import { mock } from "jest-mock-extended";
import { firstValueFrom } from "rxjs";

import { FakeAccountService, FakeStateProvider } from "@bitwarden/common/spec";
import { Region } from "@bitwarden/common/platform/abstractions/environment.service";
import { LogService } from "@bitwarden/common/platform/abstractions/log.service";
import {
  EnvironmentUrls,
  GLOBAL_ENVIRONMENT_KEY,
} from "@bitwarden/common/platform/services/default-environment.service";

import { BrowserEnvironmentService } from "./browser-environment.service";

describe("BrowserEnvironmentService", () => {
  let stateProvider: FakeStateProvider;
  let logService: LogService;
  let service: BrowserEnvironmentService;

  const originalForkBuild = process.env.FIREFOX_FORK_BUILD;
  const originalDefaultServer = process.env.FIREFOX_FORK_DEFAULT_SERVER;

  beforeEach(() => {
    process.env.FIREFOX_FORK_BUILD = "true";
    process.env.FIREFOX_FORK_DEFAULT_SERVER = "self-hosted";
    const accountService = new FakeAccountService({});
    stateProvider = new FakeStateProvider(accountService);
    logService = mock<LogService>();
    service = new BrowserEnvironmentService(logService, stateProvider, accountService);
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
  });

  it("defaults a fresh fork install to a fail-closed unconfigured Self-hosted environment", async () => {
    const environment = await firstValueFrom(service.globalEnvironment$);

    expect(environment.getRegion()).toBe(Region.SelfHosted);
    expect(environment.getUrls()).toEqual({});
    expect(environment.hasBaseUrl()).toBe(false);
    expect(environment.getApiUrl()).toBe("https://self-hosted.invalid/api");
    expect(environment.getIdentityUrl()).toBe("https://self-hosted.invalid/identity");
  });

  it("fails closed for an explicitly stored Self-hosted environment without URLs", async () => {
    stateProvider.global.getFake(GLOBAL_ENVIRONMENT_KEY).stateSubject.next({
      region: Region.SelfHosted,
      urls: new EnvironmentUrls(),
    });

    const environment = await firstValueFrom(service.globalEnvironment$);

    expect(environment.getRegion()).toBe(Region.SelfHosted);
    expect(environment.getUrls()).toEqual({});
    expect(environment.hasBaseUrl()).toBe(false);
    expect(environment.getApiUrl()).toBe("https://self-hosted.invalid/api");
  });

  it("retains the upstream US default outside the fork build", async () => {
    process.env.FIREFOX_FORK_BUILD = "false";

    const environment = await firstValueFrom(service.globalEnvironment$);

    expect(environment.getRegion()).toBe(Region.US);
    expect(environment.getApiUrl()).toBe("https://api.bitwarden.com");
  });

  it("distinguishes a fresh install from an explicitly saved environment", async () => {
    expect(await service.hasExplicitGlobalEnvironment()).toBe(false);

    for (const region of [Region.US, Region.EU, Region.Gov, Region.SelfHosted]) {
      const urls = new EnvironmentUrls();
      if (region === Region.SelfHosted) {
        urls.base = "https://vaultwarden.example.test";
      }
      stateProvider.global.getFake(GLOBAL_ENVIRONMENT_KEY).stateSubject.next({ region, urls });

      expect(await service.hasExplicitGlobalEnvironment()).toBe(true);
      expect((await firstValueFrom(service.globalEnvironment$)).getRegion()).toBe(region);
    }
  });

  it.each([
    ["an empty policy", {}],
    ["an empty URL", { base: "" }],
    ["a relative URL", { base: "vaultwarden.example.test" }],
    ["a non-HTTP URL", { base: "ftp://vaultwarden.example.test" }],
    ["credentials in a URL", { base: "https://user:password@vaultwarden.example.test" }],
    ["an icons-only policy", { icons: "https://icons.example.test" }],
    ["an API-only policy", { api: "https://api.example.test" }],
    [
      "a valid base with an invalid optional URL",
      { base: "https://vaultwarden.example.test", icons: "" },
    ],
  ])("ignores %s instead of persisting a cloud fallback", async (_description, environment) => {
    jest.spyOn(service, "getManagedEnvironment").mockResolvedValue(environment);
    const setEnvironment = jest.spyOn(service, "setEnvironment");

    expect(await service.hasManagedEnvironment()).toBe(false);
    await service.setUrlsToManagedEnvironment();

    expect(setEnvironment).not.toHaveBeenCalled();
    expect(logService.error).toHaveBeenCalledWith(
      "Ignoring an invalid managed environment configuration.",
    );
  });

  it("applies a valid managed environment as Self-hosted", async () => {
    const environment = {
      base: "  https://vaultwarden.example.test  ",
      icons: "https://icons.example.test",
    };
    jest.spyOn(service, "getManagedEnvironment").mockResolvedValue(environment);
    const setEnvironment = jest.spyOn(service, "setEnvironment").mockResolvedValue(environment);

    expect(await service.hasManagedEnvironment()).toBe(true);
    await service.setUrlsToManagedEnvironment();

    expect(setEnvironment).toHaveBeenCalledWith(Region.SelfHosted, {
      base: "https://vaultwarden.example.test",
      webVault: undefined,
      api: undefined,
      identity: undefined,
      icons: environment.icons,
      notifications: undefined,
      events: undefined,
    });
  });
});
