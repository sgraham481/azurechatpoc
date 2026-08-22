import { Wordmark, RefreshIcon, ChatIcon, HelpIcon } from './Icons.jsx';

export default function Footer({ dataAsOf }) {
  return (
    <footer className="footer">
      <Wordmark color="#1b2a5e" />
      <div className="footer__meta">
        <span>Data as of {dataAsOf}</span>
        <RefreshIcon />
      </div>
      <div className="footer__spacer" />
      <div className="footer__links">
        <button className="footer__link">
          <ChatIcon />
          Have feedback?
        </button>
        <button className="footer__link">
          <HelpIcon />
          Need help?
        </button>
      </div>
    </footer>
  );
}
