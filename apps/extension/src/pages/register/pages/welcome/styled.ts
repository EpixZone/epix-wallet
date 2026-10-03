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
      padding: 1.25rem;
      align-items: flex-start;
    }
  `,
  CongratsImage: styled.img`
    @media screen and (max-width: 640px) {
      max-width: 4.5rem;
    }
  `,
  ResponsiveContainer: styled.div`
    display: flex;
    flex-direction: row;
    justify-content: center;
    align-items: center;
    gap: 3rem;
  `,
  // The pin-the-extension hint only makes sense in a desktop browser, and
  // it overlaps the content on small screens.
  DesktopOnly: styled.div`
    @media screen and (max-width: 800px) {
      display: none;
    }
  `,
};
