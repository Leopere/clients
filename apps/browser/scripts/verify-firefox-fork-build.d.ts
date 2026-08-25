export type VerifiedFirefoxForkBuild = {
  geckoId: string;
  locales: number;
  manifestVersion: number;
};

export function verify(
  buildDirectory: string,
  expectedManifestVersion?: number,
): VerifiedFirefoxForkBuild;
