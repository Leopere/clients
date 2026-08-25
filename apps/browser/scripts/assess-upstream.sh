#!/usr/bin/env bash

set -euo pipefail

CANDIDATE_REF="${2:-upstream/main}"
BASE_REF="${1:-}"
REPOSITORY_ROOT="$(git rev-parse --show-toplevel)"

cd "$REPOSITORY_ROOT"

if ! git rev-parse --verify --quiet "${CANDIDATE_REF}^{commit}" >/dev/null; then
  echo "Unknown candidate ref: $CANDIDATE_REF" >&2
  exit 1
fi

if [ -z "$BASE_REF" ]; then
  if ! BASE_REF="$(git merge-base HEAD "$CANDIDATE_REF")"; then
    echo "HEAD and candidate ref do not share history." >&2
    exit 1
  fi
fi

if ! git rev-parse --verify --quiet "${BASE_REF}^{commit}" >/dev/null; then
  echo "Unknown base ref: $BASE_REF" >&2
  exit 1
fi

if ! UPSTREAM_URL="$(git remote get-url upstream 2>/dev/null)"; then
  echo "Missing upstream remote. Add https://github.com/bitwarden/clients.git as upstream." >&2
  exit 1
fi

case "$UPSTREAM_URL" in
  https://github.com/bitwarden/clients.git | git@github.com:bitwarden/clients.git | ssh://git@github.com/bitwarden/clients.git) ;;
  *)
    echo "Unexpected upstream remote: $UPSTREAM_URL" >&2
    exit 1
    ;;
esac

BASE_COMMIT="$(git rev-parse "${BASE_REF}^{commit}")"
CANDIDATE_COMMIT="$(git rev-parse "${CANDIDATE_REF}^{commit}")"

if ! git merge-base --is-ancestor "$BASE_COMMIT" "$CANDIDATE_COMMIT"; then
  echo "Base ref must be an ancestor of candidate ref." >&2
  echo "Use the last assessed upstream tag or commit as the base." >&2
  exit 1
fi

echo "Firefox upstream assessment"
echo "Base:      $BASE_REF ($BASE_COMMIT)"
echo "Candidate: $CANDIDATE_REF ($CANDIDATE_COMMIT)"
echo "Upstream:  $UPSTREAM_URL"

echo
echo "Commits affecting the Firefox app or shared code"
if [ "$BASE_COMMIT" = "$CANDIDATE_COMMIT" ]; then
  echo "(none)"
else
  git log --no-merges --format='%h %s' "${BASE_COMMIT}..${CANDIDATE_COMMIT}" -- \
    apps/browser \
    libs \
    .browserslistrc \
    babel.config.json \
    package.json \
    package-lock.json \
    nx.json \
    tsconfig.base.json \
    webpack.config.js
fi

echo
echo "Firefox app changes"
if git diff --quiet "$BASE_COMMIT" "$CANDIDATE_COMMIT" -- apps/browser; then
  echo "(none)"
else
  git diff --stat "$BASE_COMMIT" "$CANDIDATE_COMMIT" -- apps/browser
fi

echo
echo "Shared library and build changes requiring dependency review"
if git diff --quiet "$BASE_COMMIT" "$CANDIDATE_COMMIT" -- \
  libs .browserslistrc babel.config.json package.json package-lock.json nx.json tsconfig.base.json webpack.config.js; then
  echo "(none)"
else
  git diff --stat "$BASE_COMMIT" "$CANDIDATE_COMMIT" -- \
    libs .browserslistrc babel.config.json package.json package-lock.json nx.json tsconfig.base.json webpack.config.js
fi

echo
echo "Assessment is read-only. Fetch upstream separately before relying on upstream/main."
