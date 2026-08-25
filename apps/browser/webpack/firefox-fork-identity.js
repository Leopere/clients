const fs = require("fs");
const path = require("path");

const OFFICIAL_FIREFOX_GECKO_ID = "{446900e4-71c2-419f-a6a7-df9c091e268b}";
const FIREFOX_FORK_MIN_VERSION = "142.0";
const FIREFOX_FORK_DATA_COLLECTION_PERMISSIONS = Object.freeze([
  "authenticationInfo",
  "browsingActivity",
  "financialAndPaymentInfo",
  "personalCommunications",
  "personallyIdentifyingInfo",
  "websiteActivity",
  "websiteContent",
]);

const REQUIRED_ICON_DIMENSIONS = Object.freeze({
  "berry19.png": 19,
  "berry38.png": 38,
  "icon16.png": 16,
  "icon19.png": 19,
  "icon19_gray.png": 19,
  "icon19_locked.png": 19,
  "icon32.png": 32,
  "icon38.png": 38,
  "icon38_gray.png": 38,
  "icon38_locked.png": 38,
  "icon48.png": 48,
  "icon96.png": 96,
  "icon128.png": 128,
});

const REQUIRED_ICON_FILES = Object.freeze(Object.keys(REQUIRED_ICON_DIMENSIONS));
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// These keys contain the upstream product identity in at least one source locale. Fork builds use
// one reviewed neutral English value for each key until independent fork translations are available.
const FORK_IDENTITY_MESSAGE_KEYS = Object.freeze([
  "about",
  "aboutBitwarden",
  "accountRestrictedOptionDescription",
  "addLoginNotificationDesc",
  "appLogoLabel",
  "appName",
  "authenticatorAppDescV2",
  "autofillIframeWarningTip",
  "autofillSpotlightDesc",
  "awaitDesktopDesc",
  "biometricPermissionDesc",
  "biometricsFailedDesc",
  "biometricsNotEnabledDesc",
  "biometricsStatusHelptextDesktopDisconnected",
  "biometricsStatusHelptextNotEnabledInDesktop",
  "bitwardenAccount",
  "bitwardenAuthenticator",
  "bitwardenForBusiness",
  "bitwardenForBusinessPageDesc",
  "bitwardenOverlayButton",
  "bitwardenOverlayMenuAvailable",
  "bitwardenSecretsManager",
  "bitwardenSupport",
  "bitwardenVault",
  "bitWebVaultApp",
  "changedPasswordNotificationDesc",
  "changedPasswordNotificationDescAlt",
  "changeMasterPasswordOnWebConfirmation",
  "communityForums",
  "contactSupport",
  "contextMenuItemDesc",
  "continueToAuthenticatorPageDesc",
  "continueToBitwardenDotCom",
  "continueToBrowserExtensionStoreDesc",
  "continueToHelpCenterDesc",
  "continueToPasswordlessDotDevPageDesc",
  "continueToSecretsManagerPageDesc",
  "continueToWebAppDesc",
  "couldNotDecryptVaultItemsBelow",
  "defaultPasswordManagerCalloutDesc",
  "defaultPasswordManagerPromptStep2AfterAllow",
  "defaultPasswordManagerPromptTitle",
  "defaultPasswordManagerPromptTitleV2",
  "defaultPasswordManagerSuccessToast",
  "defaultUriMatchDetectionDesc",
  "desktopIntegrationDisabledDesc",
  "downloadBitwarden",
  "downloadBitwardenApps",
  "downloadBitwardenOnAllDevices",
  "downloadFromBitwardenNow",
  "emailPlaceholder",
  "emailPlaceholderMultiple",
  "emptyVaultNudgeBody",
  "enableAutoFillOnPageLoadDesc",
  "encExportAccountWarningDesc",
  "excludedDomainsDesc",
  "experiencingAnIssue",
  "extDesc",
  "extName",
  "forwarderGeneratedBy",
  "forwarderGeneratedByWithWebsite",
  "freeBitwardenFamilies",
  "freeBitwardenFamiliesPageDesc",
  "generatePasswordSlideDesc",
  "generatePasswordSlideImgAltPeriod",
  "getTheMobileAppDesc",
  "gettingStartedTutorial",
  "gettingStartedTutorialVideo",
  "helpCenter",
  "howDoesBitwardenProtectFromPhishing",
  "importGnomeInstructionsFileHere",
  "importTargetHintCollection",
  "introCarouselLabel",
  "moreFromBitwarden",
  "nativeMessagingPermissionErrorDesc",
  "newToBitwarden",
  "notificationAddDesc",
  "notificationChangeDesc",
  "notificationLoginSaveConfirmation",
  "notificationLoginUpdatedConfirmation",
  "notificationSentDevicePart1",
  "notificationSentDevicePart2",
  "notificationUnlockDesc",
  "overrideDefaultBrowserAutofillDescription",
  "overrideDefaultBrowserAutoFillSettings",
  "overrideDefaultBrowserAutofillTitle",
  "passwordProtectedOptionDescription",
  "permitCipherDetailsDescription",
  "popup2faCloseMessage",
  "premiumManageAlert",
  "premiumPurchaseAlertV2",
  "privacyPermissionAdditionNotGrantedDescription",
  "privacyPermissionAdditionNotGrantedTitle",
  "receiveMarketingEmails",
  "removeMasterPasswordForOrgUserKeyConnector",
  "saveToBitwarden",
  "secureDevicesBody",
  "securityPrioritizedBody",
  "selfHostedBaseUrlHint",
  "sessionTimeoutSuppressedByConnectedDevice",
  "setPinCode",
  "setYourPinCode",
  "sharedUnlockDesktopPermissionDesc",
  "sharedUnlockDesktopPermissionWarning",
  "sharedUnlockWithDesktopDescription",
  "sharedUnlockWithWebDescription",
  "showInlineMenuOnIconSelectionLabel",
  "startDesktopDesc",
  "startDesktopTitle",
  "toggleBitwardenVaultOverlay",
  "topLayerHijackWarning",
  "totpHelper",
  "totpHelperWithCapture",
  "turnOffBrowserBuiltInPasswordManagerSettings",
  "twoStepLoginConfirmation",
  "twoStepLoginConfirmationContent",
  "updateEncryptionKeyWarning",
  "updateInBitwarden",
  "updateInBitwardenSlideDesc",
  "updateInBitwardenSlideImgAltPeriod",
  "updateMasterPasswordWarning",
  "uriMatchDefaultStrategyHint",
  "wasmNotSupported",
  "weakMasterPasswordDesc",
  "webApp",
  "welcomeDialogGraphicAlt",
]);

