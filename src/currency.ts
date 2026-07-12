export type TournamentCurrency = "USD" | "EUR" | "GBP" | "TRY" | "CHF" | "CAD" | "AUD";

export type CurrencyConfig = {
  code: TournamentCurrency;
  symbol: string;
  label: string;
  position: "prefix" | "suffix";
};

export const TOURNAMENT_CURRENCIES: CurrencyConfig[] = [
  { code: "USD", symbol: "$", label: "USD", position: "prefix" },
  { code: "EUR", symbol: "€", label: "EUR", position: "prefix" },
  { code: "GBP", symbol: "£", label: "GBP", position: "prefix" },
  { code: "TRY", symbol: "₺", label: "TRY", position: "prefix" },
  { code: "CHF", symbol: "CHF", label: "CHF", position: "suffix" },
  { code: "CAD", symbol: "C$", label: "CAD", position: "prefix" },
  { code: "AUD", symbol: "A$", label: "AUD", position: "prefix" },
];

const currencyMap = Object.fromEntries(
  TOURNAMENT_CURRENCIES.map((currency) => [currency.code, currency]),
) as Record<TournamentCurrency, CurrencyConfig>;

export const DEFAULT_TOURNAMENT_CURRENCY: TournamentCurrency = "USD";

export function normalizeTournamentCurrency(currency?: string | null): TournamentCurrency {
  if (currency && currency in currencyMap) {
    return currency as TournamentCurrency;
  }
  return DEFAULT_TOURNAMENT_CURRENCY;
}

export function getCurrencyConfig(currency?: string | null): CurrencyConfig {
  return currencyMap[normalizeTournamentCurrency(currency)];
}

const numberLocaleMap: Record<string, string> = {
  tr: "tr-TR",
  en: "en-US",
  de: "de-DE",
  fr: "fr-FR",
  es: "es-ES",
  pt: "pt-PT",
  it: "it-IT",
  ru: "ru-RU",
};

export function getPrizeNumberLocale(locale?: string | null): string {
  if (locale) {
    const normalized = locale.toLowerCase().split("-")[0];
    if (normalized in numberLocaleMap) {
      return numberLocaleMap[normalized];
    }
  }

  if (typeof navigator !== "undefined" && navigator.language) {
    return navigator.language;
  }

  return "en-US";
}

function formatPrizeNumber(amount: number, locale?: string | null): string {
  return amount.toLocaleString(getPrizeNumberLocale(locale), {
    maximumFractionDigits: 0,
  });
}

export function formatPrizeAmount(amount: number, currency?: string | null, locale?: string | null): string {
  const config = getCurrencyConfig(currency);
  const formattedAmount = formatPrizeNumber(amount, locale);

  return config.position === "prefix"
    ? `${config.symbol}${formattedAmount}`
    : `${formattedAmount} ${config.symbol}`;
}

export function formatTrackingPrizeAmount(amount: number, currency?: string | null): string {
  const config = getCurrencyConfig(currency);
  const safeAmount = Number.isFinite(amount) ? Math.round(amount) : 0;
  const formattedAmount = safeAmount.toLocaleString("tr-TR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

  return config.position === "prefix"
    ? `${config.symbol}${formattedAmount}`
    : `${formattedAmount} ${config.symbol}`;
}
