import { useStore } from "../../../stores";
import { useCallback } from "react";

export function useKeyCoinTypeFinalize() {
  const { chainStore, keyRingStore, queriesStore } = useStore();

  const needFinalizeKeyCoinTypeAction = useCallback(
    async (vaultId: string, chainId: string) => {
      const queries = queriesStore.get(chainId);

      if (keyRingStore.needKeyCoinTypeFinalize(vaultId, chainId)) {
        const candidateAddress =
          await keyRingStore.computeNotFinalizedKeyAddresses(vaultId, chainId);

        if (candidateAddress.length === 1) {
          // finalize-key scene을 통하지 않고도 이 scene으로 들어올 수 있는 경우가 있기 때문에...
          keyRingStore.finalizeKeyCoinType(
            vaultId,
            chainId,
            candidateAddress[0].coinType
          );
          return false;
        }
        if (candidateAddress.length >= 2) {
          const modularChainInfo = chainStore.getModularChain(chainId);
          const u = modularChainInfo.unwrapped;
          if (u.type !== "cosmos" && u.type !== "ethermint") {
            return false;
          }
          const bip44CoinType = u.cosmos.bip44.coinType;

          const result = await (async () => {
            const promises: Promise<unknown>[] = [];

            for (const candidate of candidateAddress) {
              const queryAccount =
                queries.cosmos.queryAccount.getQueryBech32Address(
                  candidate.bech32Address
                );

              promises.push(queryAccount.waitResponse());
            }

            await Promise.allSettled(promises);

            const mainAddress = candidateAddress.find(
              (a) => a.coinType === bip44CoinType
            );
            const otherAddresses = candidateAddress.filter(
              (a) => a.coinType !== bip44CoinType
            );

            let otherIsSelectable = false;
            if (mainAddress && otherAddresses.length > 0) {
              for (const otherAddress of otherAddresses) {
                const bech32Address = otherAddress.bech32Address;
                const queryAccount =
                  queries.cosmos.queryAccount.getQueryBech32Address(
                    bech32Address
                  );

                // Check that the account exist on chain.
                // With stargate implementation, querying account fails with 404 status if account not exists.
                // But, if account receives some native tokens, the account would be created and it may deserve to be chosen.
                if (queryAccount.response?.data && queryAccount.error == null) {
                  otherIsSelectable = true;
                  break;
                }
              }
            }

            if (!otherIsSelectable && mainAddress) {
              keyRingStore.finalizeKeyCoinType(
                vaultId,
                chainId,
                mainAddress.coinType
              );
              return false;
            } else {
              return true;
            }
          })();

          return result;
        }
      }

      return false;
    },
    [chainStore, keyRingStore, queriesStore]
  );

  return { needFinalizeKeyCoinTypeAction };
}
