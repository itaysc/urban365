import { formatShekel } from '@/lib/format';
import { panelClass } from '@/components/mortgage/panel';
import type { ValuationResponse } from '@/services/valuation';

const MARKET_LABEL: Record<ValuationResponse['market']['state'], string> = {
  buyers: 'שוק של קונים',
  balanced: 'שוק מאוזן',
  sellers: 'שוק של מוכרים',
};

/**
 * Why a particular refusal happened, in words the person can act on.
 *
 * A valuation we decline to give is still an answer, and an unexplained one reads as
 * a broken page. Each of these says what was missing and what, if anything, would
 * change it.
 */
const REFUSAL: Record<string, { title: string; body: string }> = {
  'too-thin': {
    title: 'אין מספיק עסקאות דומות באזור',
    body: 'לא נמצאו מספיק עסקאות שנרשמו בקרבת הנכס ובגודל דומה כדי לתת טווח אמין. זה נפוץ ביישובים קטנים ובנכסים חריגים בגודלם. אפשר לנסות לדייק את מיקום הסמן, או לבדוק מול שמאי או מתווך שמכיר את האזור.',
  },
  'no-comps': {
    title: 'לא נמצאו עסקאות להשוואה',
    body: 'אין במאגר עסקאות שנרשמו בטווח של 2.5 ק"מ מהנקודה שנבחרה בשנתיים האחרונות. בדקו שהסמן על המקום הנכון.',
  },
  'out-of-scope': {
    title: 'הנכס מחוץ לטווח שהכלי יודע להעריך',
    body: 'הכלי מעריך דירות בשטח של 20 עד 400 מ"ר. נכסים גדולים או קטנים מכך, וכן מגרשים ובתים פרטיים, דורשים הערכה פרטנית.',
  },
};

/**
 * The answer.
 *
 * The range leads and the single number does not appear on its own anywhere — a point
 * estimate travels further than its caveats, and a seller who screenshots one will
 * hold us to it. What is shown is what the guide's step 6 and 7 produce: the band, the
 * price the flat is likely to sell at inside it, and the price to advertise at.
 */
export function Result({ result }: { result: ValuationResponse }) {
  const refusal = REFUSAL[result.verdict];

  if (refusal || !result.range) {
    const copy = refusal ?? REFUSAL['too-thin'];
    return (
      <section className={panelClass} aria-live="polite">
        <h2 className="text-base font-semibold text-slate-800">{copy.title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">{copy.body}</p>
      </section>
    );
  }

  const { range, basis, market } = result;

  return (
    <section className={panelClass} aria-live="polite">
      <h2 className="text-base font-semibold text-slate-800">טווח השווי</h2>

      <p className="mt-3 text-2xl font-semibold tabular-nums text-slate-900 sm:text-3xl">
        {formatShekel(range.low)} – {formatShekel(range.high)}
      </p>

      {/*
        The guide's step 7, as two numbers rather than one. They differ on purpose: a
        flat advertised at the price it will sell at leaves nowhere to negotiate, and
        one advertised far above it does not sell at all.
      */}
      <dl className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-slate-50 px-3 py-2.5">
          <dt className="text-xs text-slate-500">צפוי להימכר סביב</dt>
          <dd className="mt-0.5 text-lg font-medium tabular-nums text-slate-800">
            {formatShekel(range.expected)}
          </dd>
        </div>
        <div className="rounded-xl bg-slate-50 px-3 py-2.5">
          <dt className="text-xs text-slate-500">מחיר פרסום מומלץ</dt>
          <dd className="mt-0.5 text-lg font-medium tabular-nums text-slate-800">
            {formatShekel(range.asking)}
          </dd>
        </div>
      </dl>

      {result.verdict === 'indicative' && (
        <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-900">
          מעט עסקאות דומות נמצאו באזור, ולכן הטווח רחב מהרגיל. התייחסו אליו ככיוון
          ראשוני בלבד.
        </p>
      )}

      <h3 className="mt-6 text-sm font-medium text-slate-700">על מה זה מבוסס</h3>
      <ul className="mt-2 flex flex-col gap-1.5 text-sm text-slate-600">
        <li>{basis.comps} עסקאות שנרשמו בפועל בקרבת הנכס, בגודל ובמספר חדרים דומים</li>
        <li>
          {MARKET_LABEL[market.state]}
          {!market.confident && <span className="text-slate-500"> (אין מספיק מודעות באזור כדי לקבוע בוודאות)</span>}
        </li>
      </ul>

      {basis.quality.length > 0 && (
        <>
          <h3 className="mt-5 text-sm font-medium text-slate-700">
            מה הזיז את המחיר לעומת הדירות שהושוו
          </h3>
          <ul className="mt-2 flex flex-col gap-1">
            {basis.quality.map((part) => (
              <li key={part.label} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-slate-600">{part.label}</span>
                <span
                  className={`tabular-nums ${part.factor >= 1 ? 'text-emerald-700' : 'text-rose-700'}`}
                >
                  {part.factor >= 1 ? '+' : '−'}
                  {Math.abs((part.factor - 1) * 100).toFixed(1)}%
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs leading-relaxed text-slate-500">
            כל התאמה נמדדת מול מה שמקובל בבניינים מאותה תקופה — מעלית בבניין חדש כמעט
            לא מוסיפה, כי לרוב הדירות שהושוו יש אחת.
          </p>
        </>
      )}

      {market.competing.length > 0 && (
        <>
          <h3 className="mt-6 text-sm font-medium text-slate-700">מה מוצע היום באזור</h3>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            אלה מחירים מבוקשים, לא עסקאות. דירה שעומדת באוויר חודשים ארוכים מלמדת
            שהמחיר שלה לא עובד — לא מה הנכס שווה.
          </p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {market.competing.map((rival) => (
              <li
                key={rival.id}
                className="flex items-baseline justify-between gap-3 text-sm text-slate-600"
              >
                <span className="tabular-nums">
                  {rival.price ? formatShekel(rival.price) : '—'}
                  {rival.rooms && <span className="text-slate-500"> · {rival.rooms} חד׳</span>}
                </span>
                <span className="text-xs text-slate-500">
                  {rival.metres} מ׳ מכאן
                  {rival.daysListed !== null && ` · ${rival.daysListed} ימים באוויר`}
                  {rival.hasCutPrice && ' · הורד המחיר'}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
