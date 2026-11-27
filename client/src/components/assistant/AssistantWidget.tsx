import { useEffect, useRef, useState, type RefObject } from 'react';
import { useLocation } from 'react-router-dom';
import { BookOpen, Landmark, LineChart, Search, Tag, Trash2, X, type LucideIcon } from 'lucide-react';
import { useAuth } from '@/auth/auth-context';
import { LoginDialog } from '@/components/auth/LoginDialog';
import { formatPrice, formatShekel } from '@/lib/format';
import sheet from './assistant.css?inline';
import {
  awaitingSignIn,
  clearHistory,
  confirmTool,
  forgetAwaitingSignIn,
  rememberAwaitingSignIn,
  RESUME_AFTER_SIGN_IN,
  waitingOnSignIn,
  displayChatText,
  stickAfterScroll,
  typeStep,
  forgetConversation,
  forgetTranscript,
  formatChatDate,
  loadConversation,
  assistantOpensOnLoad,
  rememberAssistantOpen,
  rememberConversation,
  rememberTranscript,
  sendMessage,
  shownTranscript,
  storedConversationId,
  storedTranscript,
  type AssistantAgentId,
  type AssistantCard,
  type AssistantMessage,
} from './assistant';
import { A2UISurface } from './A2UISurface';
import { CHAT_CATEGORIES, type ChatAction } from './chat-actions';
import { crmPageContext } from './page-context';

const HIDDEN = [/^\/app(?:\/|$)/, /^\/admin(?:\/|$)/, /^\/login(?:\/|$)/, /^\/signup(?:\/|$)/, /^\/join(?:\/|$)/];

const CATEGORY_ICON: Record<string, LucideIcon> = {
  buy: Search,
  sell: Tag,
  mortgage: Landmark,
  value: LineChart,
  info: BookOpen,
};

const emptyAssistant = (): AssistantMessage => ({
  role: 'assistant',
  content: '',
  cards: [],
  needsSignIn: false,
});

function useAssistantStyles(): void {
  useEffect(() => {
    const style = document.getElementById('u365-asst-css') ?? document.createElement('style');
    style.id = 'u365-asst-css';
    style.textContent = sheet;
    if (!style.parentNode) document.head.appendChild(style);
  });
}

/**
 * The public assistant. Stays off CRM and admin screens — those mount their own panel.
 */
export function AssistantWidget() {
  const { pathname } = useLocation();
  const { user, loading } = useAuth();
  const [signIn, setSignIn] = useState(false);

  return (
    <>
      <AssistantPanel
        agentId="end-user"
        pathname={pathname}
        signedIn={loading ? null : user !== null}
        onSignIn={() => setSignIn(true)}
      />
      <LoginDialog open={signIn} onOpenChange={setSignIn} description="כדי לשמור נכס, חיפוש או מודעה צריך להתחבר." />
    </>
  );
}

/** The CRM assistant. Mounted inside the agency shell, not on public pages. */
export function AgencyAssistantWidget() {
  const { pathname } = useLocation();
  return (
    <AssistantPanel
      agentId="agency"
      pathname={pathname}
      hideOnPublic={false}
      emptyPrompt="שאל אותי על לקוחות, פניות, עסקאות או היומן. למשל: מי הפגישות שלי השבוע?"
      note="לקוחות, עסקאות, יומן ומחירים..."
    />
  );
}

/**
 * The chat itself.
 *
 * `signInHref` is for a page that is not the app, where a dialog cannot open.
 * Links are real anchors either way: a search, a listing and a blog post are not
 * all routes of this router, and a click has to land on the page that serves them.
 *
 * `signedIn` is null while the session is still being read. Without it the panel
 * cannot tell that a sign-in happened, and the request waits for the next message.
 */
