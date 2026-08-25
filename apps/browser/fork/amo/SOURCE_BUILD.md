# Build the submitted source

Use macOS or Linux with Node 24.17 or newer, npm 11, `zip`, `unzip`, and `web-ext` 10.6 or newer.
Internet access is required only to install the dependencies locked in `package-lock.json`.

```sh
npm ci
npm --workspace @bitwarden/browser run release:check:fork:firefox
```

The release build reads `apps/browser/fork/firefox-identity.json` and the PNG files under
`apps/browser/fork/icons/`. It writes the expanded extension to
`apps/browser/build-fork-firefox/` and the release bundle to `apps/browser/dist/release/`.
Release verification rejects identity-path overrides and compares every emitted identity field and
icon with these tracked sources.
It also compares the emitted permissions, content scripts, background configuration, CSP, and
web-accessible resources with `apps/browser/fork/firefox-manifest-policy.json`.

The release command runs the focused fork test suite and the legacy cipher regression, then performs
identity validation, production build, lint, and package validation in one sequence. You do not need to
run separate prechecks for those cases when using this command.

Use `release:check:fork:firefox` to build and validate a local package. For an authorized
unlisted signing upload, run
`PUBLISH_AMO=YES npm --workspace @bitwarden/browser run publish:amo:fork:firefox`. The command reads
`WEB_EXT_API_KEY` and `WEB_EXT_API_SECRET` from the process or tmux environment and requires a clean,
matching release bundle. After AMO returns the package, the script requires exactly one signed XPI,
checks its signature and byte-equivalent payload, and then writes the submission receipt.

Set `SOURCE_DATE_EPOCH` to override ZIP timestamps. When it is absent, an original Git checkout uses
the current commit timestamp. The attached source archive uses the commit and timestamp recorded in
its root `SOURCE_REVISION.json`, so the same command also works after extracting it outside Git.

Release preflight records commit metadata and working-tree cleanliness in the release manifest. A
build from the attached source records cleanliness as `null` because it has no Git metadata. AMO
signing is blocked unless the source is the matching clean Git checkout; dirty and extracted-source
preflight runs remain available for local verification.

Provenance checks in this branch now enforce that release inputs and emitted artifacts exclude:

- `bitwarden_license/*` tracked source,
- `@bitwarden/commercial-sdk-internal` dependency declarations and lock entries,
- upstream wordmarks and all unreviewed files under the XPI's `images/` directory,
- the Bitwarden shield glyph and its CSS selectors from the emitted icon fonts,
- user-visible Bitwarden identity in every packaged locale message. The 126 messages that carry
  upstream identity in at least one source locale use reviewed neutral English wording until
  independent fork translations are available,
- upstream contact, product, download, welcome, and official-store links blocked by the policy,

while preserving required attribution paths and notices. The policy pins the exact reviewed fork
icon hashes, shield-free font hashes, neutralized legacy SVG export hashes, GPL SDK version, license,
repository, and WebAssembly hash. `@bitwarden/sdk-internal` and other `@bitwarden/*` modules remain
upstream OSS dependencies in the build.

The source archive intentionally excludes generated output, caches, `node_modules`, coverage data,
and non-browser application source. It also excludes the browser store-material, Safari, and
upstream image trees because the Firefox fork build does not consume them. It includes the remaining
`apps/browser` source, the shared `libs` used by the browser build, root package/configuration files,
root build scripts, and `SOURCE_REVISION.json`. The original archive inputs come from Git's tracked
and non-ignored file list, so ignored local files and secrets cannot enter the upload. A rebuild from
the archive enumerates only those allowlisted paths.
