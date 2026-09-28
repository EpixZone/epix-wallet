import type { MakeTxResponse } from "@keplr-wallet/stores";
import { useNavigate } from "react-router";
import { useSubmitStakeTx as createSubmitHandler } from "./use-submit-stake-tx";

jest.mock("react-router", () => ({ useNavigate: jest.fn() }));

describe("staking transaction submission", () => {
  const navigate = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useNavigate).mockReturnValue(navigate);
    jest.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function setup(interactionBlocked = false) {
    const send = jest
      .fn<
        ReturnType<MakeTxResponse["send"]>,
        Parameters<MakeTxResponse["send"]>
      >()
      .mockResolvedValue(undefined);
    const makeTx = jest.fn(() => ({ send }));
    const feeConfig = {
      toStdFee: jest.fn(() => ({
        amount: [{ denom: "aepix", amount: "1000" }],
        gas: "300000",
      })),
    };
    const memoConfig = { memo: "Initial memo" };
    const submit = createSubmitHandler({
      feeConfig,
      memoConfig,
      interactionBlocked,
      makeTx,
    });
    const event = { preventDefault: jest.fn() };
    return { submit, event, send, makeTx, feeConfig, memoConfig };
  }

  it("does not construct or send a transaction while validation blocks submission", async () => {
    const { submit, event, makeTx, feeConfig } = setup(true);

    await submit(event);

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(makeTx).not.toHaveBeenCalled();
    expect(feeConfig.toStdFee).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("reads current fees and memo at submission and waits for transaction events", async () => {
    const { submit, event, send, feeConfig, memoConfig } = setup();
    const updatedFee = {
      amount: [{ denom: "aepix", amount: "2000" }],
      gas: "400000",
    };
    feeConfig.toStdFee.mockReturnValue(updatedFee);
    memoConfig.memo = "Updated memo";

    await submit(event);

    expect(send).toHaveBeenCalledWith(
      updatedFee,
      "Updated memo",
      { preferNoSetFee: true, preferNoSetMemo: true },
      expect.any(Object)
    );
    expect(navigate).not.toHaveBeenCalled();

    const events = send.mock.calls[0][3];
    if (!events || typeof events === "function") {
      throw new Error("Expected transaction event callbacks");
    }
    events.onBroadcasted?.(new Uint8Array());
    expect(navigate.mock.calls).toEqual([["/tx-result/pending"]]);

    events.onFulfill?.({ code: 0 });
    expect(navigate.mock.calls).toEqual([
      ["/tx-result/pending"],
      ["/tx-result/success"],
    ]);
  });

  it.each([
    [{}, "/tx-result/success"],
    [{ code: 5, raw_log: "Insufficient funds" }, "/tx-result/failed"],
  ])("routes the delivered transaction result %j", async (result, route) => {
    const { submit, event, send } = setup();
    await submit(event);
    const events = send.mock.calls[0][3];
    if (!events || typeof events === "function") {
      throw new Error("Expected transaction event callbacks");
    }

    events.onFulfill?.(result);

    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith(route);
  });

  it("leaves the form open when the user rejects signing", async () => {
    const { submit, event, send } = setup();
    send.mockRejectedValue(new Error("Request rejected"));

    await submit(event);

    expect(navigate).not.toHaveBeenCalled();
    expect(console.log).not.toHaveBeenCalled();
  });

  it.each(["construction", "send"])(
    "shows failure for a transaction %s error",
    async (stage) => {
      const { submit, event, makeTx, send } = setup();
      const error = new Error("Undelegation is unavailable");
      if (stage === "construction") {
        makeTx.mockImplementation(() => {
          throw error;
        });
      } else {
        send.mockRejectedValue(error);
      }

      await submit(event);

      expect(navigate).toHaveBeenCalledTimes(1);
      expect(navigate).toHaveBeenCalledWith("/tx-result/failed");
      expect(console.log).toHaveBeenCalledWith(error);
    }
  );
});
