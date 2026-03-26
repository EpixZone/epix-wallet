import React from "react";
import type { DSIconProps } from "../types";

export const UserIcon: React.FC<DSIconProps> = ({
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
      d="M5.16037 17.85C6.81104 15.9219 9.26282 14.7 12 14.7C14.7372 14.7 17.189 15.9219 18.8396 17.85M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12ZM14.7 9.29998C14.7 10.7911 13.4912 12 12 12C10.5088 12 9.29999 10.7911 9.29999 9.29998C9.29999 7.80881 10.5088 6.59998 12 6.59998C13.4912 6.59998 14.7 7.80881 14.7 9.29998Z"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
