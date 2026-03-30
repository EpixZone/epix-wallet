import React from "react";
import type { DSIconProps } from "../types";

export const BackspaceIcon: React.FC<DSIconProps> = ({
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
      d="M10.3889 9.20761L13.1813 12M13.1813 12L15.9737 14.7924M13.1813 12L15.9737 9.2076M13.1813 12L10.3889 14.7924M8.62177 4.59277H17.6491C19.4998 4.59277 21 6.09302 21 7.94366V16.0563C21 17.907 19.4998 19.4072 17.6491 19.4072H8.62177C7.62561 19.4072 6.6811 18.964 6.04447 18.1978L2.67404 14.1415C1.64259 12.9001 1.64259 11.0999 2.67404 9.85852L6.04447 5.80217C6.6811 5.03599 7.62561 4.59277 8.62177 4.59277Z"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
