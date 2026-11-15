import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { LibraryDocumentLinks } from '@/components/agency/RecordDocuments';
import { Button } from '@/components/ui/Button';
import { Field, inputClass } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { errorMessageOf } from '@/lib/apiError';
import { updateDocument, type AgencyDocument } from '@/services/agency';

/**
 * Name, memo, and which records the file is attached to. Opened from the library —
 * the row itself only shows those details.
 */
export function EditDocumentDialog({
  doc,
  onOpenChange,
  onSaved,
}: {
  doc: AgencyDocument | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);

  const save = async (fileName: string, description: string) => {
    if (!doc) return;
    setSaving(true);
    try {
      await updateDocument(doc.id, { fileName: fileName.trim(), description });
      toast.success('המסמך עודכן.');
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error(errorMessageOf(e, 'השמירה נכשלה.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog.Root open={doc !== null} onOpenChange={(next) => { if (!saving) onOpenChange(next); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed start-1/2 top-1/2 z-50 w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-xl rtl:translate-x-1/2">
          {doc && (
            <Editor
              key={doc.id}
              doc={doc}
              saving={saving}
              onSave={save}
            />
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Editor({
  doc,
  saving,
  onSave,
}: {
  doc: AgencyDocument;
  saving: boolean;
  onSave: (fileName: string, description: string) => void;
}) {
  const [fileName, setFileName] = useState(doc.fileName);
  const [description, setDescription] = useState(doc.description ?? '');

  return (
    <>
      <header className="mb-4 flex items-start justify-between gap-4">
        <Dialog.Title className="text-lg font-bold text-slate-900">עריכת מסמך</Dialog.Title>
        <Dialog.Close
          aria-label="סגירה"
          disabled={saving}
          className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40"
        >
          <X className="h-5 w-5" />
        </Dialog.Close>
      </header>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSave(fileName, description);
        }}
      >
        <Field label="שם" htmlFor="edit-document-name" required>
          <input
            id="edit-document-name"
            required
            maxLength={180}
            className={`${inputClass} w-full`}
            value={fileName}
            onChange={(e) => setFileName(e.target.value)}
          />
        </Field>
        <Field label="הערה" htmlFor="edit-document-description">
          <textarea
            id="edit-document-description"
            rows={3}
            maxLength={2000}
            className={`${inputClass} w-full`}
            placeholder="למשל: תלוש מרץ, הזמנת תיווך חתומה"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        <LibraryDocumentLinks doc={doc} editable />
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={saving || !fileName.trim()}>
            {saving ? 'שומר…' : 'שמירה'}
          </Button>
          <Dialog.Close
            disabled={saving}
            className="text-sm text-slate-500 transition hover:text-slate-900 disabled:opacity-40"
          >
            ביטול
          </Dialog.Close>
        </div>
      </form>
    </>
  );
}
