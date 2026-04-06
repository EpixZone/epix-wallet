import { AccountSetBase, AccountSetBaseSuper, MsgOpt } from "./base";
import { CosmwasmQueries, IQueriesStore, QueriesSetBase } from "../query";
import { CoinPrimitive } from "../common";
import { ChainGetter, requireCosmosInfo } from "../chain";
import { DenomHelper } from "@keplr-wallet/common";
import { Dec, DecUtils } from "@keplr-wallet/unit";
import { AppCurrency } from "@keplr-wallet/types";
import { DeepPartial, DeepReadonly } from "utility-types";
import { MsgExecuteContract } from "@keplr-wallet/proto-types/cosmwasm/wasm/v1/tx";
import { Buffer } from "buffer/";
import deepmerge from "deepmerge";
import { CosmosAccount } from "./cosmos";
import { Bech32Address } from "@keplr-wallet/cosmos";

// Injective MsgExecuteContractCompat: 모든 필드가 string이라 수동 protobuf 인코딩.
function encodeMsgExecuteContractCompat(params: {
  sender: string;
  contract: string;
  msg: string;
  funds: string;
}): Uint8Array {
  const encodeString = (fieldNumber: number, value: string): Buffer => {
    if (!value) return Buffer.alloc(0);
    const encoded = Buffer.from(value);
    const tag = (fieldNumber << 3) | 2;
    const lenBytes: number[] = [];
    let len = encoded.length;
    while (len > 0x7f) {
      lenBytes.push((len & 0x7f) | 0x80);
      len >>>= 7;
    }
    lenBytes.push(len);
    return Buffer.concat([Buffer.from([tag]), Buffer.from(lenBytes), encoded]);
  };

  return Buffer.concat([
    encodeString(1, params.sender),
    encodeString(2, params.contract),
    encodeString(3, params.msg),
    encodeString(4, params.funds),
  ]);
}

export interface CosmwasmAccount {
  cosmwasm: CosmwasmAccountImpl;
}

export const CosmwasmAccount = {
  use(options: {
    msgOptsCreator?: (
      chainId: string
    ) => DeepPartial<CosmwasmMsgOpts> | undefined;
    queriesStore: IQueriesStore<CosmwasmQueries>;
  }): (
    base: AccountSetBaseSuper & CosmosAccount,
    chainGetter: ChainGetter,
    chainId: string
  ) => CosmwasmAccount {
    return (base, chainGetter, chainId) => {
      const msgOptsFromCreator = options.msgOptsCreator
        ? options.msgOptsCreator(chainId)
        : undefined;

      return {
        cosmwasm: new CosmwasmAccountImpl(
          base,
          chainGetter,
          chainId,
          options.queriesStore,
          deepmerge<CosmwasmMsgOpts, DeepPartial<CosmwasmMsgOpts>>(
            defaultCosmwasmMsgOpts,
            msgOptsFromCreator ? msgOptsFromCreator : {}
          )
        ),
      };
    };
  },
};

/**
 * @deprecated Predict gas through simulation rather than using a fixed gas.
 */
export interface CosmwasmMsgOpts {
  readonly send: {
    readonly cw20: Pick<MsgOpt, "gas">;
  };

  readonly executeWasm: Pick<MsgOpt, "type">;
}

/**
 * @deprecated Predict gas through simulation rather than using a fixed gas.
 */
export const defaultCosmwasmMsgOpts: CosmwasmMsgOpts = {
  send: {
    cw20: {
      gas: 150000,
    },
  },

  executeWasm: {
    type: "wasm/MsgExecuteContract",
  },
};

export class CosmwasmAccountImpl {
  constructor(
    protected readonly base: AccountSetBase & CosmosAccount,
    protected readonly chainGetter: ChainGetter,
    protected readonly chainId: string,
    protected readonly queriesStore: IQueriesStore<CosmwasmQueries>,
    protected readonly _msgOpts: CosmwasmMsgOpts
  ) {
    this.base.registerMakeSendTokenFn(this.processMakeSendTokenTx.bind(this));
  }

  /**
   * @deprecated Predict gas through simulation rather than using a fixed gas.
   */
  get msgOpts(): CosmwasmMsgOpts {
    return this._msgOpts;
  }

