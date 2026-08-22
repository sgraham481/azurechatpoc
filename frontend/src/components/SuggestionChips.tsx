interface SuggestionChipsProps {
  suggestions: readonly string[];
  onSelect: (text: string) => void;
  disabled: boolean;
}

export default function SuggestionChips({ suggestions, onSelect, disabled }: SuggestionChipsProps) {
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
