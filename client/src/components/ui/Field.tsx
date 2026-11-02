import { cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';

interface Props {
  label: string;
  htmlFor?: string;
  error?: string | false;
  required?: boolean;
  children: ReactNode;
}

/**
 * Hands the error message to the control it belongs to.
 *
 * Sitting the message underneath makes it obvious on a screen; it says nothing to a
 * screen reader, which reads the label and the value and moves on, so the field a
 * sighted user sees outlined in red is a field everybody else hears as ordinary. The
 * two attributes below are what connect them: `aria-describedby` makes the message
 * part of what is read for the field, and `aria-invalid` says there is something
 * wrong without relying on the colour to carry it.
 *
 * Only cloned onto a plain DOM element. `PhoneField`, `SuggestBox` and the rest are
 * components that do not forward unknown props, and putting `aria-describedby` on one
 * of those would leave the attribute nowhere at all — worse than the markup it
 * replaced, because it would look wired up.
 */
function describedBy(children: ReactNode, errorId: string): ReactNode {
  if (!isValidElement(children) || typeof children.type !== 'string') return children;

  const child = children as ReactElement<{ 'aria-describedby'?: string }>;
  return cloneElement(child, {
    // Appended, so a field that already describes itself keeps that description.
    'aria-describedby': [child.props['aria-describedby'], errorId].filter(Boolean).join(' '),
    'aria-invalid': true,
  } as Partial<typeof child.props>);
}

export function Field({ label, htmlFor, error, required, children }: Props) {
  // Derived from the control's own id rather than generated: the two have to agree,
  // and every caller that passes an error already labels its control this way.
  const errorId = htmlFor ? `${htmlFor}-error` : undefined;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-sm font-medium text-slate-700">
        {label}
        {required && <span className="text-red-600"> *</span>}
      </label>

      {error && errorId ? describedBy(children, errorId) : children}

      {/*
        Always in the DOM, empty until there is something to say.

        A live region has to exist before its content changes for the change to be
        announced; one that appears already full is routinely missed, which is the
        difference between an error that is read out and an error that silently is not.
        `empty:hidden` keeps it out of the layout in the meantime.
      */}
      <p id={errorId} aria-live="polite" className="text-xs text-red-700 empty:hidden">
        {error || ''}
      </p>
    </div>
  );
}

export const inputClass =
  'rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900 disabled:bg-slate-50';

/**
 * A select. The chevron is ours — see `.select-chevron` in index.css for why the
 * browser's own could not be used — and `pe-9` keeps a long option from running
 * underneath it.
 */
export const selectClass = `${inputClass} select-chevron pe-9`;
