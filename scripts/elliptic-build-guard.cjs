/* eslint-disable @typescript-eslint/no-var-requires */
// CommonJS is required by the extension webpack configuration.
const { createRequire } = require("node:module");
const { parse } = createRequire(__filename)("acorn");

function propertyName(node) {
  if (node?.type !== "MemberExpression") return undefined;
  return node.computed ? node.property.value : node.property.name;
}

function walk(node, visit, scope = node) {
  if (!node || typeof node.type !== "string") return;
  if (
    node.type === "FunctionExpression" ||
    node.type === "FunctionDeclaration" ||
    node.type === "ArrowFunctionExpression"
  ) {
    scope = node;
  }
  visit(node, scope);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      for (const child of value) walk(child, visit, scope);
    } else if (value && typeof value === "object") {
      walk(value, visit, scope);
    }
  }
}

function collectPrototypeMethods(tree, label) {
  const scopes = new Map();
  walk(tree, (node, scope) => {
    if (node.type !== "AssignmentExpression") return;
    const method = propertyName(node.left);
    if (method !== "_truncateToN" && method !== "sign") return;
    if (propertyName(node.left.object) !== "prototype") return;
    const owner = node.left.object.object;
    if (owner.type !== "Identifier") {
      throw new Error(`${label}: unrecognized elliptic prototype`);
    }
    if (!scopes.has(scope)) scopes.set(scope, new Map());
    const methods = scopes.get(scope);
    if (!methods.has(owner.name)) methods.set(owner.name, {});
    methods.get(owner.name)[method] = node.right;
  });
  return [...scopes.values()].flatMap((methods) => [...methods.values()]);
}

function isTrueLiteral(node) {
  return (
    node?.value === true ||
    (node?.type === "UnaryExpression" &&
      node.operator === "!" &&
      node.argument.value === 0)
  );
}

function isCallTo(node, name) {
  return node?.type === "CallExpression" && propertyName(node.callee) === name;
}

function assertNoncePreserved(sign, label) {
  const generated = new Set();
  const preserved = new Set();
  walk(sign, (node) => {
    if (isCallTo(node, "generate")) generated.add(node);
    if (
      isCallTo(node, "_truncateToN") &&
      isTrueLiteral(node.arguments[1]) &&
      isCallTo(node.arguments[0], "generate")
    ) {
      preserved.add(node.arguments[0]);
    }
  });
  if (
    generated.size !== 1 ||
    preserved.size !== 1 ||
    !preserved.has([...generated][0])
  ) {
    throw new Error(`${label}: elliptic nonce bytes are not preserved`);
  }
}

// Inspect syntax instead of minified variable names or numbered chunk names.
// This is a regression guard for the elliptic implementation we ship, not a
// general cryptographic audit. Known prototype-based EC implementations must
// preserve the generated nonce array through truncation.
function inspectElliptic(source, label) {
  if (!source.includes("_truncateToN")) return 0;
  const tree = parse(source, { ecmaVersion: "latest", sourceType: "module" });
  let implementations = 0;
  for (const implementation of collectPrototypeMethods(tree, label)) {
    if (!implementation._truncateToN) continue;
    implementations++;
    if (
      !implementation.sign ||
      implementation._truncateToN.params?.length !== 3
    ) {
      throw new Error(`${label}: outdated or unrecognized elliptic EC`);
    }
    assertNoncePreserved(implementation.sign, label);
  }
  return implementations;
}

function inspectModule(resource, source) {
  if (
    resource
      ?.replaceAll("\\", "/")
      .includes("/@ethersproject/signing-key/lib.esm/elliptic.js")
  ) {
    throw new Error(`${resource}: bundled ethers elliptic bypasses our patch`);
  }
  return inspectElliptic(source, resource || "webpack module");
}

class EllipticBuildGuardPlugin {
  apply(compiler) {
    const name = "EllipticBuildGuardPlugin";
    compiler.hooks.thisCompilation.tap(name, (compilation) => {
      compilation.hooks.finishModules.tap(name, (modules) => {
        for (const module of modules) {
          const source = module.originalSource()?.source().toString();
          if (source) inspectModule(module.resource, source);
        }
      });
      compilation.hooks.processAssets.tap(
        {
          name,
          stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_REPORT,
        },
        (assets) => {
          let count = 0;
          for (const [filename, asset] of Object.entries(assets)) {
            if (filename.endsWith(".js")) {
              count += inspectElliptic(asset.source().toString(), filename);
            }
          }
          if (count === 0) {
            throw new Error("No patched elliptic EC found in browser assets");
          }
        }
      );
    });
  }
}

module.exports = { inspectElliptic, inspectModule, EllipticBuildGuardPlugin };
