import { isBlockedTokenFactoryAtomCurrency } from "./currency-registrar";

describe("TokenFactoryCurrencyRegistrar", () => {
  describe("isBlockedTokenFactoryAtomCurrency", () => {
    it("blocks token factory currencies with atom in the subdenom", () => {
      expect(
        isBlockedTokenFactoryAtomCurrency({
          coinDenom: "ATOMAP",
          coinMinimalDenom:
            "factory/neutron1d59rkwmkt6f46aeyra6zfk6ghehlsqc2qevw96c6x4xfmyk4qxhsjh8ajn/ATOMAP",
        })
      ).toBe(true);

      expect(
        isBlockedTokenFactoryAtomCurrency({
          coinDenom: "REWARDATOM",
          coinMinimalDenom:
            "factory/neutron1d59rkwmkt6f46aeyra6zfk6ghehlsqc2qevw96c6x4xfmyk4qxhsjh8ajn/REWARDATOM",
        })
      ).toBe(true);
    });

    it("blocks token factory currencies with atom in the display denom", () => {
      expect(
        isBlockedTokenFactoryAtomCurrency({
          coinDenom: "ATOMEREWARD",
          coinMinimalDenom:
            "factory/neutron1d59rkwmkt6f46aeyra6zfk6ghehlsqc2qevw96c6x4xfmyk4qxhsjh8ajn/reward",
        })
      ).toBe(true);
    });

    it("does not block non-token-factory atom currencies", () => {
      expect(
        isBlockedTokenFactoryAtomCurrency({
          coinDenom: "stATOM",
          coinMinimalDenom: "ibc/abc",
        })
      ).toBe(false);
    });

    it("does not block unrelated token factory currencies", () => {
      expect(
        isBlockedTokenFactoryAtomCurrency({
          coinDenom: "NTRN",
          coinMinimalDenom:
            "factory/neutron1d59rkwmkt6f46aeyra6zfk6ghehlsqc2qevw96c6x4xfmyk4qxhsjh8ajn/NTRN",
        })
      ).toBe(false);
    });

    it("does not block chain-registry registered atom-related factory currencies", () => {
      const allowedCurrencies = [
        {
          coinDenom: "LP-ATOM-MNTA",
          coinMinimalDenom:
            "factory/kujira1h9f3k54j060pzlnea8ep8qfymsmwl5yhwc5hqept5p2esqzve7tq2ghnm4/ulp",
        },
        {
          coinDenom: "LP-ATOM-USDC",
          coinMinimalDenom:
            "factory/kujira13my0qtm2a8jp0wg8uzg49tyn4zcea8scy3dc7ghn8z9eys08yzls49ymdm/ulp",
        },
        {
          coinDenom: "LP-ATOM-USK",
          coinMinimalDenom:
            "factory/kujira1yncutssgh2vj9scaymtteg949hwcft07c6qmgarxnaf04yesq3jsn6g2uv/ulp",
        },
        {
          coinDenom: "amATOM",
          coinMinimalDenom:
            "factory/neutron1shwxlkpdjd8h5wdtrykypwd2v62z5glr95yp0etdcspkkjwm5meq82ndxs/amatom",
        },
        {
          coinDenom: "ATOM1KLFG",
          coinMinimalDenom:
            "factory/neutron13lkh47msw28yynspc5rnmty3yktk43wc3dsv0l/ATOM1KLFG",
        },
        {
          coinDenom: "dATOM",
          coinMinimalDenom:
            "factory/neutron1k6hr0f83e7un2wjf29cspk7j69jrnskk65k3ek2nj9dztrlzpj6q00rtsa/udatom",
        },
        {
          coinDenom: "amATOM",
          coinMinimalDenom:
            "factory/neutron15lku24mqhvy4v4gryrqs4662n9v9q4ux9tayn89cmdzldjcgawushxvm76/amatom",
        },
        {
          coinDenom: "sqATOM",
          coinMinimalDenom:
            "factory/osmo1g8qypve6l95xmhgc0fddaecerffymsl7kn9muw/sqatom",
        },
      ];

      for (const currency of allowedCurrencies) {
        expect(isBlockedTokenFactoryAtomCurrency(currency)).toBe(false);
      }
    });
  });
});
