import { useState, type InputHTMLAttributes } from 'react';
import { inputClass } from '@/components/ui/Field';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>;

/**
 * A password with a control to show it.
 *
 * The field itself is left-to-right — a password is a string of Latin characters —
 * and the eye sits at its end, which is the right edge. The page around it stays
 * right-to-left.
 */
export function PasswordInput({ className = '', ...props }: Props) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative" dir="ltr">
      <input
        {...props}
        type={visible ? 'text' : 'password'}
        className={`${inputClass} w-full pe-10 ${className}`}
      />
      <button
        type="button"
        aria-label={visible ? 'הסתר סיסמה' : 'הצג סיסמה'}
        aria-pressed={visible}
        onClick={() => setVisible((v) => !v)}
        className="absolute end-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-slate-500 hover:text-slate-900"
      >
        {visible ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
  );
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      <path d="M3 3l18 18" strokeLinecap="round" />
      <path d="M10.6 10.6A3 3 0 0 0 12 15a3 3 0 0 0 2.4-4.4" strokeLinecap="round" />
      <path d="M9.9 5.2A10.8 10.8 0 0 1 12 5c6.5 0 10 7 10 7a18.4 18.4 0 0 1-4.1 4.8" strokeLinecap="round" />
      <path d="M6.1 6.1C3.5 7.8 2 12 2 12s3.5 7 10 7c1.5 0 2.9-.3 4.1-.8" strokeLinecap="round" />
    </svg>
  );
}
