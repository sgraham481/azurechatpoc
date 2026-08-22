import { useRef, useState } from 'react';
import Header from './components/Header.jsx';
import Sidebar from './components/Sidebar.jsx';
import Footer from './components/Footer.jsx';
import ChatWindow from './components/ChatWindow.jsx';
import ChatInput from './components/ChatInput.jsx';
import SuggestionChips from './components/SuggestionChips.jsx';
import { SparkIcon } from './components/Icons.jsx';

const SUGGESTIONS = [
  'Where do we stand?',
  'Why is Rule of 40 at 7.3%?',
  'Top risks this week',
  'What moved in the brief?',
  'Broader markets this week',
];

const GREETING = {
  id: 'greeting',
  role: 'assistant',
  content: "I've read this week's brief and the live metrics. Ask me where the business stands, or pick a thread below.",
};

let idCounter = 0;
const nextId = () => `m${++idCounter}`;

export default function App() {
  const [messages, setMessages] = useState([GREETING]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [waitingFirstToken, setWaitingFirstToken] = useState(false);
  const [lastResponseMs, setLastResponseMs] = useState(null);
  const abortRef = useRef(null);

  async function sendMessage(text) {
    const trimmed = text.trim();
    if (!trimmed || isStreaming) return;

    const userMessage = { id: nextId(), role: 'user', content: trimmed };
    const assistantId = nextId();

    // Snapshot the history we send, so we don't depend on async state updates.
    const history = [...messages, userMessage]
      .filter((m) => !m.isError && m.id !== 'greeting')
      .map(({ role, content }) => ({ role, content }));

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsStreaming(true);
    setWaitingFirstToken(true);

    const startedAt = performance.now();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const problem = await res.json().catch(() => ({}));
        throw new Error(problem.message || `Request failed with status ${res.status}.`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let assistantText = '';
      let started = false;
      let finishReason = null;

      // Azure sends SSE frames separated by a blank line; a frame can arrive
      // split across chunks, so buffer until we have complete frames.
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split('\n\n');
        buffer = frames.pop() ?? '';

        for (const frame of frames) {
          for (const line of frame.split('\n')) {
            if (!line.startsWith('data:')) continue;
            const payload = line.slice(5).trim();
            if (!payload || payload === '[DONE]') continue;

            let parsed;
            try {
              parsed = JSON.parse(payload);
            } catch {
              continue; // ignore keepalives / partial noise
            }

            if (parsed.error) throw new Error(parsed.message || 'The response stream failed.');

            const delta = parsed.choices?.[0]?.delta?.content;
            const finish = parsed.choices?.[0]?.finish_reason;
            if (finish === 'content_filter') {
              throw new Error("That response was blocked by Azure's content filter. Try rephrasing.");
            }
            if (finish) finishReason = finish;
            if (!delta) continue;

            assistantText += delta;

            if (!started) {
              started = true;
              setWaitingFirstToken(false);
              setMessages((prev) => [
                ...prev,
                { id: assistantId, role: 'assistant', content: assistantText, isStreaming: true },
              ]);
            } else {
              setMessages((prev) =>
                prev.map((m) => (m.id === assistantId ? { ...m, content: assistantText } : m))
              );
            }
          }
        }
      }

      if (!started) {
        throw new Error(
          finishReason === 'length'
            ? 'The model spent its whole token budget on reasoning before writing an answer. Raise AZURE_OPENAI_MAX_TOKENS in backend/.env.'
            : 'Azure returned an empty response. Try again.'
        );
      }

      setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, isStreaming: false } : m)));
      setLastResponseMs(Math.round(performance.now() - startedAt));
    } catch (err) {
      if (err.name === 'AbortError') return;
      // Keep the conversation intact and show the failure inline (spec §6.4).
      setMessages((prev) => [
        ...prev.map((m) => (m.id === assistantId ? { ...m, isStreaming: false } : m)),
        { id: nextId(), role: 'assistant', content: err.message, isError: true },
      ]);
    } finally {
      setIsStreaming(false);
      setWaitingFirstToken(false);
      abortRef.current = null;
    }
  }

  function clearChat() {
    abortRef.current?.abort();
    setMessages([GREETING]);
    setInput('');
    setLastResponseMs(null);
  }

  return (
    <div className="app">
      <Header />
      <Sidebar />

      <main className="main">
        <div className="breadcrumb">AI Assistant</div>

        <h1 className="page-title">
          <SparkIcon size={34} color="#4f46e5" />
          AI Assistant
        </h1>
        <p className="page-subtitle">Ask about the business — revenue, margin, risks, broader markets.</p>

        <section className="chat-card">
          <div className="assistant-header">
            <div className="spark-avatar">
              <SparkIcon size={22} />
            </div>
            <div>
              <h2 className="assistant-header__name">AI Executive Assistant</h2>
              <p className="assistant-header__sub">
                Grounded in today's data · ask about metrics, risks, and the brief
              </p>
            </div>
            <div className="header-actions">
              {lastResponseMs !== null && (
                <span className="assistant-header__sub">{lastResponseMs} ms</span>
              )}
              <button className="link-btn" onClick={clearChat} disabled={isStreaming}>
                Clear chat
              </button>
            </div>
          </div>

          <ChatWindow messages={messages} isWaitingFirstToken={waitingFirstToken} />

          <SuggestionChips suggestions={SUGGESTIONS} onSelect={sendMessage} disabled={isStreaming} />

          <ChatInput
            value={input}
            onChange={setInput}
            onSend={() => sendMessage(input)}
            disabled={isStreaming}
          />
        </section>
      </main>

      <Footer dataAsOf="Aug 3, 2026 · 3:00 PM" />
    </div>
  );
}
