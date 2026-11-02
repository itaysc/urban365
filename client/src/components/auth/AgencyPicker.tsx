import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Field, inputClass } from '@/components/ui/Field';
import { lookupAgencies, type AgencyLookupResult } from '@/services/auth';

interface Props {
  /** The existing agency being claimed, or null while a new one is being named. */
  claimed: AgencyLookupResult | null;
  onClaimedChange: (agency: AgencyLookupResult | null) => void;
  /** Name for a brand-new agency, used only while nothing is claimed. */
  agencyName: string;
  onAgencyNameChange: (name: string) => void;
}

/**
 * Pick the agency: one we already scraped, or a new one by name.
 *
 * Shared by the signup form and the page someone lands on after signing in with Google,
 * where the account exists and only this is missing. One implementation because these
 * two drifting apart is how a claim gets filed one way on one page and another way on
 * the other.
 */
export function AgencyPicker({ claimed, onClaimedChange, agencyName, onAgencyNameChange }: Props) {
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<AgencyLookupResult[]>([]);

  useEffect(() => {
    if (claimed || query.trim().length < 2) {
      setMatches([]);
      return;
    }
    // Debounced: this fires on every keystroke otherwise, and the answer for three
    // letters is never worth the four requests it took to get there.
    const timer = setTimeout(() => {
      void lookupAgencies(query).then(setMatches).catch(() => setMatches([]));
    }, 300);
    return () => clearTimeout(timer);
  }, [query, claimed]);

  return (
    <fieldset className="rounded-lg border border-slate-200 p-3">
      <legend className="px-1 text-sm font-medium text-slate-700">הסוכנות</legend>

      {claimed ? (
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="font-medium text-slate-900">{claimed.name}</div>
            <div className="text-xs text-slate-500">
              {claimed.listingCount} נכסים{claimed.city ? ` · ${claimed.city}` : ''}
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              onClaimedChange(null);
              setQuery('');
            }}
          >
            שינוי
          </Button>
        </div>
      ) : (
        <>
          <input
            placeholder="חיפוש סוכנות קיימת ביד2…"
            className={`${inputClass} w-full`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />

          {matches.length > 0 && (
            <ul className="mt-2 max-h-44 overflow-y-auto rounded-lg border border-slate-200">
              {matches.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => onClaimedChange(m)}
                    className="flex w-full items-center justify-between px-3 py-2 text-right text-sm hover:bg-slate-50"
                  >
                    <span>{m.name}</span>
                    <span className="text-xs text-slate-500">{m.listingCount} נכסים</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <p className="my-2 text-center text-xs text-slate-500">או</p>

          <Field label="שם סוכנות חדשה" htmlFor="agencyName">
            <input
              id="agencyName"
              className={inputClass}
              value={agencyName}
              onChange={(e) => onAgencyNameChange(e.target.value)}
            />
          </Field>
        </>
      )}
    </fieldset>
  );
}
