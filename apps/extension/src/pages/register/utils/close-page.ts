/** Close this registration tab without relying on script-opened window history. */
export async function closeRegistrationPage(): Promise<void> {
  const tab = await browser.tabs.getCurrent();
  if (tab) {
    if (tab.id === undefined) {
      throw new Error("Registration tab has no ID");
    }
    await browser.tabs.remove(tab.id);
    return;
  }

  // Extension action popups have no tab and still use the window close path.
  window.close();
}
