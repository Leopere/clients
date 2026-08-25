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

function fail(message) {
  throw new Error(`Invalid Firefox fork identity: ${message}`);
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
  let realIconsDirectory;
  try {
    realIconsDirectory = fs.realpathSync(identity.iconsDirectory);
  } catch (error) {
    fail(`could not read "iconsDirectory": ${error.message}`);
  }
  if (realIconsDirectory === fs.realpathSync(upstreamIconsDirectory)) {
    fail('"iconsDirectory" must provide fork assets, not apps/browser/src/images.');
  }

  for (const [fileName, size] of Object.entries(REQUIRED_ICON_DIMENSIONS)) {
    const forkPng = validatePng(path.join(identity.iconsDirectory, fileName), size);
    const upstreamPng = fs.readFileSync(path.join(upstreamIconsDirectory, fileName));
    if (forkPng.equals(upstreamPng)) {
      fail(`"${fileName}" must not reuse the official Bitwarden icon.`);
    }
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
  return (buffer) => {
    const messages = JSON.parse(buffer.toString().replace(/^\uFEFF/, ""));
    const replacements = {
      appName: identity.name,
      appLogoLabel: identity.logoLabel,
      extName: identity.name,
      extDesc: identity.description,
    };

    for (const [key, message] of Object.entries(replacements)) {
      if (messages[key] == null || typeof messages[key] !== "object") {
        fail(`locale is missing the required "${key}" message.`);
      }
      messages[key].message = message;
    }

    return JSON.stringify(messages, null, 2);
  };
}

module.exports = {
  FIREFOX_FORK_DATA_COLLECTION_PERMISSIONS,
  FIREFOX_FORK_MIN_VERSION,
  OFFICIAL_FIREFOX_GECKO_ID,
  REQUIRED_ICON_FILES,
  applyToManifest,
  load,
  transformLocale,
};
