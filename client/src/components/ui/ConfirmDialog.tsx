import * as AlertDialog from '@radix-ui/react-alert-dialog';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/Button';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  busy?: boolean;
  /** Extra controls, such as a required choice, between the text and the buttons. */
  children?: ReactNode;
  confirmDisabled?: boolean;
}

/**
 * Radix rather than `window.confirm`, which is unstyled, untranslated and renders
 * left-to-right regardless of the page direction — all three wrong for a Hebrew app.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'מחיקה',
  cancelLabel = 'ביטול',
  onConfirm,
  busy,
  children,
  confirmDisabled,
}: Props) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <AlertDialog.Content
          dir="rtl"
          className="fixed inset-x-0 top-1/2 z-50 mx-auto w-[min(28rem,calc(100%-2rem))] -translate-y-1/2 rounded-xl bg-white p-6 shadow-xl"
        >
          <AlertDialog.Title className="text-lg font-semibold text-slate-900">{title}</AlertDialog.Title>
          {description && (
            <AlertDialog.Description className="mt-2 text-sm text-slate-600">
              {description}
            </AlertDialog.Description>
          )}
          {children}
          <div className="mt-6 flex justify-start gap-2">
            <Button variant="danger" onClick={onConfirm} disabled={busy || confirmDisabled}>
              {busy ? 'רגע…' : confirmLabel}
            </Button>
            <AlertDialog.Cancel asChild>
              <Button variant="secondary">{cancelLabel}</Button>
            </AlertDialog.Cancel>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
