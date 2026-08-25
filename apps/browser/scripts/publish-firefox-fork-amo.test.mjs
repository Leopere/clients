import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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

test("readCredentials prefers macOS Keychain over stale tmux values", () => {
  const spawn = (command, args) => {
    if (command === "tmux") {
      assert.fail("a complete Keychain pair must be used before tmux");
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
});

test("readCredentials uses a complete tmux pair when Keychain is unavailable", () => {
  const spawn = (command, args) => {
    if (command === "/usr/bin/security") {
      return commandResult(1);
    }
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

test("readCredentials uses the fixed macOS Keychain service and accounts", () => {
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

test("amo-auth uses secure Keychain prompts with a fixed contract", async () => {
  const script = await readFile(new URL("./amo-auth.zsh", import.meta.url), "utf8");
  const addCommand = script.match(/\/usr\/bin\/security add-generic-password[\s\S]*?\n\s+-w\n/);

  assert.match(script, /keychain_service="us\.nixc\.amo-publisher"/);
  assert.match(script, /store_credential "WEB_EXT_API_KEY"/);
  assert.match(script, /store_credential "WEB_EXT_API_SECRET"/);
  assert.ok(addCommand, "the Keychain add command must end with a prompted -w option");
  assert.doesNotMatch(addCommand[0], /(^|\s)-A(\s|$)/);
  assert.match(addCommand[0], /\n\s+-w\n$/);
});
