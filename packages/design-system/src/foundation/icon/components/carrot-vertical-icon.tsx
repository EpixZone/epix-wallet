import React from "react";
import type { DSIconProps } from "../types";

export const CarrotVerticalIcon: React.FC<DSIconProps> = ({
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
      d="M11.2503 19.4631C11.6346 19.9434 12.3652 19.9434 12.7495 19.4631L15.5521 15.9598C16.055 15.3312 15.6075 14.4001 14.8025 14.4001H9.19729C8.39232 14.4001 7.9448 15.3312 8.44766 15.9598L11.2503 19.4631Z"
      fill={color}
    />
    <path
      d="M12.7495 4.53714C12.3652 4.05675 11.6346 4.05675 11.2503 4.53714L8.44766 8.04039C7.9448 8.66896 8.39233 9.6001 9.1973 9.6001L14.8025 9.6001C15.6075 9.6001 16.055 8.66896 15.5521 8.04039L12.7495 4.53714Z"
      fill={color}
    />
  </svg>
);
