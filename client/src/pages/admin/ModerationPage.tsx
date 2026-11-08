import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { qk } from '@/queries/keys';
import { useAuth } from '@/auth/auth-context';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { formatDate } from '@/lib/format';
import {
  approveAgency,
  fetchPendingAgencies,
  rejectAgency,
  type PendingAgency,
} from '@/services/admin';
import { AgencyDirectory } from '@/pages/admin/AgencyDirectory';
import { ListingReviewQueue } from '@/pages/admin/ListingReviewQueue';
import { PlatformInvites } from '@/pages/admin/PlatformInvites';
import { UsersPage } from '@/pages/admin/UsersPage';

const TABS = [
  { id: 'requests', label: 'בקשות' },
  { id: 'listings', label: 'נכסים' },
  { id: 'agencies', label: 'סוכנויות' },
  { id: 'users', label: 'משתמשים' },
  { id: 'invites', label: 'הזמנות' },
] as const;

type TabId = (typeof TABS)[number]['id'];

function tabFrom(value: string | null): TabId {
  return TABS.some((tab) => tab.id === value) ? (value as TabId) : 'requests';
}

/** The agency being rejected, held while the confirm dialog is open. */
type PendingReject = { agencyId: string; name: string } | null;

/** One row per person who could be approved, whichever way they arrived. */
interface Applicant {
  userId: string;
  email: string;
  name: string;
  evidence: string | null;
  createdAt: string | null;
}

/**
 * A self-signup agency has a pending owner and no claim row; a claim on a scraped agency
 * has claim rows and no pending owner. Both approve through the same endpoint, so they
 * are flattened into one list rather than rendered as two different blocks.
 */
function applicantsOf(agency: PendingAgency): Applicant[] {
  if (agency.claims.length > 0) {
    return agency.claims.map((claim) => ({
      userId: claim.userId,
      email: claim.userEmail,
      name: claim.userName,
      evidence: typeof claim.evidence === 'string' ? claim.evidence : null,
      createdAt: claim.createdAt,
    }));
  }

  if (agency.pendingOwner) {
    return [{ ...agency.pendingOwner, evidence: null, createdAt: null }];
  }

  return [];
}

export function ModerationPage() {
  const { user, recheck } = useAuth();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const tab = tabFrom(params.get('tab'));
  const { data: agencies = null } = useQuery({
    queryKey: qk.admin.moderation,
    queryFn: fetchPendingAgencies,
    enabled: tab === 'requests',
  });

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toReject, setToReject] = useState<PendingReject>(null);


  /**
   * `affectsMe` is set when the decision is about the admin's own agency, which is the
   * ordinary case for the first account on an instance. Both halves of their identity
   * go stale at once: `/auth/me` still reports the membership as pending, and the
   * access token still carries no agency — so the dashboard would redirect back to the
   * pending page and every tenant route would 403. `recheck()` rotates the token and
   * re-reads the user, which fixes both.
   */
  const run = async (key: string, action: () => Promise<unknown>, affectsMe = false) => {
    setBusy(key);
    setError(null);
    try {
      await action();
      // `recheck` already invalidates everything, so this is for the other case.
      if (affectsMe) await recheck();
      else await queryClient.invalidateQueries({ queryKey: qk.admin.all });
    } catch {
      setError('הפעולה נכשלה.');
    } finally {
      setBusy(null);
    }
  };

  const selectTab = (id: TabId) => {
    setParams(id === 'requests' ? {} : { tab: id }, { replace: true });
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">ניהול פלטפורמה</h1>
      </div>

      <div role="tablist" aria-label="ניהול פלטפורמה" className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
        {TABS.map((item) => {
          const selected = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => selectTab(item.id)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                selected ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      {tab === 'invites' && <PlatformInvites />}
      {tab === 'listings' && <ListingReviewQueue />}
      {tab === 'agencies' && <AgencyDirectory />}
      {tab === 'users' && <UsersPage />}

      {tab === 'requests' && <h2 className="text-xl font-bold text-slate-900">בקשות ממתינות</h2>}

      {tab === 'requests' && error && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>
      )}

      {tab === 'requests' && agencies === null && <p className="text-sm text-slate-500">טוען…</p>}

      {tab === 'requests' && agencies?.length === 0 && (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          אין בקשות ממתינות.
        </p>
      )}

      {tab === 'requests' && agencies?.map((agency) => {
        const applicants = applicantsOf(agency);

        return (
          <section key={agency.id} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-semibold text-slate-900">{agency.name}</h2>
              <p className="text-xs text-slate-500">
                {agency.yad2Id ? `יד2 ${agency.yad2Id} · ` : 'הרשמה עצמית · '}
                {agency.listingCount} נכסים · {formatDate(agency.createdAt)}
              </p>
            </div>

            {applicants.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">אין מבקש לאשר.</p>
            ) : (
              <ul className="mt-3 flex flex-col gap-2">
                {applicants.map((applicant) => {
                  const key = `${agency.id}:${applicant.userId}`;
                  return (
                    <li
                      key={applicant.userId}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 p-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900">{applicant.name}</p>
                        <p className="text-xs text-slate-500">
                          {applicant.email}
                          {applicant.createdAt && ` · ${formatDate(applicant.createdAt)}`}
                        </p>
                        {applicant.evidence && (
                          <p className="mt-1 text-xs text-slate-600">{applicant.evidence}</p>
                        )}
                      </div>

                      <Button
                        disabled={busy !== null}
                        onClick={() =>
                          void run(
                            key,
                            () => approveAgency(agency.id, applicant.userId),
                            applicant.userId === user?.id,
                          )
                        }
                      >
                        {busy === key ? 'מאשר…' : 'אשר'}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}

            <Button
              variant="ghost"
              className="mt-3"
              disabled={busy !== null}
              onClick={() => setToReject({ agencyId: agency.id, name: agency.name })}
            >
              {agency.claims.length > 1 ? 'דחה את כל הבקשות' : 'דחה'}
            </Button>
          </section>
        );
      })}

      <ConfirmDialog
        open={toReject !== null}
        title="לדחות את הבקשה?"
        description={
          toReject ? `הבקשות לנהל את ${toReject.name} יידחו, והמבקשים יקבלו הודעה באימייל.` : ''
        }
        confirmLabel="דחה"
        busy={busy !== null}
        onConfirm={() => {
          const target = toReject;
          setToReject(null);
          if (target) void run(target.agencyId, () => rejectAgency(target.agencyId));
        }}
        onOpenChange={(open) => !open && setToReject(null)}
      />
    </div>
  );
}
