import { EIP712MessageValidator, domainHash, messageHash } from "./eip712";

const typedData = {
  types: {
    EIP712Domain: [{ name: "chainId", type: "uint256" }],
    Mail: [{ name: "contents", type: "string" }],
  },
  primaryType: "Mail",
  domain: { chainId: 1 },
  message: { contents: "Hello" },
};

test("validated EIP712 fields can be hashed for signing", async () => {
  const data = await EIP712MessageValidator.validateAsync(typedData);
  expect(domainHash(data)).toMatch(/^0x[0-9a-f]{64}$/);
  expect(messageHash(data)).toMatch(/^0x[0-9a-f]{64}$/);
});

test.each([
  "not a field array",
  [{ name: "contents" }],
  [{ type: "string" }],
  [{ name: "contents", type: 1 }],
])("rejects malformed custom EIP712 type fields", async (fields) => {
  await expect(
    EIP712MessageValidator.validateAsync({
      ...typedData,
      types: { ...typedData.types, Mail: fields },
    })
  ).rejects.toThrow();
});
