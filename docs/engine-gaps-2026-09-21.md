# Engine gap analysis — 2026-09-21

Where the engine is wrong, blind, or unvalidated; what filling each
gap takes; and the order to do it in. Quantifications are from the
2026-09-21 snapshot (499 companies, 373 ranked) and the September
backtest/audit record. House framing applies throughout: the
factor composite is the validated layer; everything else must earn
its place through the harnesses or be labeled as framing.

## 1. The evidence/prominence inversion (the meta-gap)

The most *displayed* number is the least *validated*, and vice versa:

| Layer | Prominence | Validation status |
|---|---|---|
| Fair-value band (p25 / Upside %) | Headline column; gates CANDIDATE (`buckets.ts:142`) | **No edge** — 0/8 H1 cells, upside marginally anti-predictive (IC −0.02), convergence below matched control (`backtest-fair-value-2026-08-21-pit.md`) |
| Factor composite (value-deep) | One rank number | PIT-validated edge (+4.05 pp vs legacy, regime-stable) — but see §3.1 staleness debt |
| Options picks | Trade table | Validated as discipline, not alpha (2026-06-11) |
| FV-trend | Row flag | Computed every refresh, **never reaches the rows** (§2.3) |

**Fill:** a product decision, then small code. Options: (a) stop
gating CANDIDATE on `price < p25` and gate on composite + §4 floors
alone, demoting the band to display-only; (b) keep the gate as
explicit *discipline* with an honesty label; (c) attempt a better
band (cycle-average-earnings anchors per the NEM work) and require it
to pass the FV harness before it touches the gate. The harness says
the current gate has nothing to lose; any replacement must beat it
under frozen thresholds. Owner: user (product call).

## 2. Data-layer defects (live, quantified)

### 2.1 Quarter-rows inside annual arrays — 52% of the universe

