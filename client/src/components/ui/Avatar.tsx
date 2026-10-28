import { useState } from 'react';

interface Props {
  firstName?: string | null;
  lastName?: string | null;
  src?: string | null;
  size?: 'sm' | 'md' | 'lg';
}

const SIZE: Record<NonNullable<Props['size']>, string> = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-20 w-20 text-xl',
};

/**
 * One letter from each name. Hebrew has no case, so no uppercasing — and `[...name]`
 * rather than `name[0]`, because a string index splits a surrogate pair and would
 * produce half a character for anyone whose name starts outside the BMP.
 */
function initialsOf(firstName?: string | null, lastName?: string | null): string {
  const first = [...(firstName?.trim() ?? '')][0] ?? '';
  const last = [...(lastName?.trim() ?? '')][0] ?? '';
  return (first + last) || '?';
}

export function Avatar({ firstName, lastName, src, size = 'md' }: Props) {
  // A broken or 404ing image falls back to initials rather than showing the browser's
  // torn-page glyph — the avatar route 404s whenever no picture has been uploaded.
  const [failed, setFailed] = useState(false);
  const initials = initialsOf(firstName, lastName);
  const label = [firstName, lastName].filter(Boolean).join(' ') || undefined;

  if (src && !failed) {
    return (
      <img
        src={src}
        alt={label ?? ''}
        onError={() => setFailed(true)}
        className={`${SIZE[size]} shrink-0 rounded-full object-cover`}
      />
    );
  }

  return (
    <span
      // Decorative when it sits beside the name, which it does everywhere here.
      aria-hidden={label ? true : undefined}
      title={label}
      className={`${SIZE[size]} flex shrink-0 select-none items-center justify-center rounded-full bg-slate-200 font-semibold text-slate-700`}
    >
      {initials}
    </span>
  );
}
