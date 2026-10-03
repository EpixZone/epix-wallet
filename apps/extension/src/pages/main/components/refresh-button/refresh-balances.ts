import { Staking } from "@keplr-wallet/stores";
import type { IObservableQuery } from "@keplr-wallet/stores";
import type { RootStore } from "../../../../stores/root";
import { INITIA_CHAIN_ID } from "../../../../config.ui";

export type BalanceRefreshStores = Pick<
  RootStore,
  | "chainStore"
  | "queriesStore"
  | "starknetQueriesStore"
  | "bitcoinQueriesStore"
  | "accountStore"
  | "priceStore"
>;

type RefreshQuery = Pick<IObservableQuery, "waitFreshResponse" | "error"> & {
  readonly isObserved?: boolean;
};
type AddQuery = (query: RefreshQuery | undefined) => void;
type Chain = RootStore["chainStore"]["modularChainInfosInUI"][number];
type Account = ReturnType<RootStore["accountStore"]["getAccount"]>;
type ChainQueries = ReturnType<RootStore["queriesStore"]["get"]>;

function collectObservedValidatorQueries(queries: ChainQueries, add: AddQuery) {
  for (const status of [
    Staking.BondStatus.Bonded,
    Staking.BondStatus.Unbonding,
    Staking.BondStatus.Unbonded,
  ]) {
    const query = queries.cosmos.queryValidators.getQueryStatus(status);
    if (query.isObserved) add(query);
  }
  if (queries.cosmos.queryStakingParams.isObserved) {
    add(queries.cosmos.queryStakingParams);
  }
}

function collectCosmosQueries(
  stores: BalanceRefreshStores,
  chainId: string,
  address: string,
  manual: boolean,
  add: AddQuery
) {
  const queries = stores.queriesStore.get(chainId);
  if (manual) collectObservedValidatorQueries(queries, add);
  if (!address) return;

  queries.queryBalances.getQueryBech32Address(address).balances.forEach(add);
  add(queries.cosmos.queryRewards.getQueryBech32Address(address));
  const isInitia = chainId === INITIA_CHAIN_ID;
  const delegations = isInitia
    ? queries.cosmos.queryInitiaDelegations
    : queries.cosmos.queryDelegations;
  const unbonding = isInitia
    ? queries.cosmos.queryInitiaUnbondingDelegations
    : queries.cosmos.queryUnbondingDelegations;
  add(delegations.getQueryBech32Address(address));
  add(unbonding.getQueryBech32Address(address));
}

function collectEvmQueries(
  stores: BalanceRefreshStores,
  chainId: string,
  address: string,
  add: AddQuery
) {
  if (!address) return;
  stores.queriesStore
    .get(chainId)
    .queryBalances.getQueryEthereumHexAddress(address)
    .balances.forEach(add);
}

function collectStarknetQueries(
  stores: BalanceRefreshStores,
  chain: Chain,
  account: Account,
  add: AddQuery
) {
  const unwrapped = chain.unwrapped;
  if (unwrapped.type !== "starknet" || !account.starknetHexAddress) return;
  const queries = stores.starknetQueriesStore.get(chain.chainId);
  for (const currency of unwrapped.starknet.currencies) {
    add(
      queries.queryStarknetERC20Balance.getBalance(
        chain.chainId,
        stores.chainStore,
        account.starknetHexAddress,
        currency.coinMinimalDenom
      )
    );
  }
  add(queries.stakingInfoManager.getStakingInfo(account.starknetHexAddress));
}

function collectBitcoinQueries(
  stores: BalanceRefreshStores,
  chain: Chain,
  account: Account,
  add: AddQuery
) {
  const unwrapped = chain.unwrapped;
  if (unwrapped.type !== "bitcoin" || !account.bitcoinAddress) return;
  add(
    stores.bitcoinQueriesStore
      .get(chain.chainId)
      .queryBitcoinBalance.getBalance(
        chain.chainId,
        stores.chainStore,
        account.bitcoinAddress.bech32Address,
        unwrapped.bitcoin.currencies[0].coinMinimalDenom
      )
  );
}

function collectChainQueries(
  stores: BalanceRefreshStores,
  chain: Chain,
  manual: boolean,
  add: AddQuery
) {
  const account = stores.accountStore.getAccount(chain.chainId);
  switch (chain.unwrapped.type) {
    case "cosmos":
      collectCosmosQueries(
        stores,
        chain.chainId,
        account.bech32Address,
        manual,
        add
      );
      break;
    case "ethermint":
      // Ethermint needs both its hex native/ERC20 balances and bech32 IBC balances.
      collectCosmosQueries(
        stores,
        chain.chainId,
        account.bech32Address,
        manual,
        add
      );
      collectEvmQueries(stores, chain.chainId, account.ethereumHexAddress, add);
      break;
    case "evm":
      collectEvmQueries(stores, chain.chainId, account.ethereumHexAddress, add);
      break;
    case "starknet":
      collectStarknetQueries(stores, chain, account, add);
      break;
    case "bitcoin":
      collectBitcoinQueries(stores, chain, account, add);
      break;
  }
}

export async function refreshWalletBalances(
  stores: BalanceRefreshStores,
  manual: boolean
): Promise<void> {
  const queries = new Set<RefreshQuery>();
  const add: AddQuery = (query) => {
    if (query && (manual || query.isObserved)) queries.add(query);
  };

  // Automatic refresh only updates observed asset queries. Prices and other
  // metadata keep their existing cadence; an explicit refresh also updates prices.
  const priceRefresh =
    manual && stores.priceStore.isObserved
      ? stores.priceStore.waitFreshResponse().catch(() => undefined)
      : Promise.resolve();

  for (const chain of stores.chainStore.modularChainInfosInUI) {
    collectChainQueries(stores, chain, manual, add);
  }

  // waitFreshResponse joins an already running query instead of cancelling it.
  // Await every query so one failure cannot release the refresh guard early.
  const [results] = await Promise.all([
    Promise.allSettled(
      Array.from(queries, (query) => query.waitFreshResponse())
    ),
    priceRefresh,
  ]);
  if (
    results.some((result) => result.status === "rejected") ||
    Array.from(queries).some((query) => query.error)
  ) {
    throw new Error("Some balances could not be refreshed. Please try again.");
  }
}
