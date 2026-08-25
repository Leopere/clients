import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

const browserDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryDirectory = path.resolve(browserDirectory, "../..");
const forkDirectory = path.join(browserDirectory, "fork");
const manifestPolicyPath = path.join(forkDirectory, "firefox-manifest-policy.json");
const buildDirectory = path.join(browserDirectory, "build-fork-firefox");
const releaseDirectory = path.join(browserDirectory, "dist/release");
const amoDirectory = path.join(forkDirectory, "amo");
const require = createRequire(import.meta.url);
const firefoxForkIdentity = require("../webpack/firefox-fork-identity");

const requiredDocuments = [
  "AMO_LISTING.md",
  "AMO_MANUAL_TESTS.md",
  "AMO_REVIEWER_NOTES.md",
  "AMO_SCREENSHOTS.md",
  "CHANGELOG.md",
  "PRIVACY.md",
  "SOURCE_BUILD.md",
  "amo-metadata.json",
];

const sourceRootFiles = [
  ".browserslistrc",
  ".editorconfig",
  ".npmrc",
  ".nvmrc",
  "CONTRIBUTING.md",
  "LICENSE.txt",
  "LICENSE_BITWARDEN.txt",
  "LICENSE_GPL.txt",
  "README.md",
  "angular.json",
  "babel.config.json",
  "eslint.config.mjs",
  "jest.config.js",
  "jest.preset.js",
  "nx.json",
  "package-lock.json",
  "package.json",
  "tailwind.config.js",
  "tsconfig.base.json",
  "tsconfig.eslint.json",
  "tsconfig.json",
];

const excludedDirectoryNames = new Set([
  ".angular",
  ".git",
  ".nx",
  "build",
  "build-fork-firefox",
  "coverage",
  "dist",
  "node_modules",
  "web-ext-artifacts",
]);

const reviewedLintWarnings = Object.freeze({
  DANGEROUS_EVAL: 27,
  UNSAFE_VAR_ASSIGNMENT: 10,
  UNSUPPORTED_API: 38,
});

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repositoryDirectory,
    encoding: "utf8",
    env: options.env ?? process.env,
    input: options.input,
    stdio: options.stdio ?? "inherit",
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(
      `${command} exited with status ${result.status}${detail ? `:\n${detail}` : ""}`,
    );
  }
  return result.stdout?.trim() ?? "";
}

async function sha256(filePath) {
  return createHash("sha256")
    .update(await readFile(filePath))
    .digest("hex");
}

async function listFiles(directory, prefix = "") {
  const files = [];
  const entries = await readdir(path.join(directory, prefix), { withFileTypes: true });
  for (const entry of entries.sort((left, right) =>
    left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
  )) {
    if (entry.name === ".DS_Store") {
      continue;
    }
    const relativePath = path.join(prefix, entry.name);
    if (entry.isDirectory()) {
      if (!excludedDirectoryNames.has(entry.name)) {
        files.push(...(await listFiles(directory, relativePath)));
      }
    } else if (entry.isFile()) {
      files.push(relativePath);
    }
  }
  return files;
}

