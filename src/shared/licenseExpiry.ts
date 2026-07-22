export function getLicenseDaysRemaining(expiresAt?: string | null): number | null {
  if (!expiresAt) {
    return null;
  }

  const expires = new Date(expiresAt);
  if (Number.isNaN(expires.getTime())) {
    return null;
  }

  const diffMs = expires.getTime() - Date.now();
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
}

export function formatLicenseExpiry(expiresAt?: string | null): {
  dateLabel: string;
  daysRemaining: number | null;
  daysLabel: string;
} | null {
  if (!expiresAt) {
    return null;
  }

  const expires = new Date(expiresAt);
  if (Number.isNaN(expires.getTime())) {
    return null;
  }

  const daysRemaining = getLicenseDaysRemaining(expiresAt);
  const dateLabel = expires.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  let daysLabel = "No expiry countdown";
  if (daysRemaining === null) {
    daysLabel = "Expiry date unavailable";
  } else if (daysRemaining === 0) {
    daysLabel = "Expires today";
  } else if (daysRemaining === 1) {
    daysLabel = "1 day remaining";
  } else {
    daysLabel = `${daysRemaining} days remaining`;
  }

  return { dateLabel, daysRemaining, daysLabel };
}
