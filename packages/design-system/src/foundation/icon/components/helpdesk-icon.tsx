import React from "react";
import type { DSIconProps } from "../types";

export const HelpdeskIcon: React.FC<DSIconProps> = ({
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
      d="M9.56891 9.12394C10.3444 6.47542 14.3274 6.61537 14.6279 9.40223C14.6871 10.3995 14.0522 11.1805 13.3892 11.8808C13.0493 12.2348 12.744 12.6078 12.4733 13M12.25 16.3741V16.4238M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
