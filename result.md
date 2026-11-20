# Vaultwarden Companion Firefox 2026.11.0 source integration

The source merge starts from fork main `273ac90e36d429d165938c66fc3c58b6977dca68` and incorporates the pinned upstream [browser-v2026.11.0 release](https://github.com/bitwarden/clients/releases/tag/browser-v2026.11.0) at `28b247ac34877882aaef4faea082a9f3bb201114`.

- The source merge `c3c73a3c2161a18b6facba0d612c355d63c297cf` and Firefox follow-up `658f79fcd7b8520249c724476ee94561a62f2e06` were pushed to `main`.
- Version `2026.11.0` uses the reviewed Vaultwarden Companion and ColinKnapp.com identity, its permanent Gecko ID, original fork icons, and Firefox Manifest V2. Unlisted signing, the absent update URL, the self-hosted default, and the reserved fail-closed host remain part of the fork. Saved and browser-managed environments continue to take precedence over first-run defaults.
- The merge carries the upstream OSS browser and shared code, including the shared unlock changes, Fill Assist policy and server URL resolution, and Vault Health. The fork suppresses the upstream welcome page, release-promotion dialog, Health upgrade prompt and unavailable branded onboarding images. The fork excludes commercial source, the commercial SDK, and active GitHub Actions workflows. Required license notices remain in place.
- The merged cipher parser preserves string-valued `Data`, ignores legacy object-valued `Data`, and preserves or JSON-stringifies `PartialData` for the upstream SDK. The regression suite verifies response parsing.
- The build follows the upstream lock’s GPL SDK package, `0.2.0-main.1214`. The release policy pins both the SIMD and MVP WebAssembly files. The icon font retains the upstream non-brand glyphs and their mappings and excludes the upstream shield glyph and its two CSS names. The MV2 manifest matches the existing manifest policy. The fork build substitutes neutral exports for the new upstream wordmark and shield SVG modules.

## Guest checks

- Node `24.17.0` and npm `11.13.0`. Lock regenerated, `npm ci --ignore-scripts --no-audit --no-fund` succeeded, and the browser source archive’s workspace layout also passed a clean dependency install from its manifests. Angular framework packages and the webpack compiler use 21.2.24, matching the new build tooling and retaining the fork’s previous patch coverage. npm emitted transitive ESLint peer and dependency deprecation warnings.
- Firefox fork compatibility tests passed across six suites (74 tests). These cover the identity, onboarding and saved or managed environment behavior, install welcome-page suppression, badge icons, and context-menu behavior.
- Common cipher response and Fill Assist domain-settings tests passed (98 tests). Five browser suites for Fill Assist, Vault Health, and the popup header passed (113 tests). Publisher unit tests passed (7 tests).
- The Angular browser compiler passed with `ngc -p apps/browser/tsconfig.json --noEmit`. Source checks passed for the MV2 manifest, beta-channel isolation, all 64 locale transforms, fork icon and font hashes, required notices, commercial exclusions, and both installed GPL SDK payloads.
- The normal merge hook passed Prettier, ESLint, Rust formatting, Clippy, Cargo manifest sorting, and Cargo dependency checks. Git’s whitespace check passed.

## Primary release handoff

Run Jenkins against this exact report commit on `main` with Node 24.17 or newer and npm 11. Use the tracked fork identity, manifest, and provenance policies under `apps/browser/fork/` and the repository command `npm --workspace @bitwarden/browser run release:check:fork:firefox`. Review the emitted manifest, runtime URL and asset exclusions, and any changes to the fail-closed `web-ext` warning inventory before approval. After the release gate passes, use the approved unlisted-signing path and install the signed XPI through the primary workflow. Validate login, sync, view, edit, and autofill against a named Vaultwarden version before accepting the upgrade. Package validation, signing, publication, installation, and live Vaultwarden compatibility are pending primary work.

pve-coder-vw-firefox-20261120-20261120-1426: DONE 658f79fcd7b8520249c724476ee94561a62f2e06
