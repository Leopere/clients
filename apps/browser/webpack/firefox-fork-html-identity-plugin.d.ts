export class FirefoxForkHtmlIdentityPlugin {
  constructor(name: string);
  apply(compiler: unknown): void;
}

export function escapeHtmlText(value: string): string;
export function replaceIdentity(html: string, name: string): string;
