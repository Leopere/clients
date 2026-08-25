export interface FirefoxForkIdentity {
  readonly name: string;
  readonly shortName: string;
  readonly description: string;
  readonly author: string;
  readonly homepageUrl: string;
  readonly geckoId: string;
  readonly logoLabel: string;
  readonly defaultServer: "self-hosted";
  readonly openWelcomePage: false;
  readonly slug: string;
  readonly distributionChannel: "unlisted";
  readonly iconsDirectory: string;
  readonly configPath: string;
}

export const FIREFOX_FORK_DATA_COLLECTION_PERMISSIONS: readonly string[];
export const FIREFOX_FORK_MIN_VERSION: string;
export const OFFICIAL_FIREFOX_GECKO_ID: string;
export const REQUIRED_ICON_FILES: readonly string[];

export function load(
  configPath: string,
  browser: string,
  browserDirectory?: string,
): FirefoxForkIdentity;

export function applyToManifest(
  manifest: Record<string, unknown>,
  identity: FirefoxForkIdentity,
): Record<string, unknown>;

export function transformLocale(identity: FirefoxForkIdentity): (buffer: Buffer) => string;
