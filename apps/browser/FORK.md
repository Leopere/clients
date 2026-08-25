# Firefox fork guide for this repository

This fork is for the Bitwarden Firefox extension only.

## Fork baseline

- Treat `origin` as `Leopere/clients`.
- Treat `upstream` as `bitwarden/clients`.
- Keep changes scoped to `apps/browser` and any shared build assets needed for Firefox.
- Do not change web vault, desktop app, CLI, or other non-browser products.

## Identity and publishing defaults

- The signed fork uses the independent name **Vaultwarden Companion**, publisher
  **ColinKnapp.com**, original vault-door artwork, and the permanent Gecko ID
  `vaultwarden-companion@extensions.colinknapp.com`.
- It is an unofficial client and is not affiliated with Vaultwarden, Bitwarden, Inc., or 8bit
  Solutions LLC.
- Fresh installs use **Self-hosted** as the default. When no server was previously selected, the
  self-hosted URL dialog opens automatically and no blank or placeholder URL is saved.
- Until the user saves a server, the runtime fails closed against the reserved
  `self-hosted.invalid` domain. Canceling setup keeps Self-hosted selected. A Bitwarden cloud region
  becomes active only when the user selects it.
- Required fork identity defaults include `defaultServer`, `openWelcomePage`, `slug`, and
  `distributionChannel`.
- The fork suppresses the upstream Bitwarden welcome tab. Keep `openWelcomePage` false until a
  reviewed fork-owned destination is available.
- Keep `update_url` absent until a controlled signed-update host is authorized and operational.

## Firefox identity fork lane

- The reviewed identity is in `fork/firefox-identity.json`. Use
  `fork/firefox-identity.example.json` only when creating a separate identity.
- Required fields in that file:
  - `name`
  - `shortName`
  - `description`
  - `author`
  - `homepageUrl` (must use `https://`)
  - `geckoId` (must be a fork-specific permanent ID and must **not** use `{446900e4-71c2-419f-a6a7-df9c091e268b}`)
  - `defaultServer`
  - `openWelcomePage`
  - `slug`
  - `distributionChannel`
  - `logoLabel`
  - `iconsDirectory` (relative to `fork/firefox-identity.json`)
- Required icon files under the `iconsDirectory` path:
  `icon16.png`, `icon19.png`, `icon19_gray.png`, `icon19_locked.png`, `icon32.png`, `icon38.png`, `icon38_gray.png`, `icon38_locked.png`, `icon48.png`, `icon96.png`, `icon128.png`, `berry19.png`, `berry38.png`
- Use these build commands for the identity lane:
  - `npm --workspace @bitwarden/browser run build:fork:firefox`
  - `npm --workspace @bitwarden/browser run dist:fork:firefox`
  - `npm --workspace @bitwarden/browser run dist:fork:firefox:mv3` (evaluation only)
  - `npm --workspace @bitwarden/browser run release:check:fork:firefox`
  - `PUBLISH_AMO=YES npm --workspace @bitwarden/browser run publish:amo:fork:firefox`
- `dist:firefox` remains the upstream-equivalent path. It ignores fork identity environment variables.
- Fork builds use the dedicated `build-fork-firefox` output directory. The MV2 and MV3 commands set their manifest versions explicitly.
- Fork build and package steps fail closed when identity configuration, icon assets, or emitted identity are invalid.
- Release verification always uses the tracked `fork/firefox-identity.json`; it rejects
  `FIREFOX_FORK_IDENTITY` overrides and byte-checks every emitted icon against the reviewed assets.
- `fork/firefox-manifest-policy.json` is the fail-closed security contract for permissions, host
  access, content scripts, background execution, CSP, and web-accessible resources. Review and
  update it explicitly when an upstream merge intentionally changes that surface.
- The identity transform updates:
  - manifest identity fields,
  - four identity locale keys across all locales,
  - generated HTML titles,
  - context-menu and Firefox sidebar titles,
  - and visible Firefox icons.
