import { useEffect, useState } from 'react';
import { useYad2Visible } from '@/hooks/useYad2Visible';
import { Button } from '@/components/ui/Button';
import { Field, inputClass } from '@/components/ui/Field';
import { lookupAgencies, type AgencyLookupResult } from '@/services/auth';
import type { AgencyVertical } from '@/types/auth';

const VERTICALS: { value: AgencyVertical; label: string; hint: string }[] = [
  { value: 'real_estate', label: 'סוכנות נדל״ן', hint: 'נכסים, פניות ועסקאות' },
  { value: 'mortgage_broker', label: 'ברוקר משכנתאות', hint: 'תיקי משכנתא ובנקים' },
];

interface Props {
  /** The existing agency being claimed, or null while a new one is being named. */
  claimed: AgencyLookupResult | null;
  onClaimedChange: (agency: AgencyLookupResult | null) => void;
  /** Name for a brand-new agency, used only while nothing is claimed. */
  agencyName: string;
  onAgencyNameChange: (name: string) => void;
  /**
   * What kind of business a brand-new agency is. Optional: a page that only ever
   * creates real-estate agencies can leave this out and the default on the server
   * side is the same either way.
   */
  vertical?: AgencyVertical;
  onVerticalChange?: (vertical: AgencyVertical) => void;
}

/**
 * Pick the agency: one we already scraped, or a new one by name.
 *
 * Shared by the signup form and the page someone lands on after signing in with Google,
 * where the account exists and only this is missing. One implementation because these
 * two drifting apart is how a claim gets filed one way on one page and another way on
 * the other.
 */
export function AgencyPicker({
  claimed,
  onClaimedChange,
  agencyName,
  onAgencyNameChange,
  vertical,
  onVerticalChange,
}: Props) {
  const yad2Visible = useYad2Visible();
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
            placeholder={yad2Visible ? 'חיפוש סוכנות קיימת ביד2…' : 'חיפוש סוכנות קיימת…'}
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

          {onVerticalChange && (
            <fieldset className="mt-3">
              <legend className="mb-1.5 text-xs font-medium text-slate-700">סוג העסק</legend>
              <div className="grid grid-cols-2 gap-2">
                {VERTICALS.map((v) => (
                  <label
                    key={v.value}
                    className={`cursor-pointer rounded-lg border p-2 text-sm transition ${
                      (vertical ?? 'real_estate') === v.value
                        ? 'border-blue-400 bg-blue-50'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="agency-vertical"
                      className="sr-only"
                      checked={(vertical ?? 'real_estate') === v.value}
                      onChange={() => onVerticalChange(v.value)}
                    />
                    <span className="block font-medium text-slate-900">{v.label}</span>
                    <span className="block text-xs text-slate-500">{v.hint}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}
        </>
      )}
    </fieldset>
  );
}
