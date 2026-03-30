import React from "react";
import type { DSIconProps } from "../types";

export const CopyIcon: React.FC<DSIconProps> = ({
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
      d="M16 4H6.4C5.07452 4 4 5.07452 4 6.4V16M10.4 20H17.6C18.9255 20 20 18.9255 20 17.6V10.4C20 9.0745 18.9255 7.99999 17.6 7.99999H10.4C9.07454 7.99999 8.00002 9.0745 8.00002 10.4V17.6C8.00002 18.9255 9.07454 20 10.4 20Z"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);
