import { webcrypto } from "crypto";
import {
  createWalletTransfer,
  isWalletTransfer,
  MAX_WALLET_TRANSFER_LENGTH,
  openWalletTransfer,
  validateTransferAccount,
  WALLET_TRANSFER_LIFETIME_MS,
  WalletTransferAccount,
} from "./wallet-transfer";

Object.defineProperty(globalThis, "crypto", {
  value: webcrypto,
  configurable: true,
});
const password = "several random transfer words";
const now = 1700000000000;
const account: WalletTransferAccount = {
  type: "mnemonic",
  name: "Android wallet",
  secret:
    "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about",
  bip44Path: { account: 4, change: 1, addressIndex: 9 },
};

describe("offline wallet QR transfer", () => {
  it("round trips the name, secret and non-default derivation path without plaintext in the QR", async () => {
    const { qr, expiresAt } = await createWalletTransfer(
      account,
      password,
      now
    );
    expect(expiresAt).toBe(now + WALLET_TRANSFER_LIFETIME_MS);
    expect(isWalletTransfer(qr)).toBe(true);
    expect(qr).not.toContain(account.secret);
    expect(qr).not.toContain(account.name);
    expect(qr).not.toContain(password);
    expect(qr.length).toBeLessThanOrEqual(MAX_WALLET_TRANSFER_LENGTH);
    expect(await openWalletTransfer(qr, password, now)).toEqual(account);
  });

  it("supports private keys and produces fresh salt and nonce for each export", async () => {
    const key: WalletTransferAccount = {
      type: "private-key",
      name: "Imported key",
      secret: "1".repeat(64),
    };
    const first = await createWalletTransfer(key, password, now);
    const second = await createWalletTransfer(key, password, now);
    expect(first.qr).not.toEqual(second.qr);
    expect(await openWalletTransfer(first.qr, password, now)).toEqual(key);
  });

  it("rejects an incorrect password and altered ciphertext, salt or IV", async () => {
    const { qr } = await createWalletTransfer(account, password, now);
    await expect(
      openWalletTransfer(qr, "a different transfer password", now)
    ).rejects.toThrow();
    const prefix = "epix-wallet:1:";
    for (const field of ["data", "salt", "iv"]) {
      const envelope = JSON.parse(qr.slice(prefix.length));
      const bytes = Buffer.from(envelope[field], "base64");
      bytes[0] ^= 1;
      envelope[field] = bytes.toString("base64");
      await expect(
        openWalletTransfer(prefix + JSON.stringify(envelope), password, now)
      ).rejects.toThrow();
    }
  });

  it("rejects expired or implausibly future-dated transfers", async () => {
    const { qr, expiresAt } = await createWalletTransfer(
      account,
      password,
      now
    );
    await expect(openWalletTransfer(qr, password, expiresAt)).rejects.toThrow();
    await expect(
      openWalletTransfer(qr, password, now - 60000)
    ).rejects.toThrow();
  });

  it.each([
    "https://example.com",
    "epix-wallet:2:{}",
    "epix-wallet:1:null",
    "epix-wallet:1:{}",
    "epix-wallet:1:" + "a".repeat(2000),
  ])("rejects malformed or oversized QR input", (qr) => {
    expect(isWalletTransfer(qr)).toBe(false);
  });

  it("rejects weak transfer passwords", async () => {
    await expect(createWalletTransfer(account, "short", now)).rejects.toThrow();
  });

  it("rejects noncanonical base64 rather than accepting trailing whitespace", () => {
    const envelope = {
      salt: Buffer.alloc(16).toString("base64"),
      iv: Buffer.alloc(12).toString("base64"),
      data: Buffer.alloc(17).toString("base64"),
    };
    expect(isWalletTransfer("epix-wallet:1:" + JSON.stringify(envelope))).toBe(
      true
    );
    envelope.salt += "\n";
    expect(isWalletTransfer("epix-wallet:1:" + JSON.stringify(envelope))).toBe(
      false
    );
  });

  it("rejects invalid secrets and derivation paths", () => {
    for (const invalid of [
      { ...account, secret: "not a recovery phrase" },
      { ...account, type: "ledger" },
      { ...account, bip44Path: { account: -1, change: 0, addressIndex: 0 } },
      { ...account, bip44Path: { account: 0, change: 2, addressIndex: 0 } },
      {
        ...account,
        bip44Path: { account: 0, change: 0, addressIndex: 0x80000000 },
      },
      { ...account, name: "x".repeat(129) },
      { type: "private-key", name: "Key", secret: "0".repeat(64) },
      { type: "private-key", name: "Key", secret: "f".repeat(64) },
      { type: "private-key", name: "Key", secret: "1".repeat(64) + "\n" },
    ]) {
      expect(() => validateTransferAccount(invalid)).toThrow();
    }
  });
});
