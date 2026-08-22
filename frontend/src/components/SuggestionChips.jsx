export default function SuggestionChips({ suggestions, onSelect, disabled }) {
  return (
    <div className="chips">
      {suggestions.map((text) => (
        <button key={text} className="chip" onClick={() => onSelect(text)} disabled={disabled}>
          {text}
        </button>
      ))}
    </div>
  );
}
