import { BaseAccount } from "@keplr-wallet/cosmos";
import {
  AuthInfo,
  TxBody,
  TxRaw,
} from "@keplr-wallet/proto-types/cosmos/tx/v1beta1/tx";
import { PubKey } from "@keplr-wallet/proto-types/cosmos/crypto/secp256k1/keys";
import { StdFee } from "@keplr-wallet/types";
import { Buffer } from "buffer/";
import { ChainsService } from "../chains/service";
import { ChainsUIService } from "../chains-ui/service";
import { KeyRingCosmosService } from "../keyring-cosmos/service";
import { KeyRingService } from "../keyring/service";
import { BackgroundTxService } from "../tx/service";
import { EpixSwapTransactions } from "./transactions";
import { EpixSwapOperation } from "./types";
import { bridgeMessage, swapMessage } from "./plan";
import { EPIX_CHAIN_ID, OSMOSIS_CHAIN_ID } from "./constants";

const publicKey = new Uint8Array(33).fill(2);
const signature = new Uint8Array(64).fill(3);
const bridgeFee: StdFee = {
  gas: "130000",
  amount: [{ denom: "aepix", amount: "3250000000000000" }],
};
const swapFee: StdFee = {
  gas: "130000",
  amount: [{ denom: "uosmo", amount: "4680" }],
};
const operation: EpixSwapOperation = {
  id: "operation",
  vaultId: "vault",
  sourceAddress: "epix1source",
  destinationAddress: "osmo1destination",
  amountIn: "1000000000000000000",
  outputDenom: "uosmo",
  minimumAmountOut: "990",
  estimatedAmountOut: "1000",
  slippageBps: 100,
  feeDenom: "uosmo",
  bridgeFee,
  swapFeeCap: swapFee,
  sourceRest: "https://epix.example",
  destinationRest: "https://osmosis.example",
  status: "bridging",
  createdAt: 1000,
  updatedAt: 1000,
  expiresAt: 100000,
  packetTimeoutTimestamp: "100000000000",
  depositConfirmed: false,
};
const account = {
  getAccountNumber: () => ({ toString: () => "42" }),
  getSequence: () => ({ toString: () => "7" }),
} as unknown as BaseAccount;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function fixture() {
  const keys = {
    keyRingStatus: "unlocked",
    selectedVaultId: "vault",
    getKeyInfo: () => ({ type: "mnemonic" }),
  };
  const cosmos = {
    getKey: jest.fn(async (_vault: string, chain: string) => ({
      bech32Address:
        chain === EPIX_CHAIN_ID
          ? operation.sourceAddress
          : operation.destinationAddress,
      pubKey: publicKey,
      isNanoLedger: false,
      isKeystone: false,
    })),
    signDirectPreAuthorized: jest.fn(async () => ({
      signature: { signature: Buffer.from(signature).toString("base64") },
    })),
  };
  const chains = {
    getChainInfoOrThrow: (chainId: string) => ({
      chainId,
      rest:
        chainId === EPIX_CHAIN_ID
          ? operation.sourceRest
          : operation.destinationRest,
      features: chainId === EPIX_CHAIN_ID ? ["eth-key-sign"] : [],
    }),
  };
  const broadcast = jest.fn();
  const adapter = new EpixSwapTransactions(
    chains as unknown as ChainsService,
    { isEnabled: () => true } as unknown as ChainsUIService,
    keys as unknown as KeyRingService,
    cosmos as unknown as KeyRingCosmosService,
    { sendTx: broadcast } as unknown as BackgroundTxService
  );
  return { adapter, keys, cosmos, broadcast };
}

beforeEach(() => {
  jest.spyOn(BaseAccount, "fetchFromRest").mockResolvedValue(account);
});
afterEach(() => {
  jest.restoreAllMocks();
});

