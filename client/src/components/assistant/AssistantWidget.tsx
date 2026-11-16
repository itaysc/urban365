import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { MessageCircle, X } from 'lucide-react';
import { LoginDialog } from '@/components/auth/LoginDialog';
import { formatPrice, formatShekel } from '@/lib/format';
import sheet from './assistant.css?inline';
import {
  forgetConversation,
  loadConversation,
  rememberAssistantOpen,
  rememberConversation,
  sendMessage,
  storedAssistantOpen,
  storedConversationId,
  type AssistantCard,
  type AssistantMessage,
} from './assistant';

const HIDDEN = [/^\/app(?:\/|$)/, /^\/admin(?:\/|$)/, /^\/login(?:\/|$)/, /^\/signup(?:\/|$)/, /^\/join(?:\/|$)/];

const emptyAssistant = (): AssistantMessage => ({
  role: 'assistant',
  content: '',
  cards: [],
  needsSignIn: false,
});

function useAssistantStyles(): void {
  useEffect(() => {
    if (document.getElementById('u365-asst-css')) return;
    const style = document.createElement('style');
    style.id = 'u365-asst-css';
    style.textContent = sheet;
    document.head.appendChild(style);
  }, []);
}

/**
 * The end-user assistant, on the app.
 *
 * Agency and admin screens have their own work and will get their own assistants.
 * This one stays out of their way. The front door is not this app — it mounts
 * `AssistantPanel` on its own.
 */
export function AssistantWidget() {
  const { pathname } = useLocation();
  const [signIn, setSignIn] = useState(false);
  if (HIDDEN.some((pattern) => pattern.test(pathname))) return null;

  return (
    <>
      <AssistantPanel pathname={pathname} onSignIn={() => setSignIn(true)} />
      <LoginDialog open={signIn} onOpenChange={setSignIn} description="כדי לשמור נכס, חיפוש או מודעה צריך להתחבר." />
    </>
  );
}

/**
 * The chat itself.
 *
 * `signInHref` is for a page that is not the app, where a dialog cannot open.
 * Links are real anchors either way: a search, a listing and a blog post are not
 * all routes of this router, and a click has to land on the page that serves them.
 */
export function AssistantPanel({ pathname, onSignIn, signInHref }: {
  pathname: string;
  onSignIn?: () => void;
  signInHref?: string;
}) {
  useAssistantStyles();
  const [open, setOpenState] = useState(storedAssistantOpen);
  const setOpen = (next: boolean | ((value: boolean) => boolean)) => {
    setOpenState((current) => {
      const value = typeof next === 'function' ? next(current) : next;
      rememberAssistantOpen(value);
      return value;
    });
  };
  const [pending, setPending] = useState(false);
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const conversationId = useRef<string | null>(storedConversationId());
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = conversationId.current;
    if (!id) return;
    let cancelled = false;
    void loadConversation(id).then((loaded) => {
      if (cancelled) return;
      if (!loaded) {
        conversationId.current = null;
        forgetConversation();
        return;
      }
      setMessages(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [messages, open]);

  if (HIDDEN.some((pattern) => pattern.test(pathname))) return null;

  const send = async () => {
    const text = draft.trim();
    if (!text || pending) return;
    setDraft('');
    setPending(true);
    setMessages((current) => [...current, { role: 'user', content: text, cards: [], needsSignIn: false }, emptyAssistant()]);

    const patch = (update: (message: AssistantMessage) => AssistantMessage) => {
      setMessages((current) => {
        const next = [...current];
        const last = next[next.length - 1];
        if (!last || last.role !== 'assistant') return current;
        next[next.length - 1] = update(last);
        return next;
      });
    };

    try {
      await sendMessage(text, conversationId.current, {
        onReady: (id) => {
          conversationId.current = id;
          rememberConversation(id);
        },
        onText: (delta) => patch((message) => ({ ...message, content: message.content + delta })),
        onCards: (cards) => patch((message) => ({ ...message, cards: [...message.cards, ...cards] })),
        onSignIn: () => patch((message) => ({ ...message, needsSignIn: true })),
        onError: (message) => patch((current) => ({ ...current, content: current.content || message })),
      });
    } catch {
      patch((current) => ({ ...current, content: current.content || 'משהו השתבש. נסה שוב.' }));
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      {open && (
        <section className="u365-asst-panel" aria-label="עוזר">
          <header className="u365-asst-head">
            <div>
              <div className="u365-asst-title">עוזר Urban365</div>
              <div className="u365-asst-note">חיפוש, מחירים ומשכנתא. לא ייעוץ.</div>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="סגירה" className="u365-asst-x">
              <X />
            </button>
          </header>

          <div ref={scroller} className="u365-asst-log">
            {messages.length === 0 && (
              <p className="u365-asst-empty">שאל אותי על דירות, מחירים, משכנתא ועוד... למשל: אני מחפש דירת 4 חדרים בנתניה</p>
            )}
            {messages.map((message, index) => (
              <article key={index} className={message.role === 'user' ? 'u365-asst-mine' : undefined}>
                {message.content && (
                  <p className={message.role === 'user' ? 'u365-asst-user' : 'u365-asst-bot'}>{message.content}</p>
                )}
                {message.cards.length > 0 && (
                  <div className="u365-asst-cards">
                    {message.cards.map((card, cardIndex) => (
                      <CardView key={cardIndex} card={card} />
                    ))}
                  </div>
                )}
                {message.needsSignIn &&
                  (signInHref ? (
                    <a className="u365-asst-signin" href={signInHref}>
                      התחברות
                    </a>
                  ) : (
                    <button type="button" className="u365-asst-signin" onClick={onSignIn}>
                      התחברות
                    </button>
                  ))}
              </article>
            ))}
          </div>

          <form
            className="u365-asst-form"
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
          >
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="שאלה או בקשה"
            />
            <button type="submit" disabled={pending || draft.trim() === ''}>
              שליחה
            </button>
          </form>
        </section>
      )}

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={open ? 'סגירת העוזר' : 'פתיחת העוזר'}
        className="u365-asst-button"
      >
        {open ? <X /> : <MessageCircle />}
      </button>
    </>
  );
}

function CardView({ card }: { card: AssistantCard }) {
  if (card.type === 'listing') {
    return (
      <a href={card.href} className="u365-asst-card">
        <div>{card.title}</div>
        <div className="u365-asst-meta">
          {[card.rooms !== null ? `${card.rooms} חד'` : '', card.sqm !== null ? `${card.sqm} מ"ר` : '', formatPrice(card.price)]
            .filter(Boolean)
            .join(' · ')}
        </div>
      </a>
    );
  }

  if (card.type === 'link') {
    return (
      <a href={card.href} className="u365-asst-link">
        {card.label}
      </a>
    );
  }

  if (card.type === 'mortgage') {
    return (
      <div className="u365-asst-card">
        <div>{formatShekel(card.monthly)} לחודש</div>
        <div className="u365-asst-meta">
          הלוואה {formatShekel(card.loan)} · {card.years} שנים · {card.note}
        </div>
      </div>
    );
  }

  return (
    <div className="u365-asst-card">
      <div>
        {card.low !== null && card.high !== null
          ? `${formatShekel(card.low)} – ${formatShekel(card.high)}`
          : 'אין טווח'}
      </div>
      <div className="u365-asst-meta">{card.city} · טווח, לא שמאות</div>
    </div>
  );
}
