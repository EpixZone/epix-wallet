jest.mock("../keyring-bitcoin", () => ({}));

import { KeyRingService } from "./service";
import { KeyInfo } from "./types";

const getAddressHexStringFromKeyInfo = (KeyRingService as any)
  .getAddressHexStringFromKeyInfo;

describe("KeyRingService", () => {
  afterEach(() => {
    (KeyRingService as any).getAddressHexStringFromKeyInfo =
      getAddressHexStringFromKeyInfo;
    jest.restoreAllMocks();
  });

  describe("searchKeyRings", () => {
    it("does not run bech32 address search for name-like queries", () => {
      const keyInfos: KeyInfo[] = [
        createKeyInfo("1", "devx"),
        createKeyInfo("2", "deva"),
        createKeyInfo("3", "dev2"),
        createKeyInfo("4", "main"),
      ];
      const service = createSearchService(keyInfos, {
        getModularChainInfos: jest.fn(() => {
          throw new Error("bech32 address search should not run");
        }),
      });

      const searched = KeyRingService.prototype.searchKeyRings.call(
        service,
        "dev"
      );

      expect(searched.map((keyInfo) => keyInfo.name)).toEqual([
        "devx",
        "deva",
        "dev2",
      ]);
      expect(service.chainsService.getModularChainInfos).not.toHaveBeenCalled();
      expect(
        service.chainsUIService.enabledModularChainInfosForVault
      ).not.toHaveBeenCalled();
    });

    it("does not fall back to enabled chain address scans for invalid bech32 prefixes", () => {
      const keyInfos: KeyInfo[] = [createKeyInfo("1", "main")];
      const service = createSearchService(keyInfos);

      const searched = KeyRingService.prototype.searchKeyRings.call(
        service,
        "dev1x"
      );

      expect(searched).toEqual([]);
      expect(service.chainsService.getModularChainInfos).toHaveBeenCalledTimes(
        1
      );
      expect(
        service.chainsUIService.enabledModularChainInfosForVault
      ).not.toHaveBeenCalled();
    });

    it("still runs bech32 address search for recognized address prefixes", () => {
      const keyInfos: KeyInfo[] = [createKeyInfo("1", "main")];
      const service = createSearchService(keyInfos);
      const getAddressHexString = jest.fn().mockReturnValue("00".repeat(20));
      (KeyRingService as any).getAddressHexStringFromKeyInfo =
        getAddressHexString;

      const searched = KeyRingService.prototype.searchKeyRings.call(
        service,
        "cosmos1"
      );

      expect(searched.map((keyInfo) => keyInfo.name)).toEqual(["main"]);
      expect(getAddressHexString).toHaveBeenCalled();
    });
  });
});

function createKeyInfo(id: string, name: string): KeyInfo {
  return {
    id,
    name,
    type: "mnemonic",
    isSelected: false,
    insensitive: {
      publicKey: "unused",
    },
  };
}

function createSearchService(
  keyInfos: KeyInfo[],
  overrides?: {
    getModularChainInfos?: jest.Mock;
  }
) {
  const cosmosModularChainInfo = {
    type: "cosmos",
    chainId: "cosmoshub-4",
    chainName: "Cosmos Hub",
    cosmos: {
      chainId: "cosmoshub-4",
      chainName: "Cosmos Hub",
      rpc: "",
      rest: "",
      bip44: {
        coinType: 118,
      },
      bech32Config: {
        bech32PrefixAccAddr: "cosmos",
      },
      currencies: [],
      feeCurrencies: [],
      stakeCurrency: {
        coinDenom: "ATOM",
        coinMinimalDenom: "uatom",
        coinDecimals: 6,
      },
      features: [],
    },
  };
  const service = Object.create(KeyRingService.prototype) as any;

  service.getKeyInfos = jest.fn(() => keyInfos);
  service.chainsService = {
    getModularChainInfos:
      overrides?.getModularChainInfos ??
      jest.fn(() => [cosmosModularChainInfo]),
    getModularChainInfoOrThrow: jest.fn(() => cosmosModularChainInfo),
  };
  service.chainsUIService = {
    enabledModularChainInfosForVault: jest.fn(() => [cosmosModularChainInfo]),
    isEnabled: jest.fn(() => true),
  };
  service.cacheKeySearchHexToBech32 = new Map();

  return service;
}
