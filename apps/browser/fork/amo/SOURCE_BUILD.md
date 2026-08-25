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

Set `SOURCE_DATE_EPOCH` to reproduce ZIP timestamps exactly. When it is absent, the scripts use the
timestamp of the current Git commit.

Release preflight records commit metadata and working-tree cleanliness in the release manifest.
AMO signing is blocked when the source tree is dirty or has untracked changes, though dirty preflight
runs are allowed locally for testing.

The source archive intentionally excludes generated output, caches, `node_modules`, coverage data,
and non-browser application source. It includes `apps/browser`, the shared `libs` used by the
browser build, root package/configuration files, and root build scripts. Archive inputs come from
Git's tracked and non-ignored file list, so ignored local files and secrets cannot enter the upload.
