# Transfer a wallet to another device

Use a current Epix Wallet build on both devices. EpixNet includes a pinned
wallet build, so update EpixNet to receive its bundled wallet changes.

1. On the sending device, select the wallet you want to transfer.
2. Open **Settings > Transfer to another device**.
3. Enter the sending wallet's password. Choose and confirm a separate transfer
   password with at least 12 characters, preferably several random words.
4. Select **Create QR code**.
5. On the receiving device, open Epix Wallet and select **Scan QR code**. This
   option is also available under **Import an existing wallet**.
6. Select **Open camera**, allow camera access, and scan the sending device's QR.
7. Enter the transfer password on the receiving device. Confirm the wallet name
   and choose the receiving wallet's password when prompted, then finish the
   normal import.

Each QR transfers the selected recovery phrase or private key wallet. Repeat
for additional wallets. Hardware wallets must be connected separately. The
wallet name and recovery phrase account/change/address index are preserved.
Contacts, custom networks, and other preferences are not copied.

The QR contains encrypted wallet data. Nothing is uploaded. Keep both the QR
and transfer password private, and only scan codes you created yourself.
Transfers expire in the receiving app after five minutes; the sending device
also hides the QR when its page is hidden. A saved QR is still encrypted data, so
expiry does not make a captured copy safe to share.

The transfer QR is static. Keep the entire code and its white border in the
camera preview and hold steady for focus. The scanner requests HD video when
available; lower-resolution cameras remain supported. The preview shows the
whole camera frame without cropping its edges.

If the camera is unavailable, allow camera access for EpixNet or your browser
and try again. An unrelated QR is ignored. If decryption fails, check the
transfer password and device clocks, or create a fresh transfer.

## Transfer format

Version 1 uses the `epix-wallet:1:` prefix followed by a JSON envelope with
base64 `salt` (16 bytes), `iv` (12 bytes), and `data` (ciphertext plus tag).
PBKDF2-HMAC-SHA256 with 600,000 iterations derives a non-exportable AES-256-GCM
key from the separate transfer password. The prefix is authenticated additional
data. Salt and IV come from the browser's cryptographic random generator.

The authenticated plaintext contains the account and expiration time. The
receiver bounds the entire QR to 1,800 characters, validates the envelope before
key derivation, validates the mnemonic or secp256k1 private scalar, and validates
derivation indices before entering the existing wallet creation flow. QR data,
passwords, and secrets are never logged or persisted by the transfer UI.
