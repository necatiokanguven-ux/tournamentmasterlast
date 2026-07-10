import { useMemo } from "react";
import { detectTrackingLocale, getTrackingTranslations, type TrackingLocale, type TrackingTranslations } from "./translations";

export function useTrackingI18n(): { locale: TrackingLocale; t: TrackingTranslations } {
  return useMemo(() => {
    const locale = detectTrackingLocale();
    const t = getTrackingTranslations(locale);
    return { locale, t };
  }, []);
}
