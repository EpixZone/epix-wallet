import React from "react";
import type { DSIconProps } from "../types";

export const VoteIcon: React.FC<DSIconProps> = ({
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
    <g clipPath="url(#clip0_677_8952)">
      <path
        d="M7.59913 7.77255L5.15137 9.17001C4.47341 9.55707 4.47341 10.5346 5.15137 10.9216L10.6052 14.0353C11.351 14.4611 12.2663 14.4611 13.0121 14.0353L18.4659 10.9216C19.1439 10.5346 19.1439 9.55707 18.4659 9.17001L15.7321 7.60921"
        stroke={color}
        strokeWidth="1.7"
      />
      <path
        d="M4.75003 10.5009L4.75003 16.6599C4.75003 17.1006 4.98889 17.5066 5.37405 17.7207L10.6305 20.6424C11.3632 21.0496 12.2542 21.05 12.9872 20.6433L17.5 18.1398"
        stroke={color}
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M7.75 4.84615L11.4559 9L16.75 3"
        stroke={color}
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
    <defs>
      <clipPath id="clip0_677_8952">
        <rect width="24" height="24" fill={color} />
      </clipPath>
    </defs>
  </svg>
);
