import { useRef, useState, type DragEvent } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useQueries } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { useAuth } from '@/auth/auth-context';
import { recordOptions, subjectsFor } from '@/components/agency/RecordDocuments';
import { Button } from '@/components/ui/Button';
import { Field, selectClass } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { errorMessageOf } from '@/lib/apiError';
import { qk } from '@/queries/keys';
import {
  MAX_DOCUMENT_BYTES,
  linkDocument,
  uploadDocument,
  type DocumentSubject,
} from '@/services/agency';

const ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.docx,.xlsx';
const EXTENSIONS = new Set(['pdf', 'jpg', 'jpeg', 'png', 'webp', 'docx', 'xlsx']);

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUploaded: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} ב׳`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} ק״ב`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} מ״ב`;
}

function accepted(file: File): boolean {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return EXTENSIONS.has(ext);
}

/**
 * Uploading from the library. The file can land on its own, or already attached to
 * the customer, the mortgage case, and the other records the office keeps.
 */
export function UploadDocumentDialog({ open, onOpenChange, onUploaded }: Props) {
  const toast = useToast();
  const { user } = useAuth();
  const subjects = subjectsFor(user?.agency?.vertical);
  const input = useRef<HTMLInputElement>(null);
  const depth = useRef(0);

  const [file, setFile] = useState<File | null>(null);
  const [over, setOver] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [picks, setPicks] = useState<Partial<Record<DocumentSubject, string>>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const records = useQueries({
    queries: subjects.map((subject) => ({
      queryKey: qk.documents.options(subject.value),
      queryFn: () => recordOptions(subject.value),
      enabled: open,
    })),
  });

  const reset = (next: boolean) => {
    if (!next) {
      setFile(null);
      setNote(null);
      setPicks({});
      setError(null);
      setOver(false);
      depth.current = 0;
    }
    onOpenChange(next);
  };

  const take = (list: FileList | null) => {
    const next = list?.[0];
    if (!next) return;
    if (!accepted(next)) {
      setNote('אפשר להעלות PDF, תמונה, Word או Excel.');
      return;
    }
    if (next.size > MAX_DOCUMENT_BYTES) {
      setNote('הקובץ גדול מ-10 מ״ב.');
      return;
    }
    setNote(null);
    setFile(next);
  };

  const onDrop = (e: DragEvent<HTMLButtonElement>) => {
    e.preventDefault();
    depth.current = 0;
    setOver(false);
    if (!saving) take(e.dataTransfer.files);
  };

  const submit = async () => {
    if (!file) return;
    const links = subjects
      .map((subject) => ({ subject: subject.value, subjectId: picks[subject.value] ?? '' }))
      .filter((link) => link.subjectId !== '');

    setSaving(true);
    setError(null);
    let createdId: string | null = null;
    try {
      const created = await uploadDocument(file, links[0]);
      createdId = created.id;
      for (const link of links.slice(1)) {
        await linkDocument(created.id, link);
      }
      setFile(null);
      setPicks({});
      toast.success(links.length > 0 ? 'המסמך הועלה וקושר.' : 'המסמך הועלה.');
      onUploaded();
    } catch (e) {
      if (createdId) {
        toast.error(errorMessageOf(e, 'הקובץ הועלה, אבל חלק מהשיוך נכשל.'));
        setFile(null);
        setPicks({});
        onUploaded();
        return;
      }
      const message = errorMessageOf(e, 'ההעלאה נכשלה.');
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={reset}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed start-1/2 top-1/2 z-50 max-h-[90vh] w-[min(40rem,calc(100vw-2rem))] min-w-0 -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl bg-white p-6 shadow-xl rtl:translate-x-1/2">
          <header className="mb-4 flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="text-lg font-bold text-slate-900">העלאת מסמך</Dialog.Title>
              <Dialog.Description className="mt-0.5 text-sm text-slate-500">
                אפשר לשייך את הקובץ כבר עכשיו ללקוח ולשאר הרשומות במשרד.
              </Dialog.Description>
            </div>
            <Dialog.Close
              aria-label="סגירה"
              className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="h-5 w-5" />
            </Dialog.Close>
          </header>

          <form
            className="flex min-w-0 flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <input
              ref={input}
              type="file"
              accept={ACCEPT}
              hidden
              onChange={(e) => {
                take(e.target.files);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              disabled={saving}
              onClick={() => input.current?.click()}
              onDragEnter={(e) => {
                e.preventDefault();
                depth.current += 1;
                if (!saving) setOver(true);
              }}
              onDragOver={(e) => e.preventDefault()}
              onDragLeave={() => {
                depth.current -= 1;
                if (depth.current <= 0) setOver(false);
              }}
              onDrop={onDrop}
              className={`flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition ${
                over
                  ? 'border-slate-900 bg-slate-50 text-slate-900'
                  : 'border-slate-300 text-slate-500 hover:border-slate-900 hover:text-slate-700'
              }`}
            >
              <span className="text-sm font-medium">
                {file ? file.name : 'גררו קובץ לכאן או לחצו לבחירה'}
              </span>
              <span className="text-xs">
                {file ? formatBytes(file.size) : 'PDF, תמונה, Word או Excel · עד 10 מ״ב'}
              </span>
            </button>
            {note && <p className="text-xs text-amber-700">{note}</p>}

            <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
              {subjects.map((subject, index) => (
                <div key={subject.value} className="min-w-0">
                  <Field label={subject.label} htmlFor={`upload-${subject.value}`}>
                    <select
                      id={`upload-${subject.value}`}
                      className={`${selectClass} w-full min-w-0`}
                      value={picks[subject.value] ?? ''}
                      disabled={records[index]?.isPending}
                      onChange={(e) =>
                        setPicks((current) => ({ ...current, [subject.value]: e.target.value }))
                      }
                    >
                      <option value="">{records[index]?.isPending ? 'טוען…' : 'ללא שיוך'}</option>
                      {(records[index]?.data ?? []).map((record) => (
                        <option key={record.id} value={record.id}>
                          {record.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
              ))}
            </div>

            {error && (
              <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>
            )}

            <div className="flex items-center gap-3">
              <Button type="submit" disabled={!file || saving}>
                {saving ? 'מעלה…' : 'העלאה'}
              </Button>
              <Dialog.Close className="text-sm text-slate-500 transition hover:text-slate-900">ביטול</Dialog.Close>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
