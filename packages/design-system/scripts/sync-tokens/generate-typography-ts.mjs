#!/usr/bin/env node
// Figma text style JSON → generate typography.ts
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
function sizeToDartField(sizeName) {
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

  const tsField = sizeToDartField(sizeName);
  if (!tsField || sizeMap[tsField]) continue;

  sizeMap[tsField] = {
    fontSize: style.fontSize,
    lineHeight: style.lineHeight,
    letterSpacing: style.letterSpacing,
  };
  fieldOrder.push(tsField);
}

// ── TypeScript file generation ────────────────────────────────────────────────
const now = new Date().toISOString().slice(0, 19).replace("T", " ");
const lines = [];

lines.push(`// GENERATED FILE — DO NOT EDIT MANUALLY`);
lines.push(`// Last synced: ${now} UTC`);
lines.push(`// Source: Figma "Supernova Design System" text styles`);
lines.push(`// Run: yarn workspace @keplr-wallet/design-system sync:tokens`);
lines.push(``);
lines.push(`import type { CSSProperties } from 'react';`);
lines.push(``);
lines.push(`export interface TypographyStyle {`);
lines.push(`  readonly fontSize: number;`);
lines.push(`  readonly lineHeight: number;`);
lines.push(`  readonly letterSpacing: number;`);
lines.push(`  readonly semibold: CSSProperties;`);
lines.push(`  readonly medium: CSSProperties;`);
lines.push(`  readonly regular: CSSProperties;`);
lines.push(`}`);
lines.push(``);
lines.push(
  `function createStyle(fontSize: number, lineHeight: number, letterSpacing: number): TypographyStyle {`
);
lines.push(`  const base = { fontSize, lineHeight, letterSpacing };`);
lines.push(`  return {`);
lines.push(`    ...base,`);
lines.push(`    semibold: { ...base, fontWeight: 600 },`);
lines.push(`    medium: { ...base, fontWeight: 500 },`);
lines.push(`    regular: { ...base, fontWeight: 400 },`);
lines.push(`  };`);
lines.push(`}`);
lines.push(``);
lines.push(`/// Supernova Design System Typography`);
lines.push(`///`);
lines.push(`/// Usage: dsTypographyTokens.textMd.semibold`);
lines.push(`export const dsTypographyTokens = {`);
for (const tsField of fieldOrder) {
  const { fontSize, lineHeight, letterSpacing } = sizeMap[tsField];
  lines.push(
    `  ${tsField}: createStyle(${fontSize}, ${lineHeight}, ${letterSpacing}),`
  );
}
lines.push(`} as const;`);
lines.push(``);
lines.push(`export type DSTypographySize = keyof typeof dsTypographyTokens;`);
lines.push(``);

// ── Field deletion guard ───────────────────────────────────────────────────────
const newContent = lines.join("\n");
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
