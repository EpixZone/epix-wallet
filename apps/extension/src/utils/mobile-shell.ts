// Whether we run inside one of the mobile shells (Android GeckoView, iOS
// WKWebView) rather than a desktop browser. Both mobile engines report
// Android/iOS + "Mobile" in the user agent, desktop browsers do not.
//
// On the mobile shells the UI always fills a full-screen document (a
// GeckoView tab or the WKWebView's mobile.html) whose size the page cannot
// influence, so the fluid side-panel layout applies instead of the fixed
// 360px popup layout. Desktop browser-action popups must keep the fixed
// width: they size themselves to the page's preferred width, and a fluid
// page would collapse to the initial (tiny) popup viewport.
export const isMobileShell = (): boolean => {
  return (
    typeof navigator !== "undefined" &&
    /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
  );
};
