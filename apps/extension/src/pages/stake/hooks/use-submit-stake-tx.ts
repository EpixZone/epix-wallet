import type { FormEvent } from "react";
import { useNavigate } from "react-router";
import type { IFeeConfig, IMemoConfig } from "@keplr-wallet/hooks";
import type { MakeTxResponse } from "@keplr-wallet/stores";

export const useSubmitStakeTx = ({
  feeConfig,
  memoConfig,
  interactionBlocked,
  makeTx,
}: {
  feeConfig: Pick<IFeeConfig, "toStdFee">;
  memoConfig: Pick<IMemoConfig, "memo">;
  interactionBlocked: boolean;
  makeTx: () => Pick<MakeTxResponse, "send">;
}) => {
  const navigate = useNavigate();

  return async (e: Pick<FormEvent, "preventDefault">) => {
    e.preventDefault();

    if (interactionBlocked) {
      return;
    }

    try {
      const tx = makeTx();
      await tx.send(
        feeConfig.toStdFee(),
        memoConfig.memo,
        {
          preferNoSetFee: true,
          preferNoSetMemo: true,
        },
        {
          onBroadcasted: () => {
            navigate("/tx-result/pending");
          },
          onFulfill: (result: any) => {
            if (result.code != null && result.code !== 0) {
              console.log(result.log ?? result.raw_log);
              navigate("/tx-result/failed");
              return;
            }

            navigate("/tx-result/success");
          },
        }
      );
    } catch (e) {
      if (e?.message === "Request rejected") {
        return;
      }

      console.log(e);
      navigate("/tx-result/failed");
    }
  };
};
