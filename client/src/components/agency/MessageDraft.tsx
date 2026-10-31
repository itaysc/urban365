import { useState } from 'react';
import { Check, Copy, MessageCircle, RefreshCw, Sparkles } from 'lucide-react';
import { inputClass } from '@/components/ui/Field';
import { waLink } from '@/lib/phone';

interface Props {
  draft: string | null;
  phone: string | null;
  busy: boolean;
  /** Ask the model for one, or for another. */
  onWrite: () => void;
  /** Keep what the agent typed. Called when they stop editing, not per keystroke. */
  onSave: (text: string) => void;
}

/**
 * The message to a customer about a property that fits them.
 *
 * Everything here stops one step short of sending. The agent reads it, changes what
 * they want, and either copies it or opens WhatsApp with it ready — where they press
 * send themselves. That is not a missing feature: a model that can message a client
 * unprompted is a model that can embarrass an agency in somebody's pocket, and the
 * second between "looks right" and "sent" is the whole safeguard.
 */
export function MessageDraft({ draft, phone, busy, onWrite, onSave }: Props) {
  const [text, setText] = useState(draft ?? '');
  const [copied, setCopied] = useState(false);

  /**
   * A new draft from the server replaces what is on screen — the agent pressed the
   * button, so they want the new one.
   *
   * Adjusted during render against the last draft seen, rather than in an effect. An
   * effect would paint the old text first and then replace it, which on a slow frame
   * is a visible flash of the wording they just asked to be rid of.
   */
  const [lastSeen, setLastSeen] = useState(draft);
  if (draft !== lastSeen) {
    setLastSeen(draft);
    setText(draft ?? '');
  }

  if (!draft && !busy) {
    return (
      <button
        type="button"
        onClick={onWrite}
        className="mt-2 flex items-center gap-1 text-sm text-blue-700 hover:underline"
      >
        <Sparkles className="h-3.5 w-3.5" aria-hidden />
        הכנת הודעה
      </button>
    );
  }

  const link = waLink(phone, text);

  const copy = () => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="mt-2 flex flex-col gap-2 rounded-lg bg-slate-50 p-3">
      {busy && !draft ? (
        <p className="text-sm text-slate-500">כותב…</p>
      ) : (
        <textarea
          rows={4}
          className={inputClass}
          value={text}
          onChange={(e) => setText(e.target.value)}
          // On blur rather than per keystroke: a save every letter is a request every
          // letter, and the thing worth keeping is what they finished writing.
          onBlur={() => text !== (draft ?? '') && onSave(text)}
          aria-label="הודעה ללקוח"
        />
      )}

      <div className="flex flex-wrap items-center gap-4 text-sm">
        {link ? (
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => text !== (draft ?? '') && onSave(text)}
            className="flex items-center gap-1 text-green-700 hover:underline"
          >
            <MessageCircle className="h-4 w-4" aria-hidden />
            פתיחה בוואטסאפ
          </a>
        ) : (
          // Said rather than left as a missing button, so nobody hunts for it.
          <span className="text-xs text-slate-400">אין מספר טלפון לשליחה</span>
        )}

        <button type="button" onClick={copy} className="flex items-center gap-1 text-slate-600 hover:text-slate-900">
          {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
          {copied ? 'הועתק' : 'העתקה'}
        </button>

        <button
          type="button"
          onClick={onWrite}
          disabled={busy}
          className="flex items-center gap-1 text-slate-500 hover:text-slate-900 disabled:opacity-50"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden />
          {busy ? 'כותב…' : 'נוסח אחר'}
        </button>

        <span className="text-xs text-slate-400">ההודעה נשלחת רק אחרי שתאשרו בוואטסאפ.</span>
      </div>
    </div>
  );
}
