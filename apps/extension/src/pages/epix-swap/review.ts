import { CoinPretty, Dec } from "@keplr-wallet/unit";
import { CosmosAccountImpl, MakeTxResponse } from "@keplr-wallet/stores";
import { CosmosChainInfo, Currency, StdFee } from "@keplr-wallet/types";
import { parseAmountToMinimal, prepareEpixBridgeTx } from "./bridge";
import {
  calculateSwapNetworkFee,
  fetchSwapQuote,
  prepareSwapTx,
  SwapQuote,
} from "./swap";
import { getOsmosisFeeQuote } from "./fee";

export type SwapStage = "deposit" | "swap" | "withdraw";
export type PreparedReview = {
  tx: MakeTxResponse;
  fee: StdFee;
  feeCurrency: Currency;
  expiresAt: number;
  quote?: SwapQuote;
};
type Account = {
  readonly bech32Address: string;
  readonly isReadyToSendTx: boolean;
  readonly cosmos: Pick<CosmosAccountImpl, "makeTx" | "makeIBCTransferTx">;
};
type BalanceQuery = {
  readonly balance: CoinPretty;
  readonly error?: unknown;
  waitFreshResponse(): Promise<unknown>;
};
type ReviewInput = {
  stage: SwapStage;
  amount: string;
  sourceCurrency: Currency;
  targetCurrency: Currency;
  feeCurrency: Currency;
  sourceAccount: Account;
  targetAccount: Account;
  epixChain: CosmosChainInfo;
  osmoChain: CosmosChainInfo;
  balanceQuery?: BalanceQuery;
  feeQuery?: BalanceQuery;
  targetQuery?: BalanceQuery;
  feeQueries: Parameters<typeof getOsmosisFeeQuote>[0]["queries"];
  slippage: number;
  signal: AbortSignal;
  messages: { loading: string; insufficient: string; noFeeBalance: string };
};

async function requireBalances(input: ReviewInput, amount: string) {
  const { balanceQuery, feeQuery, targetQuery, messages } = input;
  if (
    !input.sourceAccount.isReadyToSendTx ||
    !input.targetAccount.isReadyToSendTx
  )
    throw new Error(messages.loading);
  await Promise.all([
    balanceQuery?.waitFreshResponse(),
    feeQuery?.waitFreshResponse(),
    targetQuery?.waitFreshResponse(),
  ]);
  if (
    !balanceQuery?.balance.isReady ||
    !feeQuery?.balance.isReady ||
    balanceQuery.error ||
    feeQuery.error
  )
    throw new Error(messages.loading);
  if (new Dec(balanceQuery.balance.toCoin().amount).lt(new Dec(amount)))
    throw new Error(messages.insufficient);
  if (input.stage !== "deposit" && feeQuery.balance.toDec().isZero())
    throw new Error(messages.noFeeBalance);
  return feeQuery.balance.toCoin().amount;
}

async function prepareTransaction(
  input: ReviewInput,
  amountMinimal: string
): Promise<{ tx: MakeTxResponse; quote?: SwapQuote }> {
  if (input.stage === "swap") {
    const quote = await fetchSwapQuote(
      {
        amountIn: amountMinimal,
        tokenIn: input.sourceCurrency.coinMinimalDenom,
        tokenOut: input.targetCurrency.coinMinimalDenom,
      },
      input.signal
    );
    return {
      quote,
      tx: prepareSwapTx(input.sourceAccount, quote, input.slippage),
    };
  }
  return {
    tx: await prepareEpixBridgeTx({
      direction: input.stage,
      amount: input.amount,
      account: input.sourceAccount,
      recipient: input.targetAccount.bech32Address,
      signal: input.signal,
      endpoints: { epix: input.epixChain.rest, osmosis: input.osmoChain.rest },
    }),
  };
}

export async function prepareReview(
  input: ReviewInput
): Promise<PreparedReview> {
  const amountMinimal = parseAmountToMinimal(
    input.amount,
    input.sourceCurrency.coinDecimals
  );
  const feeBalance = await requireBalances(input, amountMinimal);
  if (input.signal.aborted)
    throw new Error("Transaction preparation cancelled");
  const { tx, quote } = await prepareTransaction(input, amountMinimal);
  const simulation = await tx.simulate();
  const baseFeeDenom = input.stage === "deposit" ? "aepix" : "uosmo";
  const chain = input.stage === "deposit" ? input.epixChain : input.osmoChain;
  const feeInfo = chain.feeCurrencies.find(
    (currency) => currency.coinMinimalDenom === baseFeeDenom
  );
  const minimumGasPrice = new Dec(
    feeInfo?.gasPriceStep?.average?.toString() ?? "0"
  );
  const networkFee =
    input.stage === "deposit"
      ? {
          fee: calculateSwapNetworkFee(
            simulation.gasUsed,
            minimumGasPrice,
            input.feeCurrency.coinMinimalDenom
          ),
          expiresAt: Date.now() + 60_000,
        }
      : await getOsmosisFeeQuote({
          queries: input.feeQueries,
          feeDenom: input.feeCurrency.coinMinimalDenom,
          gasUsed: simulation.gasUsed,
          minimumGasPrice,
          signal: input.signal,
        });
  const required = new Dec(networkFee.fee.amount[0].amount).add(
    input.sourceCurrency.coinMinimalDenom === input.feeCurrency.coinMinimalDenom
      ? new Dec(amountMinimal)
      : new Dec(0)
  );
  if (new Dec(feeBalance).lt(required))
    throw new Error(input.messages.insufficient);
  const expiresAt = Math.min(
    quote?.expiresAt ?? Number.POSITIVE_INFINITY,
    networkFee.expiresAt
  );
  if (input.signal.aborted || expiresAt <= Date.now())
    throw new Error("Transaction review expired. Please try again.");
  return {
    tx,
    quote,
    fee: networkFee.fee,
    feeCurrency: input.feeCurrency,
    expiresAt,
  };
}
