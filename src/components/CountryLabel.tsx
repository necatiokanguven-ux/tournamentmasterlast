import React from "react";
import {
  normalizeCountryValue,
  parseCountryValue,
} from "../utils/countryFlags";

const FLAG_IMG_CLASS =
  "inline-block w-5 h-[15px] object-cover rounded-[2px] shrink-0 align-middle";

export function CountryFlag({
  country,
  className = FLAG_IMG_CLASS,
}: {
  country: string;
  className?: string;
}) {
  if (!country?.trim()) {
    return null;
  }

  const { code, displayName } = parseCountryValue(country);

  if (!code) {
    return (
      <span className="text-base leading-none" aria-hidden title={displayName}>
        🏳️
      </span>
    );
  }

  return (
    <img
      src={`https://flagcdn.com/w40/${code.toLowerCase()}.png`}
      width={20}
      height={15}
      alt=""
      aria-hidden
      title={displayName}
      className={className}
      loading="lazy"
    />
  );
}

export function CountryLabel({
  country,
  className = "",
  flagClassName = FLAG_IMG_CLASS,
}: {
  country: string;
  className?: string;
  flagClassName?: string;
}) {
  if (!country?.trim()) {
    return <span className={className}>—</span>;
  }

  const { displayName } = parseCountryValue(country);

  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <CountryFlag country={country} className={flagClassName} />
      <span>{displayName}</span>
    </span>
  );
}

export function countryInputDisplayValue(country: string): string {
  return parseCountryValue(country).displayName;
}

export { normalizeCountryValue, parseCountryValue };
