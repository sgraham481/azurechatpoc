import { PanelIcon, SearchIcon, BellIcon, Wordmark } from './Icons.jsx';

// Presentational only — search, notifications and the account menu are out of
// scope for the POC (spec §9), but the shell should look like the real product.
export default function Header() {
  return (
    <header className="topbar">
      <div className="topbar__panel-icon">
        <PanelIcon />
      </div>
      <Wordmark />
      <div className="topbar__divider" />
      <span className="topbar__title">Executive Command Center</span>
      <div className="topbar__spacer" />
      <div className="topbar__actions">
        <button className="icon-btn" aria-label="Search" title="Not wired up in this POC">
          <SearchIcon />
        </button>
        <button className="icon-btn" aria-label="Notifications" title="Not wired up in this POC">
          <BellIcon />
          <span className="badge">3</span>
        </button>
        <div className="avatar-chip" title="Signed-in user">TV</div>
      </div>
    </header>
  );
}
