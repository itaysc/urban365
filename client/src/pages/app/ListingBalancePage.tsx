import { Link } from 'react-router-dom';
import { useListingCredits } from '@/hooks/useListingCredits';
import { formatDate, formatShekel } from '@/lib/format';

/**
 * The agency's listing credits: what's left, what was bought, and the way to buy more.
 * Hidden from the menu while billing is off; a direct visit says so and stops.
 */
export function ListingBalancePage() {
  const { data, isPending, isError } = useListingCredits();

  if (isPending) return <p className="text-sm text-slate-500">טוען…</p>;
  if (isError) return <p className="text-sm text-red-700">לא הצלחנו לטעון את היתרה.</p>;
  if (!data?.enabled) {
    return <p className="text-sm text-slate-600">הפרסום כרגע ללא תשלום.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-slate-900">פרסומים</h1>
        {data.canPurchase && (
          <Link
            to="/app/billing/checkout?returnTo=/app/billing"
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            קניית פרסומים
          </Link>
        )}
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <p className="text-sm text-slate-500">יתרה</p>
        <p className="mt-1 text-3xl font-bold text-slate-900">{data.balance.toLocaleString('he-IL')}</p>
        <p className="mt-1 text-sm text-slate-500">כל נכס שמפרסמים מהאפליקציה משתמש בפרסום אחד.</p>
        {!data.canPurchase && (
          <p className="mt-2 text-sm text-slate-500">רק בעל הסוכנות יכול לקנות חבילה.</p>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">רכישות</h2>
        {data.orders.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">עדיין לא נרכשו פרסומים.</p>
        ) : (
          <ul className="mt-2 flex flex-col">
            {data.orders.map((order) => (
              <li
                key={order.id}
                className="flex items-baseline justify-between gap-3 border-t border-slate-100 py-2 first:border-t-0"
              >
                <span className="text-sm text-slate-900">
                  {order.size === 1 ? 'פרסום בודד' : `${order.size} פרסומים`}
                </span>
                <span className="text-sm text-slate-500">
                  {formatShekel(order.totalAgorot / 100)} · {formatDate(order.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
