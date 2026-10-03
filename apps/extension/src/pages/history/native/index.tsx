import React, { FunctionComponent, useEffect, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { useStore } from "../../../stores";
import { Box } from "../../../components/box";
import { Button } from "../../../components/button";
import { DSTypography, DSColor } from "@keplr-wallet/design-system";
import { useIntl } from "react-intl";
import { Stack } from "../../../components/stack";
import { Gutter } from "../../../components/gutter";
import { RenderMessages } from "../../main/token-detail/messages";
import { ResMsgsHistory } from "../../main/token-detail/types";
import { MsgItemSkeleton } from "../../main/token-detail/msg-items/skeleton";
import { NativeHistoryPager } from "./query";

export const NativeHistory: FunctionComponent<{
  chainId: string;
  targetDenom?: string;
}> = observer(({ chainId, targetDenom }) => {
  const { chainStore, accountStore } = useStore();
  const chain = chainStore.getModularChain(chainId).unwrapped;
  const address = accountStore.getAccount(chainId).bech32Address;
  const rest =
    chain.type === "ethermint" || chain.type === "cosmos"
      ? chain.cosmos.rest
      : "";
  const nativeDenom =
    chain.type === "ethermint" || chain.type === "cosmos"
      ? chain.cosmos.stakeCurrency?.coinMinimalDenom ?? ""
      : "";
  // Remount when an account or endpoint changes, so old wallet records cannot
  // flash in a different account while its first request is pending.
  return (
    <NativeHistoryResults
      key={`${chainId}/${rest}/${address}/${targetDenom}`}
      chainId={chainId}
      address={address}
      rest={rest}
      nativeDenom={nativeDenom}
      targetDenom={targetDenom}
    />
  );
});

const NativeHistoryResults: FunctionComponent<{
  chainId: string;
  rest: string;
  address: string;
  nativeDenom: string;
  targetDenom?: string;
}> = ({ chainId, rest, address, nativeDenom, targetDenom }) => {
  const intl = useIntl();
  const text = (key: string) =>
    intl.formatMessage({ id: `page.history.native.${key}` });
  const [pages, setPages] = useState<{ response: ResMsgsHistory }[]>([]);
  const [error, setError] = useState(false);
  const [isFetching, setIsFetching] = useState(
    !!address && !!rest && !!nativeDenom
  );
  const [revision, setRevision] = useState(0);
  const loadMore = useRef<() => void>(() => undefined);

  useEffect(() => {
    const refresh = () => setRevision((value) => value + 1);
    window.addEventListener("epix-wallet-refresh", refresh);
    return () => window.removeEventListener("epix-wallet-refresh", refresh);
  }, []);

  useEffect(() => {
    setPages([]);
    setError(false);
    if (!address || !rest || !nativeDenom) return;
    const controller = new AbortController();
    const pager = new NativeHistoryPager(rest, chainId, address, nativeDenom);
    let fetching = false;
    const load = async () => {
      if (fetching) return;
      fetching = true;
      setIsFetching(true);
      setError(false);
      try {
        const response = await pager.next(controller.signal);
        if (!controller.signal.aborted)
          setPages((previous) => [...previous, { response }]);
      } catch {
        if (!controller.signal.aborted) setError(true);
      } finally {
        fetching = false;
        if (!controller.signal.aborted) setIsFetching(false);
      }
    };
    loadMore.current = () => {
      void load();
    };
    void load();
    return () => {
      controller.abort();
      loadMore.current = () => undefined;
    };
  }, [address, chainId, nativeDenom, rest, revision]);

  const visiblePages = pages.map(({ response }) => ({
    response: {
      ...response,
      msgs: response.msgs.filter(
        ({ msg }) => !targetDenom || msg.denoms?.includes(targetDenom)
      ),
    },
  }));
  const hasMessages = visiblePages.some(
    ({ response }) => response.msgs.length > 0
  );
  const hasMore = !!pages.at(-1)?.response.nextCursor;
  let emptyMessage = "loading-account";
  if (address) emptyMessage = hasMore ? "empty-page" : "empty";
  return (
    <Box paddingY="0.75rem">
      <Box paddingX="0.75rem">
        <DSTypography as="p" size="textSm" color={DSColor.typography.primary}>
          {text("title")}
        </DSTypography>
        <Gutter size="0.5rem" />
        <DSTypography as="p" size="textSm" color={DSColor.typography.primary}>
          {text("coverage")}
        </DSTypography>
        <Gutter size="0.75rem" />
        {targetDenom ? (
          <Button
            text={text("refresh")}
            size="small"
            color="secondary"
            disabled={isFetching || !address}
            onClick={() =>
              window.dispatchEvent(new Event("epix-wallet-refresh"))
            }
          />
        ) : null}
      </Box>
      <Gutter size="0.75rem" />
      {hasMessages ? (
        <RenderMessages
          msgHistory={{
            pages: visiblePages,
            isFetching,
            next: () => loadMore.current(),
          }}
          targetDenom={targetDenom ?? ((msg) => msg.denoms?.[0] ?? nativeDenom)}
          isInAllActivitiesPage={!targetDenom}
        />
      ) : null}
      {isFetching ? (
        <Box paddingX="0.75rem">
          <Stack gutter="0.5rem">
            <MsgItemSkeleton />
            <MsgItemSkeleton />
          </Stack>
        </Box>
      ) : null}
      {error ? (
        <Box padding="0.75rem">
          <DSTypography as="p" size="textSm" color={DSColor.typography.primary}>
            {text("error")}
          </DSTypography>
          <Gutter size="0.75rem" />
          <Button
            text={text("retry")}
            size="small"
            onClick={() => loadMore.current()}
          />
        </Box>
      ) : null}
      {!isFetching && !error && !hasMessages ? (
        <Box padding="0.75rem">
          <DSTypography as="p" size="textSm" color={DSColor.typography.primary}>
            {text(emptyMessage)}
          </DSTypography>
        </Box>
      ) : null}
      {hasMore && !isFetching && !error ? (
        <Box padding="0.75rem">
          <Button
            text={text("load-more")}
            size="small"
            color="secondary"
            onClick={() => loadMore.current()}
          />
        </Box>
      ) : null}
    </Box>
  );
};
