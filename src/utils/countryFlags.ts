const COUNTRY_NAME_TO_CODE: Record<string, string> = {
  turkey: "TR",
  türkiye: "TR",
  turkiye: "TR",
  "united states": "US",
  usa: "US",
  "united kingdom": "GB",
  uk: "GB",
  england: "GB",
  germany: "DE",
  deutschland: "DE",
  france: "FR",
  spain: "ES",
  españa: "ES",
  italy: "IT",
  italia: "IT",
  netherlands: "NL",
  holland: "NL",
  belgium: "BE",
  portugal: "PT",
  greece: "GR",
  poland: "PL",
  romania: "RO",
  bulgaria: "BG",
  serbia: "RS",
  croatia: "HR",
  hungary: "HU",
  austria: "AT",
  switzerland: "CH",
  sweden: "SE",
  norway: "NO",
  denmark: "DK",
  finland: "FI",
  ireland: "IE",
  russia: "RU",
  ukraine: "UA",
  israel: "IL",
  lebanon: "LB",
  egypt: "EG",
  morocco: "MA",
  tunisia: "TN",
  algeria: "DZ",
  brazil: "BR",
  brasil: "BR",
  argentina: "AR",
  mexico: "MX",
  canada: "CA",
  australia: "AU",
  "new zealand": "NZ",
  japan: "JP",
  china: "CN",
  "south korea": "KR",
  korea: "KR",
  india: "IN",
  thailand: "TH",
  vietnam: "VN",
  indonesia: "ID",
  malaysia: "MY",
  singapore: "SG",
  "saudi arabia": "SA",
  uae: "AE",
  "united arab emirates": "AE",
  qatar: "QA",
  kuwait: "KW",
  iran: "IR",
  iraq: "IQ",
  cyprus: "CY",
  "north macedonia": "MK",
  macedonia: "MK",
  bosnia: "BA",
  montenegro: "ME",
  albania: "AL",
  slovenia: "SI",
  slovakia: "SK",
  czechia: "CZ",
  "czech republic": "CZ",
  lithuania: "LT",
  latvia: "LV",
  estonia: "EE",
  luxembourg: "LU",
  iceland: "IS",
  georgia: "GE",
  armenia: "AM",
  azerbaijan: "AZ",
  kazakhstan: "KZ",
  colombia: "CO",
  chile: "CL",
  peru: "PE",
  venezuela: "VE",
  "south africa": "ZA",
  nigeria: "NG",
  kenya: "KE",
  philippines: "PH",
  taiwan: "TW",
  "hong kong": "HK",
  macau: "MO",
  monaco: "MC",
  malta: "MT",
};

const CODE_TO_DISPLAY_NAME: Record<string, string> = {
  TR: "Turkey",
  US: "United States",
  GB: "United Kingdom",
  DE: "Germany",
  FR: "France",
  ES: "Spain",
  IT: "Italy",
  NL: "Netherlands",
  BE: "Belgium",
  PT: "Portugal",
  GR: "Greece",
  PL: "Poland",
  RO: "Romania",
  BG: "Bulgaria",
  RS: "Serbia",
  HR: "Croatia",
  HU: "Hungary",
  AT: "Austria",
  CH: "Switzerland",
  SE: "Sweden",
  NO: "Norway",
  DK: "Denmark",
  FI: "Finland",
  IE: "Ireland",
  RU: "Russia",
  UA: "Ukraine",
  IL: "Israel",
  LB: "Lebanon",
  EG: "Egypt",
  MA: "Morocco",
  TN: "Tunisia",
  DZ: "Algeria",
  BR: "Brazil",
  AR: "Argentina",
  MX: "Mexico",
  CA: "Canada",
  AU: "Australia",
  NZ: "New Zealand",
  JP: "Japan",
  CN: "China",
  KR: "South Korea",
  IN: "India",
  TH: "Thailand",
  VN: "Vietnam",
  ID: "Indonesia",
  MY: "Malaysia",
  SG: "Singapore",
  SA: "Saudi Arabia",
  AE: "United Arab Emirates",
  QA: "Qatar",
  KW: "Kuwait",
  IR: "Iran",
  IQ: "Iraq",
  CY: "Cyprus",
  MK: "North Macedonia",
  BA: "Bosnia",
  ME: "Montenegro",
  AL: "Albania",
  SI: "Slovenia",
  SK: "Slovakia",
  CZ: "Czech Republic",
  LT: "Lithuania",
  LV: "Latvia",
  EE: "Estonia",
  LU: "Luxembourg",
  IS: "Iceland",
  GE: "Georgia",
  AM: "Armenia",
  AZ: "Azerbaijan",
  KZ: "Kazakhstan",
  CO: "Colombia",
  CL: "Chile",
  PE: "Peru",
  VE: "Venezuela",
  ZA: "South Africa",
  NG: "Nigeria",
  KE: "Kenya",
  PH: "Philippines",
  TW: "Taiwan",
  HK: "Hong Kong",
  MO: "Macau",
  MC: "Monaco",
  MT: "Malta",
};

function normalizeCountryKey(name: string): string {
  return name.trim().toLowerCase();
}

export function parseCountryValue(country: string): { code: string | null; displayName: string } {
  const trimmed = country.trim();
  if (!trimmed) {
    return { code: null, displayName: "" };
  }

  const codeWithName = trimmed.match(/^([A-Za-z]{2})(?:\s*[-–—/,]\s*|\s+)(.+)$/i);
  if (codeWithName) {
    const code = codeWithName[1].toUpperCase();
    const rest = codeWithName[2].trim();
    const nameFromCode = CODE_TO_DISPLAY_NAME[code];
    const displayName =
      rest && rest.toUpperCase() !== code ? rest : nameFromCode || rest || code;
    return { code, displayName };
  }

  const codeOnly = trimmed.match(/^([A-Za-z]{2})$/);
  if (codeOnly) {
    const code = codeOnly[1].toUpperCase();
    return {
      code,
      displayName: CODE_TO_DISPLAY_NAME[code] || code,
    };
  }

  const code = countryCodeFromName(trimmed);
  return { code, displayName: trimmed };
}

export function normalizeCountryValue(country: string): string {
  return parseCountryValue(country).displayName;
}

export function countryCodeFromName(country: string): string | null {
  const key = normalizeCountryKey(country);
  if (!key) return null;
  if (COUNTRY_NAME_TO_CODE[key]) return COUNTRY_NAME_TO_CODE[key];
  if (key.length === 2 && /^[a-z]{2}$/i.test(key)) return key.toUpperCase();
  return null;
}

export function flagEmojiFromCountryCode(code: string): string {
  const upper = code.trim().toUpperCase();
  if (upper.length !== 2 || !/^[A-Z]{2}$/.test(upper)) {
    return "🏳️";
  }
  const points = [...upper].map((char) => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...points);
}

export function flagEmojiFromCountry(country: string): string {
  const parsed = parseCountryValue(country);
  if (parsed.code) {
    return flagEmojiFromCountryCode(parsed.code);
  }
  const code = countryCodeFromName(parsed.displayName || country);
  return code ? flagEmojiFromCountryCode(code) : "🏳️";
}
