import React from "react";
import { observer } from "mobx-react-lite";
import { EpixMainSwapView } from "./main-swap-view";
import { useMainSwap } from "./use-main-swap";

export const EpixSwapPage = observer(() => (
  <EpixMainSwapView {...useMainSwap()} />
));
