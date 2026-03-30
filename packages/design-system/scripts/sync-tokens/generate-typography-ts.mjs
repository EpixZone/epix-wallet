#!/usr/bin/env node
// Figma text style JSON → generate typography-tokens.ts
// Input: /tmp/figma-typography.json (generated after running sync-typography.mjs)

import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const inputPath = process.argv[2] || "/tmp/figma-typography.json";
const outputPath =
  process.argv[3] ||
  path.join(__dirname, "../../src/foundation/typography/typography-tokens.ts");

if (!fs.existsSync(inputPath)) {
  console.error(
    `Error: ${inputPath} not found. Run sync-typography.mjs first.`
  );
  process.exit(1);
}
const figmaStyles = JSON.parse(fs.readFileSync(inputPath, "utf8"));
if (Object.keys(figmaStyles).length === 0) {
  console.error("Error: figma-typography.json is empty. Aborting overwrite.");
  process.exit(1);
}

// ── Style parsing ──────────────────────────────────────────────────────────────
function sizeToTsField(sizeName) {
  // "Display xl" → "displayXl", "Text xxs" → "textXxs"
  const parts = sizeName.trim().split(/\s+/);
  return (
    parts[0].toLowerCase() +
    parts
      .slice(1)
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join("")
  );
}

function isDeprecatedVariant(variantName) {
  return /^\[X\]/i.test(variantName.trim());
}

function isTestArtifact(sizeName) {
  return /^test/i.test(sizeName.trim());
}

const sizeMap = {}; // tsField → { fontSize, lineHeight, letterSpacing }
const fieldOrder = []; // Preserve Figma appearance order

for (const [styleName, style] of Object.entries(figmaStyles)) {
  const slashIdx = styleName.lastIndexOf("/");
  const sizeName =
    slashIdx !== -1 ? styleName.slice(0, slashIdx).trim() : styleName.trim();
  const variantName =
    slashIdx !== -1 ? styleName.slice(slashIdx + 1).trim() : "";

  if (isDeprecatedVariant(variantName)) continue;
  if (isTestArtifact(sizeName)) continue;

  const tsField = sizeToTsField(sizeName);
  if (!tsField || sizeMap[tsField]) continue;

  sizeMap[tsField] = {
    fontSize: style.fontSize,
    lineHeight: style.lineHeight,
    letterSpacing: style.letterSpacing,
  };
  fieldOrder.push(tsField);
}

// ── Code generation ─────────────────────────────────────────────────────────────

function buildTokenEntries() {
  return fieldOrder
    .map((tsField) => {
      const { fontSize, lineHeight, letterSpacing } = sizeMap[tsField];
      return `  ${tsField}: createStyle(${fontSize}, ${lineHeight}, ${letterSpacing}),`;
    })
    .join("\n");
}

const now = new Date().toISOString().slice(0, 19).replace("T", " ");
const newContent = `\
// GENERATED FILE — DO NOT EDIT MANUALLY
// Last synced: ${now} UTC
// Source: Figma "Supernova Design System" text styles
// Run: yarn workspace @keplr-wallet/design-system sync:tokens

import type { CSSProperties } from 'react';

export interface TypographyStyle {
  readonly fontSize: number;
  readonly lineHeight: number;
  readonly letterSpacing: number;
  readonly semibold: CSSProperties;
  readonly medium: CSSProperties;
  readonly regular: CSSProperties;
}

function createStyle(fontSize: number, lineHeight: number, letterSpacing: number): TypographyStyle {
  const base = { fontSize, lineHeight, letterSpacing };
  return {
    ...base,
    semibold: { ...base, fontWeight: 600 },
    medium: { ...base, fontWeight: 500 },
    regular: { ...base, fontWeight: 400 },
  };
}

/// Supernova Design System Typography
///
/// Usage: dsTypographyTokens.textMd.semibold
export const dsTypographyTokens = {
${buildTokenEntries()}
} as const;

export type DSTypographySize = keyof typeof dsTypographyTokens;
`;

// ── Field deletion guard ───────────────────────────────────────────────────────
if (fs.existsSync(outputPath)) {
  const existingContent = fs.readFileSync(outputPath, "utf8");
  const existingFields = [
    ...existingContent.matchAll(/^\s+(\w+): createStyle/gm),
  ].map((m) => m[1]);
  const newFields = new Set(
    [...newContent.matchAll(/^\s+(\w+): createStyle/gm)].map((m) => m[1])
  );
  const removed = existingFields.filter((f) => !newFields.has(f));
  if (removed.length > 0) {
    console.error(
      `Error: ${
        removed.length
      } dsTypographyTokens field(s) will be deleted: ${removed.join(", ")}`
    );
    console.error("  Update call-sites first, then re-run with --force.");
    if (!process.argv.includes("--force")) process.exit(1);
    console.warn("  --force: Overwriting anyway.");
  }
}

// ── Atomic write ───────────────────────────────────────────────────────────────
const tmpPath = path.join(os.tmpdir(), `typography_${Date.now()}.ts.tmp`);
fs.writeFileSync(tmpPath, newContent, "utf8");
fs.renameSync(tmpPath, outputPath);
console.log(`✓ Generated: ${outputPath}`);
console.log(`  Styles: ${fieldOrder.length} (from Figma)`);
