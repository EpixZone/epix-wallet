import { RouteStepType } from "@keplr-wallet/stores-internal";
import { EvmGasSimulationOutcome } from "@keplr-wallet/types";
import {
  getEvmTxExecutionDiagnostics,
  getRouteExecutionDiagnostics,
  getTxExecutionDiagnostics,
  withPreSignGasEstimateDiagnostics,
} from "./swap-execution-diagnostics";

describe("swap execution diagnostics", () => {
  it("summarizes route steps and bridge kinds without route fingerprints", () => {
    expect(
      getRouteExecutionDiagnostics({
        steps: [
          { type: RouteStepType.SWAP },
          { type: RouteStepType.BRIDGE },
          { type: RouteStepType.IBC_TRANSFER },
        ],
        skip_operations: [
          { axelar_transfer: {}, tx_index: 0 },
          { cctp_transfer: {}, tx_index: 0 },
          { transfer: {}, tx_index: 1 },
          { axelar_transfer: {}, tx_index: 1 },
        ],
      })
    ).toEqual({
      route_step_kinds: ["swap", "bridge", "ibc_transfer"],
      route_bridge_kinds: ["axelar", "cctp", "ibc"],
    });
  });

  it("omits route step diagnostics when route steps are missing", () => {
    expect(
      getRouteExecutionDiagnostics({
        skip_operations: [{ axelar_transfer: {}, tx_index: 0 }],
      })
    ).toEqual({
      route_bridge_kinds: ["axelar"],
    });
  });

  it("summarizes EVM approval and native value shape", () => {
    expect(
      getEvmTxExecutionDiagnostics(
        [
          {
            to: "0xrouter",
            value: "0x1",
            data: "0x",
            requiredErc20Approvals: [
              {
                tokenAddress: "0xtoken",
                spender: "0xrouter",
                amount: "1",
              },
            ],
          },
        ],
        EvmGasSimulationOutcome.TX_BUNDLE_SIMULATED
      )
    ).toEqual({
      has_required_erc20_approval: true,
      has_native_value: true,
      evm_simulation_outcome: EvmGasSimulationOutcome.TX_BUNDLE_SIMULATED,
    });
  });

  it("adds pre-sign gas diagnostics to thrown errors", async () => {
    await expect(
      withPreSignGasEstimateDiagnostics(
        async () => {
          throw new Error("insufficient funds for gas * price + value");
        },
        {
          to: "0xrouter",
          value: "0x1",
          data: "0x",
          requiredErc20Approvals: [],
        }
      )
    ).rejects.toMatchObject({
      diagnostics: {
        gas_estimate_context: "pre_sign_simulation",
        gas_estimate_error_category: "native_balance_insufficient",
        failed_tx_has_required_erc20_approval: false,
        failed_tx_has_native_value: true,
      },
    });

    try {
      await withPreSignGasEstimateDiagnostics(
        async () => {
          throw new Error("insufficient funds for gas * price + value");
        },
        {
          to: "0xrouter",
          value: "0x1",
          data: "0x",
          requiredErc20Approvals: [],
        }
      );
    } catch (e) {
      expect(getTxExecutionDiagnostics(e)).toEqual({
        gas_estimate_context: "pre_sign_simulation",
        gas_estimate_error_category: "native_balance_insufficient",
        failed_tx_has_required_erc20_approval: false,
        failed_tx_has_native_value: true,
      });
    }
  });

  it("sanitizes diagnostics before exposing them to analytics", () => {
    const error = Object.assign(new Error("wrapped"), {
      diagnostics: {
        confirmation_failure_reason: "evm_receipt_missing",
        gas_estimate_context: "provider supplied raw context",
        route_bridge_kinds: ["axelar", "raw-bridge-id"],
        evm_simulation_outcome: "raw simulation outcome",
        leaked_payload: "should not be logged",
      },
    });

    expect(getTxExecutionDiagnostics(error)).toEqual({
      confirmation_failure_reason: "evm_receipt_missing",
      route_bridge_kinds: ["axelar"],
    });
  });
});