async function copySourceFile(stagingDirectory, relativePath) {
  const source = path.join(repositoryDirectory, relativePath);
  const destination = path.join(stagingDirectory, relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(source, destination);
}

function sourceArchiveFiles() {
  const output = run(
    "git",
    [
      "ls-files",
      "-z",
      "--cached",
      "--others",
      "--exclude-standard",
      "--deduplicate",
      "--",
      ...sourceRootFiles,
      "apps/browser",
      "libs",
      "scripts",
    ],
    { stdio: "pipe" },
  );

  return output
    .split("\0")
    .filter(Boolean)
    .filter((relativePath) => {
      const parts = relativePath.split(path.sep);
      return (
        !parts.includes(".DS_Store") && !parts.some((part) => excludedDirectoryNames.has(part))
      );
    })
    .sort();
}

function zipTimestamp(epoch) {
  const date = new Date(epoch * 1000);
  if (!Number.isSafeInteger(epoch) || date.getUTCFullYear() < 1980) {
    throw new Error("SOURCE_DATE_EPOCH must be a valid ZIP timestamp from 1980 or later.");
  }
  return (
    date.toISOString().slice(0, 10).replaceAll("-", "") +
    date.toISOString().slice(11, 16).replace(":", "") +
    `.${date.toISOString().slice(17, 19)}`
  );
}

async function createSourceArchive(archivePath, epoch) {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "vaultwarden-companion-source-"));
  const stagingDirectory = path.join(temporaryRoot, "vaultwarden-companion-source");
  await mkdir(stagingDirectory, { recursive: true });
  try {
    for (const relativePath of sourceArchiveFiles()) {
      await copySourceFile(stagingDirectory, relativePath);
    }

    const timestamp = zipTimestamp(epoch);
    run("find", [".", "-exec", "touch", "-h", "-t", timestamp, "{}", "+"], {
      cwd: stagingDirectory,
      env: { ...process.env, TZ: "UTC" },
      stdio: "pipe",
    });
    const files = await listFiles(stagingDirectory);
    run("zip", ["-X", "-q", archivePath, "-@"], {
      cwd: stagingDirectory,
      env: { ...process.env, LC_ALL: "C", TZ: "UTC" },
      input: `${files.join("\n")}\n`,
      stdio: "pipe",
    });
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

async function main() {
  if (process.env.FIREFOX_FORK_IDENTITY != null) {
    throw new Error(
      "Release verification uses the tracked fork/firefox-identity.json and forbids FIREFOX_FORK_IDENTITY overrides.",
    );
  }
  run("web-ext", ["--version"], { stdio: "pipe" });
  const identity = firefoxForkIdentity.load(
    "fork/firefox-identity.json",
    "firefox",
    browserDirectory,
  );
  const packageJson = JSON.parse(await readFile(path.join(browserDirectory, "package.json")));
  const manifestPolicy = JSON.parse(await readFile(manifestPolicyPath));
  const metadata = JSON.parse(await readFile(path.join(amoDirectory, "amo-metadata.json")));
  for (const document of requiredDocuments) {
    const documentPath = path.join(amoDirectory, document);
    if (!(await stat(documentPath)).isFile()) {
      throw new Error(`Missing AMO release document: ${documentPath}`);
    }
  }
  if (!metadata.summary?.["en-US"] || !metadata.description?.["en-US"]) {
    throw new Error("amo-metadata.json must define en-US summary and description fields.");
  }

  run("npm", ["run", "test:fork"], { cwd: browserDirectory });
  run(
    "npm",
    [
      "--workspace",
      "@bitwarden/common",
      "test",
      "--",
      "--runInBand",
      "src/vault/models/response/cipher.response.spec.ts",
    ],
    { cwd: repositoryDirectory },
  );
  run("npm", ["run", "dist:fork:firefox"], { cwd: browserDirectory });
  const lintResult = JSON.parse(
    run(
      "web-ext",
      [
        "lint",
        "--output=json",
        "--self-hosted",
        "--no-input",
        "--source-dir",
        buildDirectory,
        "--artifacts-dir",
        path.join(browserDirectory, "dist/web-ext-lint"),
      ],
      { cwd: browserDirectory, stdio: "pipe" },
    ),
  );
  if (lintResult.summary?.errors !== 0) {
    throw new Error(`web-ext lint reported ${lintResult.summary?.errors ?? "unknown"} errors.`);
  }
  const lintWarningCounts = Object.fromEntries(
    Object.entries(
      (lintResult.warnings ?? []).reduce((counts, warning) => {
        counts[warning.code] = (counts[warning.code] ?? 0) + 1;
        return counts;
      }, {}),
    ).sort(([left], [right]) => left.localeCompare(right)),
  );
  if (JSON.stringify(lintWarningCounts) !== JSON.stringify(reviewedLintWarnings)) {
    throw new Error(
      `web-ext lint warning inventory changed and requires review: ${JSON.stringify(lintWarningCounts)}`,
    );
  }

  const manifest = JSON.parse(await readFile(path.join(buildDirectory, "manifest.json")));
  const englishMessages = JSON.parse(
    await readFile(path.join(buildDirectory, "_locales/en/messages.json")),
  );
  const action = manifest.manifest_version === 3 ? manifest.action : manifest.browser_action;
  if (
    manifest.manifest_version !== 2 ||
    manifest.browser_specific_settings?.gecko?.id !== identity.geckoId ||
    manifest.short_name !== identity.shortName ||
    manifest.author !== identity.author ||
    manifest.homepage_url !== identity.homepageUrl ||
    action?.default_title !== identity.name ||
    manifest.sidebar_action?.default_title !== identity.name ||
    englishMessages.appName?.message !== identity.name ||
    englishMessages.appLogoLabel?.message !== identity.logoLabel ||
    englishMessages.extName?.message !== identity.name ||
    englishMessages.extDesc?.message !== identity.description
  ) {
    throw new Error("The release build does not match the reviewed MV2 fork identity.");
  }
  for (const fileName of firefoxForkIdentity.REQUIRED_ICON_FILES) {
    const builtIcon = path.join(buildDirectory, "images", fileName);
    const reviewedIcon = path.join(identity.iconsDirectory, fileName);
    if ((await sha256(builtIcon)) !== (await sha256(reviewedIcon))) {
      throw new Error(`The release build icon does not match the reviewed asset: ${fileName}`);
    }
  }
  const actualManifestPolicy = {
    manifest_version: manifest.manifest_version,
    permissions: manifest.permissions,
    optional_permissions: manifest.optional_permissions ?? [],
    host_permissions: manifest.host_permissions ?? null,
    optional_host_permissions: manifest.optional_host_permissions ?? null,
    externally_connectable: manifest.externally_connectable ?? null,
    background: manifest.background,
    content_security_policy: manifest.content_security_policy,
    content_scripts: manifest.content_scripts,
    web_accessible_resources: manifest.web_accessible_resources,
  };
  if (!isDeepStrictEqual(actualManifestPolicy, manifestPolicy)) {
    throw new Error(
      "The generated manifest security surface differs from fork/firefox-manifest-policy.json and requires review.",
    );
  }

  await rm(releaseDirectory, { recursive: true, force: true });
  await mkdir(path.join(releaseDirectory, "amo"), { recursive: true });
  const slug = identity.slug;
  const artifactPath = path.join(releaseDirectory, `${slug}-${packageJson.version}.xpi`);
  const sourceArchivePath = path.join(
    releaseDirectory,
    `${slug}-${packageJson.version}-source.zip`,
  );
  await cp(path.join(browserDirectory, "dist/fork-dist-firefox.zip"), artifactPath);

  const epochText =
    process.env.SOURCE_DATE_EPOCH ??
    run("git", ["show", "-s", "--format=%ct", "HEAD"], { stdio: "pipe" });
  const epoch = Number(epochText);
  await createSourceArchive(sourceArchivePath, epoch);

  for (const document of requiredDocuments) {
    await cp(path.join(amoDirectory, document), path.join(releaseDirectory, "amo", document));
  }

  const gitStatus = run("git", ["status", "--porcelain=v1", "--untracked-files=all"], {
    stdio: "pipe",
  });
  const releaseManifest = {
    channel: identity.distributionChannel,
    dataCollectionPermissions:
      manifest.browser_specific_settings.gecko.data_collection_permissions.required,
    extensionId: identity.geckoId,
    hostAccess: manifest.permissions.filter((permission) => permission.includes("://")),
    git: {
      commit: run("git", ["rev-parse", "HEAD"], { stdio: "pipe" }),
      clean: gitStatus.length === 0,
    },
    manifestVersion: manifest.manifest_version,
    manifestPolicy: {
      file: path.relative(browserDirectory, manifestPolicyPath),
      sha256: await sha256(manifestPolicyPath),
    },
    minimumFirefoxVersion: manifest.browser_specific_settings.gecko.strict_min_version,
    mozillaLint: {
      errors: lintResult.summary.errors,
      notices: lintResult.summary.notices,
      reviewedWarnings: lintWarningCounts,
      warnings: lintResult.summary.warnings,
    },
    optionalPermissions: manifest.optional_permissions ?? [],
    package: {
      file: path.basename(artifactPath),
      sha256: await sha256(artifactPath),
    },
    permissions: manifest.permissions.filter((permission) => !permission.includes("://")),
    product: identity.name,
    source: {
      file: path.basename(sourceArchivePath),
      sha256: await sha256(sourceArchivePath),
    },
    version: packageJson.version,
  };
  const releaseManifestPath = path.join(releaseDirectory, "RELEASE_MANIFEST.json");
  await writeFile(releaseManifestPath, `${JSON.stringify(releaseManifest, null, 2)}\n`);
  await writeFile(
    path.join(releaseDirectory, "SHA256SUMS"),
    `${releaseManifest.package.sha256}  ${releaseManifest.package.file}\n${releaseManifest.source.sha256}  ${releaseManifest.source.file}\n`,
  );

  console.log(`Verified AMO release bundle: ${releaseDirectory}`);
  console.log(`Package SHA-256 ${releaseManifest.package.sha256}`);
  console.log(`Source SHA-256  ${releaseManifest.source.sha256}`);
}

await main();
