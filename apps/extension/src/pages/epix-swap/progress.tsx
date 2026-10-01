import React from "react";
import { DSColor, DSTypography } from "@keplr-wallet/design-system";
import { PendingSwapTransaction } from "./execution";

export type PreparationProgress = "idle" | "preparing" | "review" | "signing";
export type TranslateProgress = (
  key: string,
  values?: Record<string, string>
) => string;

export function transactionProgress(transaction: PendingSwapTransaction) {
  const total = transaction.direction ? 6 : 5;
  if (transaction.cancelled)
    return { completed: 0, total, label: "progress-cancelled" };
  if (transaction.failed) return { completed: 4, total, label: "failed" };
  if (transaction.received)
    return { completed: total, total, label: "progress-delivered" };
  if (transaction.confirmed)
    return { completed: 5, total, label: "progress-confirmed" };
  if (transaction.submissionUnknown)
    return { completed: 3, total, label: "progress-submitting" };
  return { completed: 4, total, label: "progress-submitted" };
}

export function StepProgress({
  t,
  completed,
  total,
  label,
}: {
  t: TranslateProgress;
  completed: number;
  total: number;
  label: string;
}) {
  return (
    <div>
      <div
        role="progressbar"
        aria-label={t("progress")}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={completed}
        aria-valuetext={t(label)}
        style={{
          display: "flex",
          gap: "0.25rem",
          height: "0.4rem",
          marginBottom: "0.5rem",
        }}
      >
        {Array.from({ length: total }, (_, index) => (
          <span
            key={index}
            aria-hidden="true"
            style={{
              flex: 1,
              borderRadius: "0.2rem",
              background:
                index < completed
                  ? DSColor.typography.brand
                  : DSColor.stroke.separator.primary,
            }}
          />
        ))}
      </div>
      <DSTypography as="p" size="textSm" role="status" aria-live="polite">
        {t(label)}
      </DSTypography>
    </div>
  );
}

export function PreparationSteps({
  t,
  progress,
  bridge,
}: {
  t: TranslateProgress;
  progress: PreparationProgress;
  bridge: boolean;
}) {
  if (progress === "idle") return null;
  const completed = { preparing: 0, review: 1, signing: 2 }[progress];
  return (
    <StepProgress
      t={t}
      completed={completed}
      total={bridge ? 6 : 5}
      label={`progress-${progress}`}
    />
  );
}
