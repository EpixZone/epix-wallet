import React, { FunctionComponent, useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { BackButton } from "../../../../layouts/header/components";
import { HeaderLayout } from "../../../../layouts/header";
import styled from "styled-components";
import { Stack } from "../../../../components/stack";
import { GuideBox } from "../../../../components/guide-box";
import { ChainStore, useStore } from "../../../../stores";
import { Column, Columns } from "../../../../components/column";
import { Dropdown } from "../../../../components/dropdown";
import { Button } from "../../../../components/button";
import { Box } from "../../../../components/box";
import { TextInput } from "../../../../components/input";
import { useForm, UseFormRegister } from "react-hook-form";
import {
  checkEvmRpcConnectivity,
  checkRestConnectivity,
  checkRPCConnectivity,
  checkStarknetRpcConnectivity,
  DifferentChainVersionError,
} from "@keplr-wallet/chain-validator";
import { useNotification } from "../../../../hooks/notification";
import { useConfirm } from "../../../../hooks/confirm";
import { GetChainOriginalEndpointsMsg } from "@keplr-wallet/background";
import { InExtensionMessageRequester } from "@keplr-wallet/router-extension";
import { BACKGROUND_PORT } from "@keplr-wallet/router";
import { FormattedMessage, useIntl } from "react-intl";
import { ModularChainInfo } from "@keplr-wallet/types";
import { filterModularChainInfosByKeyType } from "../../../../utils/is-chain-supported-by-key-type";

const Styles = {
  Container: styled(Stack)`
    height: 100%;
    padding: 0 0.75rem;
  `,
  Flex1: styled.div`
    flex: 1;
  `,
};

// --- Types ---

interface FormData {
  rpc: string;
  lcd?: string;
  evmRpc?: string;
}

interface OriginalEndpoint {
  rpc: string;
  rest?: string;
  evmRpc?: string;
}

// --- Field Descriptor ---
// formKey: key in FormData, originalKey: key in OriginalEndpoint

interface EndpointField {
  formKey: keyof FormData;
  originalKey: keyof OriginalEndpoint;
  label: string;
}

const FIELD_RPC: EndpointField = {
  formKey: "rpc",
  originalKey: "rpc",
  label: "RPC",
};
const FIELD_LCD: EndpointField = {
  formKey: "lcd",
  originalKey: "rest",
  label: "LCD",
};
const FIELD_EVM_RPC: EndpointField = {
  formKey: "evmRpc",
  originalKey: "evmRpc",
  label: "EVM RPC",
};

const ALL_FORM_KEYS: (keyof FormData)[] = ["rpc", "lcd", "evmRpc"];

// --- Generic Field Operations ---

function formFieldsMatch(
  fields: EndpointField[],
  a: Partial<FormData>,
  b: Partial<FormData>
): boolean {
  return fields.every((f) => a[f.formKey] === b[f.formKey]);
}

function formMatchesOriginal(
  fields: EndpointField[],
  formValues: Partial<FormData>,
  original: OriginalEndpoint
): boolean {
  return fields.every(
    (f) =>
      (formValues[f.formKey] as string | undefined) ===
      (original[f.originalKey] as string | undefined)
  );
}

// --- Chain Endpoint Config ---

type ConnectivityChecker = (
  checkFn: () => Promise<void>,
  endpointLabel: string
) => Promise<void>;

interface ChainEndpointConfig {
  fields: EndpointField[];
  currentValues: FormData;
  validate: (
    data: FormData,
    originalEndpoint: OriginalEndpoint | undefined,
    check: ConnectivityChecker
  ) => Promise<void>;
  getSubmitArgs: (
    data: FormData
  ) => [string | undefined, string | undefined, string | undefined];
}

function getChainEndpointConfig(
  chainInfoU: ModularChainInfo,
  chainId: string
): ChainEndpointConfig {
  switch (chainInfoU.type) {
    case "cosmos":
      return {
        fields: [FIELD_RPC, FIELD_LCD],
        currentValues: {
          rpc: chainInfoU.cosmos.rpc,
          lcd: chainInfoU.cosmos.rest,
        },
        validate: async (data, orig, check) => {
          if (orig?.rpc !== data.rpc) {
            await check(() => checkRPCConnectivity(chainId, data.rpc), "RPC");
          }
          if (data.lcd != null && orig?.rest !== data.lcd) {
            await check(() => checkRestConnectivity(chainId, data.lcd!), "LCD");
          }
        },
        getSubmitArgs: (data) => [data.rpc, data.lcd, undefined],
      };
    case "ethermint": {
      const evmChainId = chainInfoU.evm.chainId;
      return {
        fields: [FIELD_RPC, FIELD_LCD, FIELD_EVM_RPC],
        currentValues: {
          rpc: chainInfoU.cosmos.rpc,
          lcd: chainInfoU.cosmos.rest,
          evmRpc: chainInfoU.evm.rpc,
        },
        validate: async (data, orig, check) => {
          if (orig?.rpc !== data.rpc) {
            await check(() => checkRPCConnectivity(chainId, data.rpc), "RPC");
          }
          if (data.lcd != null && orig?.rest !== data.lcd) {
            await check(() => checkRestConnectivity(chainId, data.lcd!), "LCD");
          }
          if (data.evmRpc != null && orig?.evmRpc !== data.evmRpc) {
            await check(
              () => checkEvmRpcConnectivity(evmChainId, data.evmRpc!),
              "EVM RPC"
            );
          }
        },
        getSubmitArgs: (data) => [data.rpc, data.lcd, data.evmRpc],
      };
    }
    case "evm": {
      const evmChainId = chainInfoU.evm.chainId;
      return {
        fields: [FIELD_RPC],
        currentValues: { rpc: chainInfoU.evm.rpc },
        validate: async (data, orig) => {
          if (orig?.rpc !== data.rpc) {
            await checkEvmRpcConnectivity(evmChainId, data.rpc);
          }
        },
        getSubmitArgs: (data) => [undefined, undefined, data.rpc],
      };
    }
    case "starknet":
      return {
        fields: [FIELD_RPC],
        currentValues: { rpc: chainInfoU.starknet.rpc },
        validate: async (data, orig) => {
          if (orig?.rpc !== data.rpc) {
            await checkStarknetRpcConnectivity(chainId, data.rpc);
          }
        },
        getSubmitArgs: (data) => [data.rpc, undefined, undefined],
      };
    default:
      throw new Error(`Unsupported chain type: ${(chainInfoU as any).type}`);
  }
}

// --- Endpoint Input Rendering ---

const EndpointInputs: FunctionComponent<{
  fields: EndpointField[];
  register: UseFormRegister<FormData>;
}> = ({ fields, register }) => (
  <React.Fragment>
    {fields.map((field) => (
      <TextInput
        key={field.formKey}
        label={field.label}
        {...register(field.formKey)}
      />
    ))}
  </React.Fragment>
);

// --- Main Page ---

function getEndpointSelectableChains(
  chainStore: ChainStore,
  keyType: string | undefined
) {
  const chainsInUI = filterModularChainInfosByKeyType(
    keyType,
    chainStore.modularChainInfosInUI
  ).filter((ci) => ci.type !== "bitcoin");
  if (chainsInUI.length > 0) {
    return chainsInUI;
  }

  throw new Error("No chain available for endpoint settings in UI");
}

export const SettingAdvancedEndpointPage: FunctionComponent = observer(() => {
  const { chainStore, keyRingStore } = useStore();

  const notification = useNotification();
  const confirm = useConfirm();
  const intl = useIntl();

  const selectableChains = getEndpointSelectableChains(
    chainStore,
    keyRingStore.selectedKeyInfo?.type
  );

  const [chainId, setChainId] = useState<string>(selectableChains[0].chainId);
  const [originalEndpoint, setOriginalEndpoint] = useState<
    OriginalEndpoint | undefined
  >();
  const [isLoading, setIsLoading] = useState(false);

  const chainList = selectableChains.map((ci) => ({
    key: ci.chainId,
    label: ci.chainName,
  }));

  const activeChainId = chainList.some((item) => item.key === chainId)
    ? chainId
    : chainList[0].key;
  const modularChainInfo = chainStore.getModularChain(activeChainId);
  const config = getChainEndpointConfig(
    modularChainInfo.unwrapped,
    activeChainId
  );

  const { setValue, watch, register, handleSubmit } = useForm<FormData>({
    defaultValues: config.currentValues,
  });

  useEffect(() => {
    const activeKeys = new Set(config.fields.map((f) => f.formKey));
    for (const key of ALL_FORM_KEYS) {
      setValue(
        key,
        activeKeys.has(key) ? config.currentValues[key] : undefined
      );
    }

    const msg = new GetChainOriginalEndpointsMsg(activeChainId);
    new InExtensionMessageRequester()
      .sendMessage(BACKGROUND_PORT, msg)
      .then((r) => setOriginalEndpoint(r))
      .catch((e) => {
        console.log(e);
        setOriginalEndpoint(undefined);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeChainId,
    config.currentValues.rpc,
    config.currentValues.lcd,
    config.currentValues.evmRpc,
    setValue,
  ]);

  const watchedValues: Partial<FormData> = {
    rpc: watch("rpc"),
    lcd: watch("lcd"),
    evmRpc: watch("evmRpc"),
  };

  const isEndpointNothingChanged = formFieldsMatch(
    config.fields,
    watchedValues,
    config.currentValues
  );

  const checkConnectivityWithConfirm: ConnectivityChecker = async (
    checkFn,
    endpointType
  ) => {
    try {
      await checkFn();
    } catch (e) {
      if (e instanceof DifferentChainVersionError) {
        if (
          !(await confirm.confirm(
            "Different chain id",
            `The ${endpointType} endpoint of the node might have different version with the registered chain. Do you want to proceed?`
          ))
        ) {
          throw e;
        }
      } else {
        throw e;
      }
    }
  };

  return (
    <HeaderLayout
      title={intl.formatMessage({
        id: "page.setting.advanced.change-endpoints-title",
      })}
      left={<BackButton />}
      bottomButtons={[
        {
          text: intl.formatMessage({ id: "button.confirm" }),
          color: "primary",
          size: "large",
          type: "submit",
          isLoading,
          disabled: isEndpointNothingChanged,
        },
      ]}
      onSubmit={handleSubmit(async (data) => {
        setIsLoading(true);

        try {
          const matchesOriginal =
            originalEndpoint &&
            formMatchesOriginal(config.fields, data, originalEndpoint);

          if (!matchesOriginal) {
            try {
              await config.validate(
                data,
                originalEndpoint,
                checkConnectivityWithConfirm
              );
            } catch (e) {
              console.error(e);
              notification.show(
                "failed",
                intl.formatMessage({ id: "error.failed-to-set-endpoints" }),
                e.message || e.toString()
              );
              return;
            }
          }

          if (matchesOriginal) {
            await chainStore.resetChainEndpoints(activeChainId);
          } else {
            const [rpc, rest, evmRpc] = config.getSubmitArgs(data);
            await chainStore.setChainEndpoints(
              activeChainId,
              rpc,
              rest,
              evmRpc
            );
          }

          await confirm.confirm(
            intl.formatMessage({
              id: "page.setting.advanced.endpoint.confirm-title",
            }),
            intl.formatMessage({
              id: "page.setting.advanced.endpoint.confirm-paragraph",
            }),
            { forceYes: true }
          );

          window.close();
        } catch (e) {
          console.error(e);
        } finally {
          setIsLoading(false);
        }
      })}
    >
      <Styles.Container gutter="1rem">
        <Columns sum={1} alignY="center">
          <Box width="13rem">
            <Dropdown
              items={chainList}
              selectedItemKey={activeChainId}
              onSelect={setChainId}
              allowSearch={true}
            />
          </Box>

          <Column weight={1} />
          <Button
            size="extraSmall"
            text={intl.formatMessage({
              id: "page.setting.advanced.endpoint.reset-button",
            })}
            color="secondary"
            disabled={
              !originalEndpoint ||
              formMatchesOriginal(
                config.fields,
                watchedValues,
                originalEndpoint
              )
            }
            onClick={() => {
              if (originalEndpoint) {
                for (const field of config.fields) {
                  setValue(
                    field.formKey,
                    originalEndpoint[field.originalKey] as string | undefined
                  );
                }
              }
            }}
          />
        </Columns>

        <EndpointInputs fields={config.fields} register={register} />

        <Styles.Flex1 />

        <GuideBox
          title={intl.formatMessage({
            id: "page.setting.advanced.endpoint.guide-title",
          })}
          paragraph={
            <Box>
              <FormattedMessage
                id="page.setting.advanced.endpoint.guide-paragraph"
                values={{ br: <br /> }}
              />
            </Box>
          }
        />
      </Styles.Container>
    </HeaderLayout>
  );
});
