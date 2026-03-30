import React from "react";
import type { DSIconProps } from "../types";

export const KeyOutlineIcon: React.FC<DSIconProps> = ({
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
      d="M7.45455 17.4545C5.93939 17.4545 4.65152 16.9242 3.59091 15.8636C2.5303 14.803 2 13.5151 2 12C2 10.4848 2.5303 9.19693 3.59091 8.13632C4.65152 7.07571 5.93939 6.54541 7.45455 6.54541C8.68182 6.54541 9.75394 6.8939 10.6709 7.59086C11.3877 8.13571 11.9353 8.78241 12.3136 9.53096C12.5049 9.90953 12.8746 10.1818 13.2988 10.1818H20.2045L22 11.9772L18.8182 15.6136L16.5455 14L14.7273 15.6363L12.5909 13.8181C12.2121 14.909 11.553 15.7878 10.6136 16.4545C9.67424 17.1212 8.62121 17.4545 7.45455 17.4545Z"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M8.45455 12C8.45455 12.5523 8.00683 13 7.45455 13C6.90226 13 6.45455 12.5523 6.45455 12C6.45455 11.4477 6.90226 11 7.45455 11C8.00683 11 8.45455 11.4477 8.45455 12Z"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M7.95456 12C7.95456 12.2761 7.7307 12.5 7.45456 12.5C7.17842 12.5 6.95456 12.2761 6.95456 12C6.95456 11.7239 7.17842 11.5 7.45456 11.5C7.7307 11.5 7.95456 11.7239 7.95456 12Z"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
