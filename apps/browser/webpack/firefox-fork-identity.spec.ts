import fs from "fs";
import os from "os";
import path from "path";
import zlib from "zlib";

import { verify } from "../scripts/verify-firefox-fork-build";

import { replaceIdentity } from "./firefox-fork-html-identity-plugin";
import {
  FIREFOX_FORK_DATA_COLLECTION_PERMISSIONS,
  FIREFOX_FORK_MIN_VERSION,
  OFFICIAL_FIREFOX_GECKO_ID,
  REQUIRED_ICON_FILES,
  load,
  transformLocale,
} from "./firefox-fork-identity";
import { transform } from "./manifest";

type IdentityConfig = {
  name: string;
  shortName: string;
  description: string;
  author: string;
  homepageUrl: string;
  geckoId: string;
  logoLabel: string;
  defaultServer: "self-hosted";
  openWelcomePage: false;
  slug: string;
  distributionChannel: "unlisted";
  iconsDirectory: string;
};

type BuiltManifest = {
  manifest_version: number;
  short_name: string;
  author: string;
  homepage_url: string;
  browser_specific_settings: {
    gecko: {
      id: string;
      strict_min_version: string;
      data_collection_permissions: { required: string[] };
    };
  };
  action?: { default_title: string };
  browser_action?: { default_title: string };
  sidebar_action: { default_title: string };
  background: Record<string, unknown>;
};

type LocaleMessages = Record<string, { message: string; description?: string }>;

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer) {
  const typeBuffer = Buffer.from(type);
  const chunk = Buffer.alloc(data.length + 12);
  chunk.writeUInt32BE(data.length, 0);
  typeBuffer.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), data.length + 8);
  return chunk;
}

