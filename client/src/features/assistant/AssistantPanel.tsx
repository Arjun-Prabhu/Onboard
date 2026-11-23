/**
 * @file The one Help panel: how to use the current screen (FR-31) plus the Help Assistant
 * (FR-23). Runs locally — no AI service or internet call; answers come from the API's assistant
 * service, which is role-aware.
 */
import { LifeBuoy, Send, X } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { messageOf } from '@shared/errors';
import type { AssistantReply } from '@shared/types';
import { Button } from '@/components/Button';
import { useOrg } from '@/context/OrgContext';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { modeForPath } from '@/app/navigation';
import { helpFor } from '../help/helpContent';
import { useHelp } from '../help/HelpContext';

interface Message {
  id: number;
  from: 'user' | 'bot';
  text: string;
  reply?: AssistantReply;
}

/** Example prompts shown before the first question. */
const STARTERS = {
  manage: [
    'Which sessions need volunteers this week?',
    'Who is free Tuesday?',
    'How many hours are pending?',
  ],
  self: [
    'When is my next shift?',
    'How many hours do I have?',
    'How do I volunteer with another organization?',
  ],
};

/**
 * Slide-over assistant panel.
 * @returns The panel, or null when closed.
 */
export function AssistantPanel() {
  const { assistantOpen, setAssistantOpen } = useHelp();
  const { activeOrg } = useOrg();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const screen = helpFor(pathname);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (assistantOpen) inputRef.current?.focus();
  }, [assistantOpen]);
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);
  useEffect(() => {
    if (!assistantOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setAssistantOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [assistantOpen, setAssistantOpen]);

  /**
   * Sends a question to the assistant.
   * @param question - The question text.
   */
  const ask = async (question: string) => {
    const q = question.trim();
    if (!q || busy) return;
    setDraft('');
    setMessages((m) => [...m, { id: Date.now(), from: 'user', text: q }]);
    setBusy(true);
    try {
      const reply = await api.assistant.ask(q, activeOrg?.id ?? null);
      setMessages((m) => [...m, { id: Date.now() + 1, from: 'bot', text: reply.text, reply }]);
    } catch (err) {
      setMessages((m) => [...m, { id: Date.now() + 1, from: 'bot', text: messageOf(err) }]);
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void ask(draft);
  };

  if (!assistantOpen) return null;
  return (
    <aside
      aria-label="Help"
      className="animate-pop fixed inset-x-2 bottom-2 top-16 z-40 flex flex-col rounded-panel border border-line bg-surface shadow-2xl sm:inset-x-auto sm:right-4 sm:w-96"
    >
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <LifeBuoy className="size-5 text-primary" aria-hidden /> Help
        </h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setAssistantOpen(false)}
          aria-label="Close help"
          icon={<X className="size-5" aria-hidden />}
        />
      </div>
      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3" aria-live="polite">
        {messages.length === 0 && (
          <div className="text-sm text-ink-muted">
            <section aria-labelledby="screen-help" className="rounded-panel bg-surface-2 p-3">
              <h3 id="screen-help" className="font-semibold text-ink">
                {screen.title}
              </h3>
              <p className="mt-0.5">{screen.summary}</p>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-ink">
                {screen.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
              <Link
                to="/help"
                onClick={() => setAssistantOpen(false)}
                className="mt-2 inline-block font-medium text-primary underline underline-offset-2"
              >
                All help topics
              </Link>
            </section>
            <p className="mt-4">Or ask a question. Everything stays on this computer.</p>
            <ul className="mt-2 flex flex-col gap-2">
              {(activeOrg && modeForPath(pathname) !== 'volunteer'
                ? STARTERS.manage
                : STARTERS.self
              ).map((s) => (
                <li key={s}>
                  <button
                    type="button"
                    onClick={() => void ask(s)}
                    className="w-full rounded-control border border-line px-3 py-2 text-left text-ink hover:border-primary"
                  >
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={cn('flex', m.from === 'user' ? 'justify-end' : 'justify-start')}
          >
            <div
              className={cn(
                'max-w-[85%] rounded-panel px-3 py-2 text-sm',
                m.from === 'user' ? 'bg-primary text-on-primary' : 'bg-surface-2 text-ink',
              )}
            >
              <span className="sr-only">{m.from === 'user' ? 'You said: ' : 'Assistant: '}</span>
              {m.text}
              {m.reply?.link && (
                <div className="mt-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      navigate(m.reply!.link!.to);
                      setAssistantOpen(false);
                    }}
                  >
                    {m.reply.link.label}
                  </Button>
                </div>
              )}
              {m.reply?.suggestions && m.reply.suggestions.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {m.reply.suggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => void ask(s)}
                      className="rounded-full border border-line bg-surface px-2.5 py-1 text-xs text-ink hover:border-primary"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {busy && (
          <p className="text-sm text-ink-muted" role="status">
            Thinking…
          </p>
        )}
      </div>
      <form onSubmit={onSubmit} className="flex gap-2 border-t border-line p-3">
        <label htmlFor="assistant-input" className="sr-only">
          Ask a question
        </label>
        <input
          id="assistant-input"
          ref={inputRef}
          value={draft}
          maxLength={300}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="e.g. Who is free Tuesday?"
          className="min-h-10 flex-1 rounded-control border border-line-strong bg-surface px-3 text-sm text-ink"
        />
        <Button
          type="submit"
          aria-label="Send question"
          disabled={!draft.trim()}
          loading={busy}
          icon={<Send className="size-4" aria-hidden />}
        />
      </form>
    </aside>
  );
}
