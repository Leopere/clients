# Vaultwarden Companion changelog

## Unreleased

- Removed commercial code inputs from the fork (`bitwarden_license` modules and
  `@bitwarden/commercial-sdk-internal`) and documented the remaining `@bitwarden/*` namespace as
  upstream OSS build inputs.
- Excluded upstream wordmark PNGs (`logo-dark@2x.png`, `logo-white@2x.png`) from fork XPI output.
- Removed source maps from the runnable XPI; human-readable source remains in the separate source
  archive.
- Disabled the upstream targeting-rules fallback for fork builds. A selected server must advertise
  its own resource URL.
- Kept an explicitly stored but blank Self-hosted environment fail-closed instead of normalizing it
  to a cloud region.
- Added automated provenance checks for commercial source and package exclusion from release inputs
  and output.
- Removed upstream product-promotion, app-download, support, and official-store links from fork
  settings.

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
