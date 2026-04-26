import { useState } from "react";
import type { Position, PositionKind, StockPosition } from "@stockrank/core";
import { newPositionId } from "@stockrank/core";

export type AddPositionFormProps = {
  /** Existing stock positions — used to populate the "pair with" dropdown when adding an option. */
  stockPositions: StockPosition[];
  /** Called when the user submits a valid new position. */
  onSubmit: (position: Position) => void;
  /** Called when the user cancels. */
  onCancel: () => void;
};

/** Today's date as YYYY-MM-DD for date input defaults. */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function AddPositionForm({
  stockPositions,
  onSubmit,
  onCancel,
}: AddPositionFormProps) {
  const [kind, setKind] = useState<PositionKind>("stock");

  return (
    <section className="add-position" aria-label="Add a new position">
      <header className="add-position__header">
        <h2>Add position</h2>
        <button
          type="button"
          className="add-position__cancel"
          onClick={onCancel}
          aria-label="Cancel adding position"
        >
          ×
        </button>
      </header>

      <fieldset className="add-position__type-picker" aria-label="Position type">
        <label>
          <input
            type="radio"
            name="position-kind"
            value="stock"
            checked={kind === "stock"}
            onChange={() => setKind("stock")}
          />
          Stock
        </label>
        <label>
          <input
            type="radio"
            name="position-kind"
            value="option"
            checked={kind === "option"}
            onChange={() => setKind("option")}
          />
          Option
        </label>
        <label>
          <input
            type="radio"
            name="position-kind"
            value="cash"
            checked={kind === "cash"}
            onChange={() => setKind("cash")}
          />
          Cash / MMF / T-bills
        </label>
      </fieldset>

      {kind === "stock" && <StockForm onSubmit={onSubmit} onCancel={onCancel} />}
      {kind === "option" && (
        <OptionForm
          stockPositions={stockPositions}
          onSubmit={onSubmit}
          onCancel={onCancel}
        />
      )}
      {kind === "cash" && <CashForm onSubmit={onSubmit} onCancel={onCancel} />}
    </section>
  );
}

/* ─── Stock subform ──────────────────────────────────────────────── */

function StockForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (p: Position) => void;
  onCancel: () => void;
}) {
  const [symbol, setSymbol] = useState("");
  const [entryDate, setEntryDate] = useState(todayIso());
  const [shares, setShares] = useState("");
  const [costBasis, setCostBasis] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const sharesNum = Number(shares);
    const costBasisNum = Number(costBasis);
    if (!symbol.trim()) return setError("Symbol is required.");
    if (!Number.isFinite(sharesNum) || sharesNum <= 0)
      return setError("Shares must be a positive number.");
    if (!Number.isFinite(costBasisNum) || costBasisNum < 0)
      return setError("Cost basis must be a non-negative number.");
    const position: Position = {
      kind: "stock",
      id: newPositionId(),
      symbol: symbol.trim().toUpperCase(),
      entryDate,
      shares: sharesNum,
      costBasis: costBasisNum,
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    };
    onSubmit(position);
  };

  return (
    <form className="add-position__form" onSubmit={submit}>
      <Field label="Ticker">
        <input
          type="text"
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          placeholder="AAPL"
          required
        />
      </Field>
      <Field label="Entry date">
        <input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
      </Field>
      <Field label="Shares">
        <input
          type="number"
          step="any"
          value={shares}
          onChange={(e) => setShares(e.target.value)}
          placeholder="100"
          required
        />
      </Field>
      <Field label="Total cost basis ($)">
        <input
          type="number"
          step="0.01"
          value={costBasis}
          onChange={(e) => setCostBasis(e.target.value)}
          placeholder="15000"
          required
        />
      </Field>
      <Field label="Notes (optional)">
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Why you bought it"
        />
      </Field>
      {error && (
        <p className="add-position__error" role="alert">
          {error}
        </p>
      )}
      <FormActions onCancel={onCancel} submitLabel="Add stock" />
    </form>
  );
}

/* ─── Option subform ─────────────────────────────────────────────── */

