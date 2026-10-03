import { createGlobalStyle } from "styled-components";

export const SidePanelMaxWidth = "540px";
export const GlobalSidePanelStyle = createGlobalStyle`
  html {
    margin-left: auto;
    margin-right: auto;
    
    // 스크롤은 simplebar가 모두 처리한다고 가정하고 설정된것임. 주의할 것.
    overflow: hidden;
  }
  
  body {
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  
  #app {
    width: 100%;
    max-width: ${SidePanelMaxWidth};
  }

  html[data-mobile-popup-viewport="true"] body {
    height: var(--wallet-viewport-height);
    min-height: 0;
    // Give fixed headers, actions and body-level modals the visible viewport
    // as their containing block, including after the mobile keyboard closes.
    transform: translateY(var(--wallet-viewport-top));
  }

  html[data-mobile-popup-viewport="true"] #app {
    height: 100%;
    min-height: 0;
  }
`;
