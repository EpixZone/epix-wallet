export function validateBlocklistRedirect(
  expected: string,
  allowed: unknown
): void {
  if (typeof allowed !== "string") {
    throw new TypeError("Invalid allowed URL");
  }

  const url = new URL(expected);
  const allowedUrl = new URL(allowed);
  if (
    (url.protocol !== "https:" && url.protocol !== "http:") ||
    url.username ||
    url.password ||
    url.href !== allowedUrl.href
  ) {
    throw new Error("Invalid blocklist redirect");
  }
}
