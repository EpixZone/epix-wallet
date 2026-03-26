#!/usr/bin/env node
// Figma Icons → React 컴포넌트 직접 생성 (SVG 파일 중간 저장 없음)
// 필요: FIGMA_ACCESS_TOKEN 환경변수

import https from "https";
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const FILE_KEY = "nhxLa3t70UV80DEjPWMz3Z";
const ICONS_PAGE_ID = "319:234";
const TOKEN = process.env.FIGMA_ACCESS_TOKEN;
const COMPONENTS_DIR = path.join(
  __dirname,
  "../../src/foundation/icon/components"
);
const INDEX_PATH = path.join(__dirname, "../../src/foundation/icon/index.ts");

if (!TOKEN) {
  console.error("Error: FIGMA_ACCESS_TOKEN not set");
  process.exit(1);
}

// ── Figma API ───────────────────────────────────────────────────────────────

function apiGet(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "X-FIGMA-TOKEN": TOKEN } }, (response) => {
        let rawData = "";
        response.on("data", (chunk) => (rawData += chunk));
        response.on("end", () => {
          if (response.statusCode >= 400)
            return reject(
              new Error(`HTTP ${response.statusCode}: ${url}\n${rawData}`)
            );
          resolve(JSON.parse(rawData));
        });
      })
      .on("error", reject);
  });
}

function downloadSvg(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https") ? https : http;
    client
      .get(url, (response) => {
        if (
          response.statusCode >= 300 &&
          response.statusCode < 400 &&
          response.headers.location
        )
          return downloadSvg(response.headers.location)
            .then(resolve)
            .catch(reject);
        let rawData = "";
        response.on("data", (chunk) => (rawData += chunk));
        response.on("end", () => {
          if (response.statusCode >= 400)
            return reject(
              new Error(`HTTP ${response.statusCode} downloading SVG: ${url}`)
            );
          resolve(rawData);
        });
      })
      .on("error", reject);
  });
}

function collectComponents(node, results = []) {
  if (node.type === "COMPONENT") results.push({ id: node.id, name: node.name });
  for (const child of node.children || []) collectComponents(child, results);
  return results;
}

// ── SVG → JSX 변환 ─────────────────────────────────────────────────────────

const ATTR_MAP = {
  "stroke-width": "strokeWidth",
  "stroke-linecap": "strokeLinecap",
  "stroke-linejoin": "strokeLinejoin",
  "fill-rule": "fillRule",
  "clip-rule": "clipRule",
  "clip-path": "clipPath",
  "stop-color": "stopColor",
  "stop-opacity": "stopOpacity",
  "font-size": "fontSize",
  "font-weight": "fontWeight",
  "text-anchor": "textAnchor",
  "dominant-baseline": "dominantBaseline",
  "color-interpolation-filters": "colorInterpolationFilters",
  "flood-opacity": "floodOpacity",
  "flood-color": "floodColor",
  "stroke-miterlimit": "strokeMiterlimit",
  "xlink:href": "xlinkHref",
  "xmlns:xlink": "xmlnsXlink",
  class: "className",
};

function convertAttributes(svgContent) {
  let result = svgContent;
  for (const [svgAttr, jsxAttr] of Object.entries(ATTR_MAP)) {
    result = result.replace(
      new RegExp(`\\b${svgAttr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}=`, "g"),
      `${jsxAttr}=`
    );
  }
  // 하드코딩된 색상을 {color}로 교체 ("none", "currentColor" 유지)
  result = result.replace(
    /\b(stroke|fill)="(#[0-9a-fA-F]{3,8}|rgb[^"]*|rgba[^"]*|black|white|red|blue|green)"/g,
    `$1={color}`
  );
  return result;
}

function toComponentName(name) {
  return (
    name
      .split(/[-_]/)
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join("") + "Icon"
  );
}

function toKebabFileName(name) {
  return name + "-icon";
}

function parseSvg(content) {
  const svgMatch = content.match(/<svg([^>]*)>([\s\S]*)<\/svg>/i);
  if (!svgMatch) return null;
  const viewBoxMatch = svgMatch[1].match(/viewBox="([^"]*)"/);
  return {
    viewBox: viewBoxMatch ? viewBoxMatch[1] : "0 0 24 24",
    innerContent: svgMatch[2].trim(),
  };
}

