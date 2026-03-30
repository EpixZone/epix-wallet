import React from "react";
import type { DSIconProps } from "../types";

export const PencilSquareIcon: React.FC<DSIconProps> = ({
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
      d="M7.72871 15.4873L9.04852 12.215C9.25896 11.6932 9.57406 11.2193 9.97473 10.8219L17.2121 3.64455C18.0786 2.78515 19.4836 2.78515 20.3501 3.64455C21.2166 4.50394 21.2166 5.8973 20.3501 6.75669L13.1127 13.9341C12.712 14.3314 12.2342 14.6439 11.7081 14.8526L8.40853 16.1616C7.98161 16.3309 7.55794 15.9108 7.72871 15.4873Z"
      fill={color}
    />
    <path
      d="M13.0479 5.08905H7.26232C6.01287 5.08905 5 6.09359 5 7.33275V16.7563C5 17.9955 6.01287 19 7.26232 19H16.764C18.0135 19 19.0264 17.9955 19.0264 16.7563V11.0509"
      stroke={color}
      strokeWidth="2"
      strokeMiterlimit="10"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
