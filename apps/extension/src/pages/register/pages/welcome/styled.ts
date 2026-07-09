import styled from "styled-components";

export const Styles = {
  Container: styled.div`
    height: 100vh;

    display: flex;
    flex-direction: row;
    justify-content: center;
    align-items: center;
    overflow: auto;

    padding: 6.25rem 10rem;

    @media screen and (max-height: 800px) {
      height: 100%;
    }

    // On narrow (phone) viewports the desktop padding would leave no room
    // for the content.
    @media screen and (max-width: 800px) {
      padding: 2.5rem 1.25rem;
    }
  `,
  ResponsiveContainer: styled.div`
    display: flex;
    flex-direction: row;
    justify-content: center;
    align-items: center;
    gap: 3rem;
  `,
  // A row of equal-width link cards; matches the old Columns layout at the
  // desktop width and wraps to two cards per row on narrow viewports.
  LinkItemRow: styled.div`
    display: flex;
    flex-direction: row;
    gap: 0.5rem;

    > * {
      flex: 1 1 0%;
      min-width: 0;
    }

    @media screen and (max-width: 480px) {
      flex-wrap: wrap;

      > * {
        flex-basis: calc(50% - 0.25rem);
      }
    }
  `,
  // The pin-the-extension hint only makes sense in a desktop browser, and
  // it overlaps the content on small screens.
  DesktopOnly: styled.div`
    @media screen and (max-width: 800px) {
      display: none;
    }
  `,
};
