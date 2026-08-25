const fs = require("fs");
const path = require("path");

const {
  FIREFOX_FORK_DATA_COLLECTION_PERMISSIONS,
  FIREFOX_FORK_MIN_VERSION,
  OFFICIAL_FIREFOX_GECKO_ID,
  REQUIRED_ICON_FILES,
} = require("../webpack/firefox-fork-identity");

function fail(message) {
  throw new Error(`Invalid Firefox fork build: ${message}`);
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
  } catch (error) {
    fail(`could not read "${filePath}": ${error.message}`);
  }
}

function findFiles(directory, extension) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return findFiles(entryPath, extension);
    }
    return entry.isFile() && entry.name.endsWith(extension) ? [entryPath] : [];
  });
}

function verify(buildDirectory, expectedManifestVersion) {
  const resolvedBuildDirectory = path.resolve(buildDirectory);
  const manifest = readJson(path.join(resolvedBuildDirectory, "manifest.json"));
  if (manifest.manifest_version !== 2 && manifest.manifest_version !== 3) {
    fail("manifest_version must be 2 or 3.");
  }
  if (
    expectedManifestVersion != null &&
    manifest.manifest_version !== Number(expectedManifestVersion)
  ) {
    fail(
      `manifest_version must be ${expectedManifestVersion}; found ${manifest.manifest_version}.`,
    );
  }
  if (Object.hasOwn(manifest, "update_url")) {
    fail('manifest.json must not define "update_url" before a release channel exists.');
  }

  const geckoSettings = manifest.browser_specific_settings?.gecko;
  if (geckoSettings?.strict_min_version !== FIREFOX_FORK_MIN_VERSION) {
    fail(`manifest.json must require Firefox ${FIREFOX_FORK_MIN_VERSION} or newer.`);
  }
  if (
    JSON.stringify(geckoSettings?.data_collection_permissions?.required) !==
    JSON.stringify(FIREFOX_FORK_DATA_COLLECTION_PERMISSIONS)
  ) {
    fail("manifest.json must declare the reviewed Firefox data collection permissions.");
  }

  const geckoId = geckoSettings?.id;
  if (
    typeof geckoId !== "string" ||
    geckoId.toLowerCase() === OFFICIAL_FIREFOX_GECKO_ID.toLowerCase()
  ) {
    fail("manifest.json must use a non-official Gecko ID.");
  }

  const englishMessages = readJson(path.join(resolvedBuildDirectory, "_locales/en/messages.json"));
  const identityMessages = ["appName", "appLogoLabel", "extName", "extDesc"];
  for (const key of identityMessages) {
    if (typeof englishMessages[key]?.message !== "string") {
      fail(`the English locale is missing "${key}".`);
    }
  }
  if (englishMessages.appName.message !== englishMessages.extName.message) {
    fail("the English appName and extName identities do not match.");
  }

  const action = manifest.manifest_version === 3 ? manifest.action : manifest.browser_action;
  const identityValues = [
    manifest.short_name,
    manifest.author,
    action?.default_title,
    manifest.sidebar_action?.default_title,
    englishMessages.appName.message,
    englishMessages.appLogoLabel.message,
    englishMessages.extDesc.message,
  ];
  if (identityValues.some((value) => typeof value !== "string" || /bitwarden/i.test(value))) {
    fail("manifest and locale identity fields must not use the upstream Bitwarden identity.");
  }
  if (
    action.default_title !== englishMessages.appName.message ||
    manifest.sidebar_action.default_title !== englishMessages.appName.message
  ) {
    fail("manifest action titles must match the English appName identity.");
  }
  let homepage;
  try {
    homepage = new URL(manifest.homepage_url);
  } catch (error) {
    fail(`manifest homepage_url is invalid: ${error.message}`);
  }
  const canonicalHostname = homepage.hostname.replace(/\.+$/, "").toLowerCase();
  if (canonicalHostname === "bitwarden.com" || canonicalHostname.endsWith(".bitwarden.com")) {
    fail("manifest homepage_url must not use the upstream Bitwarden domain.");
  }

  const localesDirectory = path.join(resolvedBuildDirectory, "_locales");
  const locales = fs
    .readdirSync(localesDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  if (locales.length === 0) {
    fail("the build has no locales.");
  }
  for (const locale of locales) {
    const messages = readJson(path.join(localesDirectory, locale, "messages.json"));
    for (const key of identityMessages) {
      if (messages[key]?.message !== englishMessages[key].message) {
        fail(`locale "${locale}" does not use the configured "${key}" identity.`);
      }
    }
  }

  for (const fileName of REQUIRED_ICON_FILES) {
    const forkIconPath = path.join(resolvedBuildDirectory, "images", fileName);
    if (!fs.statSync(forkIconPath).isFile()) {
      fail(`the build is missing required icon "${fileName}".`);
    }
    const upstreamIconPath = path.join(__dirname, "../src/images", fileName);
    if (fs.readFileSync(forkIconPath).equals(fs.readFileSync(upstreamIconPath))) {
      fail(`the build reuses the official Bitwarden icon "${fileName}".`);
    }
  }

  const htmlFiles = findFiles(resolvedBuildDirectory, ".html");
  if (htmlFiles.length === 0) {
    fail("the build has no HTML entry points.");
  }
  for (const htmlFile of htmlFiles) {
    const html = fs.readFileSync(htmlFile, "utf8");
    if (/<title[^>]*>[^<]*Bitwarden/i.test(html)) {
      fail(`HTML title retains the upstream identity in "${htmlFile}".`);
    }
  }

  const popupBundle = fs.readFileSync(path.join(resolvedBuildDirectory, "popup/main.js"), "utf8");
  for (const forbiddenIdentity of ["<title>Bitwarden</title>", "Bitwarden phishing blocker"]) {
    if (popupBundle.includes(forbiddenIdentity)) {
      fail(`popup/main.js retains the upstream identity "${forbiddenIdentity}".`);
    }
  }

  return {
    geckoId,
    locales: locales.length,
    manifestVersion: manifest.manifest_version,
  };
}

if (require.main === module) {
  try {
    const result = verify(process.argv[2], process.argv[3]);
    console.log(
      `Verified Firefox fork MV${result.manifestVersion}, Gecko ID ${result.geckoId}, ${result.locales} locales.`,
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { verify };