261 of 499 companies have annual periods spaced < 300 days apart —
quarterly facts tagged `fp="FY"` by EDGAR leaking through the
`isFY` filter (`concepts.ts:4`). Effect: `ownHistorical*` multiples
inflate (tiny-EPS "years" → DECK's $226 P/E anchor), `normalized*`
deflate (quarters averaged as years), and real old FYs get crowded
out of the 7-slot window. This is the single largest live data
defect. **Fill:** span-check FY facts (~annual duration ≥ 300d),
mirroring the existing standalone-quarter check; task chip already
filed; TDD against DECK/NVDA fixtures. Small change, large blast
radius — refresh + spot-check required after.

### 2.2 Anchor coverage and cohort fallbacks

Null rates in the ranked set: EV/EBITDA anchors 34–46%, P/FCF
anchors 38–55%. Only 16/373 names reach high confidence; 260 (70%)
are low. Peer sets: just 50/373 (13%) form a true cohort; 94 (25%)
fall all the way to sector (DECK's "peers" = 53 assorted Consumer
Cyclical names). Part of this is *correct* (banks have no EBITDA);
part is feed gaps (capex/FCF chains). **Fill:** (i) split the null
rates into structural-vs-missing with one diagnostic pass; (ii)
improve EDGAR capex/FCF concept chains where missing; (iii) consider
a super-group middle tier between industry and sector fallback —
the FV backtest's coarse-cohort stress suggests it behaves
similarly, and it would replace the worst 25% of comparables.

### 2.3 FV-trend join regression (new, found in this survey)

`fv-trend.json` is healthy; all 373 ranked rows say
`insufficient_data`. The per-row attach in the ingest is broken —
note the long-ignored pre-existing `tsc` error at `ingest/cli.ts:276`
(`fvTrendEntry: FvTrendEntry | undefined` under
`exactOptionalPropertyTypes`) is exactly this seam. Nothing *acts*
on the flag since H10's removal, but the UI shows a false
"insufficient data" and every refresh spends the compute. **Fill:**
fix the join + a render test asserting a non-insufficient trend
reaches a row; or, if the flag is truly vestigial post-H10, delete
the pipeline step and the field. Decide, don't leave it half-alive.

### 2.4 Membership history frozen (2026-06-11)

The Wikipedia changes-table parser is still broken (chip open); the
stale-cache fallback keeps backtests self-consistent but blind to
changes after 2026-06-22. Live universe drift is now guarded only by
manual checks (the September catch was manual: 10 in / 10 out,
including EPAM ranked while out of the index). **Fill:** (i) fix the
changes parser (chip); (ii) add a cheap drift guard to refresh —
live constituents diff vs `sp500.json`, warn on any delta (the
constituents parser works).

### 2.5 forwardEps staleness

Frozen to five decimals across 11 days through DECK's
downgrade cycle. It's the *only* channel where analyst revisions
enter the engine (spike-defense corroboration, forward P/E). If it
lags weeks, the corroboration check corroborates the past.
**Fill:** one diagnostic — log forwardEps per symbol across the
dated snapshot archive, measure update cadence; then either accept
with a documented lag, or add a fresher estimates source. Cheap to
measure, currently unknown.

### 2.6 Share-count magnitude family (COP/DLR/HST)

Adjacent-year share jumps of 959×–1,006,233× — unit inconsistencies
*across* filings that `inferSharesScale` misses because it only
checks `annual[0]`. Distinct root cause from splits and from
quarter-rows. **Fill:** per-period magnitude normalization against
the authoritative count (extend `inferSharesScale` to per-period
power-of-1000 inference), with the three names as fixtures.

### 2.7 Restatement bias + PIT industry (documented, time-gated)

Both restated in every backtest header. Restatement bias is fixable
only via as-first-filed XBRL (heavy; quantify on a sample before
deciding). PIT industry becomes self-solving as the dated snapshot
archive ages (usable for 1y tests ~2027, 3y ~2029). **Fill:** keep
restating; no action now.

## 3. Validation debts (the engine may be right, but we can't say so)

### 3.1 Value-deep weights rest on pre-split-fix evidence — the top debt

The adopted default weights (50/20/10/10/10/0) were validated
2026-04-25, *before* the split-basis fix corrected P/E-family inputs
for 49 symbols (up to 50×) and before the quarter-row defect was
known. The 2026-08-21 IC rerun on corrected data came back weaker
(FDR "marginal": 17 surviving vs 5.4 expected; 21/544 cells) than
the April narrative. The weight-validation itself (§3.11 train/test,
the actual adoption evidence) has **not** been re-run on corrected
data. **Fill:** after 2.1 lands, one `--weight-test` PIT rerun,
value-deep vs legacy vs equal-weight, same adoption bar. If
value-deep survives, the core is re-founded; if not, that's the most
important finding of the year. Either answer is worth more than any
new feature.

### 3.2 Phase-2 factor contamination (EIX-class, still open)

TTM ROIC (sole Quality factor), EBIT/interest-coverage, net-debt/
EBITDA, and 7Y EPS CAGR all still ingest one-time spikes
(`project_outlier_audit`). Deferred in April because normalization
reshuffles the leaderboard. **Fill:** normalize in `factors.ts`,
then re-run IC + weight-validation (rides 3.1's rerun). Do after
3.1 so the baseline is clean.

### 3.3 Options layer

Realized-premium backtest blocked on chain-archive depth (started
2026-06; meaningful ~mid-2027). Early-assignment mechanics absent —
the engine never flags strikes where extrinsic < carry (the DECK
$110s crossed that line within two weeks). No portfolio awareness
(NEM + DECK concentration is tracked in memory, not the engine).
**Fill:** (i) small: assignment-rationality flag on the trade table
(pure math, testable now); (ii) time-gated: real-premium backtest
when the archive matures; (iii) portfolio input is a product
decision (the user may prefer keeping holdings out of the tool).

## 4. Process gaps

- **Sentiment overlay has no exit rule.** It vetoes entries
  (StarMine) but said nothing when DECK was downgraded post-entry.
  Not automatable (no feed); **fill:** a documented per-holding
  review trigger, owned by the user.
- **Premarket refresh still wastes 30 minutes before failing**
  (chip open for the fail-fast guard).
- **Single-market concentration**: every validated result is
  US/S&P-only; the DMS survivorship caveat applies to the whole
  edifice. Not fillable in-engine; keep it in the headers.

## 5. Priority order

| # | Gap | Size | Payoff |
|---|---|---|---|
| P0 | 2.1 quarter-rows fix | S | Uncorrupts anchors for 52% of universe |
| P0 | 3.1 weight-validation rerun on corrected data | M | Re-founds (or refutes) the core adopted weights |
| P0 | 1 CANDIDATE-gate decision | user | Aligns product with the no-edge verdict |
| P1 | 2.3 fvTrend join fix-or-delete | S | Kills a silent regression |
| P1 | 2.4 changes parser + drift guard | S–M | Unblocks future PIT; automates drift catch |
| P1 | 2.5 forwardEps cadence diagnostic | S | Turns unknown staleness into a number |
| P1 | 2.6 share-magnitude guard | S | Closes the COP/DLR/HST family |
| P2 | 3.2 factor normalization + revalidation | M–L | Cleans Quality/Health/Growth of spike bias |
| P2 | 2.2 anchor coverage split + super-group cohort tier | M | Honest confidence; better comparables |
| P2 | 3.3(i) assignment-rationality flag | S | Live-position mechanics the user already needed |
| P3 | realized-premium backtest; PIT industry; restatement quantification | gated | Time/archive-gated |

The through-line: **almost nothing above adds a new signal.** The
gaps are (a) inputs that are measurably wrong at scale, (b) evidence
that predates the input fixes, and (c) one display layer the
harness has already ruled on. Fix the inputs, re-run the evidence,
let the gate decision follow the verdict — in that order.
