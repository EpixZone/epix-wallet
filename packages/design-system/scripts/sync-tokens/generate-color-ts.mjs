#!/usr/bin/env node
// Figma Variables JSON → generate color.ts (single file: DSColor + theme values)
// Input: /tmp/figma-vars.json (generated after running figma-extract-vars.mjs)

import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const inputPath = process.argv[2] || "/tmp/figma-vars.json";
const outputPath =
  process.argv[3] ||
  path.join(__dirname, "../../src/foundation/color/color.ts");

const figmaData = JSON.parse(fs.readFileSync(inputPath, "utf8"));

if (!figmaData.primitive || Object.keys(figmaData.primitive).length === 0) {
  console.error(
    "Error: No primitive colors in figma-vars.json. figma-use eval may have failed."
  );
  process.exit(1);
}

// ── Color conversion helpers ───────────────────────────────────────────────────
function to255(n) {
  return Math.round(n * 255);
}
function hex2(b) {
  return b.toString(16).padStart(2, "0").toUpperCase();
}
function rgbKey(r, g, b) {
  return `${to255(r)},${to255(g)},${to255(b)}`;
}
function toHex(r, g, b) {
  return `#${hex2(to255(r))}${hex2(to255(g))}${hex2(to255(b))}`;
}
function toRgba(r, g, b, a) {
  const alpha = parseFloat(a.toFixed(2));
  return `rgba(${to255(r)}, ${to255(g)}, ${to255(b)}, ${alpha})`;
}

// ── Primitive parsing ──────────────────────────────────────────────────────────
function parsePrimitiveName(figmaName) {
  const [familyRaw, type, variant] = figmaName.split("/");
  if (!familyRaw || !type || !variant) return null;
  const family = familyRaw.toLowerCase();
  if (type === "Solid") return { type: "solid", field: `${family}${variant}` };
  if (type === "Alpha") {
    const match = variant.match(/^(\d+)-(\d+)$/);
    if (!match) return null;
    return {
      type: "alpha",
      base: `${family}${match[1]}`,
      alphaPct: parseInt(match[2]),
    };
  }
  return null;
}

const solidColors = {};
const alphaVariants = [];

for (const [figmaName, rgba] of Object.entries(figmaData.primitive)) {
  const parsed = parsePrimitiveName(figmaName);
  if (!parsed) continue;
  if (parsed.type === "solid") {
    solidColors[parsed.field] = { r: rgba.r, g: rgba.g, b: rgba.b };
  } else {
    alphaVariants.push({ ...parsed, rgba });
  }
}

for (const { base, rgba } of alphaVariants) {
  if (!solidColors[base])
    solidColors[base] = { r: rgba.r, g: rgba.g, b: rgba.b };
}

const alphasByBase = {};
for (const v of alphaVariants) {
  (alphasByBase[v.base] = alphasByBase[v.base] || []).push(v);
}
for (const variants of Object.values(alphasByBase)) {
  variants.sort((a, b) => a.alphaPct - b.alphaPct);
}

// Synthetic primitives — only added if not already present from Figma
if (!solidColors.black) solidColors.black = { r: 0, g: 0, b: 0 };
if (!solidColors.white) solidColors.white = { r: 1, g: 1, b: 1 };

function parseField(field) {
  const match = field.match(/^([a-z]+)(\d+)$/);
  return match
    ? { family: match[1], num: parseInt(match[2]) }
    : { family: field, num: 0 };
}
const sortedSolids = Object.keys(solidColors).sort((a, b) => {
  const pa = parseField(a);
  const pb = parseField(b);
  return pa.family !== pb.family
    ? pa.family.localeCompare(pb.family)
    : pa.num - pb.num;
});

const rgbToSolidName = {};
for (const [field, rgba] of Object.entries(solidColors))
  rgbToSolidName[rgbKey(rgba.r, rgba.g, rgba.b)] = field;

const rgbAlphaToName = {};
for (const { base, alphaPct, rgba } of alphaVariants) {
  const variantName = `${base}_${alphaPct}`;
  rgbAlphaToName[`${rgbKey(rgba.r, rgba.g, rgba.b)}:${alphaPct}`] = variantName;
  if (solidColors[base])
    rgbAlphaToName[
      `${rgbKey(
        solidColors[base].r,
        solidColors[base].g,
        solidColors[base].b
      )}:${alphaPct}`
    ] = variantName;
}

