import React from "react";
import type { DSIconProps } from "../types";

export const CarrotUpIcon: React.FC<DSIconProps> = ({
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
      d="M11.078 9.50634C11.5578 8.93063 12.442 8.93063 12.9218 9.50634L16.3597 13.6319C17.0111 14.4135 16.4553 15.6001 15.4379 15.6001L8.56196 15.6001C7.54455 15.6001 6.98877 14.4135 7.64009 13.6319L11.078 9.50634Z"
      fill={color}
    />
  </svg>
);
