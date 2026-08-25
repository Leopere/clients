import { mock, MockProxy } from "jest-mock-extended";

import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import { PlatformUtilsService } from "@bitwarden/common/platform/abstractions/platform-utils.service";

import { BrowserApi } from "../browser/browser-api";

import { DefaultBadgeBrowserApi } from "./badge-browser-api";
import { BadgeIcon } from "./icon";

describe("DefaultBadgeBrowserApi", () => {
  let browserAction: MockProxy<ReturnType<typeof BrowserApi.getBrowserAction>>;
  let sidebarAction: MockProxy<FirefoxSidebarAction>;
  let platformUtilsService: MockProxy<PlatformUtilsService>;
  let i18nService: MockProxy<I18nService>;

  beforeEach(() => {
    browserAction = mock();
    sidebarAction = mock();
    Object.defineProperty(sidebarAction, "setBadgeText", { value: undefined });
    platformUtilsService = mock();
    i18nService = mock();

    jest.spyOn(BrowserApi, "getBrowserAction").mockReturnValue(browserAction);
    jest.spyOn(BrowserApi, "getSidebarAction").mockReturnValue(sidebarAction);
    platformUtilsService.isFirefox.mockReturnValue(true);
    i18nService.t.mockImplementation((key) => (key === "appName" ? "Northstar Vault" : key));
  });

  it("uses the localized app name in the Firefox sidebar title", async () => {
    const api = new DefaultBadgeBrowserApi(platformUtilsService, i18nService);

    await api.setState(
      {
        text: "3",
        backgroundColor: "#175ddc",
        icon: BadgeIcon.Unlocked,
      },
      42,
    );

    expect(sidebarAction.setTitle).toHaveBeenCalledWith({
      title: "Northstar Vault [3]",
      tabId: 42,
    });
  });
});
