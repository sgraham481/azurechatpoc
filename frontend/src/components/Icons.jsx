// Inline SVGs so the POC has no icon-library dependency.

export function SparkIcon({ size = 22, color = '#fff' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M13 2.5l1.6 4.6 4.6 1.6-4.6 1.6L13 15l-1.6-4.7L6.8 8.7l4.6-1.6L13 2.5z" fill={color} />
      <path d="M6.4 14.2l.85 2.45 2.45.85-2.45.85L6.4 21l-.85-2.65-2.45-.85 2.45-.85.85-2.45z" fill={color} opacity="0.85" />
    </svg>
  );
}

export function PanelIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <rect x="2.5" y="3.5" width="15" height="13" rx="2.5" stroke="#fff" strokeWidth="1.7" />
      <rect x="5" y="6" width="3.4" height="8" rx="1" fill="#fff" />
    </svg>
  );
}

export function SearchIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="10.7" cy="10.7" r="6.7" stroke="currentColor" strokeWidth="1.9" />
      <path d="M15.6 15.6L20.5 20.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

export function BellIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3.2a5.6 5.6 0 00-5.6 5.6v3.3L5 15.4h14l-1.4-3.3V8.8A5.6 5.6 0 0012 3.2z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M10 18.2a2.2 2.2 0 004 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function SendIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M21 3L10.5 13.5M21 3l-6.8 18-3.7-7.5L3 9.8 21 3z" stroke="#fff" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  );
}

export function RefreshIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M20 12a8 8 0 11-2.6-5.9" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      <path d="M20 3.5V9h-5.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ChatIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M20.5 12c0 4-3.8 7.2-8.5 7.2-1 0-2-.15-2.9-.42L4 20.5l1.5-3.6A6.9 6.9 0 013.5 12c0-4 3.8-7.2 8.5-7.2s8.5 3.2 8.5 7.2z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function HelpIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="8.6" stroke="currentColor" strokeWidth="1.7" />
      <path d="M9.8 9.4a2.3 2.3 0 114 1.6c-.7.6-1.5 1-1.5 2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="12.2" cy="16.4" r="0.95" fill="currentColor" />
    </svg>
  );
}

// Placeholder wordmark — swap for the real Astrion SVG when you have the asset.
export function Wordmark({ color = '#fff' }) {
  return (
    <span className="wordmark" style={{ color }}>
      <svg className="wordmark__mark" width="34" height="20" viewBox="0 0 34 20" fill="none" aria-hidden="true">
        <path d="M2 17.5L15.5 2.5h4L6 17.5H2z" fill={color} />
        <path d="M12.5 17.5L26 2.5h4L16.5 17.5h-4z" fill={color} opacity="0.72" />
      </svg>
      ASTRION<span className="wordmark__tm">™</span>
    </span>
  );
}
