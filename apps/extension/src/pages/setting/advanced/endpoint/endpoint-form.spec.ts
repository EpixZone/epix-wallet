import {
  endpointFormUpdates,
  preferredEndpointFormValues,
} from "./endpoint-form";

const preferred = {
  rpc: "https://preferred-rpc.test",
  rest: "https://preferred-rest.test",
  evmRpc: "https://preferred-evm.test",
};
const effective = {
  rpc: "https://backup-rpc.test",
  lcd: "https://backup-rest.test",
  evmRpc: "https://backup-evm.test",
};

it("edits the preferred Cosmos endpoints while reads use a backup", () => {
  expect(preferredEndpointFormValues("cosmos", effective, preferred)).toEqual({
    rpc: preferred.rpc,
    lcd: preferred.rest,
  });
});
it("keeps Ethermint REST, RPC and EVM preference fields independent", () => {
  expect(
    preferredEndpointFormValues("ethermint", effective, preferred)
  ).toEqual({
    rpc: preferred.rpc,
    lcd: preferred.rest,
    evmRpc: preferred.evmRpc,
  });
});
it("preserves normal endpoint settings for unsupported networks", () => {
  expect(preferredEndpointFormValues("starknet", effective, preferred)).toBe(
    effective
  );
  expect(preferredEndpointFormValues("cosmos", effective)).toBe(effective);
});
it("a health update cannot replace unsaved endpoint text", () => {
  const draft = {
    rpc: "https://my-custom.test",
    lcd: "https://draft-rest.test",
    evmRpc: effective.evmRpc,
  };
  const values = preferredEndpointFormValues("ethermint", effective, preferred);
  const updates = endpointFormUpdates(values, { rpc: true, lcd: true });
  expect({ ...draft, ...updates }).toEqual({
    ...draft,
    evmRpc: preferred.evmRpc,
  });
  expect(updates).not.toHaveProperty("rpc");
  expect(updates).not.toHaveProperty("lcd");
});
it("clean inputs follow saved preferences and remove fields absent on the next chain", () => {
  expect(endpointFormUpdates({ rpc: preferred.rpc }, {})).toEqual({
    rpc: preferred.rpc,
    lcd: undefined,
    evmRpc: undefined,
  });
});