it.each(["bridge", "swap"] as const)(
  "encodes the exact approved %s message and fee in the signed envelope",
  async (step) => {
    const f = fixture();
    const message =
      step === "bridge"
        ? bridgeMessage(operation)
        : swapMessage(operation, [{ poolId: "1", tokenOutDenom: "uosmo" }]);
    const fee = step === "bridge" ? bridgeFee : swapFee;
    const guard = jest.fn(() => f.adapter.assertContext(operation));
    const bytes = await f.adapter.sign(operation, step, message, fee, guard);
    const raw = TxRaw.decode(bytes);
    expect(TxBody.decode(raw.bodyBytes).messages).toEqual([message]);
    const auth = AuthInfo.decode(raw.authInfoBytes);
    expect(auth.fee).toMatchObject({ gasLimit: fee.gas, amount: fee.amount });
    expect(auth.signerInfos).toHaveLength(1);
    expect(auth.signerInfos[0]).toMatchObject({
      sequence: "7",
      modeInfo: { single: { mode: 1 } },
      publicKey: {
        typeUrl:
          step === "bridge"
            ? "/ethermint.crypto.v1.ethsecp256k1.PubKey"
            : "/cosmos.crypto.secp256k1.PubKey",
        value: PubKey.encode({ key: publicKey }).finish(),
      },
    });
    expect(raw.signatures.map((value) => Array.from(value))).toEqual([
      Array.from(signature),
    ]);
    expect(f.cosmos.signDirectPreAuthorized).toHaveBeenCalledWith(
      expect.any(String),
      "vault",
      step === "bridge" ? EPIX_CHAIN_ID : OSMOSIS_CHAIN_ID,
      step === "bridge"
        ? operation.sourceAddress
        : operation.destinationAddress,
      expect.objectContaining({
        accountNumber: "42",
        bodyBytes: raw.bodyBytes,
        authInfoBytes: raw.authInfoBytes,
      })
    );
    expect(guard).toHaveBeenCalledTimes(2);
    expect(f.broadcast).not.toHaveBeenCalled();
  }
);

it("does not sign when the wallet locks during an account lookup", async () => {
  const f = fixture();
  const fetched = deferred<BaseAccount>();
  jest.mocked(BaseAccount.fetchFromRest).mockReturnValue(fetched.promise);
  const result = f.adapter.sign(
    operation,
    "bridge",
    bridgeMessage(operation),
    bridgeFee,
    () => f.adapter.assertContext(operation)
  );
  const rejected = expect(result).rejects.toThrow("Unlock and select");
  f.keys.keyRingStatus = "locked";
  fetched.resolve(account);
  await rejected;
  expect(f.cosmos.signDirectPreAuthorized).not.toHaveBeenCalled();
  expect(f.broadcast).not.toHaveBeenCalled();
});

it("withholds signed bytes if authorization changes while the signer is pending", async () => {
  const f = fixture();
  const signed = deferred<{ signature: { signature: string } }>();
  const signingStarted = deferred<void>();
  f.cosmos.signDirectPreAuthorized.mockImplementation(() => {
    signingStarted.resolve();
    return signed.promise;
  });
  let authorized = true;
  const guard = () => {
    if (!authorized) throw new Error("Approval ended");
  };
  const result = f.adapter.sign(
    operation,
    "bridge",
    bridgeMessage(operation),
    bridgeFee,
    guard
  );
  await signingStarted.promise;
  expect(f.cosmos.signDirectPreAuthorized).toHaveBeenCalledTimes(1);
  authorized = false;
  signed.resolve({
    signature: { signature: Buffer.from(signature).toString("base64") },
  });
  await expect(result).rejects.toThrow("Approval ended");
  expect(f.broadcast).not.toHaveBeenCalled();
});

it("rejects a changed actual signer before constructing a signed transaction", async () => {
  const f = fixture();
  f.cosmos.getKey.mockResolvedValue({
    bech32Address: "epix1different",
    pubKey: publicKey,
    isNanoLedger: false,
    isKeystone: false,
  });
  await expect(
    f.adapter.sign(
      operation,
      "bridge",
      bridgeMessage(operation),
      bridgeFee,
      () => undefined
    )
  ).rejects.toThrow("reviewed signing account changed");
  expect(f.cosmos.signDirectPreAuthorized).not.toHaveBeenCalled();
});
