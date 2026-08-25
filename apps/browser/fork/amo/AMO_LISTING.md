# Vaultwarden Companion

## Summary

Use an unofficial Firefox password manager client with your self-hosted Vaultwarden server.

## Description

Vaultwarden Companion packages the Firefox browser client as an independently signed,
self-distributed extension for people who rely on Vaultwarden. Self-hosted onboarding is the
default on fresh installs. Until you save a server, network requests fail closed against a reserved
non-routable domain instead of falling back to a Bitwarden cloud service.

Choose **Self-hosted** on the account server screen and enter your Vaultwarden URL. You can then
sign in, synchronize your encrypted vault, view and edit items, copy credentials, generate
passwords, and use autofill and passkeys where supported by your server.

This release keeps the familiar client behavior while isolating its Firefox identity and adding a
compatibility guard for legacy Vaultwarden cipher responses. It uses an original icon, a permanent
extension ID, and an explicit privacy declaration.

This is an unofficial community build. It is not affiliated with or endorsed by the Vaultwarden
project, Bitwarden, Inc., or 8bit Solutions LLC. Vaultwarden and Bitwarden are names of their
respective projects and owners.

Distribution channel: Mozilla-signed, unlisted self-distribution. The extension is not offered as a
public AMO listing by this release workflow.