- Fork builds show the configured product name as text where the upstream build uses the Bitwarden wordmark. Add an approved fork wordmark separately after its asset is provided.
- Keep all other Bitwarden service and feature copy unchanged until separately approved.
- Self-hosted, US, EU, Government, and previously saved self-hosted URLs are preserved as saved choices and are not overwritten by defaults.
- Browser-managed environments take precedence over fork onboarding.
- Do not add `update_url`.
- The AMO publisher uses Mozilla's unlisted self-distribution channel. It runs the full release gate,
  loads guarded AMO credentials from the environment or tmux server memory, uploads the matching
  human-readable source archive, and stores the signed XPI and non-secret receipt in `dist/signed/`.
- For deterministic package output:
  - use `SOURCE_DATE_EPOCH` when present,
  - otherwise fall back to the current Git commit timestamp,
  - and always print the package SHA-256.
- Build source archives only from Git-tracked or non-ignored files in the documented source paths.
  Never scan ignored working-tree files into an AMO upload.

## Upstream compatibility assessment

- Run:
  - `npm --workspace @bitwarden/browser run assess:upstream -- <base> <candidate>`
- Use the last assessed upstream tag or commit as `<base>`, and the proposed upstream tag or commit as `<candidate>`.
- Omit both references to compare the common base of `HEAD` and `upstream/main` with the current `upstream/main`.
- The command compares Firefox, shared-library, and required build changes. It rejects unrelated histories and unexpected `upstream` remotes.
- Record comparison results with commit/branch references for audit.

## Browser build and manifest lane

- `npm run dist:firefox` is the production Firefox build path for the Manifest V2 package.
- Manifest V3 packaging exists for Firefox compatibility exploration only and is **not** production at this point.

## Fork automation

- The local `release:check:fork:firefox` command is the release authority for this fork.
- This repository has no active GitHub Actions workflow. The trusted runner inventory intentionally
  targets source repositories and excludes GitHub forks, including `Leopere/clients`.
- `.github/disabled-workflows/firefox-fork.yml` is a reviewed self-hosted workflow template. Do not
  move it into `.github/workflows` until the runner inventory supports this repository and a test
  run proves that jobs receive the public-safe runner.
- The template runs only after a push to `main` or a manual dispatch; it does not run pull-request
  code. A successful run would upload the verified unsigned release bundle for 14 days.
- The inherited Bitwarden organization, product, publishing, translation, and repository-management
  workflows are intentionally absent from this browser-only fork. Refer to the `upstream` remote or
  Git history when assessing future upstream workflow changes.

## Stability gate for release decision

Only declare “stable” after completing all of these:

1. Targeted compatibility tests for the specific upstream changes, plus focused fork browser
   compatibility checks and the common legacy `cipher.response.spec.ts` regression.
2. Firefox package build from current source.
3. Generated manifest review (name, permissions, content scripts, host matches, background script type, and update URL policy).
4. Live functional checks against a named Vaultwarden version:
   - login
   - sync
   - view
   - edit
   - autofill

## Vaultwarden version baseline

- For the legacy cipher `Data` regression, the 2026.7+ extension clients require Vaultwarden **1.37.0** unless fork compatibility normalization is present.
- Track upstream breakage work through Vaultwarden references, especially:
  - PR: <https://github.com/dani-garcia/vaultwarden/pull/7434>
  - Release: <https://github.com/dani-garcia/vaultwarden/releases/tag/1.37.0>

## Licensing

- Keep `LICENSE.txt`, `LICENSE_GPL.txt`, `LICENSE_BITWARDEN.txt`, and all third-party notices intact.
- The OSS Firefox fork uses the repository's default GPL-3.0 code and must not include modules under `bitwarden_license`, which use the Bitwarden License.
- Preserve upstream and third-party license coverage as-is. ColinKnapp proprietary copyright applies only to the Vaultwarden Companion name and original fork artwork.
