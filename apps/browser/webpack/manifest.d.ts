import { FirefoxForkIdentity } from "./firefox-fork-identity";

export function transform(
  browser: string,
  identity?: FirefoxForkIdentity,
): (buffer: Buffer) => string;

export function transformPrefixes(
  manifest: Record<string, unknown>,
  browser: string,
): Record<string, unknown>;
