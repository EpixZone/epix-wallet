export const PopupSize = {
  width: 360,
  // Keplr's default popup height is 600px.
  // Remember that below height includes status bar of OS.
  // If actual height excluded status bar is lesser than 600px,
  // it is hard to manage scroll bar of popup.
  // So, we need to add additional value to make sure that the actual height is greater than 600px.
  height: 660,
};

const lastWindowIds: Record<string, number | undefined> = {};
const lastTabIds: Record<string, number | undefined> = {};

// GeckoView (the Epix mobile shell) has no browser.windows API. Open the UI
// as a tab instead; the host app renders extension tabs as sheets over the
// browser (WebExtension.TabDelegate), so this behaves like a popup there.
async function openPopupTab(
  url: string,
  channel: string,
  ignoreURIReplacement: boolean
): Promise<number> {
  const lastTabId = lastTabIds[channel];
  if (lastTabId !== undefined) {
    try {
      if (!ignoreURIReplacement) {
        await browser.tabs.update(lastTabId, { active: true, url });
      } else {
        await browser.tabs.update(lastTabId, { active: true });
      }
      return lastTabId;
    } catch {
      // The tab is gone; fall through and open a new one.
    }
  }
  const tab = await browser.tabs.create({ url, active: true });
  lastTabIds[channel] = tab.id;
  return tab.id ?? -1;
}

/**
 * Try open window if no previous window exists.
 * If, previous window exists, try to change the location of this window.
 * Finally, try to recover focusing for opened window.
 * @param url
 */
export async function openPopupWindow(
  url: string,
  channel: string = "default",
  options:
    | Partial<Parameters<typeof browser.windows.create>[0]> & {
        ignoreURIReplacement?: boolean;
      } = {}
): Promise<number> {
  const ignoreURIReplacement = options.ignoreURIReplacement;

  if (typeof browser.windows === "undefined") {
    return openPopupTab(url, channel, !!ignoreURIReplacement);
  }
  const windowInfo = await browser.windows.getCurrent();
  const option = {
    top: (windowInfo.top || 0) + 80,
    left: Math.max(
      0,
      (windowInfo.left || 0) + (windowInfo.width || 0) - PopupSize.width - 100
    ),
    width: PopupSize.width,
    height: PopupSize.height,
    url: url,
    type: "popup" as const,
    ...options,
  };
  delete option.ignoreURIReplacement;

  if (lastWindowIds[channel] !== undefined) {
    try {
      const window = await browser.windows.get(
        lastWindowIds[channel] as number,
        {
          populate: true,
        }
      );
      if (window?.tabs?.length) {
        const tab = window.tabs[0];
        if (tab?.id) {
          if (!ignoreURIReplacement) {
            await browser.tabs.update(tab.id, { active: true, url });
          }
        } else {
          throw new Error("Null window or tabs");
        }
      } else {
        throw new Error("Null window or tabs");
      }
    } catch {
      lastWindowIds[channel] = (await browser.windows.create(option)).id;
    }
  } else {
    lastWindowIds[channel] = (await browser.windows.create(option)).id;
  }

  if (lastWindowIds[channel]) {
    try {
      await browser.windows.update(lastWindowIds[channel] as number, {
        focused: true,
      });
    } catch (e) {
      console.log(`Failed to update window focus: ${e.message}`);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return lastWindowIds[channel]!;
}

export function closePopupWindow(channel: string) {
  (async () => {
    if (typeof browser.windows === "undefined") {
      const tabId = lastTabIds[channel];
      if (tabId !== undefined) {
        await browser.tabs.remove(tabId);
      }
      return;
    }

    const windowId = lastWindowIds[channel];

    if (windowId) {
      await browser.windows.remove(windowId);
    }
  })();
}

/**
 * window.open() has many options for sizing, but they require different ways to do this per web browser.
 * So, to avoid this problem, just manually set sizing if new window popup is opened.
 */
export function fitPopupWindow() {
  // Get the gap size like title bar or menu bar, etc...
  const gap = {
    width: window.outerWidth - window.innerWidth,
    height: window.outerHeight - window.innerHeight,
  };

  if (browser.windows) {
    browser.windows.getCurrent().then((window) => {
      if (window?.id != null) {
        browser.windows.update(window.id, {
          width: PopupSize.width + gap.width,
          height: PopupSize.height + gap.height,
        });
      }
    });
    return;
  }

  window.resizeTo(PopupSize.width + gap.width, PopupSize.height + gap.height);
}

/**
 * In some case, opened window has scrollbar even if scroll is unnecessary.
 * This can spoil the layout of content slightly.
 * So, if you are sure you don't need scrolling, use this function to remove scrolling.
 */
export function disableScroll() {
  const html = document.getElementsByTagName("html");
  html[0].style.overflow = "hidden";
}

export function enableScroll() {
  const html = document.getElementsByTagName("html");
  html[0].style.overflow = "";
}
