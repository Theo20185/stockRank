export type AppHeaderProps = {
  /** When omitted, the header renders only the back button (if present)
   * and nothing else. Useful on screens whose primary card already
   * carries a title (e.g. StockDetail). */
  title?: string;
  subtitle?: string;
  /** When provided, renders a back button on the left that calls this. */
  onBack?: () => void;
  right?: React.ReactNode;
};

export function AppHeader({ title, subtitle, onBack, right }: AppHeaderProps) {
  const hasTitle = Boolean(title);
  return (
    <header className={hasTitle ? "app-header" : "app-header app-header--bare"}>
      <div className="app-header__row">
        {onBack ? (
          <button
            type="button"
            className="app-header__back"
            aria-label="Back"
            onClick={onBack}
          >
            ‹
          </button>
        ) : null}
        {hasTitle && <h1 className="app-header__title">{title}</h1>}
        {right && <div className="app-header__right">{right}</div>}
      </div>
      {subtitle && <p className="app-header__subtitle">{subtitle}</p>}
    </header>
  );
}
