import React from "react";
import type { DSIconProps } from "../types";

export const RefreshIcon: React.FC<DSIconProps> = ({
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
      d="M3 12a9 9 0 0 1 9-9c2.52 0 4.93 1 6.74 2.74L21 8M21 3v5h-5M21 12a9 9 0 0 1-9 9c-2.52 0-4.93-1-6.74-2.74L3 16M3 21v-5h5"
      stroke={color}
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
