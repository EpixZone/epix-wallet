jest.mock("../keyring-bitcoin", () => ({}));

import { KeyRingService } from "./service";
import { KeyInfo } from "./types";

describe("KeyRingService", () => {
  describe("searchKeyRings", () => {
    it("does not run bech32 address search for name-like queries", () => {
      const keyInfos: KeyInfo[] = [
        createKeyInfo("1", "devx"),
        createKeyInfo("2", "deva"),
        createKeyInfo("3", "dev2"),
        createKeyInfo("4", "main"),
      ];
      const service = Object.create(KeyRingService.prototype) as any;
      const getModularChainInfos = jest.fn(() => {
        throw new Error("bech32 address search should not run");
      });

      service.getKeyInfos = jest.fn(() => keyInfos);
      service.chainsService = {
        getModularChainInfos,
      };
      service.chainsUIService = {
        enabledModularChainInfosForVault: jest.fn(),
        isEnabled: jest.fn(),
      };
      service.cacheKeySearchHexToBech32 = new Map();

      const searched = KeyRingService.prototype.searchKeyRings.call(
        service,
        "dev",
        true
      );

      expect(searched.map((keyInfo) => keyInfo.name)).toEqual([
        "devx",
        "deva",
        "dev2",
      ]);
      expect(getModularChainInfos).not.toHaveBeenCalled();
    });
  });
});

function createKeyInfo(id: string, name: string): KeyInfo {
  return {
    id,
    name,
    type: "mnemonic",
    isSelected: false,
    insensitive: {},
  };
}
