#!/usr/bin/env node
// Figma Icons → Generate React components directly (no intermediate SVG files)
// Requires: FIGMA_ACCESS_TOKEN environment variable

import https from "node:https";
import http from "node:http";
import fs from "node:fs";
import { iconFilePath } from "./files.mjs";
import { forEachBatch } from "./batches.mjs";
import { generateComponent, MAX_SVG_BYTES } from "./svg-component.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
        let bytes = 0;
        response.on("data", (chunk) => {
          bytes += chunk.length;
          if (bytes > MAX_SVG_BYTES) {
            response.destroy();
            reject(new Error("SVG exceeds the size limit"));
            return;
          }
          rawData += chunk;
        });
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

// ── SVG → JSX conversion ────────────────────────────────────────────────────

function toComponentName(name) {
  return (
    name
      .split(/[-_]/)
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join("") + "Icon"
  );
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
      if (name.trim() !== name || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(name))
        return false;
      if (seen.has(name)) return false;
      seen.add(name);
      return true;
    });

  console.log(`  Found ${components.length} icons in Figma`);

  // Compare against existing components (additive-only)
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

  // Figma accepts 100 IDs per export request. Limit concurrent requests and
  // retained SVG bodies to four, then write each batch in the original order.
  const BATCH_SIZE = 100;
  const CONCURRENCY = 4;
  const exportRequests = Array.from(
    { length: Math.ceil(toDownload.length / BATCH_SIZE) },
    (_, index) => {
      const ids = toDownload
        .slice(index * BATCH_SIZE, (index + 1) * BATCH_SIZE)
        .map((component) => component.id)
        .join(",");
      return `https://api.figma.com/v1/images/${FILE_KEY}?ids=${ids}&format=svg`;
    }
  );
  const svgUrls = {};
  await forEachBatch(exportRequests, CONCURRENCY, async (urls) => {
    const responses = await Promise.all(urls.map(apiGet));
    for (const response of responses) {
      Object.assign(svgUrls, response.images || {});
    }
  });

  // Download SVGs → generate React components directly in memory
  fs.mkdirSync(COMPONENTS_DIR, { recursive: true });
  let successCount = 0;
  let failCount = 0;

  await forEachBatch(toDownload, CONCURRENCY, async (batch) => {
    const results = await Promise.allSettled(
      batch.map(({ id }) =>
        svgUrls[id] ? downloadSvg(svgUrls[id]) : Promise.resolve(null)
      )
    );
    for (const [index, { id, name }] of batch.entries()) {
      if (!svgUrls[id]) {
        console.warn(`  ⚠ No export URL for: ${name}`);
        failCount++;
        continue;
      }
      try {
        const result = results[index];
        if (result.status === "rejected") throw result.reason;
        const componentCode = generateComponent(
          toComponentName(name),
          result.value
        );
        fs.writeFileSync(iconFilePath(COMPONENTS_DIR, name), componentCode, {
          encoding: "utf8",
          flag: "wx",
        });
        successCount++;
      } catch (error) {
        console.warn(`  ⚠ Failed: ${name} - ${error.message}`);
        failCount++;
      }
    }
  });

  // Regenerate barrel index.ts (all existing + new components)
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
