import { validateBlocklistRedirect } from "./redirect";

test.each([
  "https://example.com/path?query=1#fragment",
  "http://example.com/path",
])("allows the HTTP(S) URL the user chose: %s", (url) =>
  expect(() => validateBlocklistRedirect(url, url)).not.toThrow()
);

test.each([
  "javascript:alert(1)",
  "data:text/html,<script>alert(1)</script>",
  "file:///etc/passwd",
  "https://user:password@example.com/",
  "not a URL",
])("rejects unsafe navigation: %s", (url) => {
  expect(() => validateBlocklistRedirect(url, url)).toThrow();
});

test("the approval must match the entire requested URL", () => {
  const expected = "https://example.com/requested";
  expect(() =>
    validateBlocklistRedirect(expected, "https://attacker.example/requested")
  ).toThrow();
  expect(() =>
    validateBlocklistRedirect(expected, "https://example.com/other")
  ).toThrow();
  expect(() =>
    validateBlocklistRedirect(expected, { toString: () => expected })
  ).toThrow();
});
