import { SparkIcon } from './Icons.jsx';

export default function Sidebar() {
  return (
    <nav className="sidebar">
      <button className="nav-item nav-item--active">
        <SparkIcon size={18} />
        AI Assistant
      </button>
    </nav>
  );
}
