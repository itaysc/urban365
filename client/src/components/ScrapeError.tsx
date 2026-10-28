import { useState } from 'react';
import type { JobErrorCode } from '@/types/yad2';

const CHROME_COMMAND = 'npm run chrome:debug';

/**
 * yad2 is behind Radware Bot Manager, which serves a challenge page to an automated
 * browser. Nothing in the app can clear it — a live scrape has to run through a Chrome
 * a person already browses yad2 with — so say exactly that, with the steps.
 */
function BotCheckHelp() {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(CHROME_COMMAND);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-6 text-amber-900">
      <p className="font-semibold">יד2 חסמה את הסריקה (Radware Bot Manager)</p>
      <p className="mt-1 text-sm">
        יד2 מגישה דף אימות לדפדפן אוטומטי. כדי לסרוק סוכנות חדשה צריך לחבר את השרת לכרום
        שכבר גולש ביד2:
      </p>

      <ol className="mt-3 list-inside list-decimal space-y-2 text-sm">
        <li>
          <span>הריצו בטרמינל:</span>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <code dir="ltr" className="rounded bg-amber-100 px-2 py-1 font-mono text-xs">
              {CHROME_COMMAND}
            </code>
            <button
              type="button"
              onClick={copy}
              className="rounded border border-amber-400 px-2 py-1 text-xs hover:bg-amber-100"
            >
              {copied ? 'הועתק ✓' : 'העתקה'}
            </button>
          </div>
        </li>
        <li>בחלון שנפתח, גלשו פעם אחת ל‑yad2.co.il ועברו את האימות אם מוצג.</li>
        <li>
          ודאו ש‑
          <code dir="ltr" className="rounded bg-amber-100 px-1 font-mono text-xs">
            YAD2_CDP_URL=http://127.0.0.1:9222
          </code>{' '}
          מוגדר ב‑<code dir="ltr" className="font-mono text-xs">server/.env</code>, והפעילו את
          השרת מחדש.
        </li>
        <li>חזרו לכאן ונסו שוב.</li>
      </ol>

      <p className="mt-3 text-xs text-amber-700">
        סוכנויות שכבר נסרקו נטענות מהמטמון ואינן דורשות את זה.
      </p>
    </div>
  );
}

export function ScrapeErrorPanel({ code, message }: { code: JobErrorCode | null; message: string | null }) {
  if (code === 'BOT_CHECK') return <BotCheckHelp />;

  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-800">
      <p className="font-medium">לא ניתן לשלוף את הנתונים</p>
      <p className="mt-1 text-sm">{message}</p>
    </div>
  );
}