function OptionForm({
  stockPositions,
  onSubmit,
  onCancel,
}: {
  stockPositions: StockPosition[];
  onSubmit: (p: Position) => void;
  onCancel: () => void;
}) {
  const [symbol, setSymbol] = useState("");
  const [optionType, setOptionType] = useState<"call" | "put">("call");
  const [contracts, setContracts] = useState("");
  const [strike, setStrike] = useState("");
  const [expiration, setExpiration] = useState("");
  const [premium, setPremium] = useState("");
  const [entryDate, setEntryDate] = useState(todayIso());
  const [pairedStockId, setPairedStockId] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Suggest pairings only for stocks of the same symbol.
  const candidatePairs = stockPositions.filter(
    (s) => s.symbol.toUpperCase() === symbol.trim().toUpperCase(),
  );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const contractsNum = Number(contracts);
    const strikeNum = Number(strike);
    const premiumNum = Number(premium);
    if (!symbol.trim()) return setError("Symbol is required.");
    if (!Number.isFinite(contractsNum) || contractsNum === 0 || !Number.isInteger(contractsNum))
      return setError("Contracts must be a non-zero integer (negative for short).");
    if (!Number.isFinite(strikeNum) || strikeNum <= 0)
      return setError("Strike must be a positive number.");
    if (!expiration) return setError("Expiration date is required.");
    if (!Number.isFinite(premiumNum) || premiumNum < 0)
      return setError("Premium must be a non-negative number.");
    const position: Position = {
      kind: "option",
      id: newPositionId(),
      symbol: symbol.trim().toUpperCase(),
      optionType,
      contracts: contractsNum,
      strike: strikeNum,
      expiration,
      premium: premiumNum,
      entryDate,
      ...(pairedStockId ? { pairedStockId } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    };
    onSubmit(position);
  };

  return (
    <form className="add-position__form" onSubmit={submit}>
      <Field label="Underlying ticker">
        <input
          type="text"
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          placeholder="AAPL"
          required
        />
      </Field>
      <Field label="Type">
        <select value={optionType} onChange={(e) => setOptionType(e.target.value as "call" | "put")}>
          <option value="call">Call</option>
          <option value="put">Put</option>
        </select>
      </Field>
      <Field label="Contracts (negative = short / sold)">
        <input
          type="number"
          step="1"
          value={contracts}
          onChange={(e) => setContracts(e.target.value)}
          placeholder="-1 for one short contract"
          required
        />
      </Field>
      <Field label="Strike ($)">
        <input
          type="number"
          step="0.01"
          value={strike}
          onChange={(e) => setStrike(e.target.value)}
          placeholder="200"
          required
        />
      </Field>
      <Field label="Expiration">
        <input
          type="date"
          value={expiration}
          onChange={(e) => setExpiration(e.target.value)}
          required
        />
      </Field>
      <Field label="Total premium ($, always positive)">
        <input
          type="number"
          step="0.01"
          value={premium}
          onChange={(e) => setPremium(e.target.value)}
          placeholder="350"
          required
        />
      </Field>
      <Field label="Entry date">
        <input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
      </Field>
      {candidatePairs.length > 0 && (
        <Field label="Pair with stock position (covered position)">
          <select value={pairedStockId} onChange={(e) => setPairedStockId(e.target.value)}>
            <option value="">— None —</option>
            {candidatePairs.map((s) => (
              <option key={s.id} value={s.id}>
                {s.symbol} · {s.shares} sh · cost {s.costBasis.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field label="Notes (optional)">
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Strategy / thesis"
        />
      </Field>
      {error && (
        <p className="add-position__error" role="alert">
          {error}
        </p>
      )}
      <FormActions onCancel={onCancel} submitLabel="Add option" />
    </form>
  );
}

/* ─── Cash subform ───────────────────────────────────────────────── */

function CashForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (p: Position) => void;
  onCancel: () => void;
}) {
  const [symbol, setSymbol] = useState("");
  const [entryDate, setEntryDate] = useState(todayIso());
  const [amount, setAmount] = useState("");
  const [yieldPct, setYieldPct] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = Number(amount);
    const yieldNum = Number(yieldPct);
    if (!symbol.trim()) return setError("Symbol is required.");
    if (!Number.isFinite(amountNum) || amountNum <= 0)
      return setError("Amount must be a positive number.");
    if (!Number.isFinite(yieldNum) || yieldNum < 0)
      return setError("Yield must be a non-negative number.");
    const position: Position = {
      kind: "cash",
      id: newPositionId(),
      symbol: symbol.trim().toUpperCase(),
      entryDate,
      amount: amountNum,
      yieldPct: yieldNum,
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    };
    onSubmit(position);
  };

  return (
    <form className="add-position__form" onSubmit={submit}>
      <Field label="Symbol (e.g. SPAXX, BIL, FZDXX)">
        <input
          type="text"
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          placeholder="SPAXX"
          required
        />
      </Field>
      <Field label="As-of date">
        <input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
      </Field>
      <Field label="Amount ($)">
        <input
          type="number"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="10000"
          required
        />
      </Field>
      <Field label="Annual yield (%)">
        <input
          type="number"
          step="0.01"
          value={yieldPct}
          onChange={(e) => setYieldPct(e.target.value)}
          placeholder="4.85"
          required
        />
      </Field>
      <Field label="Notes (optional)">
        <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      {error && (
        <p className="add-position__error" role="alert">
          {error}
        </p>
      )}
      <FormActions onCancel={onCancel} submitLabel="Add cash" />
    </form>
  );
}

/* ─── Shared subcomponents ───────────────────────────────────────── */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="add-position__field">
      <span className="add-position__field-label">{label}</span>
      {children}
    </label>
  );
}

function FormActions({
  onCancel,
  submitLabel,
}: {
  onCancel: () => void;
  submitLabel: string;
}) {
  return (
    <div className="add-position__actions">
      <button type="button" className="add-position__btn add-position__btn--secondary" onClick={onCancel}>
        Cancel
      </button>
      <button type="submit" className="add-position__btn add-position__btn--primary">
        {submitLabel}
      </button>
    </div>
  );
}
