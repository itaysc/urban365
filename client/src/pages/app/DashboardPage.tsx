import { useQueries } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { qk } from '@/queries/keys';
import { useAuth } from '@/auth/AuthProvider';
import { fetchMyListings } from '@/services/agency';

const CARDS = [
  { status: 'published', label: 'פורסמו' },
  { status: 'draft', label: 'טיוטות' },
  { status: 'archived', label: 'בארכיון' },
] as const;

/**
 * Three counts, each from the listings endpoint with a status filter — a dedicated
 * stats route would be one more thing to keep in step for no gain at this size.
 *
 * `useQueries` rather than three hooks so the list stays data-driven, and the keys are
 * the same ones the listings page uses: opening a tab after this is already warm.
 */
export function DashboardPage() {
  const { user } = useAuth();

  const results = useQueries({
    queries: CARDS.map((card) => ({
      queryKey: qk.listings.mine(card.status, 1),
      queryFn: () => fetchMyListings({ status: card.status, page: 1 }),
    })),
  });

  const cards = CARDS.map((card, i) => ({
    label: card.label,
    value: results[i].data?.total ?? null,
    to: `/app/listings?status=${card.status}`,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">
          שלום {user?.firstName}
        </h1>
        {user?.agency && <p className="text-sm text-slate-500">{user.agency.name}</p>}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {cards.map((card) => (
          <Link
            key={card.label}
            to={card.to}
            className="rounded-xl border border-slate-200 bg-white p-4 transition hover:border-slate-900"
          >
            <p className="text-sm text-slate-500">{card.label}</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">
              {card.value === null ? '—' : card.value}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
