/**
 * Industry → super-group mapping per `docs/specs/super-groups.md`.
 *
 * Used by the IC analysis pipeline (backtest.md §3.9) and per-super-
 * group weight presets (ranking.md §11.5). NOT used by the main
 * ranking percentile cohort — that stays at narrow industry +
 * sector fallback per ranking.md §3.2.
 */

export type SuperGroupKey =
  | "software-internet"
  | "semis-hardware"
  | "pharma-biotech"
  | "healthcare-equipment"
  | "healthcare-services"
  | "banks-lending"
  | "capital-markets"
  | "insurance"
  | "reits-real-estate"
  | "utilities"
  | "energy"
  | "industrials"
  | "materials-construction"
  | "transport-autos"
  | "consumer-staples"
  | "consumer-discretionary"
  | "media-telecom";

export const SUPER_GROUP_LABELS: Record<SuperGroupKey, string> = {
  "software-internet": "Software & Internet",
  "semis-hardware": "Semiconductors & Hardware",
  "pharma-biotech": "Pharma & Biotech",
  "healthcare-equipment": "Healthcare Equipment & Diagnostics",
  "healthcare-services": "Healthcare Services",
  "banks-lending": "Banks & Lending",
  "capital-markets": "Capital Markets",
  insurance: "Insurance",
  "reits-real-estate": "REITs & Real Estate",
  utilities: "Utilities",
  energy: "Energy",
  industrials: "Industrials",
  "materials-construction": "Materials & Construction",
  "transport-autos": "Transportation & Autos",
  "consumer-staples": "Consumer Staples",
  "consumer-discretionary": "Consumer Discretionary",
  "media-telecom": "Media & Telecom",
};

/**
 * Maps FMP `profile.industry` strings to super-group keys.
 *
 * Per super-groups.md §4 — non-obvious assignments documented:
 *   - Tobacco → consumer-staples (brand pricing power, not commodity ag)
 *   - Discount Stores → consumer-staples (necessity-spending retail)
 *   - Diagnostics & Research → healthcare-equipment (instrument economics)
 *   - Conglomerates / Waste Mgmt / Industrial Distribution → industrials
 *
 * Industries appearing in the snapshot but missing from this table
 * are returned as `null` from `superGroupOf` — they contribute to
 * universe-wide aggregates only, not per-super-group cells. Add new
 * mappings here when S&P 500 rebalances bring in new industries.
 */
