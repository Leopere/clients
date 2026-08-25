# Vaultwarden Companion changelog

## 2026.8.0

- Added an independent Firefox name, extension ID, icon set, manifest identity, and all-locale name
  overlay.
- Added explicit Firefox data-collection declarations and a Firefox 142 minimum version.
- Added deterministic Manifest V2 packaging and fail-closed identity validation.
- Added Vaultwarden compatibility normalization for legacy non-string cipher `Data` responses.
- Added an unlisted Mozilla signing workflow with a reproducible source archive and non-secret
  submission receipt.
- Clarified fork identity defaults (including `defaultServer`, `slug`, and `distributionChannel`),
  release-check test coverage, and fail-closed Self-hosted first-run behavior.
- Suppressed the upstream Bitwarden welcome page for fork installs.
- Clarified independent publisher, non-affiliation, and upstream code attribution in About.
- Documented AMO clean-tree signing policy in release and manual QA guidance.
