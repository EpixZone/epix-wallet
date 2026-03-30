import React from "react";
import type { DSIconProps } from "../types";

export const ArrowImportIcon: React.FC<DSIconProps> = ({
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
      d="M12 4V14.5862M12 14.5862L16.9655 9.62069M12 14.5862L7.03447 9.62069M4.27585 14.5862V15.8C4.27585 16.9201 4.27585 17.4802 4.49384 17.908C4.68558 18.2843 4.99154 18.5903 5.36787 18.782C5.79569 19 6.35574 19 7.47585 19H16.5241C17.6442 19 18.2043 19 18.6321 18.782C19.0084 18.5903 19.3144 18.2843 19.5061 17.908C19.7241 17.4802 19.7241 16.9201 19.7241 15.8V14.5862"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