const UPSTREAM_IDENTITY_MESSAGE_VARIANTS = Object.freeze([
  "bitwarden",
  "bitwaden",
  "bitwaren",
  "bidwarden",
  "bitwardna",
  "bitwardnov",
  "битуорден",
  "битоурден",
  "битуордун",
  "बिटवार्डन",
  "बिटवर्डन",
  "बिटवॉर्डेन",
  "ಬಿಟ್ವಾರ್ಡೆನ್",
  "ಬಿಟ್‌ವಾರ್ಡನ್",
  "ಬಿಟ್ವರ್ಡ್ನಲ್ಲಿ",
  "ಬಿಟ್‌ವಾರ್ಡೆನ್",
  "ಬಿಟ್ವರ್ಡ್",
  "ಬಿಟ್ವಾರ್ಡ್",
  "ബിറ്റ്‌വർ‌ഡൻ‌",
  "ബിറ്റ്വാർഡനിൽ",
  "බිට්වාඩන්",
  "බිට්වොන්",
  "බිට්වර්ඩන්",
]);

function fail(message) {
  throw new Error(`Invalid Firefox fork identity: ${message}`);
}

function containsUpstreamIdentity(message) {
  const normalizedMessage = message.normalize("NFKC").toLocaleLowerCase();
  return UPSTREAM_IDENTITY_MESSAGE_VARIANTS.some((variant) =>
    normalizedMessage.includes(variant.normalize("NFKC")),
  );
}

function readRequiredString(config, property) {
  const value = config[property];
  if (typeof value !== "string" || value.trim().length === 0) {
    fail(`"${property}" must be a non-empty string.`);
  }

  if (/replace[ _-]?me/i.test(value)) {
    fail(`"${property}" still contains a placeholder.`);
  }
  if (/[\u0000-\u001f\u007f]/u.test(value)) {
    fail(`"${property}" must not contain control characters.`);
  }

  return value.trim();
}

function validatePng(filePath, expectedSize) {
  let png;
  try {
    png = fs.readFileSync(filePath);
  } catch (error) {
    fail(`could not read required icon "${filePath}": ${error.message}`);
  }

  if (png.length < 24 || !png.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    fail(`"${filePath}" is not a PNG file.`);
  }

  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  if (width !== expectedSize || height !== expectedSize) {
    fail(`"${filePath}" must be ${expectedSize}x${expectedSize}; found ${width}x${height}.`);
  }

  return png;
}

