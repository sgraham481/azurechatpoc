import { useRef } from 'react';
import { SendIcon } from './Icons.jsx';

export default function ChatInput({ value, onChange, onSend, disabled }) {
  const textareaRef = useRef(null);

  function handleKeyDown(e) {
    // Enter sends, Shift+Enter makes a newline.
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!disabled && value.trim()) onSend();
    }
  }

  function handleChange(e) {
    onChange(e.target.value);
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
    }
  }

  return (
    <div className="composer">
      <textarea
        ref={textareaRef}
        className="composer__input"
        rows={1}
        placeholder="Ask about this week's numbers..."
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        disabled={disabled}
      />
      <button
        className="send-btn"
        onClick={onSend}
        disabled={disabled || !value.trim()}
        aria-label="Send message"
      >
        <SendIcon />
      </button>
    </div>
  );
}
