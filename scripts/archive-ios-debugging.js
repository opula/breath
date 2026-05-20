#!/usr/bin/env node

const { spawnSync } = require("child_process");
const { mkdirSync, rmSync, writeFileSync } = require("fs");
const { join } = require("path");

const projectRoot = join(__dirname, "..");
const workspace = "ios/MidBreath.xcworkspace";
const scheme = "MidBreath";
const buildDir = join(projectRoot, "ios", "build");
const archivePath = join(buildDir, "MidBreath.xcarchive");
const exportPath = join(buildDir, "debugging-export");
const exportOptionsPath = join(buildDir, "ExportOptions.debugging.plist");
const dryRun = process.argv.includes("--dry-run") || process.env.DRY_RUN === "1";

const exportOptions = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>destination</key>
  <string>export</string>
  <key>method</key>
  <string>debugging</string>
  <key>signingStyle</key>
  <string>automatic</string>
  <key>stripSwiftSymbols</key>
  <true/>
</dict>
</plist>
`;

function run(command, args, options = {}) {
  console.log(`Running: ${command} ${args.join(" ")}`);
  if (dryRun) return "";

  const result = spawnSync(command, args, {
    cwd: projectRoot,
    encoding: "utf8",
    stdio: options.inherit ? "inherit" : "pipe",
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(output || `${command} exited with code ${result.status}`);
  }

  return result.stdout;
}

try {
  mkdirSync(buildDir, { recursive: true });

  if (!dryRun) {
    rmSync(archivePath, { recursive: true, force: true });
    rmSync(exportPath, { recursive: true, force: true });
    writeFileSync(exportOptionsPath, exportOptions);
  }

  run(
    "xcodebuild",
    [
      "-quiet",
      "-workspace",
      workspace,
      "-scheme",
      scheme,
      "-configuration",
      "Release",
      "-destination",
      "generic/platform=iOS",
      "-archivePath",
      archivePath,
      "archive",
    ],
    { inherit: true }
  );

  run(
    "xcodebuild",
    [
      "-quiet",
      "-exportArchive",
      "-archivePath",
      archivePath,
      "-exportPath",
      exportPath,
      "-exportOptionsPlist",
      exportOptionsPath,
    ],
    { inherit: true }
  );

  console.log(`Archive: ${archivePath}`);
  console.log(`Debugging export: ${exportPath}`);
  console.log("Note: this exports a Release iOS archive with Xcode's debugging export method. It does not create a Finder-launchable Mac app.");
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