function generateComponent(componentName, svgContent) {
  const parsed = parseSvg(svgContent);
  if (!parsed) return null;

  const convertedInner = convertAttributes(parsed.innerContent);
  const usesColor = convertedInner.includes("{color}");

  return [
    `import React from "react";`,
    `import type { DSIconProps } from "../types";`,
    ``,
    `export const ${componentName}: React.FC<DSIconProps> = ({`,
    `  size = 24,`,
    `  color = "currentColor",`,
    `  ...props`,
    `}) => (`,
    `  <svg`,
    `    width={size}`,
    `    height={size}`,
    `    viewBox="${parsed.viewBox}"`,
    `    fill="none"`,
    `    xmlns="http://www.w3.org/2000/svg"`,
    ...(usesColor ? [] : [`    color={color}`]),
    `    {...props}`,
    `  >`,
    `    ${convertedInner}`,
    `  </svg>`,
    `);`,
    ``,
  ].join("\n");
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("Fetching icon list from Figma...");
  const pageData = await apiGet(
    `https://api.figma.com/v1/files/${FILE_KEY}/nodes?ids=${ICONS_PAGE_ID}&depth=3`
  );

  const rootNode = Object.values(pageData.nodes)[0]?.document;
  if (!rootNode) throw new Error(`Node ${ICONS_PAGE_ID} not found`);

  const seen = new Set();
  const components = collectComponents(rootNode)
    .map((c) => ({ ...c, name: c.name.replace(/_/g, "-") }))
    .filter(({ name }) => {
      if (name.includes("/") || name.includes("..")) return false;
      if (seen.has(name)) return false;
      seen.add(name);
      return true;
    });

  console.log(`  Found ${components.length} icons in Figma`);

  // 기존 컴포넌트와 비교 (additive-only)
  const existingComponents = new Set(
    fs.existsSync(COMPONENTS_DIR)
      ? fs
          .readdirSync(COMPONENTS_DIR)
          .filter((f) => f.endsWith(".tsx"))
          .map((f) => f.replace("-icon.tsx", ""))
      : []
  );
  const toDownload = components.filter(
    ({ name }) => !existingComponents.has(name)
  );

  if (!toDownload.length) {
    console.log("✓ Icons up to date — no new icons");
    return;
  }

  console.log(`  Generating ${toDownload.length} new icon component(s):`);
  toDownload.forEach(({ name }) => console.log(`    + ${name}`));

  // SVG export URL 요청 (100개씩 배치)
  const BATCH_SIZE = 100;
  const svgUrls = {};
  for (let i = 0; i < toDownload.length; i += BATCH_SIZE) {
    const batch = toDownload.slice(i, i + BATCH_SIZE);
    const ids = batch.map((c) => c.id).join(",");
    const imgData = await apiGet(
      `https://api.figma.com/v1/images/${FILE_KEY}?ids=${ids}&format=svg`
    );
    Object.assign(svgUrls, imgData.images || {});
  }

  // SVG 다운로드 → 메모리에서 바로 React 컴포넌트 생성
  fs.mkdirSync(COMPONENTS_DIR, { recursive: true });
  let successCount = 0;
  let failCount = 0;
  const newComponents = [];

  for (const { id, name } of toDownload) {
    const svgUrl = svgUrls[id];
    if (!svgUrl) {
      console.warn(`  ⚠ No export URL for: ${name}`);
      failCount++;
      continue;
    }
    try {
      const svgContent = await downloadSvg(svgUrl);
      const componentName = toComponentName(name);
      const componentCode = generateComponent(componentName, svgContent);
      if (!componentCode) {
        console.warn(`  ⚠ Could not parse SVG for: ${name}`);
        failCount++;
        continue;
      }
      const kebabName = toKebabFileName(name);
      fs.writeFileSync(
        path.join(COMPONENTS_DIR, `${kebabName}.tsx`),
        componentCode,
        "utf8"
      );
      newComponents.push({ componentName, kebabName });
      successCount++;
    } catch (error) {
      console.warn(`  ⚠ Failed: ${name} — ${error.message}`);
      failCount++;
    }
  }

  // barrel index.ts 재생성 (기존 + 신규 전체)
  const allComponents = fs
    .readdirSync(COMPONENTS_DIR)
    .filter((f) => f.endsWith(".tsx"))
    .sort()
    .map((f) => {
      const kebabName = f.replace(".tsx", "");
      const baseName = kebabName.replace(/-icon$/, "");
      const componentName = toComponentName(baseName);
      return { componentName, kebabName };
    });

  const indexLines = [
    `// GENERATED FILE — DO NOT EDIT MANUALLY`,
    `// Run: yarn workspace @keplr-wallet/design-system sync:tokens`,
    ``,
    `export type { DSIconProps } from "./types";`,
    ``,
    ...allComponents.map(
      ({ componentName, kebabName }) =>
        `export { ${componentName} } from "./components/${kebabName}";`
    ),
    ``,
  ];

  fs.writeFileSync(INDEX_PATH, indexLines.join("\n"), "utf8");

  const failMsg = failCount ? `, ${failCount} failed` : "";
  console.log(`✓ Generated ${successCount} icon component(s)${failMsg}`);
  console.log(`✓ Updated: ${INDEX_PATH} (${allComponents.length} total)`);
}

main().catch((error) => {
  console.error("Error:", error.message);
  process.exit(1);
});
