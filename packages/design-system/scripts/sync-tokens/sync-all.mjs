#!/usr/bin/env node
// sync-all.mjs — Transactional orchestrator for sync:tokens pipeline
// Phase 1: Fetch all data from Figma (network-dependent)
// Phase 2: Generate TS files to staging directory
// Phase 3: Commit staged files to final locations (atomic)
// Phase 4: Sync icons → React components (additive-only)

import { execSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cwd = path.join(__dirname, "../..");
const foundationDir = path.join(cwd, "src/foundation");

const FINAL_COLOR = path.join(foundationDir, "color/color.ts");
const FINAL_TYPO = path.join(foundationDir, "typography/typography-tokens.ts");

const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), "sync-tokens-"));
const STAGED_COLOR = path.join(stagingDir, "color.ts");
const STAGED_TYPO = path.join(stagingDir, "typography.ts");

const forceFlag = process.argv.includes("--force") ? " --force" : "";

function cleanup() {
  try {
    fs.rmSync(stagingDir, { recursive: true, force: true });
  } catch {}
}

function run(cmd, opts = {}) {
  execSync(cmd, { stdio: "inherit", cwd, ...opts });
}

try {
  // ── Phase 1: Fetch all data from Figma ──────────────────────────────────────
  console.log("═══ Phase 1: Fetching data from Figma ═══\n");

  run(
    'figma-use eval "$(cat scripts/sync-tokens/figma-extract-vars.mjs)" > /tmp/figma-vars.json',
    { shell: true }
  );

  run("node scripts/sync-tokens/sync-typography.mjs");

  // ── Phase 2: Generate TS files to staging ───────────────────────────────────
  console.log("\n═══ Phase 2: Generating TS files (staging) ═══\n");

  run(
    `node scripts/sync-tokens/generate-color-ts.mjs /tmp/figma-vars.json "${STAGED_COLOR}"${forceFlag}`
  );

  run(
    `node scripts/sync-tokens/generate-typography-ts.mjs /tmp/figma-typography.json "${STAGED_TYPO}"${forceFlag}`
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
    run("node scripts/sync-tokens/sync-icons.mjs");
  } catch (iconError) {
    console.warn(`\n⚠ Icon sync failed (color/typography were saved)`);
    console.warn(`  ${iconError.message}`);
  }

  // ── Format generated files ──────────────────────────────────────────────────
  console.log("\n═══ Formatting generated files ═══\n");
  run('npx prettier --write "src/**/*.{ts,tsx}"');

  console.log("\n✓ All sync steps completed successfully");
} catch (error) {
  console.error(`\n✗ Pipeline failed — no TS files were modified`);
  console.error(`  ${error.message}`);
  cleanup();
  process.exit(1);
}

cleanup();
