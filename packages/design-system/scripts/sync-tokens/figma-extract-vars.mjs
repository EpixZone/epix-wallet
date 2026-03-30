// figma-use eval script — Extracts Figma Variables (Primitive + Semantic)
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

  // Recursively follow VARIABLE_ALIAS to resolve the actual color value ({r,g,b,a})
  // Pass modeId so alias targets are also resolved in the same mode
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
        // Prefer the same modeId; fall back to the first mode if not found (primitives have only one mode)
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
