import { SaxesParser } from "saxes";

export const MAX_SVG_BYTES = 1024 * 1024;
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const COLOR = Symbol("color prop");

// Only static drawing primitives are supported. In particular, scripts, event
// handlers, foreignObject, use, images, styles and external resources cannot be
// carried from a downloaded SVG into the wallet.
const ELEMENTS = [
  "svg",
  "g",
  "path",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "defs",
  "clipPath",
  "mask",
  "linearGradient",
  "radialGradient",
  "stop",
];
const ATTRIBUTES = new Map([
  ...[
    "id",
    "d",
    "points",
    "x",
    "y",
    "x1",
    "x2",
    "y1",
    "y2",
    "cx",
    "cy",
    "r",
    "rx",
    "ry",
    "fx",
    "fy",
    "width",
    "height",
    "viewBox",
    "fill",
    "stroke",
    "opacity",
    "transform",
    "offset",
    "mask",
    "maskUnits",
    "maskContentUnits",
    "clipPathUnits",
    "gradientUnits",
    "gradientTransform",
    "spreadMethod",
    "preserveAspectRatio",
  ].map((name) => [name, name]),
  ["stroke-width", "strokeWidth"],
  ["stroke-linecap", "strokeLinecap"],
  ["stroke-linejoin", "strokeLinejoin"],
  ["stroke-miterlimit", "strokeMiterlimit"],
  ["stroke-dasharray", "strokeDasharray"],
  ["stroke-dashoffset", "strokeDashoffset"],
  ["stroke-opacity", "strokeOpacity"],
  ["fill-rule", "fillRule"],
  ["fill-opacity", "fillOpacity"],
  ["clip-rule", "clipRule"],
  ["clip-path", "clipPath"],
  ["stop-color", "stopColor"],
  ["stop-opacity", "stopOpacity"],
]);

function localReference(value) {
  return /^url\(#[A-Za-z_][A-Za-z0-9_.-]*\)$/u.test(value);
}

function attributeValue(name, value) {
  if (name === "clipPath" || name === "mask") {
    if (value !== "none" && !localReference(value)) {
      throw new Error("SVG resource references must be local fragments");
    }
  }
  if (name === "fill" || name === "stroke" || name === "stopColor") {
    if (
      value !== "none" &&
      value !== "currentColor" &&
      value !== "transparent" &&
      !localReference(value)
    ) {
      if (
        !/^(?:#[0-9a-fA-F]{3,8}|[a-zA-Z]+|rgba?\([0-9.,%\s+-]*\))$/u.test(value)
      ) {
        throw new Error("Unsupported SVG paint value");
      }
      if (name !== "stopColor") return COLOR;
    }
  }
  return value;
}

function parseSvg(content) {
  if (
    typeof content !== "string" ||
    Buffer.byteLength(content) > MAX_SVG_BYTES
  ) {
    throw new Error("SVG exceeds the size limit");
  }
  const parser = new SaxesParser({ xmlns: true });
  const stack = [];
  let root;
  let count = 0;
  const rejectMarkup = () => {
    throw new Error("Unsupported SVG markup");
  };
  parser.on("doctype", rejectMarkup);
  parser.on("processinginstruction", rejectMarkup);
  parser.on("cdata", rejectMarkup);
  parser.on("text", (text) => {
    if (text.trim()) rejectMarkup();
  });
  parser.on("opentag", (tag) => {
    const name = ELEMENTS.find((element) => element === tag.name);
    if (!name || (tag.uri && tag.uri !== SVG_NAMESPACE)) rejectMarkup();
    if (++count > 2000 || stack.length >= 32) {
      throw new Error("SVG exceeds the complexity limit");
    }
    const node = { name, attributes: new Map(), children: [] };
    for (const attribute of Object.values(tag.attributes)) {
      if (attribute.name === "xmlns" && attribute.value === SVG_NAMESPACE) {
        continue;
      }
      const attributeName = ATTRIBUTES.get(attribute.name);
      if (!attributeName || attribute.prefix) rejectMarkup();
      node.attributes.set(
        attributeName,
        attributeValue(attributeName, attribute.value)
      );
    }
    if (stack.length) {
      stack.at(-1).children.push(node);
    } else {
      if (root || name !== "svg") rejectMarkup();
      root = node;
    }
    stack.push(node);
  });
  parser.on("closetag", () => stack.pop());
  parser.write(content).close();
  if (!root) throw new Error("Missing SVG root");
  return root;
}

function stringLiteral(value) {
  // TypeScript's TSX parser still treats these valid JSON characters as source
  // line separators, so escape them along with JSON's quotes and backslashes.
  return JSON.stringify(value)
    .replaceAll("\u2028", String.raw`\u2028`)
    .replaceAll("\u2029", String.raw`\u2029`);
}

function renderElement(node, depth = 2) {
  const indent = "  ".repeat(depth);
  const attributes = Array.from(node.attributes, ([name, value]) => {
    // Values are JavaScript string literals, never interpolated JSX or code.
    const expression = value === COLOR ? "color" : stringLiteral(value);
    return ` ${name}={${expression}}`;
  }).join("");
  if (!node.children.length) return `${indent}<${node.name}${attributes} />`;
  return [
    `${indent}<${node.name}${attributes}>`,
    ...node.children.map((child) => renderElement(child, depth + 1)),
    `${indent}</${node.name}>`,
  ].join("\n");
}

export function generateComponent(componentName, svgContent) {
  if (
    typeof componentName !== "string" ||
    componentName.trim() !== componentName ||
    !/^[A-Z][A-Za-z0-9]*Icon$/u.test(componentName)
  ) {
    throw new Error("Invalid icon component name");
  }
  const root = parseSvg(svgContent);
  const viewBox = root.attributes.get("viewBox") ?? "0 0 24 24";
  // Size, namespace and viewBox are generated separately below. Preserve other
  // drawing attributes on the root, including inherited fill and stroke.
  for (const name of ["width", "height", "viewBox"])
    root.attributes.delete(name);
  const rootAttributes = Array.from(root.attributes, ([name, value]) => {
    const expression = value === COLOR ? "color" : stringLiteral(value);
    return `    ${name}={${expression}}`;
  });

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
    `    viewBox={${stringLiteral(viewBox)}}`,
    `    xmlns="http://www.w3.org/2000/svg"`,
    `    color={color}`,
    ...rootAttributes,
    `    {...props}`,
    `  >`,
    ...root.children.map((node) => renderElement(node)),
    `  </svg>`,
    `);`,
    ``,
  ].join("\n");
}
