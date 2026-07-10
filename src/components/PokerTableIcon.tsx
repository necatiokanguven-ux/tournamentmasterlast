import React from "react";

type PokerTableIconProps = {
  className?: string;
};

export default function PokerTableIcon({ className = "w-5 h-5" }: PokerTableIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <ellipse cx="12" cy="12" rx="9" ry="5.5" />
      <ellipse cx="12" cy="12" rx="6.5" ry="3.2" opacity="0.45" />
      <circle cx="12" cy="4.2" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="18.2" cy="7.1" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="18.2" cy="16.9" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="19.8" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="5.8" cy="16.9" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="5.8" cy="7.1" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" opacity="0.8" />
    </svg>
  );
}
