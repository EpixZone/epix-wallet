import React, { FunctionComponent, useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react-lite";
import { useNavigate } from "react-router";
import { useSearchParams } from "react-router-dom";
import { useIntl } from "react-intl";
import { Dec } from "@keplr-wallet/unit";
import { Staking } from "@keplr-wallet/stores";
import { HeaderLayout } from "../../../layouts/header";
import { BackButton } from "../../../layouts/header/components";
import { useStore } from "../../../stores";
import { Box } from "../../../components/box";
import { XAxis } from "../../../components/axis";
import { Gutter } from "../../../components/gutter";
import { Stack } from "../../../components/stack";
import { SearchTextInput } from "../../../components/input";
import { Dropdown } from "../../../components/dropdown";
import { EmptyView } from "../../../components/empty-view";
import { Subtitle3 } from "../../../components/typography";
import {
  ValidatorListItem,
  ValidatorSortOption,
} from "../components/validator-item";

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

export const StakeValidatorListPage: FunctionComponent = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const chainId = searchParams.get("chainId");
  // In select mode the list works as the redelegate destination picker:
  // choosing a validator returns to the redelegate page with `dst` set
  // instead of opening the validator detail.
  const isSelectMode = searchParams.get("mode") === "select";
  const srcValidatorAddress = searchParams.get("src");
  // Amount/memo typed on the redelegate page ride along so they survive
  // the select round-trip.
  const carriedAmount = searchParams.get("amount") || "";
  const carriedMemo = searchParams.get("memo") || "";

  useEffect(() => {
    if (!chainId) {
      navigate("/stake", { replace: true });
    }
  }, [chainId, navigate]);

  if (!chainId) {
    return null;
  }

  return (
    <ValidatorListView
      chainId={chainId}
      isSelectMode={isSelectMode}
      srcValidatorAddress={srcValidatorAddress}
      carriedAmount={carriedAmount}
      carriedMemo={carriedMemo}
    />
  );
};

const ValidatorListView: FunctionComponent<{
  chainId: string;
  isSelectMode: boolean;
  srcValidatorAddress: string | null;
  carriedAmount: string;
  carriedMemo: string;
}> = observer(
  ({
    chainId,
    isSelectMode,
    srcValidatorAddress,
    carriedAmount,
    carriedMemo,
  }) => {
    const { accountStore, queriesStore } = useStore();
    const intl = useIntl();
    const navigate = useNavigate();

    const [sortOption, setSortOption] =
      useState<ValidatorSortOption>("voting-power");
    const [search, setSearch] = useState("");
    const debouncedSearch = useDebounce(search, 200);

    const queries = queriesStore.get(chainId);

    const bech32Address = accountStore.getAccount(chainId).bech32Address;
    const delegations =
      queries.cosmos.queryDelegations.getQueryBech32Address(
        bech32Address
      ).delegations;
    const delegationsValidatorSet = useMemo(() => {
      return new Set(
        delegations.map((del) => del.delegation.validator_address)
      );
    }, [delegations]);

    const bondedValidators = queries.cosmos.queryValidators.getQueryStatus(
      Staking.BondStatus.Bonded
    );

    const sortedValidators = useMemo(() => {
      if (sortOption === "voting-power") {
        return bondedValidators.validators.slice().sort((a, b) => {
          const aTokens = new Dec(a.tokens);
          const bTokens = new Dec(b.tokens);
          if (aTokens.gt(bTokens)) {
            return -1;
          } else if (aTokens.equals(bTokens)) {
            return 0;
          } else {
            return 1;
          }
        });
      }

      return bondedValidators.validators.slice().sort((a, b) => {
        const aRate = new Dec(a.commission.commission_rates.rate);
        const bRate = new Dec(b.commission.commission_rates.rate);
        if (aRate.lt(bRate)) {
          return -1;
        } else if (aRate.equals(bRate)) {
          return 0;
        } else {
          return 1;
        }
      });
    }, [bondedValidators.validators, sortOption]);

    const filteredValidators = useMemo(() => {
      const trimmedSearch = debouncedSearch.trim().toLowerCase();
      return sortedValidators.filter((val) => {
        return val.description.moniker
          ?.toLocaleLowerCase()
          .includes(trimmedSearch);
      });
    }, [debouncedSearch, sortedValidators]);

    return (
      <HeaderLayout
        title={intl.formatMessage({
          id: isSelectMode
            ? "page.stake.redelegate.select-validator-card.placeholder"
            : "page.stake.validator-list.title",
        })}
        left={<BackButton />}
      >
        <Box paddingX="0.75rem">
          <Gutter size="0.75rem" />

          <SearchTextInput
            placeholder={intl.formatMessage({
              id: "page.stake.validator-list.search-input-placeholder",
            })}
            value={search}
            onChange={(e) => {
              e.preventDefault();
              setSearch(e.target.value);
            }}
          />

          <Gutter size="0.5rem" />

          <XAxis alignY="center">
            <div style={{ flex: 1 }} />
            <Box width="10rem">
              <Dropdown
                size="small"
                selectedItemKey={sortOption}
                items={[
                  {
                    key: "voting-power",
                    label: intl.formatMessage({
                      id: "page.stake.validator-list.option.voting-power",
                    }),
                  },
                  {
                    key: "commission",
                    label: intl.formatMessage({
                      id: "page.stake.validator-list.option.commission",
                    }),
                  },
                ]}
                onSelect={(key) => {
                  setSortOption(key as ValidatorSortOption);
                }}
              />
            </Box>
          </XAxis>

          <Gutter size="0.75rem" />

          {filteredValidators.length === 0 && !bondedValidators.isFetching ? (
            <Box marginTop="3rem">
              <EmptyView
                subject={intl.formatMessage({
                  id: "page.stake.validator-list.empty-title",
                })}
              >
                <Subtitle3>
                  {intl.formatMessage({
                    id: "page.stake.validator-list.empty-text",
                  })}
                </Subtitle3>
              </EmptyView>
            </Box>
          ) : (
            <Stack gutter="0.5rem">
              {filteredValidators.map((validator) => (
                <ValidatorListItem
                  key={validator.operator_address}
                  chainId={chainId}
                  validator={validator}
                  sortOption={sortOption}
                  bondedToken={queries.cosmos.queryPool.bondedTokens}
                  isDelegation={delegationsValidatorSet.has(
                    validator.operator_address
                  )}
                  onClick={() => {
                    if (isSelectMode && srcValidatorAddress) {
                      navigate(
                        `/stake/redelegate/${chainId}/${srcValidatorAddress}?dst=${
                          validator.operator_address
                        }&amount=${encodeURIComponent(
                          carriedAmount
                        )}&memo=${encodeURIComponent(carriedMemo)}`,
                        {
                          replace: true,
                        }
                      );
                      return;
                    }

                    navigate(
                      `/stake/validator/${chainId}/${validator.operator_address}`
                    );
                  }}
                />
              ))}
            </Stack>
          )}

          <Gutter size="1.25rem" />
        </Box>
      </HeaderLayout>
    );
  }
);
