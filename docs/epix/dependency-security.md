# Dependency security maintenance

The wallet and documentation site have separate Yarn lockfiles. Run installs
with the repository's Yarn 3.4.1 release and Node 22.22.1 or newer. Audit both
lockfiles, including development dependencies:

```sh
node .yarn/releases/yarn-3.4.1.cjs install --immutable
cd docs
node ../.yarn/releases/yarn-3.4.1.cjs install --immutable
cd ..
trivy fs --scanners vuln --include-dev-deps \
  --skip-dirs node_modules --skip-dirs docs/node_modules .
node .yarn/releases/yarn-3.4.1.cjs test:dependency-security
```

The targeted resolutions keep compatible major versions where patched releases
exist. Version selectors use `package@range`; Yarn 3 does not match the
`package@npm:range` form against ordinary dependency requests.

The `decode-uri-component` Yarn patch changes only the 0.5.0 module export and
package module type to CommonJS. Its upstream security fix is unchanged. The
older `query-string` dependency expects `require()` to return a callable decoder;
the regression test exercises that consumer with valid and malformed URI input.

React Router 7 and protobufjs 7 are required for published security fixes.
StableLib Ed25519 2.1.0 is the maintainer's
[release rejecting non-canonical signatures and public keys](https://github.com/StableLib/stablelib/releases).
The dependency security tests cover an RFC 8032 signing vector and reject
malleable signatures through the actual WalletConnect relay authentication API.

The documentation site uses Docusaurus 3.10.2 to consume supported versions of
its image parser and development server. The WalletConnect example uses Parcel
2 to remove obsolete Parcel 1 dependency chains. Swiper was removed because no
wallet source imported it.

## Elliptic nonce backport

All `elliptic` consumers use the exact CVE-2025-14505 code fix maintained in
[Debian's `node-elliptic` source package, version `6.6.1+dfsg+~6.4.18-2`](https://deb.debian.org/debian/pool/main/n/node-elliptic/node-elliptic_6.6.1+dfsg+~6.4.18-2.debian.tar.xz).
The Yarn patch copies `debian/patches/CVE-2025-14505.patch`; its origin is
[upstream PR 345](https://github.com/indutny/elliptic/pull/345).
The source archive's SHA-256 is
`d13dd705e9389025246a93e39d01732e8e0b8331b84e00fdf632007b4fc95174`, matching
[Debian's source descriptor](https://deb.debian.org/debian/pool/main/n/node-elliptic/node-elliptic_6.6.1+dfsg+~6.4.18-2.dsc).

The fix preserves the full byte count of generated nonces before truncating
them to the curve order's bit length. This matters for P-521 when the generated
66-byte value starts with zero: the original code loses that byte and skips
the required seven-bit shift. Both the original and corrected signatures can
verify, so a sign/verify round trip is not a sufficient regression test.
Custom nonce callbacks and signing input validation are unchanged.

The dependency security suite exercises a deterministic P-521 leading-zero
case against the wallet's independent Noble implementation and a fixed expected
signature. It also compares 256 secp256k1 and 256 P-256 cases with Noble, including
the actual ethers signing consumer, checks custom nonce retries, and preserves
rejection of malformed messages. Elliptic's unmodified v6.6.1 upstream test suite
passes all 226 tests with the backport applied.

The package retains its real name and version, `elliptic@6.6.1`. Upstream has
not published a patched npm release. The complete Trivy scan still reports
the advisory by version despite the installed code fix; do not dismiss or
suppress that finding. Removing the dependency through supported replacements remains the
longer-term path to clearing the version-based alert.

## Remaining scanner findings

The complete scan on September 29, 2026 contains three findings. None are
suppressed or excluded by vulnerability ID:

| Package | Advisory | Scope and remaining work |
| --- | --- | --- |
| `elliptic@6.6.1` | [CVE-2025-14505](https://github.com/advisories/GHSA-848j-6mx2-7j84) | The maintained Debian nonce fix is applied through Yarn, as documented above. The npm version remains affected according to the advisory. Ethereum signing dependencies, browser crypto shims, and the CosmJS test workspace still depend on this package. |
| `extract-zip@1.7.0` | [CVE-2026-19693](https://github.com/advisories/GHSA-7pqw-9j4j-h8q3) | Required by `@storybook/cli@7.6.24` through `puppeteer-core@2.1.1`. Storybook's deprecated `extract` command can invoke its browser downloader. Migrate the extension Storybook setup and legacy MDX stories to a supported newer major to remove this path. |
| `extract-zip@1.7.0` | [CVE-2026-56876](https://github.com/advisories/GHSA-jmr9-qjv8-65gv) | The same development tool dependency. The latest upstream `extract-zip@2.0.1` is also affected, so a version-only override does not fix either finding. |

Of the 293 dependency alerts in the original GitHub code-scanning snapshot,
292 are removed by the updated dependency tree. The remaining original alert is
`elliptic` alert 121. The two `extract-zip` findings are additional findings from
the complete scan. The documentation lockfile has no findings.
