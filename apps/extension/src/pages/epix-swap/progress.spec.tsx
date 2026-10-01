import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StepProgress, transactionProgress } from "./progress";
import { PendingSwapTransaction } from "./execution";
const base: PendingSwapTransaction = {
  chainId: "epix_1916-1",
  hash: "A".repeat(64),
  confirmed: false,
  direction: "deposit",
};
it("shows factual source and destination milestones without simulated percentages", () => {
  expect(transactionProgress({ ...base, submissionUnknown: true })).toEqual({
    completed: 3,
    total: 6,
    label: "progress-submitting",
  });
  expect(transactionProgress(base).completed).toBe(4);
  expect(transactionProgress({ ...base, confirmed: true }).completed).toBe(5);
  expect(
    transactionProgress({ ...base, confirmed: true, received: true }).completed
  ).toBe(6);
  expect(
    transactionProgress({ ...base, confirmed: true, failed: true }).label
  ).toBe("failed");
});
it("exposes labeled step counts and current status to assistive technology", () => {
  const html = renderToStaticMarkup(
    <StepProgress
      t={(key) => key}
      completed={3}
      total={6}
      label="progress-submitting"
    />
  );
  expect(html).toContain('role="progressbar"');
  expect(html).toContain('aria-valuenow="3"');
  expect(html).toContain('aria-valuemax="6"');
  expect(html).toContain('aria-valuetext="progress-submitting"');
  expect(html).toContain('aria-live="polite"');
});