  protected processMakeSendTokenTx(
    amount: string,
    currency: AppCurrency,
    recipient: string
  ) {
    const denomHelper = new DenomHelper(currency.coinMinimalDenom);

    if (denomHelper.type === "cw20") {
      const actualAmount = (() => {
        let dec = new Dec(amount);
        dec = dec.mul(DecUtils.getPrecisionDec(currency.coinDecimals));
        return dec.truncate().toString();
      })();

      if (!("type" in currency) || currency.type !== "cw20") {
        throw new Error("Currency is not cw20");
      }

      Bech32Address.validate(
        recipient,
        requireCosmosInfo(this.chainGetter.getModularChain(this.chainId))
          .bech32Config?.bech32PrefixAccAddr
      );

      return this.makeExecuteContractTx(
        "send",
        currency.contractAddress,
        {
          transfer: {
            recipient: recipient,
            amount: actualAmount,
          },
        },
        [],
        (tx) => {
          if (tx.code == null || tx.code === 0) {
            // After succeeding to send token, refresh the balance.
            const queryBalance = this.queries.queryBalances
              .getQueryBech32Address(this.base.bech32Address)
              .balances.find((bal) => {
                return (
                  bal.currency.coinMinimalDenom === currency.coinMinimalDenom
                );
              });

            if (queryBalance) {
              queryBalance.fetch();
            }
          }
        }
      );
    }
  }

  makeExecuteContractTx(
    // This arg can be used to override the type of sending tx if needed.
    type: keyof CosmwasmMsgOpts | "unknown" = "executeWasm",
    contractAddress: string,
    // eslint-disable-next-line @typescript-eslint/ban-types
    obj: object,
    funds: CoinPrimitive[],
    preOnTxEvents?:
      | ((tx: any) => void)
      | {
          onBroadcasted?: (txHash: Uint8Array) => void;
          onFulfill?: (tx: any) => void;
        }
  ) {
    Bech32Address.validate(
      contractAddress,
      requireCosmosInfo(this.chainGetter.getModularChain(this.chainId))
        .bech32Config?.bech32PrefixAccAddr
    );

    const msg = {
      type: this.msgOpts.executeWasm.type,
      value: {
        sender: this.base.bech32Address,
        contract: contractAddress,
        msg: obj,
        funds,
      },
    };

    // Injective + Ledger: MsgExecuteContractCompat 사용 (EIP-712 호환)
    // 표준 MsgExecuteContract의 msg(bytes)는 EIP-712 정적 타입 불가 →
    // Injective wasmx 모듈의 Compat 버전은 모든 필드가 string.
    // ref: https://docs.injective.network/developers-native/examples/wasm#msgexecutecontractcompat
    // ref: https://github.com/InjectiveLabs/injective-ts/blob/master/packages/sdk-ts/src/core/modules/wasm/msgs/MsgExecuteContractCompat.ts
    if (this.chainId.startsWith("injective") && this.base.isNanoLedger) {
      const fundsStr = funds.map((f) => `${f.amount}${f.denom}`).join(",");

      return this.base.cosmos.makeTx(
        type,
        {
          aminoMsgs: [
            {
              type: "wasmx/MsgExecuteContractCompat",
              value: {
                sender: this.base.bech32Address,
                contract: contractAddress,
                msg: JSON.stringify(obj),
                funds: fundsStr,
              },
            },
          ],
          protoMsgs: [
            {
              typeUrl: "/injective.wasmx.v1.MsgExecuteContractCompat",
              value: encodeMsgExecuteContractCompat({
                sender: this.base.bech32Address,
                contract: contractAddress,
                msg: JSON.stringify(obj),
                funds: fundsStr,
              }),
            },
          ],
          rlpTypes: {
            MsgValue: [
              { name: "sender", type: "string" },
              { name: "contract", type: "string" },
              { name: "msg", type: "string" },
              { name: "funds", type: "string" },
            ],
          },
        },
        preOnTxEvents
      );
    }

    return this.base.cosmos.makeTx(
      type,
      {
        aminoMsgs: [msg],
        protoMsgs: [
          {
            typeUrl: "/cosmwasm.wasm.v1.MsgExecuteContract",
            value: MsgExecuteContract.encode({
              sender: msg.value.sender,
              contract: msg.value.contract,
              msg: Buffer.from(JSON.stringify(msg.value.msg)),
              funds: msg.value.funds,
            }).finish(),
          },
        ],
      },
      preOnTxEvents
    );
  }

  protected get queries(): DeepReadonly<QueriesSetBase & CosmwasmQueries> {
    return this.queriesStore.get(this.chainId);
  }
}