function load(configPath, browser, browserDirectory) {
  if (browser !== "firefox") {
    fail("the identity layer can only be used for Firefox builds.");
  }

  const resolvedBrowserDirectory = path.resolve(browserDirectory ?? path.join(__dirname, ".."));
  const resolvedConfigPath = path.resolve(resolvedBrowserDirectory, configPath);

  let config;
  try {
    config = JSON.parse(fs.readFileSync(resolvedConfigPath, "utf8").replace(/^\uFEFF/, ""));
  } catch (error) {
    fail(`could not read "${resolvedConfigPath}": ${error.message}`);
  }

  if (config === null || typeof config !== "object" || Array.isArray(config)) {
    fail("the configuration must be a JSON object.");
  }

  const identity = {
    name: readRequiredString(config, "name"),
    shortName: readRequiredString(config, "shortName"),
    description: readRequiredString(config, "description"),
    author: readRequiredString(config, "author"),
    homepageUrl: readRequiredString(config, "homepageUrl"),
    geckoId: readRequiredString(config, "geckoId"),
    logoLabel: readRequiredString(config, "logoLabel"),
    defaultServer: readRequiredString(config, "defaultServer"),
    openWelcomePage: config.openWelcomePage,
    slug: readRequiredString(config, "slug"),
    distributionChannel: readRequiredString(config, "distributionChannel"),
    iconsDirectory: readRequiredString(config, "iconsDirectory"),
    configPath: resolvedConfigPath,
  };

  if (identity.name.length > 40) {
    fail('"name" must be 40 characters or fewer.');
  }
  if (identity.description.length > 112) {
    fail('"description" must be 112 characters or fewer.');
  }
  if (identity.defaultServer !== "self-hosted") {
    fail('"defaultServer" must be "self-hosted".');
  }
  if (identity.openWelcomePage !== false) {
    fail('"openWelcomePage" must be false until a reviewed fork welcome page is available.');
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(identity.slug)) {
    fail('"slug" must contain lowercase letters, numbers, and single hyphens only.');
  }
  if (identity.distributionChannel !== "unlisted") {
    fail('"distributionChannel" must remain "unlisted" until public listing is authorized.');
  }

  for (const property of ["name", "shortName", "description", "author", "logoLabel"]) {
    if (/bitwarden/i.test(identity[property])) {
      fail(`"${property}" must not use the upstream Bitwarden identity.`);
    }
  }

  let homepage;
  try {
    homepage = new URL(identity.homepageUrl);
  } catch (error) {
    fail(`"homepageUrl" must be a valid URL: ${error.message}`);
  }
  if (homepage.protocol !== "https:" || homepage.username !== "" || homepage.password !== "") {
    fail('"homepageUrl" must be an HTTPS URL without credentials.');
  }
  const canonicalHostname = homepage.hostname.replace(/\.+$/, "").toLowerCase();
  if (canonicalHostname === "bitwarden.com" || canonicalHostname.endsWith(".bitwarden.com")) {
    fail('"homepageUrl" must not use the upstream Bitwarden domain.');
  }

  if (identity.geckoId.toLowerCase() === OFFICIAL_FIREFOX_GECKO_ID.toLowerCase()) {
    fail('"geckoId" must not use the official Bitwarden Firefox add-on ID.');
  }
  const guidGeckoId = /^\{[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\}$/i;
  const emailGeckoId = /^[a-z0-9][a-z0-9._+-]*@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i;
  if (!guidGeckoId.test(identity.geckoId) && !emailGeckoId.test(identity.geckoId)) {
    fail('"geckoId" must be a UUID in braces or an email-style extension ID.');
  }

  identity.iconsDirectory = path.resolve(path.dirname(resolvedConfigPath), identity.iconsDirectory);
  const upstreamIconsDirectory = path.resolve(resolvedBrowserDirectory, "src/images");
  if (identity.iconsDirectory === upstreamIconsDirectory) {
    fail('"iconsDirectory" must provide fork assets, not apps/browser/src/images.');
  }
  let realIconsDirectory;
  try {
    realIconsDirectory = fs.realpathSync(identity.iconsDirectory);
  } catch (error) {
    fail(`could not read "iconsDirectory": ${error.message}`);
  }
  const realUpstreamIconsDirectory = fs.existsSync(upstreamIconsDirectory)
    ? fs.realpathSync(upstreamIconsDirectory)
    : upstreamIconsDirectory;
  if (realIconsDirectory === realUpstreamIconsDirectory) {
    fail('"iconsDirectory" must provide fork assets, not apps/browser/src/images.');
  }

  for (const [fileName, size] of Object.entries(REQUIRED_ICON_DIMENSIONS)) {
    validatePng(path.join(identity.iconsDirectory, fileName), size);
  }

  return Object.freeze(identity);
}

function applyToManifest(manifest, identity) {
  const result = JSON.parse(JSON.stringify(manifest));

  if (result.manifest_version !== 2 && result.manifest_version !== 3) {
    fail("the transformed manifest must use Manifest Version 2 or 3.");
  }
  if (result.browser_specific_settings?.gecko?.id == null) {
    fail("the transformed manifest is missing browser_specific_settings.gecko.id.");
  }
  if (Object.hasOwn(result, "update_url")) {
    fail('the transformed manifest must not define "update_url" before a release channel exists.');
  }
  if (result.sidebar_action == null) {
    fail("the transformed Firefox manifest is missing sidebar_action.");
  }
  const action = result.manifest_version === 3 ? result.action : result.browser_action;
  if (action == null) {
    fail(
      `the transformed Manifest Version ${result.manifest_version} manifest is missing its action.`,
    );
  }

  result.short_name = identity.shortName;
  result.author = identity.author;
  result.homepage_url = identity.homepageUrl;
  result.browser_specific_settings.gecko.id = identity.geckoId;
  result.browser_specific_settings.gecko.strict_min_version = FIREFOX_FORK_MIN_VERSION;
  result.browser_specific_settings.gecko.data_collection_permissions = {
    required: [...FIREFOX_FORK_DATA_COLLECTION_PERMISSIONS],
  };

  action.default_title = identity.name;
  result.sidebar_action.default_title = identity.name;

  return result;
}

function transformLocale(identity) {
  const englishMessages = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "../src/_locales/en/messages.json"), "utf8"),
  );

  return (buffer) => {
    const messages = JSON.parse(buffer.toString().replace(/^\uFEFF/, ""));
    const replacements = {
      appName: identity.name,
      appLogoLabel: identity.logoLabel,
      extName: identity.name,
      extDesc: identity.description,
      newToBitwarden: "Need an account?",
      aboutBitwarden: `About ${identity.name}`,
      moreFromBitwarden: "More resources",
      bitWebVaultApp: "Account server web app",
      continueToWebAppDesc: "Open more account features on your selected server's web app.",
      continueToBrowserExtensionStoreDesc: "Share feedback with your support provider.",
      continueToBitwardenDotCom: "Continue to the upstream website?",
      continueToHelpCenterDesc: "Learn more in the upstream documentation.",
      helpCenter: "Upstream documentation",
      communityForums: "Upstream community forums",
      contactSupport: "Contact your support provider",
      bitwardenSupport: "your server administrator or support provider",
      downloadDiagnosticReportWith:
        "Download the diagnostic report before sharing it with your server administrator or support provider.",
      couldNotDecryptVaultItemsBelow: `${identity.name} could not decrypt the vault items listed below.`,
      contactCSToAvoidDataLossPart1: "Contact your server administrator or support provider",
      contactCSToAvoidDataLossPart2: "to avoid further data loss.",
      bitwardenForBusiness: "Business password management",
      bitwardenForBusinessPageDesc:
        "Business password management lets you share vault items through an organization.",
      bitwardenAuthenticator: "Authenticator app",
      continueToAuthenticatorPageDesc:
        "An authenticator app can store keys and generate TOTP codes for two-step verification.",
      bitwardenSecretsManager: "Secrets management",
      continueToSecretsManagerPageDesc:
        "Secrets management tools can securely store, manage, and share developer secrets.",
      continueToPasswordlessDotDevPageDesc:
        "Passwordless.dev provides tools for passwordless sign-in experiences.",
      freeBitwardenFamilies: "Family plan",
      freeBitwardenFamiliesPageDesc:
        "Your account may be eligible for a family plan. Check your server's web app for details.",
      twoStepLoginConfirmation:
        "Two-step login makes your account more secure. Set it up in your server's web app now?",
      twoStepLoginConfirmationContent:
        "Make your account more secure by setting up two-step login in your server's web app.",
      changeMasterPasswordOnWebConfirmation:
        "You can change your master password in your server's web app.",
      premiumManageAlert: "Manage your membership in your server's web app now?",
      premiumPurchaseAlertV2: "If your server offers premium features, manage them in its web app.",
      authenticatorAppDescV2: "Enter a code generated by your authenticator app.",
      selfHostedBaseUrlHint:
        "Enter the base URL of your self-hosted server. Example: https://vault.example.com",
      bitwardenAccount: "compatible account",
      accountRestrictedOptionDescription:
        "Use your account encryption key to restrict this encrypted export to the current account.",
      passwordProtectedOptionDescription:
        "Set a file password so you can import this encrypted export into another compatible account.",
      encExportAccountWarningDesc:
        "Account encryption keys are unique, so you can't import this encrypted export into a different account.",
      receiveMarketingEmails: "Receive account service updates in your inbox.",
      howDoesBitwardenProtectFromPhishing: "How can I protect my data from phishing?",
      updateEncryptionKeyWarning:
        "After updating your encryption key, log out and back in to every compatible client so each one downloads the new key. Delayed sign-out can cause data corruption.",
      downloadBitwarden: "Get compatible apps",
      downloadBitwardenApps: "Get compatible apps",
      downloadBitwardenOnAllDevices: "Use compatible apps on all devices",
      downloadFromBitwardenNow: "Visit the upstream website",
      getTheMobileAppDesc: "Use a compatible mobile app to access your passwords on the go.",
      secureDevicesBody:
        "Save passwords in this browser and use compatible clients on your other devices.",
      awaitDesktopDesc:
        "Confirm in a compatible desktop app to set up biometric unlock in the browser.",
      desktopIntegrationDisabledDesc:
        "Browser integration isn't set up in the compatible desktop app. Enable it in the desktop app settings.",
      startDesktopTitle: "Start the compatible desktop app",
      startDesktopDesc: "Start the compatible desktop app before you use biometric unlock.",
      biometricsFailedDesc:
        "Biometric unlock failed. Use your master password or sign out. If the problem continues, contact your support provider.",
      nativeMessagingPermissionErrorDesc:
        "Allow communication with the compatible desktop app to use biometric unlock in the browser.",
      biometricsStatusHelptextDesktopDisconnected:
        "Biometric unlock is unavailable because the compatible desktop app is closed.",
      biometricsStatusHelptextNotEnabledInDesktop:
        "Biometric unlock isn't enabled for $EMAIL$ in the compatible desktop app.",
      sessionTimeoutSuppressedByConnectedDevice:
        "Managed by the compatible desktop app. Open that app to make changes.",
      sharedUnlockWithDesktopDescription: "Share unlock status with a compatible desktop app.",
      sharedUnlockWithWebDescription: "Share unlock status with compatible web vaults.",
      sharedUnlockDesktopPermissionDesc:
        "Shared unlock needs permission to communicate with the compatible desktop app.",
      sharedUnlockDesktopPermissionWarning:
        "The extension will lock and reload after you approve desktop communication.",
      biometricPermissionDesc:
        "Biometric unlock needs permission to communicate with the compatible desktop app.",
      permitCipherDetailsDescription:
        "This extension uses saved login URIs to identify which icon or change-password URL to use. It does not collect or save information when you use this service.",
      wasmNotSupported:
        "WebAssembly is not supported or is disabled in this browser. This extension requires WebAssembly.",
      removeMasterPasswordForOrgUserKeyConnector:
        "Your organization no longer uses master passwords. Verify the organization and domain to continue.",
      emailPlaceholder: "user@example.com",
      emailPlaceholderMultiple: "user@example.com, admin@example.com",
    };

    for (const key of FORK_IDENTITY_MESSAGE_KEYS) {
      if (englishMessages[key] == null || typeof englishMessages[key].message !== "string") {
        fail(`the English locale is missing the reviewed "${key}" identity message.`);
      }
      if (messages[key] == null || typeof messages[key] !== "object") {
        fail(`locale is missing the reviewed "${key}" identity message.`);
      }

      const englishMessage = englishMessages[key].message
        .replace(/bitwarden\.com/giu, "the upstream website")
        .replace(/bitwarden/giu, identity.name);
      messages[key].message = replacements[key] ?? englishMessage;
    }

    for (const [key, message] of Object.entries(replacements)) {
      if (messages[key] == null || typeof messages[key] !== "object") {
        fail(`locale is missing the required "${key}" message.`);
      }
      messages[key].message = message;
    }

    for (const value of Object.values(messages)) {
      if (typeof value?.message !== "string") {
        continue;
      }
      value.message = value.message
        .replace(/bitwarden\.com/giu, "the upstream website")
        .replace(/bitwarden/giu, identity.name);
    }

    return JSON.stringify(messages, null, 2);
  };
}

module.exports = {
  FIREFOX_FORK_DATA_COLLECTION_PERMISSIONS,
  FIREFOX_FORK_MIN_VERSION,
  FORK_IDENTITY_MESSAGE_KEYS,
  OFFICIAL_FIREFOX_GECKO_ID,
  REQUIRED_ICON_FILES,
  applyToManifest,
  containsUpstreamIdentity,
  load,
  transformLocale,
};
