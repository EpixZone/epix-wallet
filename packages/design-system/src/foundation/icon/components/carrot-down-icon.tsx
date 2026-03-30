import React from "react";
import type { DSIconProps } from "../types";

export const CarrotDownIcon: React.FC<DSIconProps> = ({
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
      d="M11.078 14.4939C11.5578 15.0696 12.442 15.0696 12.9218 14.4939L16.3597 10.3683C17.0111 9.58673 16.4553 8.4001 15.4379 8.4001L8.56196 8.4001C7.54455 8.4001 6.98877 9.58673 7.64009 10.3683L11.078 14.4939Z"
      fill={color}
    />
  </svg>
);
