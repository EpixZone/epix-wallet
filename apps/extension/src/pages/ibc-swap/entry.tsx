import React from "react";
import { useSearchParams } from "react-router-dom";
import { ChainIdHelper } from "@keplr-wallet/cosmos";
import { EpixSwapPage } from "../epix-swap";
import { IBCSwapPage } from ".";

export const IBCSwapEntryPage = () => {
  const [params] = useSearchParams();
  const chainId = params.get("chainId");
  const useOsmosis =
    !process.env["KEPLR_API_ENDPOINT"] ||
    !chainId ||
    ["epix_1916", "osmosis"].includes(ChainIdHelper.parse(chainId).identifier);

  return useOsmosis ? <EpixSwapPage /> : <IBCSwapPage />;
};
