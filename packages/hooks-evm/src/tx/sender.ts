import { ISenderConfig, UIProperties } from "./types";
import { TxChainSetter } from "./chain";
import { action, makeObservable, observable } from "mobx";
import { ChainGetter } from "@keplr-wallet/stores";
import { useState } from "react";
import { EmptyAddressError, InvalidHexError } from "./errors";
import { Buffer } from "buffer";

export class SenderConfig extends TxChainSetter implements ISenderConfig {
  @observable
  protected _value: string = "";

  constructor(
    chainGetter: ChainGetter,
    initialChainId: string,
    initialSender: string
  ) {
    super(chainGetter, initialChainId);

    this._value = initialSender;

    makeObservable(this);
  }

  get sender(): string {
    return this._value;
  }

  get value(): string {
    return this._value;
  }

  @action
  setValue(value: string): void {
    this._value = value;
  }

  get uiProperties(): UIProperties {
    if (!this.value) {
      return {
        error: new EmptyAddressError("Address is empty"),
      };
    }

    if (!this.value.startsWith("0x")) {
      return {
        error: new InvalidHexError("Invalid hex address for chain"),
      };
    }

    {
      const hex = this.value.replace("0x", "");
      const buf = Buffer.from(hex, "hex");
      if (buf.length !== 20) {
        return {
          error: new InvalidHexError("Invalid hex address for chain"),
        };
      }
      if (hex.toLowerCase() !== buf.toString("hex").toLowerCase()) {
        return {
          error: new InvalidHexError("Invalid hex address for chain"),
        };
      }
    }

    return {};
  }
}

export const useSenderConfig = (
  chainGetter: ChainGetter,
  chainId: string,
  sender: string
) => {
  const [config] = useState(
    () => new SenderConfig(chainGetter, chainId, sender)
  );
  config.setChain(chainId);
  config.setValue(sender);

  return config;
};
