export type IndustryFilterProps = {
  industries: string[];
  selected: string | null;
  onChange: (next: string | null) => void;
};

export function IndustryFilter({ industries, selected, onChange }: IndustryFilterProps) {
  return (
    <label className="industry-filter">
      <span className="industry-filter__label">Industry:</span>
      <select
        aria-label="Filter by industry"
        value={selected ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}
      >
        <option value="">All industries</option>
        {industries.map((ind) => (
          <option key={ind} value={ind}>
            {ind}
          </option>
        ))}
      </select>
    </label>
  );
}
