# Spec: Industry super-groups

**Status:** draft v1 — written to support per-industry IC analysis in
`backtest.md` §3.7 and per-industry weight presets in `ranking.md`
§11.5. Not used by the main ranking percentile cohort (see §6).

## 1. Problem

The actual snapshot exposes **110 distinct industries** across ~500
S&P 500 companies (FMP `profile.industry`, finer-grained than the
GICS industry-group level the spec originally assumed). The
distribution has a long tail:

| N range | Industry count |
|---|---|
| ≥ 10 names | 11 |
| 5–9 names | 30 |
| 3–4 names | 27 |
| 2 names | 21 |
| 1 name | 21 |

Roughly **40% of industries have ≤ 2 names**. For IC analysis, those
cells produce noise: a Spearman correlation across 1–3 stocks is
meaningless regardless of the underlying signal.

Two cohort structures coexist after this spec:

| Use | Cohort | Rationale |
|---|---|---|
| **Main ranking percentiles** (`ranking.md` §3.2) | Narrow FMP industry, fall back to GICS sector at N<8 | "Best in class vs direct peers" loses meaning when peers are too dissimilar |
| **IC analysis** (`backtest.md` §3.7) | This spec's super-groups (~17 buckets) | Sample size dominates; a coarser-but-coherent bucket buys signal that single-industry cells can't deliver |

## 2. Design principles

1. **Group by economic model, not by surface label.** Tobacco belongs
   with Branded Staples (brand pricing power, defensive demand,
   regulated duopoly), not with Agricultural Products (commodity
   processing). The mapping reflects the underlying business model
   that drives factor sensitivity.
2. **Target N ≥ 13 per super-group** in the current S&P 500. Below
   that threshold, the IC pipeline degrades to "—" cells regardless of
   underlying signal (per `backtest.md` Phase 0 calibration).
3. **Hand-curated and auditable.** Every assignment has a one-line
   rationale in §4. Statistical clustering (Option 3 from design
   conversation) was rejected: it produces unintuitive groupings that
   are hard to defend in a report.
4. **Preserve the original industry label.** The IC heatmap rows are
   super-groups, but the per-cell drill-down still surfaces the
   underlying industries so that genuine intra-super-group divergence
   (e.g., Tobacco specifically diverging from Branded Staples) is
   visible.

## 3. Mapping table

17 super-groups; current S&P 500 N in parentheses.

| # | Super-group | N | Member FMP industries |
|---|---|---|---|
| 1 | Software & Internet | 43 | Software - Application; Software - Infrastructure; Internet Content & Information; Information Technology Services |
| 2 | Semiconductors & Hardware | 41 | Semiconductors; Semiconductor Equipment & Materials; Computer Hardware; Communication Equipment; Electronic Components; Scientific & Technical Instruments |
| 3 | Pharma & Biotech | 16 | Drug Manufacturers - General; Drug Manufacturers - Specialty & Generic; Biotechnology |
| 4 | Healthcare Equipment & Diagnostics | 29 | Medical Devices; Medical Instruments & Supplies; Diagnostics & Research |
| 5 | Healthcare Services | 13 | Healthcare Plans; Medical Distribution; Medical Care Facilities |
| 6 | Banks & Lending | 20 | Banks - Regional; Banks - Diversified; Credit Services |
| 7 | Capital Markets | 26 | Asset Management; Capital Markets; Financial Data & Stock Exchanges |
| 8 | Insurance | 22 | Insurance - Property & Casualty; Insurance Brokers; Insurance - Life; Insurance - Diversified; Insurance - Reinsurance |
| 9 | REITs & Real Estate | 31 | REIT - Specialty; REIT - Residential; REIT - Retail; REIT - Industrial; REIT - Healthcare Facilities; REIT - Office; REIT - Hotel & Motel; REIT - Diversified; Real Estate Services |
| 10 | Utilities | 31 | Utilities - Regulated Electric; Utilities - Independent Power Producers; Utilities - Diversified; Utilities - Regulated Gas; Utilities - Regulated Water |
| 11 | Energy | 22 | Oil & Gas E&P; Oil & Gas Integrated; Oil & Gas Refining & Marketing; Oil & Gas Equipment & Services; Oil & Gas Midstream |
| 12 | Industrials | 51 | Specialty Industrial Machinery; Aerospace & Defense; Farm & Heavy Construction Machinery; Electrical Equipment & Parts; Tools & Accessories; Industrial Distribution; Conglomerates; Waste Management; Specialty Business Services; Consulting Services; Pollution & Treatment Controls; Rental & Leasing Services; Security & Protection Services |
| 13 | Materials & Construction | 41 | Specialty Chemicals; Chemicals; Agricultural Inputs; Steel; Copper; Gold; Solar; Packaging & Containers; Building Products & Equipment; Engineering & Construction; Building Materials; Residential Construction |
| 14 | Transportation & Autos | 20 | Integrated Freight & Logistics; Railroads; Airlines; Trucking; Auto Manufacturers; Auto Parts |
| 15 | Consumer Staples | 33 | Packaged Foods; Household & Personal Products; Beverages - Non-Alcoholic; Beverages - Brewers; Beverages - Wineries & Distilleries; Tobacco; Confectioners; Farm Products; Discount Stores; Grocery Stores; Food Distribution |
| 16 | Consumer Discretionary | 42 | Specialty Retail; Internet Retail; Apparel Retail; Home Improvement Retail; Auto & Truck Dealerships; Luxury Goods; Apparel Manufacturing; Footwear & Accessories; Consumer Electronics; Restaurants; Travel Services; Resorts & Casinos; Lodging; Leisure; Electronic Gaming & Multimedia; Personal Services |
| 17 | Media & Telecom | 19 | Entertainment; Telecom Services; Advertising Agencies |

