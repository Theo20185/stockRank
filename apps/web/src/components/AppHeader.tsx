export type AppHeaderProps = {
  title: string;
  subtitle?: string;
  /** When provided, renders a back button on the left that calls this. */
  onBack?: () => void;
  right?: React.ReactNode;
};

export function AppHeader({ title, subtitle, onBack, right }: AppHeaderProps) {
  return (
    <header className="app-header">
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
        ) : (
          <span className="app-header__back app-header__back--placeholder" aria-hidden />
        )}
        <h1 className="app-header__title">{title}</h1>
        <div className="app-header__right">{right}</div>
      </div>
      {subtitle && <p className="app-header__subtitle">{subtitle}</p>}
    </header>
  );
}
