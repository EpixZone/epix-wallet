import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { useForm, UseFormReturn } from "react-hook-form";
import { EndpointFormData, syncCleanEndpointFields } from "./endpoint-form";

function formController(
  initial: EndpointFormData
): UseFormReturn<EndpointFormData> {
  let form: UseFormReturn<EndpointFormData> | undefined;
  function Harness() {
    form = useForm<EndpointFormData>({ defaultValues: initial });
    return null;
  }
  renderToStaticMarkup(<Harness />);
  if (!form) throw new Error("Expected the real useForm controller");
  // Reset is the same production operation used when selecting a different chain.
  // It establishes values before registering the input event handlers below.
  const result = form as UseFormReturn<EndpointFormData>;
  result.reset(initial);
  result.register("rpc");
  result.register("lcd");
  result.register("evmRpc");
  return result;
}

it("real input changes survive a health refresh while clean fields adopt a new preferred baseline", async () => {
  const form = formController({
    rpc: "https://preferred-a.test",
    lcd: "https://rest-a.test",
  });
  await form.register("rpc").onChange({
    type: "change",
    target: { name: "rpc", value: "https://my-draft.test" },
  });
  expect(form.getFieldState("rpc").isDirty).toBe(true);
  syncCleanEndpointFields(
    { rpc: "https://preferred-a.test", lcd: "https://rest-a.test" },
    form
  );
  expect(form.getValues("rpc")).toBe("https://my-draft.test");
  // Another view saves new preferences; only this view's clean field may move.
  syncCleanEndpointFields(
    { rpc: "https://preferred-b.test", lcd: "https://rest-b.test" },
    form
  );
  expect(form.getValues()).toMatchObject({
    rpc: "https://my-draft.test",
    lcd: "https://rest-b.test",
  });
  expect(form.getFieldState("lcd").isDirty).toBe(false);
  await form.register("lcd").onChange({
    type: "change",
    target: { name: "lcd", value: "https://rest-a.test" },
  });
  expect(form.getFieldState("lcd").isDirty).toBe(true);
  syncCleanEndpointFields(
    { rpc: "https://preferred-c.test", lcd: "https://rest-c.test" },
    form
  );
  expect(form.getValues()).toMatchObject({
    rpc: "https://my-draft.test",
    lcd: "https://rest-a.test",
  });
});

it("real reset-to-default draft edits remain dirty until confirmed or reset to saved preferences", () => {
  const form = formController({
    rpc: "https://custom.test",
    lcd: "https://custom-rest.test",
  });
  form.setValue("rpc", "https://recommended.test", { shouldDirty: true });
  expect(form.getFieldState("rpc").isDirty).toBe(true);
  syncCleanEndpointFields(
    { rpc: "https://custom.test", lcd: "https://new-rest.test" },
    form
  );
  expect(form.getValues("rpc")).toBe("https://recommended.test");
  form.reset({ rpc: "https://next-chain.test", lcd: "https://next-rest.test" });
  expect(form.getValues("rpc")).toBe("https://next-chain.test");
});
