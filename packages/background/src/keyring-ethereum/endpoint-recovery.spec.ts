import { KeyRingEthereumService } from "./service";
import { Env } from "@keplr-wallet/router";
import { simpleFetch } from "@keplr-wallet/simple-fetch";

jest.mock("../keyring-cosmos", () => ({}));
jest.mock("@keplr-wallet/simple-fetch", () => ({ simpleFetch: jest.fn() }));

it.each([false, true])(
  "rechecks existing Epix without duplicating chain 1916 or trusting dapp endpoints (health failure: %s)",
  async (healthFails) => {
    const warn = jest
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    const known = { chainId: "epix_1916-1" };
    const chains = {
      getChainInfoByEVMChainId: jest.fn(() => known),
      checkEndpointHealth: jest.fn(async () => {
        if (healthFails) throw new Error("storage failed");
      }),
      suggestChainInfo: jest.fn(),
    };
    const permissions = {
      addPermission: jest.fn(),
      updateCurrentChainIdForEVM: jest.fn(async () => undefined),
    };
    const service = new KeyRingEthereumService(
      chains as any,
      undefined as any,
      undefined as any,
      undefined as any,
      undefined as any,
      permissions as any,
      undefined as any,
      undefined as any,
      undefined as any
    );
    const params = {
      chainId: "0x77c",
      get rpcUrls(): string[] {
        throw new Error("untrusted URLs must not be read");
      },
    };
    try {
      await expect(
        service.request(
          { isInternalMsg: false } as Env,
          "https://dapp.test",
          "wallet_addEthereumChain",
          [params]
        )
      ).resolves.toBeNull();
      expect(chains.getChainInfoByEVMChainId).toHaveBeenCalledWith(1916);
      expect(chains.checkEndpointHealth).toHaveBeenCalledWith(
        "epix_1916-1",
        "connect"
      );
      expect(chains.suggestChainInfo).not.toHaveBeenCalled();
      expect(permissions.addPermission.mock.calls[0][0]).toEqual([
        "epix_1916-1",
      ]);
      expect(permissions.updateCurrentChainIdForEVM).toHaveBeenCalledWith(
        expect.anything(),
        "https://dapp.test",
        "epix_1916-1"
      );
      expect(warn).toHaveBeenCalledTimes(healthFails ? 1 : 0);
    } finally {
      warn.mockRestore();
    }
  }
);

function receiptProvider(readChain: () => unknown) {
  return new KeyRingEthereumService(
    { getModularChainInfoOrThrow: readChain } as any,
    undefined as any,
    undefined as any,
    undefined as any,
    undefined as any,
    undefined as any,
    undefined as any,
    undefined as any,
    undefined as any
  );
}

it("provider receipt entry rejects an old full revision while preserving bare identifier requests", async () => {
  const fetchMock = simpleFetch as jest.Mock;
  fetchMock
    .mockReset()
    .mockResolvedValue({ data: { result: { transactionHash: "0xabc" } } });
  const service = receiptProvider(() => ({
    type: "ethermint",
    chainId: "epix_1916-2",
    evm: { rpc: "https://b.test" },
  }));
  const read = (chainId: string) =>
    service.request(
      { isInternalMsg: true } as Env,
      "extension",
      "eth_getTransactionReceipt",
      ["0xabc"],
      undefined,
      chainId
    );
  await expect(read("epix_1916-1")).rejects.toThrow("network has changed");
  expect(fetchMock).not.toHaveBeenCalled();
  await expect(read("epix_1916")).resolves.toEqual({
    transactionHash: "0xabc",
  });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0][0]).toBe("https://b.test");
});

it.each([true, false])(
  "provider held receipt checks full identity while permitting endpoint replacement (revision changes: %s)",
  async (revisionChanges) => {
    let current = {
      type: "ethermint",
      chainId: "epix_1916-1",
      evm: { rpc: "https://a.test" },
    };
    let release!: (value: unknown) => void;
    const held = new Promise((resolve) => {
      release = resolve;
    });
    const fetchMock = simpleFetch as jest.Mock;
    fetchMock.mockReset().mockReturnValue(held);
    const service = receiptProvider(() => current);
    const pending = service.request(
      { isInternalMsg: true } as Env,
      "extension",
      "eth_getTransactionReceipt",
      ["0xabc"],
      undefined,
      "epix_1916-1"
    );
    current = {
      ...current,
      chainId: revisionChanges ? "epix_1916-2" : current.chainId,
      evm: { rpc: "https://b.test" },
    };
    release({ data: { result: { transactionHash: "0xabc" } } });
    if (revisionChanges)
      await expect(pending).rejects.toThrow("network has changed");
    else await expect(pending).resolves.toEqual({ transactionHash: "0xabc" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("https://a.test");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      method: "eth_getTransactionReceipt",
      params: ["0xabc"],
    });
  }
);
