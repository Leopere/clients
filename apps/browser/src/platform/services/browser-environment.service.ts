// FIXME: Update this file to be type safe and remove this and next line
// @ts-strict-ignore
import { firstValueFrom } from "rxjs";

import { AccountService } from "@bitwarden/common/auth/abstractions/account.service";
import {
  Region,
  RegionConfig,
  Urls,
} from "@bitwarden/common/platform/abstractions/environment.service";
import { LogService } from "@bitwarden/common/platform/abstractions/log.service";
import {
  DefaultEnvironmentService,
  GLOBAL_ENVIRONMENT_KEY,
  SelfHostedEnvironment,
} from "@bitwarden/common/platform/services/default-environment.service";
import { StateProvider } from "@bitwarden/common/platform/state";

import { GroupPolicyEnvironment } from "../../admin-console/types/group-policy-environment";
import { devFlagEnabled, devFlagValue } from "../flags";

const UNCONFIGURED_SELF_HOSTED_URL = "https://self-hosted.invalid";
const MANAGED_ENVIRONMENT_URL_KEYS = [
  "base",
  "webVault",
  "api",
  "identity",
  "icons",
  "notifications",
  "events",
] as const satisfies readonly (keyof GroupPolicyEnvironment)[];

function normalizeManagedEnvironment(
  environment: GroupPolicyEnvironment | null,
): GroupPolicyEnvironment | null {
  if (environment == null || typeof environment !== "object") {
    return null;
  }

  const normalizedEnvironment: GroupPolicyEnvironment = {};
  for (const key of MANAGED_ENVIRONMENT_URL_KEYS) {
    const value = environment[key];
    if (value == null) {
      continue;
    }
    if (typeof value !== "string" || value.trim().length === 0) {
      return null;
    }

    const normalizedUrl = value.trim();

    try {
      const url = new URL(normalizedUrl);
      if (
        (url.protocol !== "https:" && url.protocol !== "http:") ||
        url.username !== "" ||
        url.password !== ""
      ) {
        return null;
      }
    } catch {
      return null;
    }

    normalizedEnvironment[key] = normalizedUrl;
  }

  if (normalizedEnvironment.base == null && normalizedEnvironment.webVault == null) {
    return null;
  }

  return normalizedEnvironment;
}

class UnconfiguredSelfHostedEnvironment extends SelfHostedEnvironment {
  constructor() {
    super({ base: UNCONFIGURED_SELF_HOSTED_URL });
  }

  override getUrls(): ReturnType<SelfHostedEnvironment["getUrls"]> {
    // The inherited implementation infers required keys even though Environment.getUrls() returns
    // the optional Urls contract. Keep the unconfigured sentinel out of form fields and storage.
    return {} as ReturnType<SelfHostedEnvironment["getUrls"]>;
  }

  override hasBaseUrl(): boolean {
    return false;
  }
}

export class BrowserEnvironmentService extends DefaultEnvironmentService {
  constructor(
    private logService: LogService,
    private browserStateProvider: StateProvider,
    accountService: AccountService,
    additionalRegionConfigs: RegionConfig[] = [],
  ) {
    super(browserStateProvider, accountService, additionalRegionConfigs);
  }

  protected override buildEnvironment(region: Region, urls: Urls) {
    if (
      process.env.FIREFOX_FORK_BUILD === "true" &&
      process.env.FIREFOX_FORK_DEFAULT_SERVER === "self-hosted" &&
      region == null &&
      urls == null
    ) {
      return new UnconfiguredSelfHostedEnvironment();
    }

    return super.buildEnvironment(region, urls);
  }

  async hasExplicitGlobalEnvironment(): Promise<boolean> {
    const environment = await firstValueFrom(
      this.browserStateProvider.getGlobal(GLOBAL_ENVIRONMENT_KEY).state$,
    );
    return environment != null;
  }

  async hasManagedEnvironment(): Promise<boolean> {
    return (await this.getValidManagedEnvironment()) != null;
  }

  async settingsHaveChanged() {
    const managedEnv = await this.getValidManagedEnvironment();
    if (managedEnv == null) {
      return false;
    }
    const env = await firstValueFrom(this.environment$);
    const urls = env.getUrls();

    return (
      managedEnv.base != urls.base ||
      managedEnv.webVault != urls.webVault ||
      managedEnv.api != urls.api ||
      managedEnv.identity != urls.identity ||
      managedEnv.icons != urls.icons ||
      managedEnv.notifications != urls.notifications ||
      managedEnv.events != urls.events
    );
  }

  getManagedEnvironment(): Promise<GroupPolicyEnvironment> {
    return devFlagEnabled("managedEnvironment")
      ? new Promise((resolve) => resolve(devFlagValue("managedEnvironment")))
      : new Promise((resolve, reject) => {
          if (chrome.storage.managed == null) {
            return resolve(null);
          }

          chrome.storage.managed.get("environment", (result) => {
            if (chrome.runtime.lastError) {
              return reject(chrome.runtime.lastError);
            }

            resolve(result.environment);
          });
        });
  }

  async setUrlsToManagedEnvironment() {
    const env = await this.getValidManagedEnvironment();
    if (env == null) {
      return;
    }

    await this.setEnvironment(Region.SelfHosted, {
      base: env.base,
      webVault: env.webVault,
      api: env.api,
      identity: env.identity,
      icons: env.icons,
      notifications: env.notifications,
      events: env.events,
    });
  }

  private async getValidManagedEnvironment(): Promise<GroupPolicyEnvironment | null> {
    try {
      const environment = await this.getManagedEnvironment();
      if (environment == null) {
        return null;
      }
      const normalizedEnvironment = normalizeManagedEnvironment(environment);
      if (normalizedEnvironment == null) {
        this.logService.error("Ignoring an invalid managed environment configuration.");
        return null;
      }
      return normalizedEnvironment;
    } catch (error) {
      this.logService.error(error);
      return null;
    }
  }
}
