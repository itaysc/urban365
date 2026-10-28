import type { ReactNode } from 'react';

interface Props {
  label: string;
  htmlFor?: string;
  error?: string | false;
  required?: boolean;
  children: ReactNode;
}

export function Field({ label, htmlFor, error, required, children }: Props) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-sm font-medium text-slate-700">
        {label}
        {required && <span className="text-red-600"> *</span>}
      </label>
      {children}
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  );
}

export const inputClass =
  'rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900 disabled:bg-slate-50';
