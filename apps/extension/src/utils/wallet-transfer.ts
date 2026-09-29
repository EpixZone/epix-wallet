import { validateMnemonic } from "bip39";

// Self-contained, offline transfer. The password is entered separately on the
// receiving device and is never encoded in the QR or sent to a server.
const PREFIX = "epix-wallet:1:";
export const WALLET_TRANSFER_LIFETIME_MS = 5 * 60 * 1000;
export const MAX_WALLET_TRANSFER_LENGTH = 1800;
const ITERATIONS = 600000;
const encoder = new TextEncoder();

export type WalletTransferAccount = {
  name: string;
} & (
  | {
      type: "mnemonic";
      secret: string;
      bip44Path: { account: number; change: number; addressIndex: number };
    }
  | { type: "private-key"; secret: string }
);

const invalid = () => new Error("Invalid wallet transfer");

export function validateTransferAccount(value: unknown): WalletTransferAccount {
  if (!value || typeof value !== "object") throw invalid();
  const account = value as WalletTransferAccount;
  if (
    typeof account.name !== "string" ||
    !account.name.trim() ||
    account.name.length > 128 ||
    typeof account.secret !== "string"
  ) {
    throw invalid();
  }
  if (account.type === "mnemonic") {
    const path = account.bip44Path;
    if (
      account.secret.length > 512 ||
      !validateMnemonic(account.secret) ||
      !path ||
      ![path.account, path.addressIndex].every(
        (n) => Number.isInteger(n) && n >= 0 && n < 0x80000000
      ) ||
      (path.change !== 0 && path.change !== 1)
    ) {
      throw invalid();
    }
    return {
      type: "mnemonic",
      name: account.name,
      secret: account.secret,
      bip44Path: {
        account: path.account,
        change: path.change,
        addressIndex: path.addressIndex,
      },
    };
  }
  if (account.type === "private-key") {
    // Reject zero and out-of-range secp256k1 scalars before import.
    const hex = account.secret.toLowerCase();
    if (
      hex.length !== 64 ||
      !/^[0-9a-f]{64}$/.test(hex) ||
      /^0+$/.test(hex) ||
      hex >= "fffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141"
    ) {
      throw invalid();
    }
    return { type: "private-key", name: account.name, secret: hex };
  }
  throw invalid();
}

function fromBase64(value: unknown, maxBytes: number): Uint8Array {
  if (
    typeof value !== "string" ||
    value.length > Math.ceil(maxBytes / 3) * 4 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      value
    )
  ) {
    throw invalid();
  }
  const bytes = Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
  if (bytes.length > maxBytes || toBase64(bytes) !== value) throw invalid();
  return bytes;
}

function toBase64(value: Uint8Array): string {
  return btoa(String.fromCharCode(...value));
}

function parseEnvelope(text: string) {
  if (text.length > MAX_WALLET_TRANSFER_LENGTH || !text.startsWith(PREFIX)) {
    throw invalid();
  }
  const envelope = JSON.parse(text.slice(PREFIX.length));
  const salt = fromBase64(envelope.salt, 16);
  const iv = fromBase64(envelope.iv, 12);
  const ciphertext = fromBase64(envelope.data, 1200);
  if (salt.length !== 16 || iv.length !== 12 || ciphertext.length < 17) {
    throw invalid();
  }
  return { salt, iv, ciphertext };
}

export function isWalletTransfer(text: string): boolean {
  try {
    parseEnvelope(text);
    return true;
  } catch {
    return false;
  }
}

async function deriveKey(password: string, salt: Uint8Array) {
  if (password.length < 12 || password.length > 256) throw invalid();
  const material = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function createWalletTransfer(
  account: WalletTransferAccount,
  password: string,
  now = Date.now()
): Promise<{ qr: string; expiresAt: number }> {
  const validated = validateTransferAccount(account);
  const expiresAt = now + WALLET_TRANSFER_LIFETIME_MS;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const plaintext = encoder.encode(
    JSON.stringify({ account: validated, expiresAt })
  );
  try {
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: encoder.encode(PREFIX) },
      key,
      plaintext
    );
    const qr =
      PREFIX +
      JSON.stringify({
        salt: toBase64(salt),
        iv: toBase64(iv),
        data: toBase64(new Uint8Array(ciphertext)),
      });
    if (qr.length > MAX_WALLET_TRANSFER_LENGTH) throw invalid();
    return { qr, expiresAt };
  } finally {
    plaintext.fill(0);
  }
}

export async function openWalletTransfer(
  text: string,
  password: string,
  now = Date.now()
): Promise<WalletTransferAccount> {
  const { salt, iv, ciphertext } = parseEnvelope(text);
  const key = await deriveKey(password, salt);
  const plaintext = new Uint8Array(
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv, additionalData: encoder.encode(PREFIX) },
      key,
      ciphertext
    )
  );
  try {
    const payload = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(plaintext)
    );
    if (
      !Number.isSafeInteger(payload.expiresAt) ||
      payload.expiresAt <= now ||
      payload.expiresAt > now + WALLET_TRANSFER_LIFETIME_MS + 30000
    ) {
      throw invalid();
    }
    return validateTransferAccount(payload.account);
  } finally {
    plaintext.fill(0);
  }
}
