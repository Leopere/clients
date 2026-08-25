#!/usr/bin/env bash

set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "Usage: $0 <archive-name.zip> <manifest-version>" >&2
  exit 2
fi

archive_name="$1"
manifest_version="$2"
case "$manifest_version" in
  2 | 3) ;;
  *)
    echo "Manifest version must be 2 or 3." >&2
    exit 2
    ;;
esac
case "$archive_name" in
  *.zip) ;;
  *)
    echo "Archive name must end in .zip." >&2
    exit 2
    ;;
esac
case "$archive_name" in
  */* | *..*)
    echo "Archive name must be a plain file name." >&2
    exit 2
    ;;
esac

script_directory="$(cd "$(dirname "$0")" && pwd)"
browser_directory="$(cd "$script_directory/.." && pwd)"
build_directory="$browser_directory/build-fork-firefox"
dist_directory="$browser_directory/dist"
archive_path="$dist_directory/$archive_name"

if [ ! -d "$build_directory" ]; then
  echo "Firefox build directory does not exist: $build_directory" >&2
  exit 1
fi

node "$script_directory/verify-firefox-fork-build.js" "$build_directory" "$manifest_version"

repository_directory="$(cd "$browser_directory/../.." && pwd)"
if [ -n "${SOURCE_DATE_EPOCH:-}" ]; then
  source_epoch="$SOURCE_DATE_EPOCH"
elif git_root="$(git -C "$repository_directory" rev-parse --show-toplevel 2>/dev/null)" && [ "$git_root" = "$repository_directory" ]; then
  source_epoch="$(git -C "$repository_directory" show -s --format=%ct HEAD)"
elif [ -f "$repository_directory/SOURCE_REVISION.json" ]; then
  source_epoch="$(node -e '
    const revision = require(process.argv[1]);
    process.stdout.write(String(revision.sourceDateEpoch));
  ' "$repository_directory/SOURCE_REVISION.json")"
else
  echo "Set SOURCE_DATE_EPOCH when building outside the original Git checkout." >&2
  exit 1
fi
case "$source_epoch" in
  "" | *[!0-9]*)
    echo "SOURCE_DATE_EPOCH must be a non-negative integer." >&2
    exit 2
    ;;
esac

timestamp="$(node -e '
  const epoch = Number(process.argv[1]);
  const date = new Date(epoch * 1000);
  if (!Number.isSafeInteger(epoch) || date.getUTCFullYear() < 1980) process.exit(1);
  const iso = date.toISOString();
  process.stdout.write(iso.slice(0, 10).replaceAll("-", "") + iso.slice(11, 16).replace(":", "") + "." + iso.slice(17, 19));
' "$source_epoch")" || {
  echo "SOURCE_DATE_EPOCH must be a valid ZIP timestamp from 1980 or later." >&2
  exit 2
}

staging_directory="$(mktemp -d "${TMPDIR:-/tmp}/bitwarden-firefox-fork.XXXXXX")"
trap 'rm -rf "$staging_directory"' EXIT
cp -R "$build_directory/." "$staging_directory"
# Human-readable source ships separately. Keep source maps out of the runnable XPI.
find "$staging_directory" -type f -name '*.map' -delete
TZ=UTC find "$staging_directory" -exec touch -h -t "$timestamp" {} +

mkdir -p "$dist_directory"
rm -f "$archive_path"
(
  cd "$staging_directory"
  LC_ALL=C find . -type f -print | LC_ALL=C sort | TZ=UTC zip -X -q "$archive_path" -@
)

if command -v sha256sum >/dev/null 2>&1; then
  sha256sum "$archive_path"
else
  shasum -a 256 "$archive_path"
fi
