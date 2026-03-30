import React from "react";
import type { DSIconProps } from "../types";

export const BottomnavigationSwapIcon: React.FC<DSIconProps> = ({
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
      d="M4.49976 7.49974L8.49976 3.49975M4.49976 7.49974C6.06185 9.06184 6.93766 9.93764 8.49976 11.4997M4.49976 7.49974L15.4998 7.49974M18.5 16.5L14.5 12.5M18.5 16.5C16.9379 18.0621 16.0621 18.9379 14.5 20.5M18.5 16.5L7.5 16.5"
      stroke={color}
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
