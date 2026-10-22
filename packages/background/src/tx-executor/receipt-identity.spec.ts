import { BackgroundTxExecutorService } from "./service";
import {
  BackgroundTxStatus,
  BackgroundTxType,
  CosmosBackgroundTx,
} from "./types";
import { fetchWithRetry } from "./utils/fetch";

jest.mock("./utils/fetch", () => ({ fetchWithRetry: jest.fn() }));

class ReceiptExecutor extends BackgroundTxExecutorService {
  observe(tx: CosmosBackgroundTx) {
    return this.traceTx(tx);
  }
}
function fixture() {
  let current = { chainId: "epix_1916-1", rest: "https://a.test" };
  const service = new ReceiptExecutor(
    {} as any,
    { getChainInfoOrThrow: () => current } as any,
    {} as any,
    {} as any,
    {
      traceTx: jest.fn(async () => {
        throw new Error("WebSocket unavailable");
      }),
    } as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any
  );
  return {
    service,
    move(chainId: string) {
      current = { chainId, rest: "https://b.test" };
    },
    tx: (chainId: string): CosmosBackgroundTx => ({
      type: BackgroundTxType.COSMOS,
      status: BackgroundTxStatus.PENDING,
      chainId,
      txHash: "ABCD",
      txData: { protoMsgs: [] },
    }),
  };
}

it("Cosmos REST fallback rejects a late old full revision and still accepts an identifier", async () => {
  const f = fixture();
  f.move("epix_1916-2");
  const fetchMock = fetchWithRetry as jest.Mock;
  fetchMock
    .mockReset()
    .mockResolvedValue({ data: { tx_response: { code: 0, txhash: "ABCD" } } });
  await expect(f.service.observe(f.tx("epix_1916-1"))).resolves.toMatchObject({
    confirmed: false,
  });
  expect(fetchMock).not.toHaveBeenCalled();
  await expect(f.service.observe(f.tx("epix_1916"))).resolves.toEqual({
    confirmed: true,
  });
  expect(fetchMock).toHaveBeenCalledWith(
    "https://b.test",
    "/cosmos/tx/v1beta1/txs/ABCD"
  );
});

it.each([true, false])(
  "Cosmos held REST fallback checks identity while permitting endpoint replacement (revision changes: %s)",
  async (revisionChanges) => {
    const f = fixture();
    let release!: (value: unknown) => void;
    const held = new Promise((resolve) => {
      release = resolve;
    });
    let started!: () => void;
    const arrived = new Promise<void>((resolve) => {
      started = resolve;
    });
    const fetchMock = fetchWithRetry as jest.Mock;
    fetchMock.mockReset().mockImplementation(() => {
      started();
      return held;
    });
    const pending = f.service.observe(f.tx("epix_1916-1"));
    await arrived;
    f.move(revisionChanges ? "epix_1916-2" : "epix_1916-1");
    release({ data: { tx_response: { code: 0, txhash: "ABCD" } } });
    await expect(pending).resolves.toMatchObject({
      confirmed: !revisionChanges,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://a.test",
      "/cosmos/tx/v1beta1/txs/ABCD"
    );
  }
);
