import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { generateComponent, MAX_SVG_BYTES } from "./svg-component.mjs";

function render(svg, props = {}) {
  const source = generateComponent("TestIcon", svg);
  const result = ts.transpileModule(source, {
    fileName: "test-icon.tsx",
    compilerOptions: {
      jsx: ts.JsxEmit.React,
      module: ts.ModuleKind.CommonJS,
    },
    reportDiagnostics: true,
  });
  assert.deepEqual(result.diagnostics, []);
  const react = {
    createElement: (name, attributes, ...children) => ({
      name,
      attributes,
      children,
    }),
  };
  const context = {
    exports: {},
    require: (name) => {
      assert.equal(name, "react");
      return { default: react };
    },
  };
  vm.runInNewContext(result.outputText, context, { timeout: 1000 });
  return JSON.parse(JSON.stringify(context.exports.TestIcon(props)));
}

test("generates the existing sizing, inherited paint, and stroke semantics", () => {
  const icon = render(
    `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path d="M12 19V5M12 5L5 12M12 5L19 12" stroke="#123456" stroke-width="2" stroke-linecap="round"/>
    </svg>`,
    { size: 32, color: "red", "aria-label": "Up" }
  );
  assert.equal(icon.name, "svg");
  assert.equal(icon.attributes.width, 32);
  assert.equal(icon.attributes.height, 32);
  assert.equal(icon.attributes.viewBox, "0 0 24 24");
  assert.equal(icon.attributes.fill, "none");
  assert.equal(icon.attributes["aria-label"], "Up");
  assert.equal(icon.children[0].attributes.stroke, "red");
  assert.equal(icon.children[0].attributes.strokeWidth, "2");
  assert.equal(icon.children[0].attributes.strokeLinecap, "round");
});

test("preserves nested clipping, gradients, and local resource references", () => {
  const icon = render(`<svg viewBox="0 0 24 24">
    <defs>
      <clipPath id="clip"><rect width="24" height="24"/></clipPath>
      <linearGradient id="gradient" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#000"/>
      </linearGradient>
    </defs>
    <g clip-path="url(#clip)"><path fill="url(#gradient)" d="M0 0h24v24z"/></g>
  </svg>`);
  assert.equal(icon.children[0].name, "defs");
  assert.equal(
    icon.children[0].children[1].children[0].attributes.stopColor,
    "#fff"
  );
  assert.equal(icon.children[1].attributes.clipPath, "url(#clip)");
  assert.equal(icon.children[1].children[0].attributes.fill, "url(#gradient)");
});

test("viewBox and attribute injection remain inert strings in generated TSX", () => {
  const payload = '"} onLoad={() => {throw Error("executed")}} {...{} }';
  const encoded = payload.replaceAll('"', "&quot;");
  const icon = render(
    `<svg viewBox="${encoded}"><path d="${encoded}" id="&#123;throw Error(&quot;executed&quot;)&#125;"/></svg>`
  );
  assert.equal(icon.attributes.viewBox, payload);
  assert.equal(icon.children[0].attributes.d, payload);
  assert.equal(icon.children[0].attributes.id, '{throw Error("executed")}');
  assert.equal(icon.attributes.onLoad, undefined);
});

test("Unicode line separators cannot break generated TSX string literals", () => {
  const payload = "\u2028\u2029}throw Error('executed');//";
  const icon = render(
    `<svg viewBox="${payload}" id="${payload}"><path d="${payload}"/></svg>`
  );
  assert.equal(icon.attributes.viewBox, payload);
  assert.equal(icon.attributes.id, payload);
  assert.equal(icon.children[0].attributes.d, payload);
});

for (const [description, svg] of [
  ["JSX expressions", "<svg>{(() => {throw Error('executed')})()}</svg>"],
  ["entity-encoded JSX", "<svg>&#123;alert(1)&#125;</svg>"],
  ["scripts", "<svg><script>alert(1)</script></svg>"],
  ["HTML", "<svg><foreignObject><div/></foreignObject></svg>"],
  ["event handlers", '<svg><path onload="alert(1)"/></svg>'],
  ["React event handlers", '<svg onLoad="alert(1)"/>'],
  ["styles", '<svg><path style="fill:url(https://example.com/image)"/></svg>'],
  ["style elements", "<svg><style>path {fill:red}</style></svg>"],
  ["images", '<svg><image href="https://example.com/image"/></svg>'],
  ["use", '<svg><use href="#shape"/></svg>'],
  ["href", '<svg><path href="javascript:alert(1)"/></svg>'],
  [
    "namespaced href",
    '<svg xmlns:xlink="http://www.w3.org/1999/xlink"><path xlink:href="javascript:alert(1)"/></svg>',
  ],
  [
    "external paint",
    '<svg><path fill="url(https://example.com/image)"/></svg>',
  ],
  [
    "external clipping",
    '<svg><path clip-path="url(https://example.com/image)"/></svg>',
  ],
  ["external mask", '<svg><path mask="url(https://example.com/image)"/></svg>'],
  [
    "entity-encoded external paint",
    '<svg><path fill="&#117;rl(https://example.com/image)"/></svg>',
  ],
  [
    "DOCTYPE",
    '<!DOCTYPE svg [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><svg/>',
  ],
  [
    "processing instructions",
    '<?xml-stylesheet href="https://example.com/style"?><svg/>',
  ],
  ["CDATA", "<svg><![CDATA[{alert(1)}]]></svg>"],
  ["foreign namespaces", '<svg xmlns="http://www.w3.org/1999/xhtml"/>'],
  ["multiple roots", "<svg/><svg/>"],
  ["mismatched tags", "<svg><path></svg>"],
  ["duplicate attributes", '<svg viewBox="safe" viewBox="unsafe"/>'],
]) {
  test(`rejects ${description}`, () => {
    assert.throws(() => generateComponent("TestIcon", svg));
  });
}

test("limits downloaded size, tree depth and node count", () => {
  assert.throws(
    () => generateComponent("TestIcon", " ".repeat(MAX_SVG_BYTES + 1)),
    /size limit/
  );
  assert.throws(
    () =>
      generateComponent(
        "TestIcon",
        `<svg>${"<g>".repeat(32)}${"</g>".repeat(32)}</svg>`
      ),
    /complexity limit/
  );
  assert.throws(
    () => generateComponent("TestIcon", `<svg>${"<path/>".repeat(2000)}</svg>`),
    /complexity limit/
  );
});

test("rejects invalid component identifiers", () => {
  for (const name of [
    "TestIcon\n",
    "TestIcon;throw Error()",
    "1Icon",
    "",
    null,
  ]) {
    assert.throws(() => generateComponent(name, "<svg/>"));
  }
});

test("supports every existing icon's drawing markup", () => {
  const directory = new URL(
    "../../src/foundation/icon/components/",
    import.meta.url
  );
  const names = fs
    .readdirSync(directory)
    .filter((name) => name.endsWith(".tsx"));
  assert.ok(names.length > 0);
  for (const name of names) {
    const source = fs.readFileSync(new URL(name, directory), "utf8");
    const svg = source
      .slice(source.indexOf("<svg"), source.lastIndexOf("</svg>") + 6)
      .replaceAll("{...props}", "")
      .replaceAll("{size}", '"24"')
      .replaceAll("{color}", '"#123456"')
      .replace(/\b([a-z]+)([A-Z][a-z]+)=/g, (_, first, second) => {
        const attribute = first + second;
        return ["viewBox", "clipPathUnits"].includes(attribute)
          ? `${attribute}=`
          : `${first}-${second.toLowerCase()}=`;
      });
    assert.doesNotThrow(() => render(svg), name);
  }
});
