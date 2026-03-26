import React from "react";
import type { DSIconProps } from "../types";

export const MenuIcon: React.FC<DSIconProps> = ({
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
      fillRule="evenodd"
      clipRule="evenodd"
      d="M2.40002 8.09995C2.40002 7.60289 2.80297 7.19995 3.30002 7.19995H20.7C21.1971 7.19995 21.6 7.60289 21.6 8.09995C21.6 8.59701 21.1971 8.99995 20.7 8.99995H3.30002C2.80297 8.99995 2.40002 8.59701 2.40002 8.09995ZM2.40002 15.9C2.40002 15.4029 2.80297 15 3.30002 15H20.7C21.1971 15 21.6 15.4029 21.6 15.9C21.6 16.397 21.1971 16.8 20.7 16.8H3.30002C2.80297 16.8 2.40002 16.397 2.40002 15.9Z"
      fill={color}
    />
  </svg>
);
