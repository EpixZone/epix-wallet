#!/usr/bin/env node
// Figma REST API → 텍스트 스타일 가져오기 → /tmp/figma-typography.json 저장
// 필요: FIGMA_ACCESS_TOKEN 환경변수

import https from "https";
import fs from "fs";

const FILE_KEY = "nhxLa3t70UV80DEjPWMz3Z";
const TOKEN = process.env.FIGMA_ACCESS_TOKEN;
const OUTPUT = "/tmp/figma-typography.json";

if (!TOKEN) {
  console.error("Error: FIGMA_ACCESS_TOKEN not set");
  process.exit(1);
}

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

async function main() {
  console.log("Fetching text styles from Figma...");

  // 1. 텍스트 스타일 목록 조회
  const stylesData = await apiGet(
    `https://api.figma.com/v1/files/${FILE_KEY}/styles`
  );
  const textStyles = (stylesData.meta?.styles || []).filter(
    (style) => style.style_type === "TEXT"
  );
  console.log(`  Found ${textStyles.length} text styles`);

  if (!textStyles.length) {
    console.error("No text styles found");
    process.exit(1);
  }

  // 2. 각 스타일 노드의 폰트 속성 조회
  const nodeIds = textStyles.map((style) => style.node_id).join(",");
  const nodesData = await apiGet(
    `https://api.figma.com/v1/files/${FILE_KEY}/nodes?ids=${nodeIds}`
  );

  const result = {};
  for (const style of textStyles) {
    const node = nodesData.nodes[style.node_id]?.document;
    if (!node?.style?.fontSize) continue;
    const nodeStyle = node.style;
    const lineHeightPct = nodeStyle.lineHeightPercentFontSize;
    if (lineHeightPct == null) {
      console.warn(
        `  ⚠ ${style.name}: lineHeight가 AUTO/PIXELS 단위 — 기본값 1.4 적용`
      );
    }
    result[style.name] = {
      fontSize: nodeStyle.fontSize,
      lineHeight:
        lineHeightPct != null ? Math.round(lineHeightPct * 10) / 1000 : 1.4,
      letterSpacing: nodeStyle.letterSpacing ?? 0,
      fontWeight: nodeStyle.fontWeight ?? 400,
    };
  }

  fs.writeFileSync(OUTPUT, JSON.stringify(result, null, 2), "utf8");
  console.log(`✓ Saved: ${OUTPUT} (${Object.keys(result).length} styles)`);
}

main().catch((error) => {
  console.error("Error:", error.message);
  process.exit(1);
});
