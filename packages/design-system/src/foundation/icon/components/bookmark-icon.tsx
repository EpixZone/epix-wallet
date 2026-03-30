import React from "react";
import type { DSIconProps } from "../types";

export const BookmarkIcon: React.FC<DSIconProps> = ({
  size = 24,
  color = "currentColor",
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <path
      d="M12 2.5498C14.0534 2.5498 16.0777 2.67572 18.0654 2.9209C19.3364 3.07767 20.2499 4.16929 20.25 5.41992V20.7002C20.2499 20.9578 20.1174 21.1977 19.8994 21.335C19.6813 21.4721 19.4081 21.4874 19.1758 21.376L12 17.9316L4.82422 21.376C4.59195 21.4874 4.31865 21.4721 4.10059 21.335C3.88257 21.1977 3.75013 20.9578 3.75 20.7002V5.41992C3.7501 4.16929 4.66364 3.07767 5.93457 2.9209C7.92229 2.67572 9.9466 2.5498 12 2.5498Z"
      fill={color}
    />
  </svg>
);
