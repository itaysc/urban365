import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

/**
 * The two documents the agreement points at.
 *
 * `stopLabel` is for the checkbox, whose label wraps the control: a click on the link
 * would otherwise tick the box on the way to the document.
 */
function LegalLink({ to, children, stopLabel = false }: { to: string; children: ReactNode; stopLabel?: boolean }) {
  return (
    <Link
      to={to}
      target="_blank"
      rel="noreferrer"
      className="text-blue-700 hover:underline"
      onClick={stopLabel ? (e) => e.stopPropagation() : undefined}
    >
      {children}
    </Link>
  );
}

interface Props {
  checked: boolean;
  onChange: (checked: boolean) => void;
  id?: string;
}

/**
 * Agreement to the terms and the privacy policy, as a sentence rather than a box.
 *
 * Signing up is the agreement, so the sentence does not gate the form. The links open
 * in a new tab so reading one does not throw away a half-filled signup form.
 */
export function TermsNotice() {
  return (
    <p className="text-sm text-slate-600">
      בהרשמה אני מאשר/ת את <LegalLink to="/terms">תנאי השימוש</LegalLink> ואת{' '}
      <LegalLink to="/policy">מדיניות הפרטיות</LegalLink>.
    </p>
  );
}

/**
 * Agreement to the terms and the privacy policy.
 *
 * Unticked to start with and never pre-ticked: an agreement someone did not make is not
 * an agreement. The links open in a new tab so reading one does not throw away a
 * half-filled form.
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
        קראתי ואני מאשר/ת את <LegalLink to="/terms" stopLabel>תנאי השימוש</LegalLink> ואת{' '}
        <LegalLink to="/policy" stopLabel>מדיניות הפרטיות</LegalLink>.
      </span>
    </label>
  );
}
