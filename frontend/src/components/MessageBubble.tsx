import { SparkIcon } from './Icons.tsx';
import type { Message } from '../types.ts';

type MessageBubbleProps = Pick<Message, 'role' | 'content' | 'isError' | 'isStreaming'>;

export default function MessageBubble({ role, content, isError, isStreaming }: MessageBubbleProps) {
  const isUser = role === 'user';

  const bubbleClass = isError
    ? 'bubble bubble--error'
    : isUser
      ? 'bubble bubble--user'
      : 'bubble bubble--assistant';

  return (
    <div className={`msg-row ${isUser ? 'msg-row--user' : ''}`}>
      {!isUser && !isError && (
        <div className="spark-avatar spark-avatar--sm">
          <SparkIcon size={15} />
        </div>
      )}
      <div className={bubbleClass}>
        {content}
        {isStreaming && <span className="caret" />}
      </div>
    </div>
  );
}
