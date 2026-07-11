import { Message } from "@keplr-wallet/router";
import { ROUTE } from "./constants";

export class GetThemeOptionMsg extends Message<string> {
  public static type() {
    return "GetThemeOptionMsg";
  }

  constructor() {
    super();
  }

  override approveExternal(): boolean {
    return true;
  }

  validateBasic(): void {
    // noop
  }

  route(): string {
    return ROUTE;
  }

  type(): string {
    return GetThemeOptionMsg.type();
  }
}

export class SetThemeOptionMsg extends Message<void> {
  public static type() {
    return "SetThemeOptionMsg";
  }

  constructor(public readonly themeOption: string) {
    super();
  }

  validateBasic(): void {
    // noop
  }

  route(): string {
    return ROUTE;
  }

  type(): string {
    return SetThemeOptionMsg.type();
  }
}

export class GetSidePanelOverlayDisabledMsg extends Message<boolean> {
  public static type() {
    return "GetSidePanelOverlayDisabledMsg";
  }

  constructor() {
    super();
  }

  // 웹페이지에 주입된 provider가 오버레이를 그리기 전에 조회해야 하므로 external 접근을 허용한다.
  override approveExternal(): boolean {
    return true;
  }

  validateBasic(): void {
    // noop
  }

  route(): string {
    return ROUTE;
  }

  type(): string {
    return GetSidePanelOverlayDisabledMsg.type();
  }
}

// 웹페이지가 유저 몰래 오버레이를 끄면 안 되므로 external 접근은 허용하지 않는다.
export class SetSidePanelOverlayDisabledMsg extends Message<void> {
  public static type() {
    return "SetSidePanelOverlayDisabledMsg";
  }

  constructor(public readonly disabled: boolean) {
    super();
  }

  validateBasic(): void {
    if (typeof this.disabled !== "boolean") {
      throw new Error("disabled must be boolean");
    }
  }

  route(): string {
    return ROUTE;
  }

  type(): string {
    return SetSidePanelOverlayDisabledMsg.type();
  }
}
