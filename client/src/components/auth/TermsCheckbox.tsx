import { Link } from 'react-router-dom';

interface Props {
  checked: boolean;
  onChange: (checked: boolean) => void;
  id?: string;
}

/**
 * Agreement to the terms and the privacy policy.
 *
 * Unticked to start with and never pre-ticked: an agreement someone did not make is not
 * an agreement. The links open in a new tab so reading one does not throw away a
 * half-filled signup form.
 */
export function TermsCheckbox({ checked, onChange, id = 'accept-terms' }: Props) {
  return (
    <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-700">
      <input
        id={id}
        type="checkbox"
        required
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 flex-none"
      />
      <span>
        קראתי ואני מאשר/ת את{' '}
        <Link
          to="/terms"
          target="_blank"
          rel="noreferrer"
          className="text-blue-700 hover:underline"
          // The label wraps the checkbox, so a click anywhere inside it toggles the box.
          // Without this, following a link would tick the agreement on the way out.
          onClick={(e) => e.stopPropagation()}
        >
          תנאי השימוש
        </Link>{' '}
        ואת{' '}
        <Link
          to="/policy"
          target="_blank"
          rel="noreferrer"
          className="text-blue-700 hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          מדיניות הפרטיות
        </Link>
        .
      </span>
    </label>
  );
}
