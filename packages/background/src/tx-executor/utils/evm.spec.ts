import { EVMInfo } from "@keplr-wallet/types";
import { getTxExecutionDiagnostics } from "./diagnostics";
import { fillUnsignedEVMTx } from "./evm";
import { fetchWithRetry } from "./fetch";

jest.mock("./fetch", () => ({
  fetchWithRetry: jest.fn(),
}));

const mockFetchWithRetry = fetchWithRetry as jest.MockedFunction<
  typeof fetchWithRetry
>;

describe("fillUnsignedEVMTx", () => {
  beforeEach(() => {
    mockFetchWithRetry.mockReset();
  });

  it("keeps eth_estimateGas optional and adds diagnostics only at final gas failure", async () => {
    mockFetchWithRetry.mockResolvedValue({
      data: [
        { id: 1, result: "0x1" },
        { id: 2, result: { baseFeePerGas: "0x1" } },
        { id: 3, result: {} },
        {
          id: 4,
          error: {
            code: -32000,
            message:
              "execution reverted: ERC20: transfer amount exceeds allowance",
          },
        },
        { id: 5, result: "0x1" },
        { id: 6, result: "0x1" },
      ],
    } as any);

    try {
      await fillUnsignedEVMTx(
        "extension",
        { rpc: "https://example.invalid" } as EVMInfo,
        "0xsender",
        {
          to: "0xrouter",
          value: "0x0",
          data: "0x",
        }
      );
      throw new Error("Expected fillUnsignedEVMTx to fail");
    } catch (e) {
      expect((e as Error).message).toBe(
        "Failed to estimate gas to fill unsigned transaction"
      );
      expect(getTxExecutionDiagnostics(e)).toEqual({
        gas_estimate_context: "background_fill_unsigned_tx",
        gas_estimate_error_category: "allowance_insufficient",
        failed_tx_has_required_erc20_approval: false,
        failed_tx_has_native_value: false,
      });
    }
  });
});
