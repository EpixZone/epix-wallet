import { useStore } from "../stores";

export function useGetStakingApr(chainId: string) {
  const { chainStore, starknetQueriesStore, aprsStore } = useStore();

  const isStarknet = chainStore.getModularChain(chainId).type === "starknet";

  if (isStarknet) {
    const queryApr = starknetQueriesStore.get(chainId).queryStakingApr;

    return queryApr.apr ? queryApr.apr : undefined;
  }

  return aprsStore.getApr(chainId);
}