function semPrimRef(tokenKey, mode) {
  const token = figmaData.semantic[tokenKey];
  if (!token?.[mode]) return null;
  const { r, g, b, a } = token[mode];
  if (a >= 0.999) return rgbToSolidName[rgbKey(r, g, b)] || null;
  const alphaPct = Math.round(a * 100);
  const alphaName = rgbAlphaToName[`${rgbKey(r, g, b)}:${alphaPct}`];
  if (alphaName) return alphaName;
  const solidName = rgbToSolidName[rgbKey(r, g, b)];
  if (!solidName) return null;
  if (!alphasByBase[solidName]?.some((v) => v.alphaPct === alphaPct))
    return null;
  return `${solidName}_${alphaPct}`;
}

// ── Semantic tree ─────────────────────────────────────────────────────────────
function toCssVarName(figmaPath) {
  return (
    "--ds-" +
    figmaPath
      .split("/")
      .map((p) => p.trim().toLowerCase().replace(/\s+/g, "-"))
      .join("-")
  );
}

function toJsKey(segment) {
  const cleaned = segment.replace(/.*→\s*/, "").trim();
  const result = cleaned
    .replace(/-(\d)/g, "_$1")
    .replace(/[-\s]+([a-zA-Z])/g, (_, c) => c.toUpperCase())
    .replace(/^[A-Z]/, (c) => c.toLowerCase());
  return result.replace(/[^a-zA-Z0-9_$]/g, "_");
}

const semTree = {};

for (const key of Object.keys(figmaData.semantic)) {
  let parts = key.split("/").map((p) => p.trim());

  let alphaPct = null;
  const alphaIdx = parts.indexOf("Alpha");
  if (alphaIdx !== -1 && alphaIdx < parts.length - 1) {
    parts.splice(alphaIdx, 1);
    const lastPart = parts[parts.length - 1];
    const match = lastPart.match(/-(\d+)$/);
    if (match) {
      alphaPct = parseInt(match[1]);
      parts[parts.length - 1] = lastPart.replace(/-\d+$/, "");
    }
  }

  const namespace = parts.slice(0, -1).join("/");
  let jsKey = toJsKey(parts[parts.length - 1]);
  if (alphaPct !== null) jsKey += `_${alphaPct}`;

  if (!semTree[namespace])
    semTree[namespace] = { tokens: [], children: new Set() };
  semTree[namespace].tokens.push({
    jsKey,
    cssVar: toCssVarName(key),
    figmaPath: key,
  });
}

for (const namespace of Object.keys(semTree)) {
  const parts = namespace.split("/");
  if (parts.length > 1) {
    const parent = parts.slice(0, -1).join("/");
    if (!semTree[parent]) semTree[parent] = { tokens: [], children: new Set() };
    semTree[parent].children.add(namespace);
  }
}

function hasAnyToken(namespace) {
  if (
    semTree[namespace].tokens.some(
      (t) => semPrimRef(t.figmaPath, "dark") || semPrimRef(t.figmaPath, "light")
    )
  )
    return true;
  return [...semTree[namespace].children].some((child) => hasAnyToken(child));
}

const topNamespaces = Object.keys(semTree)
  .filter((ns) => !ns.includes("/"))
  .sort((a, b) => {
    const firstKey = (ns) =>
      Object.keys(figmaData.semantic).find(
        (k) => k.startsWith(ns + "/") || k === ns
      ) || ns;
    return (
      Object.keys(figmaData.semantic).indexOf(firstKey(a)) -
      Object.keys(figmaData.semantic).indexOf(firstKey(b))
    );
  });

// ── Code generation ─────────────────────────────────────────────────────────

function colorFamily(field) {
  return field.replace(/\d+$/, "");
}

function buildPrimitiveLines() {
  const lines = [];
  let prevFamily = "";
  for (const field of sortedSolids) {
    const rgba = solidColors[field];
    const family = colorFamily(field);
    if (prevFamily && family !== prevFamily) lines.push("");
    lines.push(`  ${field}: '${toHex(rgba.r, rgba.g, rgba.b)}',`);
    for (const { alphaPct, rgba: aRgba } of alphasByBase[field] || []) {
      lines.push(
        `  ${field}_${alphaPct}: '${toRgba(
          aRgba.r,
          aRgba.g,
          aRgba.b,
          alphaPct / 100
        )}',`
      );
    }
    prevFamily = family;
  }
  return lines.join("\n");
}

