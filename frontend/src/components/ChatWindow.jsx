import { useEffect, useRef } from 'react';
import MessageBubble from './MessageBubble.jsx';

export default function ChatWindow({ messages, isWaitingFirstToken }) {
  const endRef = useRef(null);

  // Follow the conversation as it grows, including during token streaming.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, isWaitingFirstToken]);

  return (
    <div className="chat-window">
      {messages.map((m) => (
        <MessageBubble
          key={m.id}
          role={m.role}
          content={m.content}
          isError={m.isError}
          isStreaming={m.isStreaming}
        />
      ))}

      {isWaitingFirstToken && (
        <div className="msg-row">
          <div className="bubble bubble--assistant">
            <span className="typing">
              <span />
              <span />
              <span />
            </span>
          </div>
        </div>
      )}

      <div ref={endRef} />
    </div>
  );
}
