// figma-use eval script — Figma Variables(Primitive + Semantic) 추출
// Usage: figma-use eval "$(cat scripts/sync-tokens/figma-extract-vars.mjs)"

const result = { primitive: {}, semantic: {} };
const collections = figma.variables.getLocalVariableCollections();

// ── Primitive Colors ──────────────────────────────────────────────────────────
const primCollection = collections.find(
  (collection) => collection.name === "Primitive Colors"
);
if (primCollection) {
  const modeId = primCollection.modes[0].modeId;
  primCollection.variableIds.forEach((id) => {
    const figmaVar = figma.variables.getVariableById(id);
    const colorVal = figmaVar.valuesByMode[modeId];
    if (colorVal && typeof colorVal.r === "number") {
      result.primitive[figmaVar.name] = {
        r: colorVal.r,
        g: colorVal.g,
        b: colorVal.b,
        a: colorVal.a ?? 1,
      };
    }
  });
}

// ── Semantic Colors (Dark + Light) ───────────────────────────────────────────
const semCollection = collections.find(
  (collection) => collection.name === "Semantic Colors"
);
if (semCollection) {
  const darkModeId = semCollection.modes.find(
    (mode) => mode.name === "Dark"
  )?.modeId;
  const lightModeId = semCollection.modes.find(
    (mode) => mode.name === "Light"
  )?.modeId;

  // VARIABLE_ALIAS를 재귀적으로 따라가 실제 색상값({r,g,b,a}) 반환
  // modeId를 전달해 alias 대상 변수도 동일 모드로 resolve
  function resolveColor(rawValue, depth, modeId) {
    if (!rawValue || depth > 5) return null;
    if (typeof rawValue.r === "number") {
      return {
        r: rawValue.r,
        g: rawValue.g,
        b: rawValue.b,
        a: rawValue.a ?? 1,
      };
    }
    if (rawValue.type === "VARIABLE_ALIAS") {
      const aliasVar = figma.variables.getVariableById(rawValue.id);
      if (aliasVar) {
        // 동일 modeId 우선, 없으면 첫 번째 모드로 fallback (primitive는 모드 1개)
        const modeValue =
          aliasVar.valuesByMode[modeId] ??
          aliasVar.valuesByMode[Object.keys(aliasVar.valuesByMode)[0]];
        return resolveColor(modeValue, depth + 1, modeId);
      }
    }
    return null;
  }

  semCollection.variableIds.forEach((id) => {
    const figmaVar = figma.variables.getVariableById(id);
    if (figmaVar.name.includes("semanticcolor_modified")) return;
    result.semantic[figmaVar.name] = {
      dark: darkModeId
        ? resolveColor(figmaVar.valuesByMode[darkModeId], 0, darkModeId)
        : null,
      light: lightModeId
        ? resolveColor(figmaVar.valuesByMode[lightModeId], 0, lightModeId)
        : null,
    };
  });
}

return JSON.stringify(result);
