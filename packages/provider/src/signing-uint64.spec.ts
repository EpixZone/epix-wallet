import Long from "long";
import { webcrypto } from "crypto";
import { Keplr } from "./core";
import { InjectedKeplr } from "./inject";
import { MessageRequester } from "@keplr-wallet/router";

const chainId = "epix_6381917-1";
const values = [
  "0",
  "1",
  "9007199254740991",
  "9007199254740992",
  "9007199254740993",
  "9223372036854775807",
  "9223372036854775808",
  "9223372036854775809",
  "18446744073709551615",
];

function fixture() {
  const listeners = new Set<(event: any) => void>();
  const bus = {
    addMessageListener: (listener: (event: any) => void) => {
      listeners.add(listener);
    },
    removeMessageListener: (listener: (event: any) => void) => {
      listeners.delete(listener);
    },
    postMessage: (data: any) => {
      for (const listener of [...listeners]) {
        Promise.resolve().then(() => listener({ data }));
      }
    },
  };
  // The only double is the background approval boundary. No key is read and
  // nothing is signed or broadcast. Page, content bridge and core run as shipped.
  const approve = jest.fn(async (_port: string, message: any) => ({
    signed: message.signDoc,
    signature: { pub_key: { type: "fixture", value: "" }, signature: "" },
  }));
  const core = new Keplr("fixture", "core", {
    sendMessage: approve,
  } as unknown as MessageRequester);
  const stop = InjectedKeplr.startProxy(core, undefined, bus);
  // Avoid unrelated Ethereum-provider browser listeners in the constructor.
  // All Cosmos request/response methods and the content bridge remain real.
  const page = Object.assign(Object.create(InjectedKeplr.prototype), {
    eventListener: bus,
    defaultOptions: {},
  }) as InjectedKeplr;
  return { page, core, approve, stop, listeners };
}

const cryptoDescriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto");
beforeAll(() => {
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: webcrypto,
  });
});
afterAll(() => {
  if (cryptoDescriptor) {
    Object.defineProperty(globalThis, "crypto", cryptoDescriptor);
  } else {
    Reflect.deleteProperty(globalThis, "crypto");
  }
});
beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe.each(["signDirect", "signDirectAux"] as const)(
  "%s uint64 bridge",
  (method) => {
    test.each(values)(
      "preserves %s through page, content bridge and core",
      async (value) => {
        const { page, core, approve, stop, listeners } = fixture();
        try {
          for (const provider of [page, core]) {
            const signed = await provider[method](chainId, "fixture-signer", {
              chainId,
              bodyBytes: new Uint8Array(),
              accountNumber: Long.fromString(value, true),
              sequence: Long.fromString(value, true),
            });
            const sent =
              approve.mock.calls[approve.mock.calls.length - 1][1].signDoc;
            expect(sent.accountNumber).toBe(value);
            expect(signed.signed.accountNumber.toString()).toBe(value);
            expect(signed.signed.accountNumber.unsigned).toBe(true);
            if ("sequence" in signed.signed) {
              expect(sent.sequence).toBe(value);
              expect(signed.signed.sequence.toString()).toBe(value);
              expect(signed.signed.sequence.unsigned).toBe(true);
            }
          }
          expect(listeners.size).toBe(1);
        } finally {
          stop();
        }
      }
    );

    test.each([
      -1,
      Long.NEG_ONE,
      1.5,
      9007199254740992,
      "-1",
      "1e3",
      "01",
      "18446744073709551616",
    ])(
      "rejects unsafe account input %s before requesting approval",
      async (value) => {
        const { page, core, approve, stop } = fixture();
        try {
          for (const provider of [page, core]) {
            await expect(
              provider[method](chainId, "fixture-signer", {
                chainId,
                accountNumber: value as unknown as Long,
                sequence: Long.UZERO,
              })
            ).rejects.toThrow(/uint64/);
          }
          expect(approve).not.toHaveBeenCalled();
        } finally {
          stop();
        }
      }
    );

    test.each([0, BigInt(0), 1, 34391, BigInt("18446744073709551615")])(
      "keeps safe numeric input %s exact",
      async (value) => {
        const { page, core, stop } = fixture();
        try {
          for (const provider of [page, core]) {
            const response = await provider[method](chainId, "fixture-signer", {
              chainId,
              accountNumber: value as unknown as Long,
              sequence: value as unknown as Long,
            });
            expect(response.signed.accountNumber.toString()).toBe(
              String(value)
            );
            if ("sequence" in response.signed)
              expect(response.signed.sequence.toString()).toBe(String(value));
          }
        } finally {
          stop();
        }
      }
    );

    test.each([null, undefined])(
      "preserves optional %s inputs for background defaults",
      async (value) => {
        const { page, core, approve, stop } = fixture();
        approve.mockImplementation(async (_port, message) => ({
          signed: {
            ...message.signDoc,
            accountNumber: message.signDoc.accountNumber ?? "0",
            ...(method === "signDirectAux"
              ? { sequence: message.signDoc.sequence ?? "0" }
              : {}),
          },
          signature: { pub_key: { type: "fixture", value: "" }, signature: "" },
        }));
        try {
          for (const provider of [page, core]) {
            const response = await provider[method](chainId, "fixture-signer", {
              chainId,
              accountNumber: value,
              sequence: value,
            });
            const sent =
              approve.mock.calls[approve.mock.calls.length - 1][1].signDoc;
            expect(sent.accountNumber).toBeNull();
            expect(response.signed.accountNumber.toString()).toBe("0");
            expect(response.signed.accountNumber.unsigned).toBe(true);
            if ("sequence" in response.signed) {
              expect(sent.sequence).toBeNull();
              expect(response.signed.sequence.toString()).toBe("0");
              expect(response.signed.sequence.unsigned).toBe(true);
            }
          }
        } finally {
          stop();
        }
      }
    );

    test("rejects malformed returned account values instead of wrapping them", async () => {
      const { page, core, approve, stop } = fixture();
      try {
        for (const value of ["-1", "18446744073709551616", 9007199254740992]) {
          approve.mockImplementation(async (_port, message) => ({
            signed: { ...message.signDoc, accountNumber: value },
            signature: {
              pub_key: { type: "fixture", value: "" },
              signature: "",
            },
          }));
          for (const provider of [page, core]) {
            await expect(
              provider[method](chainId, "fixture-signer", {
                chainId,
                accountNumber: Long.UZERO,
                sequence: Long.UZERO,
              })
            ).rejects.toThrow(/uint64/);
          }
        }
      } finally {
        stop();
      }
    });
  }
);

test.each([
  -1,
  Long.NEG_ONE,
  1.5,
  9007199254740992,
  "-1",
  "1e3",
  "18446744073709551616",
])(
  "rejects malformed DirectAux sequence %s on requests and responses",
  async (value) => {
    const { page, core, approve, stop } = fixture();
    try {
      for (const provider of [page, core]) {
        await expect(
          provider.signDirectAux(chainId, "fixture-signer", {
            chainId,
            accountNumber: Long.UZERO,
            sequence: value as unknown as Long,
          })
        ).rejects.toThrow(/uint64/);
      }
      expect(approve).not.toHaveBeenCalled();
      approve.mockImplementation(async (_port, message) => ({
        signed: { ...message.signDoc, sequence: value },
        signature: { pub_key: { type: "fixture", value: "" }, signature: "" },
      }));
      for (const provider of [page, core]) {
        await expect(
          provider.signDirectAux(chainId, "fixture-signer", {
            chainId,
            accountNumber: Long.UZERO,
            sequence: Long.UZERO,
          })
        ).rejects.toThrow(/uint64/);
      }
    } finally {
      stop();
    }
  }
);
