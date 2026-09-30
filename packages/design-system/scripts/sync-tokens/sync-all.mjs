#!/usr/bin/env node
// sync-all.mjs — Transactional orchestrator for sync:tokens pipeline
// Phase 1: Fetch all data from Figma (network-dependent)
// Phase 2: Generate TS files to staging directory
// Phase 3: Commit staged files to final locations (atomic)
// Phase 4: Sync icons → React components (additive-only)
// Requires FIGMA_USE_EXECUTABLE: absolute path to the installed figma-use CLI.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { configuredExecutable } from "./files.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cwd = path.join(__dirname, "../..");
const foundationDir = path.join(cwd, "src/foundation");
const require = createRequire(import.meta.url);
const prettierCli = require.resolve("prettier/bin-prettier.js");

const FINAL_COLOR = path.join(foundationDir, "color/color.ts");
const FINAL_TYPO = path.join(foundationDir, "typography/typography-tokens.ts");

const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), "sync-tokens-"));
const STAGED_COLOR = path.join(stagingDir, "color.ts");
const STAGED_TYPO = path.join(stagingDir, "typography.ts");

const forceArgs = process.argv.includes("--force") ? ["--force"] : [];
const variablesPath = path.join(stagingDir, "figma-vars.json");
const typographyPath = path.join(stagingDir, "figma-typography.json");
const options = { stdio: "inherit", cwd, shell: false };

function cleanup() {
  try {
    fs.rmSync(stagingDir, { recursive: true, force: true });
  } catch {}
}

try {
  // ── Phase 1: Fetch all data from Figma ──────────────────────────────────────
  console.log("═══ Phase 1: Fetching data from Figma ═══\n");

  const variables = execFileSync(
    configuredExecutable(process.env.FIGMA_USE_EXECUTABLE),
    [
      "eval",
      fs.readFileSync(path.join(__dirname, "figma-extract-vars.mjs"), "utf8"),
    ],
    { ...options, stdio: ["ignore", "pipe", "inherit"] }
  );
  fs.writeFileSync(variablesPath, variables, { flag: "wx", mode: 0o600 });

  execFileSync(
    process.execPath,
    [path.join(__dirname, "sync-typography.mjs"), typographyPath],
    options
  );

  // Generate TS files inside the private staging directory.
  console.log("\nGenerating TS files (staging)\n");
  execFileSync(
    process.execPath,
    [
      path.join(__dirname, "generate-color-ts.mjs"),
      variablesPath,
      STAGED_COLOR,
      ...forceArgs,
    ],
    options
  );
  execFileSync(
    process.execPath,
    [
      path.join(__dirname, "generate-typography-ts.mjs"),
      typographyPath,
      STAGED_TYPO,
      ...forceArgs,
    ],
    options
  );

  // ── Phase 3: Commit staged files ────────────────────────────────────────────
  console.log("\n═══ Phase 3: Committing files ═══\n");

  fs.copyFileSync(STAGED_COLOR, FINAL_COLOR);
  fs.copyFileSync(STAGED_TYPO, FINAL_TYPO);
  console.log("✓ color.ts updated");
  console.log("✓ typography.ts updated");

  // ── Phase 4: Sync icons (additive-only, Phase 3 results preserved on failure)
  console.log("\n═══ Phase 4: Syncing icons ═══\n");

  try {
    execFileSync(
      process.execPath,
      [path.join(__dirname, "sync-icons.mjs")],
      options
    );
  } catch (iconError) {
    console.warn(`\n⚠ Icon sync failed (color/typography were saved)`);
    console.warn(`  ${iconError.message}`);
  }

  // ── Format generated files ──────────────────────────────────────────────────
  console.log("\n═══ Formatting generated files ═══\n");
  execFileSync(
    process.execPath,
    [prettierCli, "--write", "src/**/*.{ts,tsx}"],
    options
  );

  console.log("\n✓ All sync steps completed successfully");
} catch (error) {
  console.error(`\n✗ Pipeline failed — no TS files were modified`);
  console.error(`  ${error.message}`);
  cleanup();
  process.exit(1);
}

cleanup();