export const INDUSTRY_TO_SUPER_GROUP: Record<string, SuperGroupKey> = {
  // Software & Internet
  "Software - Application": "software-internet",
  "Software - Infrastructure": "software-internet",
  "Internet Content & Information": "software-internet",
  "Information Technology Services": "software-internet",

  // Semiconductors & Hardware
  Semiconductors: "semis-hardware",
  "Semiconductor Equipment & Materials": "semis-hardware",
  "Computer Hardware": "semis-hardware",
  "Communication Equipment": "semis-hardware",
  "Electronic Components": "semis-hardware",
  "Scientific & Technical Instruments": "semis-hardware",

  // Pharma & Biotech
  "Drug Manufacturers - General": "pharma-biotech",
  "Drug Manufacturers - Specialty & Generic": "pharma-biotech",
  Biotechnology: "pharma-biotech",

  // Healthcare Equipment & Diagnostics
  "Medical Devices": "healthcare-equipment",
  "Medical Instruments & Supplies": "healthcare-equipment",
  "Diagnostics & Research": "healthcare-equipment",

  // Healthcare Services
  "Healthcare Plans": "healthcare-services",
  "Medical Distribution": "healthcare-services",
  "Medical Care Facilities": "healthcare-services",

  // Banks & Lending
  "Banks - Regional": "banks-lending",
  "Banks - Diversified": "banks-lending",
  "Credit Services": "banks-lending",

  // Capital Markets
  "Asset Management": "capital-markets",
  "Capital Markets": "capital-markets",
  "Financial Data & Stock Exchanges": "capital-markets",

  // Insurance
  "Insurance - Property & Casualty": "insurance",
  "Insurance Brokers": "insurance",
  "Insurance - Life": "insurance",
  "Insurance - Diversified": "insurance",
  "Insurance - Reinsurance": "insurance",

  // REITs & Real Estate
  "REIT - Specialty": "reits-real-estate",
  "REIT - Residential": "reits-real-estate",
  "REIT - Retail": "reits-real-estate",
  "REIT - Industrial": "reits-real-estate",
  "REIT - Healthcare Facilities": "reits-real-estate",
  "REIT - Office": "reits-real-estate",
  "REIT - Hotel & Motel": "reits-real-estate",
  "REIT - Diversified": "reits-real-estate",
  "Real Estate Services": "reits-real-estate",

  // Utilities
  "Utilities - Regulated Electric": "utilities",
  "Utilities - Independent Power Producers": "utilities",
  "Utilities - Diversified": "utilities",
  "Utilities - Regulated Gas": "utilities",
  "Utilities - Regulated Water": "utilities",

  // Energy
  "Oil & Gas E&P": "energy",
  "Oil & Gas Integrated": "energy",
  "Oil & Gas Refining & Marketing": "energy",
  "Oil & Gas Equipment & Services": "energy",
  "Oil & Gas Midstream": "energy",

  // Industrials
  "Specialty Industrial Machinery": "industrials",
  "Aerospace & Defense": "industrials",
  "Farm & Heavy Construction Machinery": "industrials",
  "Electrical Equipment & Parts": "industrials",
  "Tools & Accessories": "industrials",
  "Industrial Distribution": "industrials",
  Conglomerates: "industrials",
  "Waste Management": "industrials",
  "Specialty Business Services": "industrials",
  "Consulting Services": "industrials",
  "Pollution & Treatment Controls": "industrials",
  "Rental & Leasing Services": "industrials",
  "Security & Protection Services": "industrials",

  // Materials & Construction
  "Specialty Chemicals": "materials-construction",
  Chemicals: "materials-construction",
  "Agricultural Inputs": "materials-construction",
  Steel: "materials-construction",
  Copper: "materials-construction",
  Gold: "materials-construction",
  "Packaging & Containers": "materials-construction",
  "Building Products & Equipment": "materials-construction",
  "Engineering & Construction": "materials-construction",
  "Building Materials": "materials-construction",
  "Residential Construction": "materials-construction",
  // Solar: panel/inverter manufacturers (FSLR, ENPH). Capex-heavy
  // process manufacturing with commodity exposure — fits the
  // materials-construction cyclical-capex profile.
  Solar: "materials-construction",

  // Transportation & Autos
  "Integrated Freight & Logistics": "transport-autos",
  Railroads: "transport-autos",
  Airlines: "transport-autos",
  Trucking: "transport-autos",
  "Auto Manufacturers": "transport-autos",
  "Auto Parts": "transport-autos",

  // Consumer Staples
  "Packaged Foods": "consumer-staples",
  "Household & Personal Products": "consumer-staples",
  "Beverages - Non-Alcoholic": "consumer-staples",
  "Beverages - Brewers": "consumer-staples",
  "Beverages - Wineries & Distilleries": "consumer-staples",
  Tobacco: "consumer-staples",
  Confectioners: "consumer-staples",
  "Farm Products": "consumer-staples",
  "Discount Stores": "consumer-staples",
  "Grocery Stores": "consumer-staples",
  "Food Distribution": "consumer-staples",

  // Consumer Discretionary
  "Specialty Retail": "consumer-discretionary",
  "Internet Retail": "consumer-discretionary",
  "Apparel Retail": "consumer-discretionary",
  "Home Improvement Retail": "consumer-discretionary",
  "Auto & Truck Dealerships": "consumer-discretionary",
  "Luxury Goods": "consumer-discretionary",
  "Apparel Manufacturing": "consumer-discretionary",
  "Footwear & Accessories": "consumer-discretionary",
  "Consumer Electronics": "consumer-discretionary",
  Restaurants: "consumer-discretionary",
  "Travel Services": "consumer-discretionary",
  "Resorts & Casinos": "consumer-discretionary",
  Lodging: "consumer-discretionary",
  Leisure: "consumer-discretionary",
  "Electronic Gaming & Multimedia": "consumer-discretionary",
  "Personal Services": "consumer-discretionary",

  // Media & Telecom
  Entertainment: "media-telecom",
  "Telecom Services": "media-telecom",
  "Advertising Agencies": "media-telecom",
};

/**
 * Look up the super-group for a given FMP industry string. Returns
 * `null` for industries not in the mapping (logs surface those at
 * IC-report time so the table stays current with index changes).
 */
export function superGroupOf(industry: string): SuperGroupKey | null {
  return INDUSTRY_TO_SUPER_GROUP[industry] ?? null;
}

/** All known super-group keys — useful for iteration and validation. */
export const ALL_SUPER_GROUPS: readonly SuperGroupKey[] = Object.freeze([
  "software-internet",
  "semis-hardware",
  "pharma-biotech",
  "healthcare-equipment",
  "healthcare-services",
  "banks-lending",
  "capital-markets",
  "insurance",
  "reits-real-estate",
  "utilities",
  "energy",
  "industrials",
  "materials-construction",
  "transport-autos",
  "consumer-staples",
  "consumer-discretionary",
  "media-telecom",
]);
