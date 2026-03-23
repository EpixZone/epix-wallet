import {
  IRecipientConfig,
  UIProperties,
  IRecipientConfigWithNameServices,
} from "./types";
import { TxChainSetter } from "./chain";
import { ChainGetter } from "@keplr-wallet/stores";
import { EthereumAccountBase } from "@keplr-wallet/stores-eth";
import { action, computed, makeObservable, observable } from "mobx";
import { EmptyAddressError, InvalidHexError } from "./errors";
import { useState } from "react";
import { NameService } from "./name-service";
import { ENSNameService } from "./name-service-ens";

export class RecipientConfig
  extends TxChainSetter
  implements IRecipientConfig, IRecipientConfigWithNameServices
{
  @observable
  protected _value: string = "";

  @observable
  protected _preferredNameService: string | undefined = undefined;

  @observable.ref
  protected nameServices: NameService[] = [];

  constructor(
    chainGetter: ChainGetter,
    initialChainId: string,
    ens?: { chainId: string }
  ) {
    super(chainGetter, initialChainId);

    if (ens) {
      this.nameServices.push(new ENSNameService(this, chainGetter, ens));
    }

    makeObservable(this);
  }

  get preferredNameService(): string | undefined {
    return this._preferredNameService;
  }

  @action
  setPreferredNameService(nameService: string | undefined) {
    this._preferredNameService = nameService;
  }

  getNameService(type: string): NameService | undefined {
    return this.nameServices.find((nameService) => nameService.type === type);
  }

  getNameServices(): NameService[] {
    return this.nameServices;
  }

  @computed
  get nameServiceResult(): {
    type: string;
    address: string;
    fullName: string;
    domain: string;
    suffix: string;
  }[] {
    const result: {
      type: string;
      address: string;
      fullName: string;
      domain: string;
      suffix: string;
    }[] = [];
    for (const nameService of this.nameServices) {
      if (
        this.preferredNameService &&
        nameService.type !== this.preferredNameService
      ) {
        continue;
      }

      const r = nameService.result;
      if (r) {
        result.push({
          ...r,
          type: nameService.type,
        });
      }
    }
    return result;
  }

  @action
  setENS(ens: { chainId: string }) {
    const found = this.nameServices.find(
      (nameService) => nameService.type === "ens"
    );
    if (found) {
      (found as ENSNameService).setENS(ens);
    } else {
      this.nameServices.push(new ENSNameService(this, this.chainGetter, ens));
    }
  }

  get recipient(): string {
    if (this.nameServiceResult.length > 0) {
      const r = this.nameServiceResult[0];
      return r.address;
    }

    return this.value.trim();
  }

  @computed
  get uiProperties(): UIProperties {
    let rawRecipient = this.value.trim();

    if (!rawRecipient) {
      return {
        error: new EmptyAddressError("Address is empty"),
      };
    }

    if (this.nameServiceResult.length > 0) {
      const r = this.nameServiceResult[0];
      rawRecipient = r.address;
    }

    if (!EthereumAccountBase.isEthereumHexAddressWithChecksum(rawRecipient)) {
      return {
        error: new InvalidHexError("Invalid hex address"),
      };
    }

    return {};
  }

  get value(): string {
    return this._value;
  }

  @action
  setValue(value: string): void {
    this._value = value;

    for (const nameService of this.nameServices) {
      nameService.setValue(value);
    }
  }
}

export const useRecipientConfig = (
  chainGetter: ChainGetter,
  chainId: string,
  options?: { ens?: { chainId: string } }
) => {
  const [config] = useState(
    () => new RecipientConfig(chainGetter, chainId, options?.ens)
  );
  config.setChain(chainId);
  if (options?.ens) {
    config.setENS(options.ens);
  }

  return config;
};