function buildVarTree(namespace, indent) {
  const { tokens, children } = semTree[namespace];
  const validTokens = tokens.filter(
    (t) => semPrimRef(t.figmaPath, "dark") || semPrimRef(t.figmaPath, "light")
  );
  const validChildren = [...children].filter((child) => hasAnyToken(child));
  if (!validTokens.length && !validChildren.length) return null;

  const lines = [];
  for (const token of validTokens) {
    lines.push(`${indent}  ${token.jsKey}: 'var(${token.cssVar})' as const,`);
  }
  for (const child of validChildren) {
    const childKey = toJsKey(child.split("/").pop());
    const childLines = buildVarTree(child, indent + "  ");
    if (childLines) {
      lines.push(`${indent}  ${childKey}: {`);
      lines.push(childLines);
      lines.push(`${indent}  },`);
    }
  }
  return lines.join("\n");
}

function buildSemanticLines() {
  const lines = [];
  for (const ns of topNamespaces) {
    if (!hasAnyToken(ns)) continue;
    const inner = buildVarTree(ns, "  ");
    if (inner) {
      lines.push(`  ${toJsKey(ns)}: {`);
      lines.push(inner);
      lines.push(`  },`);
    }
  }
  return lines.join("\n");
}

function buildThemeValues(mode) {
  const lines = [];
  for (const key of Object.keys(figmaData.semantic)) {
    const primRef = semPrimRef(key, mode);
    if (!primRef) continue;
    lines.push(`  '${toCssVarName(key)}': DSColor.${primRef},`);
  }
  return lines.join("\n");
}

const now = new Date().toISOString().slice(0, 19).replace("T", " ");
const newContent = `\
// @generated — DO NOT EDIT MANUALLY
// Last synced: ${now} UTC
// Source: Figma "Supernova Design System"
// Run: yarn workspace @keplr-wallet/design-system sync:tokens

/**
 * Unified Design System colors.
 * Primitive: DSColor.blue400, DSColor.gray10
 * Semantic:  DSColor.typography.primary, DSColor.fill.neutral.high
 */
export const DSColor = {
  // ── Primitives ──
${buildPrimitiveLines()}

  transparent: 'rgba(255, 255, 255, 0)',

  // ── Semantic (CSS variable refs) ──
${buildSemanticLines()}
} as const;

/** Dark theme CSS variable values */
export const darkThemeValues: Record<string, string> = {
${buildThemeValues("dark")}
};

/** Light theme CSS variable values */
export const lightThemeValues: Record<string, string> = {
${buildThemeValues("light")}
};
`;

// ── Field deletion guard ───────────────────────────────────────────────────────
if (fs.existsSync(outputPath)) {
  const existing = fs.readFileSync(outputPath, "utf8");
  const existingFields = [...existing.matchAll(/^\s+(\w+):/gm)].map(
    (m) => m[1]
  );
  const newFields = new Set(
    [...newContent.matchAll(/^\s+(\w+):/gm)].map((m) => m[1])
  );
  const removed = existingFields.filter((f) => !newFields.has(f));
  if (removed.length > 0) {
    console.error(
      `Error: ${
        removed.length
      } DSColor field(s) will be deleted: ${removed.join(", ")}`
    );
    console.error("  Update call-sites first, then re-run with --force.");
    if (!process.argv.includes("--force")) process.exit(1);
    console.warn("  --force: Overwriting anyway.");
  }
}

// Atomic write
const tmpPath = path.join(os.tmpdir(), `color_${Date.now()}.ts.tmp`);
fs.writeFileSync(tmpPath, newContent, "utf8");
fs.renameSync(tmpPath, outputPath);

const alphaCount = Object.values(alphasByBase).reduce(
  (sum, arr) => sum + arr.length,
  0
);
const semCount = Object.keys(figmaData.semantic).length;
console.log(`✓ Generated: ${outputPath}`);
console.log(
  `  Primitives: ${sortedSolids.length} solids + ${alphaCount} alpha`
);
console.log(`  Semantics:  ${semCount} tokens`);
const droppedTokens = Object.keys(figmaData.semantic).filter(
  (k) => !semPrimRef(k, "dark") && !semPrimRef(k, "light")
);
if (droppedTokens.length > 0)
  console.warn(
    `  ⚠ ${droppedTokens.length} semantic token(s) skipped — no resolved value in either mode`
  );
