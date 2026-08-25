import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const browserDirectory = path.resolve(path.dirname(scriptPath), "..");
const repositoryDirectory = path.resolve(browserDirectory, "../..");
const releaseDirectory = path.join(browserDirectory, "dist/release");
const signedDirectory = path.join(browserDirectory, "dist/signed");
const keychainService = "us.nixc.amo-publisher";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? browserDirectory,
    encoding: "utf8",
    env: options.env ?? process.env,
    stdio: options.stdio ?? "inherit",
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} exited with status ${result.status}.`);
  }
  return result.stdout?.trim() ?? "";
}

function readTmuxCredential(name, spawn) {
  const result = spawn("tmux", ["show-environment", "-g", name], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (result.status !== 0) {
    return undefined;
  }
  const prefix = `${name}=`;
  return result.stdout.startsWith(prefix)
    ? result.stdout.slice(prefix.length).trimEnd()
    : undefined;
}

function readKeychainCredential(name, spawn) {
  const result = spawn(
    "/usr/bin/security",
    ["find-generic-password", "-s", keychainService, "-a", name, "-w"],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    },
  );
  return result.status === 0 ? result.stdout?.trimEnd() || undefined : undefined;
}

export function readCredentials({
  env = process.env,
  platform = process.platform,
  spawn = spawnSync,
} = {}) {
  if (env.WEB_EXT_API_KEY && env.WEB_EXT_API_SECRET) {
    return {
      apiKey: env.WEB_EXT_API_KEY,
      apiSecret: env.WEB_EXT_API_SECRET,
      source: "process environment",
    };
  }

  if (platform === "darwin") {
    const keychainApiKey = readKeychainCredential("WEB_EXT_API_KEY", spawn);
    const keychainApiSecret = readKeychainCredential("WEB_EXT_API_SECRET", spawn);
    if (keychainApiKey && keychainApiSecret) {
      return {
        apiKey: keychainApiKey,
        apiSecret: keychainApiSecret,
        source: "macOS Keychain",
      };
    }
  }

  const tmuxApiKey = readTmuxCredential("WEB_EXT_API_KEY", spawn);
  const tmuxApiSecret = readTmuxCredential("WEB_EXT_API_SECRET", spawn);
  if (tmuxApiKey && tmuxApiSecret) {
    return {
      apiKey: tmuxApiKey,
      apiSecret: tmuxApiSecret,
      source: "tmux environment",
    };
  }

  return {};
}

async function sha256(filePath) {
  return createHash("sha256")
    .update(await readFile(filePath))
    .digest("hex");
}

function sha256Buffer(contents) {
  return createHash("sha256").update(contents).digest("hex");
}

function archiveEntries(filePath) {
  return run("unzip", ["-Z1", filePath], { stdio: "pipe" }).split("\n").filter(Boolean);
}

function requireCleanRevision(expectedCommit) {
  const gitStatus = run("git", ["status", "--porcelain=v1", "--untracked-files=all"], {
    cwd: repositoryDirectory,
    stdio: "pipe",
  });
  if (gitStatus.length !== 0) {
    throw new Error("AMO signing requires a clean Git worktree.");
  }

  const commit = run("git", ["rev-parse", "HEAD"], {
    cwd: repositoryDirectory,
    stdio: "pipe",
  });
  if (expectedCommit != null && commit !== expectedCommit) {
    throw new Error("The Git revision changed during AMO release verification.");
  }
  return commit;
}

async function listPayloadFiles(directory, prefix = "") {
  const files = [];
  for (const entry of (await readdir(path.join(directory, prefix), { withFileTypes: true })).sort(
    (left, right) => left.name.localeCompare(right.name),
  )) {
    const relativePath = path.join(prefix, entry.name);
    if (relativePath === "META-INF" || relativePath.startsWith(`META-INF${path.sep}`)) {
      continue;
    }
    if (entry.isDirectory()) {
      files.push(...(await listPayloadFiles(directory, relativePath)));
    } else if (entry.isFile()) {
      files.push(relativePath);
    }
  }
  return files;
}

async function verifySignedPayload(unsignedDirectory, signedDirectory) {
  const unsignedFiles = await listPayloadFiles(unsignedDirectory);
  const signedFiles = await listPayloadFiles(signedDirectory);
  if (JSON.stringify(signedFiles) !== JSON.stringify(unsignedFiles)) {
    throw new Error("The Mozilla-signed XPI payload file list differs from the verified package.");
  }
  for (const relativePath of unsignedFiles) {
    if (
      (await sha256(path.join(unsignedDirectory, relativePath))) !==
      (await sha256(path.join(signedDirectory, relativePath)))
    ) {
      throw new Error(`The Mozilla-signed XPI changed verified payload file: ${relativePath}`);
    }
  }
}

async function main() {
  if (process.env.PUBLISH_AMO !== "YES") {
    throw new Error("Set PUBLISH_AMO=YES for an explicitly authorized AMO signing submission.");
  }
  const initialCommit = requireCleanRevision();
  const { apiKey, apiSecret } = readCredentials();
  if (!apiKey || !apiSecret) {
    const setupHint =
      process.platform === "darwin"
        ? "Run npm --workspace @bitwarden/browser run auth:amo:fork:firefox to store them in macOS Keychain."
        : "Set both WEB_EXT_API_KEY and WEB_EXT_API_SECRET in the process or tmux environment.";
    throw new Error(`AMO credentials are unavailable. ${setupHint}`);
  }

  run("node", ["scripts/release-check-firefox-fork.mjs"]);
  const releaseManifest = JSON.parse(
    await readFile(path.join(releaseDirectory, "RELEASE_MANIFEST.json")),
  );
  if (!releaseManifest.git?.clean || releaseManifest.git.commit !== initialCommit) {
    throw new Error("The verified release bundle must match the current clean Git revision.");
  }
  requireCleanRevision(initialCommit);

  const releasePackagePath = path.join(releaseDirectory, releaseManifest.package.file);
  const releaseSourcePath = path.join(releaseDirectory, releaseManifest.source.file);
  const packageBytes = await readFile(releasePackagePath);
  const sourceBytes = await readFile(releaseSourcePath);
  if (sha256Buffer(packageBytes) !== releaseManifest.package.sha256) {
    throw new Error("The verified unsigned package hash does not match the release manifest.");
  }
  if (sha256Buffer(sourceBytes) !== releaseManifest.source.sha256) {
    throw new Error("The verified source archive hash does not match the release manifest.");
  }

  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "vaultwarden-companion-sign-"));
  const unsignedPackagePath = path.join(temporaryRoot, releaseManifest.package.file);
  const sourceArchivePath = path.join(temporaryRoot, releaseManifest.source.file);
  const unsignedSourceDirectory = path.join(temporaryRoot, "unsigned");
  const signingSourceDirectory = path.join(temporaryRoot, "signing");
  const signedPayloadDirectory = path.join(temporaryRoot, "signed");

  try {
    await writeFile(unsignedPackagePath, packageBytes, { flag: "wx", mode: 0o400 });
    await writeFile(sourceArchivePath, sourceBytes, { flag: "wx", mode: 0o400 });
    if (
      (await sha256(unsignedPackagePath)) !== releaseManifest.package.sha256 ||
      (await sha256(sourceArchivePath)) !== releaseManifest.source.sha256
    ) {
      throw new Error("The private submission snapshots do not match the verified release bundle.");
    }
    await mkdir(unsignedSourceDirectory, { recursive: true });
    run("unzip", ["-q", unsignedPackagePath, "-d", unsignedSourceDirectory], { stdio: "pipe" });
    await mkdir(signingSourceDirectory, { recursive: true });
    run("unzip", ["-q", unsignedPackagePath, "-d", signingSourceDirectory], { stdio: "pipe" });
    requireCleanRevision(initialCommit);

    await rm(signedDirectory, { recursive: true, force: true });
    await mkdir(signedDirectory, { recursive: true });
    const signingEnvironment = {
      ...process.env,
      WEB_EXT_API_KEY: apiKey,
      WEB_EXT_API_SECRET: apiSecret,
    };
    run(
      "web-ext",
      [
        "sign",
        `--channel=${releaseManifest.channel}`,
        "--no-input",
        "--approval-timeout=900000",
        `--source-dir=${signingSourceDirectory}`,
        `--artifacts-dir=${signedDirectory}`,
        `--upload-source-code=${sourceArchivePath}`,
      ],
      { env: signingEnvironment },
    );

    const signedFiles = (await readdir(signedDirectory))
      .filter((fileName) => fileName.endsWith(".xpi"))
      .sort();
    if (signedFiles.length !== 1) {
      throw new Error(`Expected one signed XPI, found ${signedFiles.length}.`);
    }
    const signedPath = path.join(signedDirectory, signedFiles[0]);
    const entries = archiveEntries(signedPath);
    if (!entries.some((entry) => entry.startsWith("META-INF/"))) {
      throw new Error("Mozilla signing completed without META-INF signature records.");
    }
    await mkdir(signedPayloadDirectory, { recursive: true });
    run("unzip", ["-q", signedPath, "-d", signedPayloadDirectory], { stdio: "pipe" });
    await verifySignedPayload(unsignedSourceDirectory, signedPayloadDirectory);

    const receipt = {
      channel: releaseManifest.channel,
      extensionId: releaseManifest.extensionId,
      git: releaseManifest.git,
      package: releaseManifest.package,
      signedArtifact: {
        file: signedFiles[0],
        sha256: await sha256(signedPath),
      },
      signedAt: new Date().toISOString(),
      source: releaseManifest.source,
      version: releaseManifest.version,
    };
    await writeFile(
      path.join(signedDirectory, "SUBMISSION_RECEIPT.json"),
      `${JSON.stringify(receipt, null, 2)}\n`,
    );
    console.log(`Mozilla-signed XPI: ${signedPath}`);
    console.log(`Signed SHA-256 ${receipt.signedArtifact.sha256}`);
    console.log(`Receipt: ${path.join(signedDirectory, "SUBMISSION_RECEIPT.json")}`);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  await main();
}
