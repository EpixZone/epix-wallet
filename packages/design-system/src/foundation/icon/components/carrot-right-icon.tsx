import React from "react";
import type { DSIconProps } from "../types";

export const CarrotRightIcon: React.FC<DSIconProps> = ({
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
      d="M15.0936 11.0782C15.6694 11.558 15.6694 12.4422 15.0937 12.922L10.9681 16.3599C10.1865 17.0112 8.99989 16.4555 8.99989 15.438L8.99989 8.56215C8.99989 7.54474 10.1865 6.98896 10.9681 7.64028L15.0936 11.0782Z"
      fill={color}
    />
  </svg>
);
