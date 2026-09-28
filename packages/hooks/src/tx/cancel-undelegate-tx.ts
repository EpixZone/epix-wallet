import { useState } from "react";
import { action, computed, makeObservable, observable } from "mobx";
import { ChainGetter } from "@keplr-wallet/stores";
import { CoinPretty, Dec } from "@keplr-wallet/unit";
import { TxChainSetter } from "./chain";
import { IBaseAmountConfig, ISenderConfig, UIProperties } from "./types";
import { QueriesStore } from "./internal";
import {
  useFeeConfig,
  useGasConfig,
  useMemoConfig,
  useSenderConfig,
} from "./index";

// Cancelling returns an existing unbonding entry to stake. Its amount does not
// come from the spendable balance; only the transaction fee does.
export class CancelUndelegateAmountConfig
  extends TxChainSetter
  implements IBaseAmountConfig
{
  @observable protected validatorAddress: string;
  @observable protected creationHeight: string;

  constructor(
    chainGetter: ChainGetter,
    protected readonly queriesStore: QueriesStore,
    chainId: string,
    protected readonly senderConfig: ISenderConfig,
    validatorAddress: string,
    creationHeight: string
  ) {
    super(chainGetter, chainId);
    this.validatorAddress = validatorAddress;
    this.creationHeight = creationHeight;
    makeObservable(this);
  }

  @action setEntry(validatorAddress: string, creationHeight: string) {
    this.validatorAddress = validatorAddress;
    this.creationHeight = creationHeight;
  }

  @computed get query() {
    return this.queriesStore
      .get(this.chainId)
      .cosmos?.queryUnbondingDelegations.getQueryBech32Address(
        this.senderConfig.sender
      );
  }

  @computed get entry() {
    return this.query?.unbondingBalances
      .find((value) => value.validatorAddress === this.validatorAddress)
      ?.entries.find(
        (value) => value.creationHeight.toString() === this.creationHeight
      );
  }

  @computed get amount(): CoinPretty[] {
    return this.entry ? [this.entry.balance] : [];
  }

  @computed get uiProperties(): UIProperties {
    if (this.query?.error)
      return { error: new Error(this.query.error.message) };
    if (!this.query?.response) return { loadingState: "loading-block" };
    if (
      !this.entry ||
      this.entry.balance.toDec().lte(new Dec(0)) ||
      new Date(this.entry.completionTime).getTime() <= Date.now()
    ) {
      return {
        error: new Error("This undelegation is no longer available to cancel."),
      };
    }
    return {};
  }
}

export function useCancelUndelegateTxConfig(
  chainGetter: ChainGetter,
  queriesStore: QueriesStore,
  chainId: string,
  sender: string,
  validatorAddress: string,
  creationHeight: string
) {
  const senderConfig = useSenderConfig(chainGetter, chainId, sender);
  const [amountConfig] = useState(
    () =>
      new CancelUndelegateAmountConfig(
        chainGetter,
        queriesStore,
        chainId,
        senderConfig,
        validatorAddress,
        creationHeight
      )
  );
  amountConfig.setChain(chainId);
  amountConfig.setEntry(validatorAddress, creationHeight);
  const memoConfig = useMemoConfig(chainGetter, chainId);
  const gasConfig = useGasConfig(chainGetter, chainId, 300000);
  const feeConfig = useFeeConfig(
    chainGetter,
    queriesStore,
    chainId,
    senderConfig,
    amountConfig,
    gasConfig,
    { additionAmountToNeedFee: false }
  );
  return { senderConfig, amountConfig, memoConfig, gasConfig, feeConfig };
}
