/**
 * Yahoo doesn't expose the financial-statement reporting currency for ADRs
 * directly. We infer it from `assetProfile.country` so we can FX-convert
 * statement values to the listing's quote currency at ingest time.
 *
 * The map covers common ADR/foreign-listing origins. Unknown countries
 * default to assuming the reporting currency matches the quote currency
 * (i.e., no conversion).
 */
const COUNTRY_TO_CURRENCY: Record<string, string> = {
  "United States": "USD",
  "USA": "USD",

  // Europe
  "Denmark": "DKK",
  "Sweden": "SEK",
  "Norway": "NOK",
  "Switzerland": "CHF",
  "United Kingdom": "GBP",
  "Ireland": "EUR",
  "Germany": "EUR",
  "France": "EUR",
  "Netherlands": "EUR",
  "Spain": "EUR",
  "Italy": "EUR",
  "Belgium": "EUR",
  "Austria": "EUR",
  "Portugal": "EUR",
  "Finland": "EUR",
  "Luxembourg": "EUR",

  // Americas
  "Canada": "CAD",
  "Brazil": "BRL",
  "Mexico": "MXN",
  "Argentina": "ARS",
  "Chile": "CLP",
  "Bermuda": "USD",
  "Cayman Islands": "USD",

  // Asia
  "Japan": "JPY",
  "China": "CNY",
  "Hong Kong": "HKD",
  "Taiwan": "TWD",
  "Singapore": "SGD",
  "South Korea": "KRW",
  "Korea": "KRW",
  "India": "INR",
  "Indonesia": "IDR",
  "Thailand": "THB",
  "Malaysia": "MYR",
  "Philippines": "PHP",
  "Vietnam": "VND",
  "Israel": "ILS",
  "Turkey": "TRY",
  "Saudi Arabia": "SAR",
  "United Arab Emirates": "AED",

  // Oceania
  "Australia": "AUD",
  "New Zealand": "NZD",

  // Africa
  "South Africa": "ZAR",
};

export function inferReportingCurrency(country: string | undefined): string {
  if (!country) return "USD";
  return COUNTRY_TO_CURRENCY[country] ?? "USD";
}
