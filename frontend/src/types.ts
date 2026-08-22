/** Roles the backend accepts; mirrors VALID_ROLES in backend/src/routes/chat.js. */
export type Role = 'system' | 'user' | 'assistant';

/** A message as rendered in the UI. */
export interface Message {
  id: string;
  role: Role;
  content: string;
  /** Set on locally-generated failure bubbles; these are never sent to Azure. */
  isError?: boolean;
  /** True while tokens are still arriving for this message. */
  isStreaming?: boolean;
}

/** The trimmed shape POSTed to /api/chat — no UI-only fields. */
export type WireMessage = Pick<Message, 'role' | 'content'>;

/** Why Azure stopped generating. `length` is the one that bites: with a reasoning
 *  model it can mean the budget was spent before any visible text was produced. */
export type FinishReason = 'stop' | 'length' | 'content_filter' | 'tool_calls';

/** One SSE frame from Azure. Fields are optional because the first frame carries
 *  only prompt content-filter results and an empty `choices` array. */
export interface StreamChunk {
  choices?: Array<{
    delta?: { content?: string | null; role?: string };
    finish_reason?: FinishReason | null;
    index?: number;
  }>;
  /** Present on error frames the backend injects when a stream dies mid-flight. */
  error?: string;
  message?: string;
}

/** JSON error body returned by the backend for non-2xx responses. */
export interface ApiError {
  error?: string;
  message?: string;
}

/** A single non-streaming completion, as returned by the deployed Azure Function.
 *  Static Web Apps' managed functions do not stream reliably, so the same
 *  frontend handles both shapes and picks by Content-Type. */
export interface ChatCompletion {
  choices?: Array<{
    message?: { content?: string | null };
    finish_reason?: FinishReason | null;
  }>;
  /** Set on 200 responses that carry a handled failure (budget_exhausted, content_filter). */
  error?: string;
  message?: string;
}