function createTestPng(size: number, shade: number) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 6, 0, 0, 0], 8);

  const rowLength = 1 + size * 4;
  const pixels = Buffer.alloc(rowLength * size);
  for (let row = 0; row < size; row++) {
    for (let column = 0; column < size; column++) {
      const offset = row * rowLength + 1 + column * 4;
      pixels.set([shade, 90, 180, 255], offset);
    }
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", zlib.deflateSync(pixels)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

describe("Firefox fork identity", () => {
  const browserDirectory = path.resolve(__dirname, "..");
  let temporaryDirectory: string;

  beforeEach(() => {
    temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "firefox-fork-identity-"));
  });

  afterEach(() => {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  });

  function writeIdentity(overrides: Partial<IdentityConfig> = {}) {
    const iconsDirectory = path.join(temporaryDirectory, "icons");
    fs.mkdirSync(iconsDirectory, { recursive: true });
    for (const [index, fileName] of REQUIRED_ICON_FILES.entries()) {
      const size = Number(fileName.match(/\d+/)?.[0]);
      fs.writeFileSync(path.join(iconsDirectory, fileName), createTestPng(size, 20 + index));
    }

    const config: IdentityConfig = {
      name: "Northstar Vault",
      shortName: "Northstar",
      description: "A private password manager for the Northstar Vaultwarden service.",
      author: "Northstar Security",
      homepageUrl: "https://vault.example.org",
      geckoId: "firefox@vault.example.org",
      logoLabel: "Northstar Vault logo",
      defaultServer: "self-hosted",
      openWelcomePage: false,
      slug: "northstar-vault",
      distributionChannel: "unlisted",
      iconsDirectory: "./icons",
      ...overrides,
    };
    const configPath = path.join(temporaryDirectory, "firefox-identity.json");
    fs.writeFileSync(configPath, JSON.stringify(config));
    return configPath;
  }

  it("loads a complete Firefox identity with validated icon dimensions", () => {
    const configPath = writeIdentity();

    expect(load(configPath, "firefox", browserDirectory)).toEqual(
      expect.objectContaining({
        name: "Northstar Vault",
        geckoId: "firefox@vault.example.org",
        iconsDirectory: path.join(temporaryDirectory, "icons"),
      }),
    );
  });

  it("rejects the official Gecko ID", () => {
    const configPath = writeIdentity({ geckoId: OFFICIAL_FIREFOX_GECKO_ID.toUpperCase() });

    expect(() => load(configPath, "firefox", browserDirectory)).toThrow(
      "must not use the official Bitwarden Firefox add-on ID",
    );
  });

  it("rejects copied official Bitwarden icons", () => {
    const configPath = writeIdentity();
    fs.copyFileSync(
      path.join(browserDirectory, "src/images/icon16.png"),
      path.join(temporaryDirectory, "icons/icon16.png"),
    );

    expect(() => load(configPath, "firefox", browserDirectory)).toThrow(
      '"icon16.png" must not reuse the official Bitwarden icon',
    );
  });

  it("rejects upstream identity in descriptions and canonical hostnames", () => {
    expect(() =>
      load(
        writeIdentity({ description: "Official Bitwarden password manager" }),
        "firefox",
        browserDirectory,
      ),
    ).toThrow('"description" must not use the upstream Bitwarden identity');

    expect(() =>
      load(
        writeIdentity({ homepageUrl: "https://BITWARDEN.COM./support" }),
        "firefox",
        browserDirectory,
      ),
    ).toThrow('"homepageUrl" must not use the upstream Bitwarden domain');
  });

  it("rejects use outside a Firefox build", () => {
    const configPath = writeIdentity();

    expect(() => load(configPath, "chrome", browserDirectory)).toThrow(
      "can only be used for Firefox builds",
    );
  });

  it("rejects an incomplete identity", () => {
    const configPath = writeIdentity({ author: "" });

    expect(() => load(configPath, "firefox", browserDirectory)).toThrow(
      '"author" must be a non-empty string',
    );

    expect(() =>
      load(writeIdentity({ name: "Northstar\nVault" }), "firefox", browserDirectory),
    ).toThrow('"name" must not contain control characters');
  });

  it("replaces identity in generated HTML titles", () => {
    expect(replaceIdentity("<title>Bitwarden</title>", 'Northstar & <Vault> "Safe"')).toBe(
      "<title>Northstar &amp; &lt;Vault&gt; &quot;Safe&quot;</title>",
    );
  });

  it("rejects unsupported release policy", () => {
    expect(() =>
      load(writeIdentity({ defaultServer: "cloud" as "self-hosted" }), "firefox", browserDirectory),
    ).toThrow('"defaultServer" must be "self-hosted"');
    expect(() =>
      load(writeIdentity({ slug: "Northstar Vault" }), "firefox", browserDirectory),
    ).toThrow('"slug" must contain lowercase letters');
    expect(() =>
      load(writeIdentity({ openWelcomePage: true as false }), "firefox", browserDirectory),
    ).toThrow('"openWelcomePage" must be false');
    expect(() =>
      load(
        writeIdentity({ distributionChannel: "listed" as "unlisted" }),
        "firefox",
        browserDirectory,
      ),
    ).toThrow('"distributionChannel" must remain "unlisted"');
  });

  it.each(["manifest.json", "manifest.v3.json"])(
    "applies identity after the Firefox prefix transform for %s",
    (fileName) => {
      const identity = load(writeIdentity(), "firefox", browserDirectory);
      const source = fs.readFileSync(path.join(browserDirectory, "src", fileName));
      const originalSource = source.toString();

      const built = JSON.parse(transform("firefox", identity)(source)) as BuiltManifest;

      expect(built).toEqual(
        expect.objectContaining({
          short_name: identity.shortName,
          author: identity.author,
          homepage_url: identity.homepageUrl,
          browser_specific_settings: expect.objectContaining({
            gecko: expect.objectContaining({
              id: identity.geckoId,
              strict_min_version: FIREFOX_FORK_MIN_VERSION,
              data_collection_permissions: {
                required: FIREFOX_FORK_DATA_COLLECTION_PERMISSIONS,
              },
            }),
          }),
          sidebar_action: expect.objectContaining({ default_title: identity.name }),
        }),
      );
      expect((built.action ?? built.browser_action)?.default_title).toBe(identity.name);
      expect(JSON.stringify(built)).not.toContain(OFFICIAL_FIREFOX_GECKO_ID);
      expect(source.toString()).toBe(originalSource);
      expect(built.background).toEqual(expect.any(Object));
    },
  );

  it("rejects a source manifest that introduces an update channel", () => {
    const identity = load(writeIdentity(), "firefox", browserDirectory);
    const source = fs.readFileSync(path.join(browserDirectory, "src/manifest.json"));
    const manifest = JSON.parse(source.toString()) as Record<string, unknown>;
    manifest.update_url = "https://updates.example.org/firefox.json";

    expect(() => transform("firefox", identity)(Buffer.from(JSON.stringify(manifest)))).toThrow(
      'must not define "update_url" before a release channel exists',
    );
  });

  it("verifies a packaged build and rejects the upstream identity", () => {
    const identity = load(writeIdentity(), "firefox", browserDirectory);
    const buildDirectory = path.join(temporaryDirectory, "build");
    fs.mkdirSync(path.join(buildDirectory, "_locales/en"), { recursive: true });
    fs.mkdirSync(path.join(buildDirectory, "images"));
    fs.mkdirSync(path.join(buildDirectory, "popup"));

    const manifestSource = fs.readFileSync(path.join(browserDirectory, "src/manifest.json"));
    fs.writeFileSync(
      path.join(buildDirectory, "manifest.json"),
      transform("firefox", identity)(manifestSource),
    );
    fs.writeFileSync(
      path.join(buildDirectory, "_locales/en/messages.json"),
      transformLocale(identity)(
        fs.readFileSync(path.join(browserDirectory, "src/_locales/en/messages.json")),
      ),
    );
    for (const fileName of REQUIRED_ICON_FILES) {
      fs.copyFileSync(
        path.join(identity.iconsDirectory, fileName),
        path.join(buildDirectory, "images", fileName),
      );
    }
    fs.writeFileSync(
      path.join(buildDirectory, "popup/index.html"),
      "<title>Northstar Vault</title>",
    );
    fs.writeFileSync(path.join(buildDirectory, "popup/main.js"), "console.log('fork build');");

    expect(verify(buildDirectory)).toEqual({
      geckoId: identity.geckoId,
      locales: 1,
      manifestVersion: 2,
    });

    const officialIdentityManifest = JSON.parse(
      fs.readFileSync(path.join(buildDirectory, "manifest.json"), "utf8"),
    ) as BuiltManifest;
    officialIdentityManifest.browser_specific_settings.gecko.id = OFFICIAL_FIREFOX_GECKO_ID;
    fs.writeFileSync(
      path.join(buildDirectory, "manifest.json"),
      JSON.stringify(officialIdentityManifest),
    );
    expect(() => verify(buildDirectory)).toThrow("must use a non-official Gecko ID");
  });

  it.each(["en", "fr"])("replaces only identity messages in the %s locale", (locale) => {
    const identity = load(writeIdentity(), "firefox", browserDirectory);
    const source = fs.readFileSync(
      path.join(browserDirectory, "src/_locales", locale, "messages.json"),
    );
    const original = JSON.parse(source.toString()) as LocaleMessages;

    const built = JSON.parse(transformLocale(identity)(source)) as LocaleMessages;

    expect(built.appName.message).toBe(identity.name);
    expect(built.appLogoLabel.message).toBe(identity.logoLabel);
    expect(built.extName.message).toBe(identity.name);
    expect(built.extDesc.message).toBe(identity.description);
    expect(built.addItem).toEqual(original.addItem);
  });
});
