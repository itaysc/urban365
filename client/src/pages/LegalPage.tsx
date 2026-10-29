import { Link } from 'react-router-dom';

interface Props {
  title: string;
  /** What this document will cover, so the placeholder is not simply blank. */
  outline: string[];
}

/**
 * Terms and privacy.
 *
 * The headings are here and the text is not, deliberately: these two documents say what
 * the business is liable for and what it does with people's data, and neither is
 * something to invent plausible-sounding prose for. Signup links here and the agreement
 * is recorded against the account, so when the real text arrives it drops into the page
 * that people were already pointed at.
 */
function LegalPage({ title, outline }: Props) {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6 sm:p-10">
        <Link to="/" className="text-sm text-blue-700 hover:underline">
          ← חזרה לחיפוש
        </Link>

        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>

        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          הנוסח המלא טרם פורסם. עד אז, אלו הנושאים שהמסמך יכסה.
        </div>

        <ul className="flex list-disc flex-col gap-2 ps-6 text-slate-700">
          {outline.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function TermsPage() {
  return (
    <LegalPage
      title="תנאי שימוש"
      outline={[
        'מי רשאי לפתוח חשבון, ומה ההבדל בין חשבון פרטי לחשבון סוכנות.',
        'האחריות של הסוכנות לנכונות המידע בנכסים שהיא מפרסמת.',
        'מה מותר ומה אסור לעשות עם המידע שבאתר, לרבות איסוף אוטומטי.',
        'ייבוא נכסים ממקורות אחרים — באילו תנאים, ובאחריות מי.',
        'השעיה והסרה של חשבון או של נכס.',
        'הגבלת אחריות, דין חל וסמכות שיפוט.',
      ]}
    />
  );
}

export function PrivacyPage() {
  return (
    <LegalPage
      title="מדיניות פרטיות"
      outline={[
        'איזה מידע נאסף — בהרשמה, בחיפוש, ובפנייה לסוכנות.',
        'מה נעשה עם המידע, ולמי הוא מועבר (סוכנות שאליה פניתם, ספקי תשתית).',
        'שימוש במיקום המכשיר, שהוא בבחירת המשתמש בלבד.',
        'עוגיות וטכנולוגיות מעקב.',
        'כמה זמן המידע נשמר.',
        'זכות העיון, התיקון והמחיקה, וכיצד לממש אותן.',
      ]}
    />
  );
}
