import { Button } from '@/components/ui/Button';
import { inputClass } from '@/components/ui/Field';

interface Props {
  name: string;
  onNameChange: (name: string) => void;
  /** Shown as the placeholder, so an empty box still saves something sensible. */
  suggestion: string;
  /** Filters the alert cannot carry, named rather than quietly discarded. */
  dropped: string[];
  busy: boolean;
  onSave: () => void;
  onCancel: () => void;
  /** The popover draws its own heading; the dialog has a title already. */
  showHeading?: boolean;
}

/**
 * The saving form itself, with no opinion about what contains it.
 *
 * Written once because it appears twice: anchored under the button on a wide screen,
 * and as a dialog on a phone, where there is nowhere to anchor it to. Two copies of
 * four fields is how one of them ends up with a fix the other never gets.
 */
export function SaveSearchForm({
  name,
  onNameChange,
  suggestion,
  dropped,
  busy,
  onSave,
  onCancel,
  showHeading = false,
}: Props) {
  return (
    <div className="flex flex-col gap-2">
      {showHeading && (
        <div>
          <p className="font-semibold text-slate-900">שמירת החיפוש</p>
          <p className="text-xs text-slate-500">
            נשלח לכם מייל כשייכנס נכס חדש שמתאים — לכל היותר פעם ביום.
          </p>
        </div>
      )}

      <label className="text-sm text-slate-700" htmlFor="save-search-name">
        שם לחיפוש
      </label>
      <input
        id="save-search-name"
        className={`${inputClass} w-full`}
        value={name}
        onChange={(e) => onNameChange(e.target.value)}
        placeholder={suggestion}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onSave();
          }
        }}
      />

      {dropped.length > 0 && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          בהתראה לא ייכללו: {dropped.join(', ')}. החיפוש באתר עצמו לא משתנה.
        </p>
      )}

      <div className="mt-1 flex items-center gap-3">
        <Button disabled={busy} onClick={onSave}>
          {busy ? 'שומר…' : 'שמירה'}
        </Button>
        <button
          type="button"
          onClick={onCancel}
          className="text-sm text-slate-500 transition hover:text-slate-900"
        >
          ביטול
        </button>
      </div>
    </div>
  );
}
