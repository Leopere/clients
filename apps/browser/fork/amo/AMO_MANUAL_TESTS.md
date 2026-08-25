# Manual release tests

Record the Firefox version, operating system, Vaultwarden version, server URL category (local test,
staging, or production), and test date for every release.

## Installation and identity

- Install the Mozilla-signed XPI in Firefox 142 or newer through
  **Add-ons and themes > Install Add-on From File**.
- Confirm Firefox shows **Vaultwarden Companion**, the original vault-door icon, and the declared
  data categories.
- On a fresh profile with no prior server selection, confirm the self-hosted URL dialog opens
  automatically when the server screen appears.
- Confirm installation does not open the upstream Bitwarden welcome page or another unsolicited
  external tab.
- Restart Firefox and confirm that the extension remains installed.
- Confirm the add-on ID is `vaultwarden-companion@extensions.colinknapp.com`.

## Onboarding edge cases

- Cancel the self-hosted dialog and confirm Self-hosted remains selected.
- Before entering a server, confirm requests fail against `self-hosted.invalid` and do not go to a
  Bitwarden service.
- Select a cloud region and confirm it becomes active only after that explicit selection.
- Enter a valid self-hosted URL, then relaunch and confirm no placeholder/empty URL was persisted.
- Change saved server selections among US, EU, Government, and Self-hosted, and confirm each
  setting is preserved after restart.

## Vaultwarden compatibility

- Choose **Self-hosted** and connect to the named Vaultwarden test version.
- Sign in with a test account and complete any configured two-step login.
- Synchronize the vault.
- View a login, secure note, identity, and card test item.
- Create and edit a non-sensitive test item, synchronize, and confirm it from a second client.
- Delete the test item and empty it from trash if the server supports that flow.
- Lock, unlock, log out, and sign in again.

## Autofill and browser behavior

- Save a test login from a test page.
- Fill it from the toolbar, context menu, and inline menu where enabled.
- Confirm a nonmatching site does not receive the saved login.
- Confirm copy actions and clipboard timeout behavior.
- Check popup, sidebar, and toolbar locked and disabled icon states.
- Confirm no unexpected background request appears while the vault is locked and idle.

## Accessibility and recovery

- Navigate the popup with the keyboard and check visible focus.
- Check 200% zoom, light mode, dark mode, and high contrast.
- Deny an optional permission and confirm the related feature fails safely.
- Remove and reinstall the extension using only the signed XPI.

Do not call the release stable until the complete matrix passes against the named Vaultwarden
version.
