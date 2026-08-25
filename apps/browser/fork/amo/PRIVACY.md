# Vaultwarden Companion privacy notice

Vaultwarden Companion is an unofficial Firefox password manager client. It is derived from the
Bitwarden browser client and is intended for people who choose a self-hosted Vaultwarden server.

## Data the extension handles

The extension handles sensitive information needed for password management and autofill. This can
include account credentials, identity details, payment-card details, secure notes, website URLs,
form fields, and your interactions with autofill controls. Firefox displays these categories during
installation through its built-in data-consent prompt.

Vault items are encrypted on your device before they are synchronized. The extension stores an
encrypted local vault and settings in Firefox storage. It decrypts data in memory when you unlock
the vault and use an item.

## Network destinations

The extension connects to the account server you select. Choose **Self-hosted** and enter your
Vaultwarden URL to use Vaultwarden. If you select one of the built-in cloud regions instead, the
extension connects to that region's Bitwarden services.

Self-hosted is the default on a fresh install. Before you save a server, service requests use the
reserved `self-hosted.invalid` domain and fail instead of falling back to Bitwarden cloud services.
A built-in cloud region becomes active only after you select it.

Some features make additional requests only when needed:

- website icons can come from the icon service configured for your selected server;
- phishing protection downloads public blocklist and checksum files from Bitwarden's asset host and
  the Phishing Database project on GitHub; these requests do not include vault contents or visited
  page URLs;
- Fill Assist targeting rules can download manifest and forms-map files when
  **FillAssistTargetingRules** is enabled. These requests go to the resource URL advertised by the
  selected account server, or to a Bitwarden GitHub release as a fallback. They carry only ordinary
  HTTP metadata and do not contain vault contents or visited page URLs.
- exposed-password checks send a password-hash prefix to the Pwned Passwords service, not the
  password itself;
- passkey checks can request a relying party's standard `/.well-known/webauthn` document;
- alias-generation tools contact a provider only after you configure and use that provider;
- organization event records can be sent to your selected account server;
- help, support, and product links open only after you choose them.

The fork does not add advertising, analytics, or a separate telemetry service. It does not sell
personal data.

## Permissions

The extension needs broad page access to detect login fields, offer saved logins, save new logins,
and fill credentials. Clipboard access supports explicit copy and paste actions. Storage retains the
encrypted local vault and settings. Tabs, navigation, web-request, menu, alarm, idle, notification,
and optional native-messaging or privacy permissions support the corresponding password-manager
features.

## Control and deletion

You choose the server and accounts you use. You can lock or log out of an account, clear extension
data, or remove the extension in Firefox. Server-side deletion is controlled by the account server
you selected.

Vaultwarden Companion is not affiliated with the Vaultwarden project, Bitwarden, Inc., or 8bit
Solutions LLC.

Copyright © 2026 ColinKnapp.com. All rights reserved. This copyright notice covers the fork name,
the original companion artwork, and companion identity assets. The source code and third-party
components remain governed by the existing repository and third-party license and attribution terms.
