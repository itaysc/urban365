import type { RefObject } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Link, useLocation } from 'react-router-dom';
import { X } from 'lucide-react';
import { AccountLoginForm } from '@/components/auth/AccountLoginForm';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * What opened it, so focus can go back there on close.
   *
   * Radix restores focus to its own `Dialog.Trigger`, and this dialog is opened from a
   * button in the page header instead — without this, closing dropped focus back to the
   * top of the document and a keyboard user had to tab in from the start again.
   */
  returnFocusTo?: RefObject<HTMLElement | null>;
}

/**
 * Signing in without leaving the search.
 *
 * Sending someone to `/login` to save a listing threw away what they had typed, which
 * on a search page is most of their work — the places, the price, the rooms. Signing in
 * is a detour, and a detour should return you to where you were standing.
 *
 * Radix rather than a hand-rolled overlay: it traps focus, restores it to whatever
 * opened the dialog, handles Escape and marks the page behind it as inert. Reimplementing
 * that correctly is more code than using it.
 */
export function LoginDialog({ open, onOpenChange, returnFocusTo }: Props) {
  const location = useLocation();

  // A Google sign-in leaves the page entirely, so it has to be told to come back here —
  // with the search intact, which is why this is the full path and not just `/`.
  const returnTo = `${location.pathname}${location.search}`;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm" />

        <Dialog.Content
          onCloseAutoFocus={(e) => {
            if (!returnFocusTo?.current) return;
            e.preventDefault();
            returnFocusTo.current.focus();
          }}
          // Centred with a translate rather than flex, so the panel can scroll on a
          // short window without the overlay scrolling with it.
          className="fixed start-1/2 top-1/2 z-50 max-h-[90vh] w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl bg-white p-6 shadow-xl rtl:translate-x-1/2"
        >
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="text-lg font-bold text-slate-900">כניסה</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-slate-500">
                כדי לשמור נכסים ולקבל עדכונים
              </Dialog.Description>
            </div>

            <Dialog.Close
              aria-label="סגירה"
              className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>

          <AccountLoginForm
            returnTo={returnTo}
            idPrefix="dialog"
            onSuccess={() => onOpenChange(false)}
          />

          <p className="mt-4 text-center text-sm text-slate-500">
            אין לך חשבון?{' '}
            <Link to="/signup" className="text-blue-700 hover:underline">
              הרשמה
            </Link>
          </p>

          {/*
            The crossing to the other side of the product. A buyer never needs it; an
            agent always looks for it — and an agent arriving at the agency sign-in wants
            a whole page, not this dialog, so it is a link out.
          */}
          <div className="mt-4 border-t border-slate-200 pt-4 text-center">
            <Link
              to="/agency/login"
              className="text-sm text-slate-600 hover:text-slate-900 hover:underline"
            >
              כניסה לסוכנויות נדל״ן ←
            </Link>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
