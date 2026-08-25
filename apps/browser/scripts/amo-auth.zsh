#!/bin/zsh

set -eu

keychain_service="us.nixc.amo-publisher"
replace_credentials=0

if [[ ${1:-} == "--replace" && $# -eq 1 ]]; then
  replace_credentials=1
elif [[ $# -ne 0 ]]; then
  print -u2 "Usage: $0 [--replace]"
  exit 2
fi

if [[ $OSTYPE != darwin* || ! -x /usr/bin/security ]]; then
  print -u2 "This helper requires macOS Keychain."
  exit 1
fi

if [[ ! -t 0 ]]; then
  print -u2 "Run this helper in an interactive terminal so Keychain can prompt securely."
  exit 1
fi

print "Create or retrieve AMO API credentials at:"
print "https://addons.mozilla.org/developers/addon/api/key/"
print

store_credential() {
  local account="$1"
  local label="$2"

  if (( ! replace_credentials )) &&
    /usr/bin/security find-generic-password \
      -s "$keychain_service" \
      -a "$account" >/dev/null 2>&1; then
    print "$label is already stored."
    return
  fi

  print "$label"
  /usr/bin/security add-generic-password \
    -U \
    -a "$account" \
    -s "$keychain_service" \
    -l "AMO publisher: $label" \
    -j "Used by local AMO publishing commands; never committed to Git." \
    -w
}

store_credential "WEB_EXT_API_KEY" "AMO JWT issuer"
store_credential "WEB_EXT_API_SECRET" "AMO JWT secret"

print
print "AMO credentials are stored in macOS Keychain."
print "The publisher can retrieve them after terminal, tmux, or computer restarts."
print "They were not written to this repository, shell history, logs, or Git."