export function AssistantPanel({
  agentId = 'end-user',
  pathname,
  signedIn,
  onSignIn,
  signInHref,
  hideOnPublic = true,
  emptyPrompt = 'שאל אותי על דירות, מחירים, משכנתא ועוד... למשל: אני מחפש דירת 4 חדרים בנתניה',
  note = 'חיפוש דירות, מחירים, משכנתא ועוד...',
}: {
  agentId?: AssistantAgentId;
  pathname: string;
  signedIn?: boolean | null;
  onSignIn?: () => void;
  signInHref?: string;
  hideOnPublic?: boolean;
  emptyPrompt?: string;
  note?: string;
}) {
  useAssistantStyles();
  const [open, setOpenState] = useState(() => assistantOpensOnLoad(agentId));
  // `present` keeps the panel mounted through the slide out. `entered` is the
  // frame after it is in the document, so the browser can animate from off-screen.
  const [present, setPresent] = useState(open);
  const [entered, setEntered] = useState(open);
  const setOpen = (next: boolean | ((value: boolean) => boolean)) => {
    setOpenState((current) => {
      const value = typeof next === 'function' ? next(current) : next;
      rememberAssistantOpen(value, agentId);
      return value;
    });
  };
  const [pending, setPending] = useState(false);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [draft, setDraft] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [messages, setMessagesState] = useState<AssistantMessage[]>(() => storedTranscript(agentId));
  const setMessages = (update: AssistantMessage[] | ((current: AssistantMessage[]) => AssistantMessage[])) => {
    setMessagesState((current) => {
      const next = typeof update === 'function' ? update(current) : update;
      rememberTranscript(next, agentId);
      return next;
    });
  };
  const conversationId = useRef<string | null>(storedConversationId(agentId));
  const scroller = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const touchY = useRef<number | null>(null);

  useEffect(() => {
    if (open) {
      setPresent(true);
      return;
    }
    setEntered(false);
  }, [open]);

  useEffect(() => {
    if (!open || !present || entered) return;
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setEntered(true));
    });
    return () => {
      cancelAnimationFrame(first);
      if (second) cancelAnimationFrame(second);
    };
  }, [open, present, entered]);

  useEffect(() => {
    if (open || entered || !present) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setPresent(false);
      return;
    }
    const backup = window.setTimeout(() => setPresent(false), 320);
    return () => window.clearTimeout(backup);
  }, [open, entered, present]);

  useEffect(() => {
    const id = conversationId.current;
    if (!id) return;
    let cancelled = false;
    void loadConversation(id, agentId).then((loaded) => {
      if (cancelled) return;
      if (!loaded.ok) {
        // A missing row cannot be continued. A failed request can, so the id stays.
        // Either way the lines already on screen stay there.
        if (loaded.missing) {
          conversationId.current = null;
          forgetConversation(agentId);
        }
        return;
      }
      setMessages((current) => shownTranscript(current, loaded.messages));
    });
    return () => {
      cancelled = true;
    };
  }, [agentId]);

  useEffect(() => {
    const node = scroller.current;
    if (!node || !stickToBottom.current) return;
    const opened = messages.at(-1)?.fresh === true ? node.querySelector('article.u365-asst-arrive:last-of-type') : null;
    if (opened instanceof HTMLElement) {
      const top = opened.offsetTop - node.offsetTop;
      if (top < node.scrollTop || top + opened.offsetHeight > node.scrollTop + node.clientHeight) {
        node.scrollTop = top;
      }
      return;
    }
    node.scrollTop = node.scrollHeight;
  }, [messages, open]);

  // A session that appears after the chat asked for one picks the request back up.
  // Seen signed out first, or marked before a Google redirect — not merely loaded
  // signed in, or every page of a signed-in visit would repeat it.
  const sendRef = useRef<((seed?: string) => Promise<void>) | null>(null);
  const seenSignedIn = useRef(signedIn);
  const resume = useRef(false);
  useEffect(() => {
    if (signedIn === true && (seenSignedIn.current === false || awaitingSignIn(agentId))) resume.current = true;
    if (signedIn != null) seenSignedIn.current = signedIn;
    if (!resume.current || pending || !sendRef.current) return;
    resume.current = false;
    forgetAwaitingSignIn(agentId);
    if (waitingOnSignIn(messages)) void sendRef.current(RESUME_AFTER_SIGN_IN);
  }, [signedIn, pending, messages, agentId]);

  if (hideOnPublic && HIDDEN.some((pattern) => pattern.test(pathname))) return null;

  const clear = async () => {
    if (pending || clearing) return;
    setClearing(true);
    try {
      const cleared = await clearHistory(agentId);
      if (!cleared) return;
      conversationId.current = null;
      forgetConversation(agentId);
      forgetTranscript(agentId);
      setMessages([]);
      setConfirmingClear(false);
    } finally {
      setClearing(false);
    }
  };

  const showAction = (action: ChatAction) => {
    setCategory(null);
    stickToBottom.current = true;
    setMessages((current) => [
      ...current,
      { role: 'assistant', content: action.intro, cards: [action.card], needsSignIn: false, fresh: true },
    ]);
  };

  const send = async (seed?: string) => {
    const text = (seed ?? draft).trim();
    if (!text || pending) return;
    stickToBottom.current = true;
    setCategory(null);
    setConfirmingClear(false);
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

    const page = agentId === 'agency' ? crmPageContext(pathname, window.location.search) : null;

    try {
      await sendMessage(
        text,
        conversationId.current,
        {
          onReady: (id) => {
            conversationId.current = id;
            rememberConversation(id, agentId);
          },
          onText: (delta) => patch((message) => ({ ...message, content: message.content + delta })),
          onCards: (cards) => patch((message) => ({ ...message, cards: [...message.cards, ...cards] })),
          onSignIn: () => patch((message) => ({ ...message, needsSignIn: true })),
          onError: (message) => patch((current) => ({ ...current, content: current.content || message })),
        },
        undefined,
        agentId,
        page,
      );
    } catch {
      patch((current) => ({ ...current, content: current.content || 'משהו השתבש. נסה שוב.' }));
    } finally {
      setPending(false);
    }
  };
  sendRef.current = send;

  const onConfirm = async (toolCallId: string, accept: boolean) => {
    if (pending || !conversationId.current) return;
    setPending(true);
    stickToBottom.current = true;
    setMessages((current) => [...current, emptyAssistant()]);

    const patch = (update: (message: AssistantMessage) => AssistantMessage) => {
      setMessages((current) => {
        const next = [...current];
        const last = next[next.length - 1];
        if (!last || last.role !== 'assistant') return current;
        next[next.length - 1] = update(last);
        return next;
      });
    };

    const page = agentId === 'agency' ? crmPageContext(pathname, window.location.search) : null;

    try {
      await confirmTool(
        conversationId.current,
        toolCallId,
        accept,
        {
          onReady: (id) => {
            conversationId.current = id;
            rememberConversation(id, agentId);
          },
          onText: (delta) => patch((message) => ({ ...message, content: message.content + delta })),
          onCards: (cards) => {
            setMessages((current) =>
              current.map((message) => ({
                ...message,
                cards: message.cards.map((card) => {
                  if (card.type !== 'confirm' || card.toolCallId !== toolCallId) return card;
                  const next = cards.find((item) => item.type === 'confirm' && item.toolCallId === toolCallId);
                  return next ?? card;
                }),
              })),
            );
            patch((message) => ({
              ...message,
              cards: [
                ...message.cards,
                ...cards.filter((card) => card.type !== 'confirm' || card.toolCallId !== toolCallId),
              ],
            }));
          },
          onSignIn: () => patch((message) => ({ ...message, needsSignIn: true })),
          onError: (message) => patch((current) => ({ ...current, content: current.content || message })),
        },
        agentId,
        page,
      );
    } catch {
      patch((current) => ({ ...current, content: current.content || 'משהו השתבש. נסה שוב.' }));
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      {present && (
        <section
          className={entered ? 'u365-asst-panel is-open' : 'u365-asst-panel'}
          aria-label="עוזר"
          aria-hidden={!entered}
          onTransitionEnd={(event) => {
            if (event.target !== event.currentTarget || event.propertyName !== 'transform' || open) return;
            setPresent(false);
          }}
        >
          <header className="u365-asst-head">
            <div>
              <div className="u365-asst-title">עוזר AI</div>
              <div className="u365-asst-note">{note}</div>
            </div>
            <div className="u365-asst-actions">
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={() => setConfirmingClear(true)}
                  disabled={pending || clearing}
                  aria-label="מחיקת השיחה"
                  className="u365-asst-x"
                >
                  <Trash2 />
                </button>
              )}
              <button type="button" onClick={() => setOpen(false)} aria-label="סגירה" className="u365-asst-x">
                <X />
              </button>
            </div>
          </header>
          {confirmingClear && (
            <div className="u365-asst-confirm">
              <span>למחוק את השיחה?</span>
              <button type="button" onClick={() => setConfirmingClear(false)} disabled={clearing}>
                ביטול
              </button>
              <button type="button" className="is-danger" onClick={() => void clear()} disabled={clearing}>
                מחיקה
              </button>
            </div>
          )}

          <div
            ref={scroller}
            className="u365-asst-log"
            onWheel={(event) => {
              if (event.deltaY < 0 && event.currentTarget.scrollTop > 0) stickToBottom.current = false;
            }}
            onTouchStart={(event) => {
              touchY.current = event.touches[0]?.clientY ?? null;
            }}
            onTouchMove={(event) => {
              const y = event.touches[0]?.clientY;
              if (y != null && touchY.current != null && y > touchY.current && event.currentTarget.scrollTop > 0) {
                stickToBottom.current = false;
              }
              if (y != null) touchY.current = y;
            }}
            onScroll={(event) => {
              const node = event.currentTarget;
              stickToBottom.current = stickAfterScroll(
                node.scrollTop,
                node.scrollHeight,
                node.clientHeight,
                stickToBottom.current,
              );
            }}
          >
            {messages.length === 0 && <p className="u365-asst-empty">{emptyPrompt}</p>}
            {messages.map((message, index) => {
              const thinking =
                pending &&
                index === messages.length - 1 &&
                message.role === 'assistant' &&
                message.content === '' &&
                message.cards.length === 0 &&
                !message.needsSignIn;
              return (
                <article
                  key={index}
                  className={message.role === 'user' ? 'u365-asst-mine' : message.fresh ? 'u365-asst-arrive' : undefined}
                >
                  {thinking ? (
                    <p className="u365-asst-thinking" role="status">
                      חושב...
                    </p>
                  ) : (
                    message.content && (
                      <p className={message.role === 'user' ? 'u365-asst-user' : 'u365-asst-bot'}>
                        {message.role === 'assistant' ? (
                          <TypedReply
                            text={message.content}
                            live={(pending || message.fresh === true) && index === messages.length - 1}
                            scroller={scroller}
                            stick={stickToBottom}
                          />
                        ) : (
                          displayChatText(message.content)
                        )}
                      </p>
                    )
                  )}
                  {message.cards.length > 0 && (
                    <div className="u365-asst-cards">
                      {message.cards.map((card, cardIndex) => (
                        <CardView
                          key={cardIndex}
                          card={card}
                          pending={pending}
                          onConfirm={onConfirm}
                          onAction={(text) => void send(text)}
                        />
                      ))}
                    </div>
                  )}
                  {message.needsSignIn &&
                    (signInHref ? (
                      <a className="u365-asst-signin" href={signInHref} onClick={() => rememberAwaitingSignIn(agentId)}>
                        התחברות
                      </a>
                    ) : (
                      <button
                        type="button"
                        className="u365-asst-signin"
                        onClick={() => {
                          rememberAwaitingSignIn(agentId);
                          onSignIn?.();
                        }}
                      >
                        התחברות
                      </button>
                    ))}
                </article>
              );
            })}
          </div>

          {agentId === 'end-user' && (
            <div className="u365-asst-dock">
              {category && (
                <div className="u365-asst-menu" role="menu">
                  {CHAT_CATEGORIES.find((item) => item.id === category)?.items.map((item) => (
                    <button key={item.id} type="button" role="menuitem" className="u365-asst-menu-item" onClick={() => showAction(item)}>
                      <span>{item.label}</span>
                      <small>{item.hint}</small>
                    </button>
                  ))}
                </div>
              )}
              <div className="u365-asst-cats">
                {CHAT_CATEGORIES.map((item) => {
                  const Icon = CATEGORY_ICON[item.id];
                  return (
                    <button
                      key={item.id}
                      type="button"
                      aria-expanded={category === item.id}
                      className={category === item.id ? 'u365-asst-cat is-on' : 'u365-asst-cat'}
                      onClick={() => setCategory((current) => (current === item.id ? null : item.id))}
                    >
                      {Icon && <Icon size={12} strokeWidth={1.75} aria-hidden="true" />}
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <form
            className={agentId === 'end-user' ? 'u365-asst-form is-under-dock' : 'u365-asst-form'}
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
        onClick={() => setOpen(true)}
        aria-expanded={entered}
        aria-label="פתיחת העוזר"
        aria-hidden={entered}
        tabIndex={entered ? -1 : 0}
        className={entered ? 'u365-asst-button is-away' : 'u365-asst-button'}
      >
        <span className="u365-asst-mark">AI</span>
      </button>
    </>
  );
}

function prefersStillText(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Reveals an assistant reply in small steps so it reads as typing, not a pop. */
function TypedReply({
  text,
  live,
  scroller,
  stick,
}: {
  text: string;
  live: boolean;
  scroller: RefObject<HTMLDivElement | null>;
  stick: RefObject<boolean>;
}) {
  const animate = useRef(live && !prefersStillText());
  const [count, setCount] = useState(() => (animate.current ? 0 : text.length));

  useEffect(() => {
    if (!animate.current) {
      setCount(text.length);
      return;
    }
    if (count >= text.length) return;
    const id = window.setTimeout(() => {
      setCount((current) => Math.min(text.length, current + typeStep(text.length - current)));
    }, 16);
    return () => window.clearTimeout(id);
  }, [text, count]);

  useEffect(() => {
    const node = scroller.current;
    if (!animate.current || !node || !stick.current) return;
    node.scrollTop = node.scrollHeight;
  }, [count, scroller, stick]);

  return displayChatText(text.slice(0, count));
}

function CardView({
  card,
  pending,
  onConfirm,
  onAction,
}: {
  card: AssistantCard;
  pending: boolean;
  onConfirm: (toolCallId: string, accept: boolean) => void;
  onAction: (text: string) => void;
}) {
  if (card.type === 'confirm') {
    return (
      <div className="u365-asst-card u365-asst-confirm-card">
        <div>{card.label}</div>
        <div className="u365-asst-meta">{card.detail}</div>
        {card.status === 'pending' ? (
          <div className="u365-asst-confirm-actions">
            <button type="button" disabled={pending} onClick={() => onConfirm(card.toolCallId, false)}>
              ביטול
            </button>
            <button
              type="button"
              className="is-ok"
              disabled={pending}
              onClick={() => onConfirm(card.toolCallId, true)}
            >
              אשר
            </button>
          </div>
        ) : (
          <div className="u365-asst-meta">{card.status === 'done' ? 'בוצע' : 'בוטל'}</div>
        )}
      </div>
    );
  }

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

  if (card.type === 'price-history') return <PriceHistoryCard card={card} />;

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

  if (card.type === 'customer') {
    return (
      <a href={card.href} className="u365-asst-card">
        <div>{card.name}</div>
        <div className="u365-asst-meta">
          {[card.kind, card.phone, card.email].filter(Boolean).join(' · ')}
        </div>
      </a>
    );
  }

  if (card.type === 'lead') {
    return (
      <a href={card.href} className="u365-asst-card">
        <div>{card.name}</div>
        <div className="u365-asst-meta">
          {[card.status, card.listingLabel, card.phone, card.email].filter(Boolean).join(' · ')}
        </div>
      </a>
    );
  }

  if (card.type === 'deal') {
    return (
      <a href={card.href} className="u365-asst-card">
        <div>{card.title}</div>
        <div className="u365-asst-meta">
          {[card.stage, card.customerName, formatPrice(card.price)].filter(Boolean).join(' · ')}
        </div>
      </a>
    );
  }

  if (card.type === 'mortgage_case') {
    return (
      <a href={card.href} className="u365-asst-card">
        <div>{card.title}</div>
        <div className="u365-asst-meta">
          {[card.stage, card.propertyCity, formatPrice(card.requestedAmount)].filter(Boolean).join(' · ')}
        </div>
      </a>
    );
  }

  if (card.type === 'banker_contact') {
    return (
      <a href={card.href} className="u365-asst-card">
        <div>
          {card.name}
          <span className="u365-asst-meta"> · {card.bankName}</span>
        </div>
        <div className="u365-asst-meta">
          {[card.branch, card.phone, card.email].filter(Boolean).join(' · ')}
        </div>
      </a>
    );
  }

  if (card.type === 'meeting') {
    return (
      <a href={card.href} className="u365-asst-card">
        <div>{card.title}</div>
        <div className="u365-asst-meta">
          {[formatChatDate(card.startsAt), card.customerName, card.location].filter(Boolean).join(' · ')}
        </div>
      </a>
    );
  }

  if (card.type === 'valuation') return <ValuationCard card={card} />;

  if (card.type === 'a2ui') {
    return (
      <A2UISurface
        components={card.components}
        dataModel={card.dataModel}
        pending={pending}
        onAction={onAction}
      />
    );
  }

  const unreachable: never = card;
  return unreachable;
}

function ValuationCard({ card }: { card: Extract<AssistantCard, { type: 'valuation' }> }) {
  const parts = card.parts ?? [];
  const where = [card.street, card.city].filter(Boolean).join(', ');
  return (
    <div className="u365-asst-card">
      <div className="u365-asst-meta">טווח השווי · {where}</div>
      <div className="u365-asst-val-range">
        {card.low !== null && card.high !== null
          ? `${formatShekel(card.low)} – ${formatShekel(card.high)}`
          : 'אין טווח'}
      </div>
      {card.expected != null && (
        <div className="u365-asst-val-row">
          <span>צפוי להימכר סביב</span>
          <span>{formatShekel(card.expected)}</span>
        </div>
      )}
      {card.asking != null && (
        <div className="u365-asst-val-row">
          <span>מחיר פרסום מומלץ</span>
          <span>{formatShekel(card.asking)}</span>
        </div>
      )}
      {parts.length > 0 && (
        <div className="u365-asst-val-parts">
          {parts.map((part) => (
            <div key={part.label} className="u365-asst-val-row">
              <span>{part.label}</span>
              <span className={part.factor >= 1 ? 'u365-asst-val-up' : 'u365-asst-val-down'}>
                {part.factor >= 1 ? '+' : '−'}
                {Math.abs((part.factor - 1) * 100).toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      )}
      <div className="u365-asst-meta">טווח, לא שמאות</div>
    </div>
  );
}

function PriceHistoryCard({ card }: { card: Extract<AssistantCard, { type: 'price-history' }> }) {
  const years = card.years ?? [];
  const latest = years[0]?.year;
  const bars = [
    ...(card.asking
      ? [
          {
            key: 'now',
            label: 'עכשיו',
            median: card.asking.median,
            perSqm: card.asking.perSqm,
            countLabel: card.asking.count === 1 ? 'מודעה אחת' : `${card.asking.count} מודעות`,
            kind: 'now' as const,
          },
        ]
      : []),
    ...years.map((year) => ({
      key: String(year.year),
      label: String(year.year),
      median: year.median,
      perSqm: year.perSqm,
      countLabel: year.count === 1 ? 'עסקה אחת' : `${year.count} עסקאות`,
      kind: year.year === latest ? ('latest' as const) : ('year' as const),
    })),
  ];
  const peak = Math.max(...bars.map((bar) => bar.median), 1);

  return (
    <section className="u365-asst-history">
      <p className="u365-asst-history-kicker">היסטוריית מחירי עסקאות</p>
      <h3 className="u365-asst-history-title">
        {card.street}, {card.city}
      </h3>
      <p className="u365-asst-meta">
        {[card.rooms ? `${card.rooms} חדרים` : '', `חציון שנתי · ${card.radiusMetres} מטר מהרחוב`]
          .filter(Boolean)
          .join(' · ')}
      </p>

      {bars.length > 0 && (
        <ul className="u365-asst-history-years">
          {bars.map((bar) => (
            <li key={bar.key} className="u365-asst-history-row">
              <span className="u365-asst-history-label">{bar.label}</span>
              <span className="u365-asst-history-track">
                <span
                  className={
                    bar.kind === 'now'
                      ? 'u365-asst-history-bar is-now'
                      : bar.kind === 'latest'
                        ? 'u365-asst-history-bar is-latest'
                        : 'u365-asst-history-bar'
                  }
                  style={{ width: `${Math.max(8, Math.round((bar.median / peak) * 100))}%` }}
                />
              </span>
              <span className="u365-asst-history-figure">{formatShekel(bar.median)}</span>
              <span className="u365-asst-meta u365-asst-history-detail">
                {bar.countLabel}
                {bar.perSqm !== null ? ` · ${formatShekel(bar.perSqm)} למ"ר` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}

      {card.recent.length > 0 && (
        <div className="u365-asst-history-sales">
          <p className="u365-asst-history-kicker">עסקאות אחרונות</p>
          <ul>
            {card.recent.map((sale) => (
              <li key={`${sale.date}-${sale.amount}-${sale.area ?? 0}`}>
                <span>{formatChatDate(sale.date)}</span>
                <span className="u365-asst-meta">
                  {[sale.rooms !== null ? `${sale.rooms} חד'` : '', sale.area !== null ? `${sale.area} מ"ר` : '']
                    .filter(Boolean)
                    .join(' · ')}
                </span>
                <span>{formatShekel(sale.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
