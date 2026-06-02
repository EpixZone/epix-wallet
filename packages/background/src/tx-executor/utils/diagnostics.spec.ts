import {
  classifyGasEstimateError,
  createGasEstimateDiagnostics,
  getTxExecutionDiagnostics,
  hasEvmTxNativeValue,
  sanitizeTxExecutionDiagnostics,
  withTxExecutionDiagnostics,
} from "./diagnostics";

describe("tx execution diagnostics", () => {
  it("classifies allowance failures without exposing the raw error", () => {
    expect(
      classifyGasEstimateError(
        new Error(
          "execution reverted: ERC20: transfer amount exceeds allowance"
        )
      )
    ).toBe("allowance_insufficient");
  });

  it("classifies common gas estimate error families", () => {
    expect(classifyGasEstimateError(new Error("insufficient funds"))).toBe(
      "native_balance_insufficient"
    );
    expect(
      classifyGasEstimateError(
        new Error("execution reverted: panic: arithmetic underflow or overflow")
      )
    ).toBe("execution_reverted");
    expect(
      classifyGasEstimateError(
        new Error("invalid argument 0: cannot unmarshal hex string")
      )
    ).toBe("invalid_calldata");
    expect(classifyGasEstimateError(new Error("network error: timeout"))).toBe(
      "rpc_unavailable"
    );
  });

  it("detects native value on decimal and hex tx values", () => {
    expect(hasEvmTxNativeValue("0")).toBe(false);
    expect(hasEvmTxNativeValue("0x0")).toBe(false);
    expect(hasEvmTxNativeValue("100")).toBe(true);
    expect(hasEvmTxNativeValue("0x64")).toBe(true);
  });

  it("attaches sanitized gas estimate diagnostics to errors", () => {
    const error = withTxExecutionDiagnostics(
      new Error("execution reverted: ERC20: transfer amount exceeds allowance"),
      createGasEstimateDiagnostics(
        new Error(
          "execution reverted: ERC20: transfer amount exceeds allowance"
        ),
        "background_fill_unsigned_tx",
        {
          value: "0x1",
          requiredErc20Approvals: [{ tokenAddress: "0x1" }],
        }
      )
    );

    expect(error.message).toBe(
      "execution reverted: ERC20: transfer amount exceeds allowance"
    );
    expect(getTxExecutionDiagnostics(error)).toEqual({
      gas_estimate_context: "background_fill_unsigned_tx",
      gas_estimate_error_category: "allowance_insufficient",
      failed_tx_has_required_erc20_approval: true,
      failed_tx_has_native_value: true,
    });
  });

  it("drops unknown diagnostics keys and invalid enum values", () => {
    expect(
      sanitizeTxExecutionDiagnostics({
        gas_estimate_context: "background_fill_unsigned_tx",
        gas_estimate_error_category: "allowance_insufficient",
        confirmation_failure_reason: "raw tx hash here",
        route_step_kinds: ["swap", "raw-route-fingerprint"],
        evm_simulation_outcome: "raw simulation outcome",
        leaked_payload: "should not be logged",
      })
    ).toEqual({
      gas_estimate_context: "background_fill_unsigned_tx",
      gas_estimate_error_category: "allowance_insufficient",
      route_step_kinds: ["swap"],
    });
  });
});