## 4. Bucket rationale

Notes on the non-obvious assignments:

- **Tobacco → Consumer Staples (not Agriculture).** MO/PM are
  brand-pricing-power businesses with regulated duopoly economics.
  Their factor sensitivities (low rev growth, high FCF yield, high
  dividend, defensive beta) match HSY/CL/KO, not ADM/BG.
- **Discount Stores → Consumer Staples (not Discretionary).**
  WMT/COST/TGT/DG are necessity-spending retailers; their cycle and
  margin profile matches grocery and packaged foods more than
  Specialty Retail.
- **Diagnostics → Healthcare Equipment (not Pharma).** IDXX/A/TMO
  sell instruments and consumables; their economics are recurring
  hardware-plus-razors, not drug-pipeline.
- **Conglomerates / Waste Mgmt / Industrial Distribution → Industrials.**
  These don't fit a separate "misc" bucket cleanly; their factor
  sensitivities (cyclical capex, balance-sheet leverage, operating
  margins) align with the broader industrial complex. Avoids a
  grab-bag super-group with N<10.
- **Materials & Construction is intentionally broad.** Specialty
  Chemicals, Steel, Building Materials, Residential Construction all
  share commodity-cycle and capex-cycle exposure. Splitting into
  "Process Industries" + "Construction" + "Metals & Mining" produces
  N=4–10 super-groups that fail the §2 threshold. If IC analysis
  surfaces meaningful intra-bucket divergence, split in v2.
- **REIT sub-types stay together.** Office vs Industrial REITs have
  different cycle exposure (Office struggling post-COVID, Industrial
  benefiting from e-commerce), but they share the dominant rate-
  sensitivity factor. The drill-down preserves the sub-type for
  inspection. Splitting now puts each REIT sub-type below N=10.

## 5. Mapping data structure

Single source of truth lives at `packages/ranking/src/super-groups.ts`:

```ts
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

export const INDUSTRY_TO_SUPER_GROUP: Record<string, SuperGroupKey> = {
  "Software - Application": "software-internet",
  "Software - Infrastructure": "software-internet",
  // ... full mapping per §3 table
};

export function superGroupOf(industry: string): SuperGroupKey | null {
  return INDUSTRY_TO_SUPER_GROUP[industry] ?? null;
}
```

A `null` return means the industry isn't in our mapping — IC analysis
treats those names as "unmapped" and excludes them from per-super-
group cells (they still contribute to all-universe aggregates). New
industries appearing post-S&P-rebalance default to `null`; an
unrecognized-industry warning surfaces in the next IC report so the
mapping stays current.

## 6. Explicit non-uses

- **Main ranking percentile cohort** continues to use FMP industry
  with sector fallback per `ranking.md` §3.2. Super-groups are too
  coarse for "best in class within direct peers" — comparing CL to
  WMT inside Consumer Staples for the *purpose of ranking* would
  blur exactly the within-vertical signal the ranker is trying to
  surface.
- **Quality floor thresholds** (`ranking.md` §4) stay sector-relative,
  not super-group-relative. Sectors are the right granularity for
  "structural" floor differences (banks have high debt, pharma has
  tight current ratios) and we already have working sector-level
  percentile machinery there.

## 7. Maintenance

- The mapping is reviewed when S&P 500 rebalances bring in new
  industries (run `npm run validate-super-groups` after a snapshot
  refresh; it logs any FMP industry seen in the snapshot that isn't
  in `INDUSTRY_TO_SUPER_GROUP`).
- Splits or merges to the mapping require updating the test fixtures
  in `packages/ranking/tests/super-groups.test.ts` and re-running the
  IC backtest so the heatmap column count is stable across a deploy.

## 8. Open questions

1. **Should the main ranker get a super-group fallback layer?** Today
   the cohort fallback ladder is `industry → sector` at N<8. A
   `industry → super-group → sector` ladder would give a tighter peer
   set than sector for the ~21 single-name industries. Defer until we
   see how many ranking rows actually fall back to sector in practice.
2. **Per-super-group factor sets.** REITs need FFO; banks need NIM.
   v1 uses the universal factor list and lets per-super-group weight
   presets (`ranking.md` §11.5) handle most of the variance.
   Industry-specific factor *additions* are a v2 question once IC
   analysis tells us where the universal set is leaving signal on
   the table.
