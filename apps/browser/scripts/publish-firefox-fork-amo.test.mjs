import assert from "node:assert/strict";
import test from "node:test";

import { readCredentials } from "./publish-firefox-fork-amo.mjs";

function commandResult(status, stdout = "") {
  return { status, stdout };
}

test("readCredentials prefers a complete process environment pair", () => {
  const credentials = readCredentials({
    env: {
      WEB_EXT_API_KEY: "environment-key",
      WEB_EXT_API_SECRET: "environment-secret",
    },
    spawn() {
      assert.fail("a complete process environment pair must not call a credential helper");
    },
  });

  assert.deepEqual(credentials, {
    apiKey: "environment-key",
    apiSecret: "environment-secret",
    source: "process environment",
  });
});

test("readCredentials uses a complete tmux pair before Keychain", () => {
  const spawn = (command, args) => {
    assert.equal(command, "tmux");
    const name = args.at(-1);
    return commandResult(0, `${name}=tmux-${name}\n`);
  };

  const credentials = readCredentials({ env: {}, platform: "darwin", spawn });

  assert.deepEqual(credentials, {
    apiKey: "tmux-WEB_EXT_API_KEY",
    apiSecret: "tmux-WEB_EXT_API_SECRET",
    source: "tmux environment",
  });
});

test("readCredentials retrieves both values from macOS Keychain", () => {
  const calls = [];
  const spawn = (command, args) => {
    calls.push([command, args]);
    if (command === "tmux") {
      return commandResult(1);
    }
    assert.equal(command, "/usr/bin/security");
    const account = args[args.indexOf("-a") + 1];
    return commandResult(0, `keychain-${account}\n`);
  };

  const credentials = readCredentials({ env: {}, platform: "darwin", spawn });

  assert.deepEqual(credentials, {
    apiKey: "keychain-WEB_EXT_API_KEY",
    apiSecret: "keychain-WEB_EXT_API_SECRET",
    source: "macOS Keychain",
  });
  assert.deepEqual(
    calls.filter(([command]) => command === "/usr/bin/security").map(([, args]) => args),
    [
      ["find-generic-password", "-s", "us.nixc.amo-publisher", "-a", "WEB_EXT_API_KEY", "-w"],
      ["find-generic-password", "-s", "us.nixc.amo-publisher", "-a", "WEB_EXT_API_SECRET", "-w"],
    ],
  );
});

test("readCredentials does not use Keychain outside macOS", () => {
  const commands = [];
  const credentials = readCredentials({
    env: { WEB_EXT_API_KEY: "incomplete" },
    platform: "linux",
    spawn(command) {
      commands.push(command);
      return commandResult(1);
    },
  });

  assert.deepEqual(credentials, {});
  assert.deepEqual(commands, ["tmux", "tmux"]);
});
