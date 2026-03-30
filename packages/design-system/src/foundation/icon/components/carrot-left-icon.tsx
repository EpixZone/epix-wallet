import React from "react";
import type { DSIconProps } from "../types";

export const CarrotLeftIcon: React.FC<DSIconProps> = ({
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
      d="M8.90614 11.0782C8.33043 11.558 8.33043 12.4422 8.90614 12.922L13.0317 16.3599C13.8133 17.0112 14.9999 16.4555 14.9999 15.438L14.9999 8.56215C14.9999 7.54474 13.8133 6.98896 13.0317 7.64028L8.90614 11.0782Z"
      fill={color}
    />
  </svg>
);
