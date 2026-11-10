import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { errorMessageOf } from '@/lib/apiError';
import { formatDate } from '@/lib/format';
import { qk } from '@/queries/keys';
import { LibraryDocumentLinks } from '@/components/agency/RecordDocuments';
import {
  MAX_DOCUMENT_BYTES,
  deleteDocument,
  downloadDocument,
  fetchDocuments,
  uploadDocument,
  type AgencyDocument,
} from '@/services/agency';

const ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.docx,.xlsx';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} ב׳`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} ק״ב`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} מ״ב`;
}

/**
 * Files the office keeps: contracts, payslips, scans. The same page for a brokerage
 * and a mortgage office — both keep the same kind of paper, and both are capped so
 * one upload cannot fill the bucket.
 */
export function DocumentsPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const { data, isPending } = useQuery({ queryKey: qk.documents.list, queryFn: () => fetchDocuments() });

  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = () => queryClient.invalidateQueries({ queryKey: qk.documents.all });

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_DOCUMENT_BYTES) {
      toast.error('הקובץ גדול מ-10 מ״ב.');
      return;
    }
    setUploading(true);
    try {
      await uploadDocument(file);
      await reload();
      toast.success('המסמך הועלה.');
    } catch (e) {
      toast.error(errorMessageOf(e, 'ההעלאה נכשלה.'));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const download = async (doc: AgencyDocument) => {
    setBusyId(doc.id);
    try {
      const blob = await downloadDocument(doc.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = doc.fileName;
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(errorMessageOf(e, 'ההורדה נכשלה.'));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (doc: AgencyDocument) => {
    setBusyId(doc.id);
    try {
      await deleteDocument(doc.id);
      await reload();
      toast.success('המסמך נמחק.');
    } catch (e) {
      toast.error(errorMessageOf(e, 'המחיקה נכשלה.'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">מסמכים</h1>
          <p className="mt-1 text-sm text-slate-500">
            חוזים, תלושים וסריקות של המשרד. כל קובץ עד 10 מ״ב — PDF, תמונה, Word או Excel.
            אפשר לקשר מסמך ללקוח, לנכס ולשאר הרשומות במשרד.
          </p>
        </div>
        <div>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            className="sr-only"
            aria-label="בחירת מסמך"
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
          <Button
            type="button"
            disabled={uploading}
            className="inline-flex items-center gap-2"
            onClick={() => inputRef.current?.click()}
          >
            <Upload className="h-4 w-4" aria-hidden />
            {uploading ? 'מעלה…' : 'העלאת מסמך'}
          </Button>
        </div>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        {isPending && <p className="text-sm text-slate-500">טוען…</p>}
        {data && data.length === 0 && <p className="text-sm text-slate-500">עדיין אין מסמכים.</p>}

        {data && data.length > 0 && (
          <ul className="flex flex-col gap-2">
            {data.map((doc) => {
              const who = doc.uploadedBy ? `${doc.uploadedBy.firstName} ${doc.uploadedBy.lastName}` : null;
              return (
                <li key={doc.id} className="rounded-lg border border-slate-200 p-2.5">
                  <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">{doc.fileName}</p>
                    <p className="text-xs text-slate-500">
                      {[formatBytes(doc.byteSize), formatDate(doc.createdAt), who].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      aria-label={`הורדת ${doc.fileName}`}
                      disabled={busyId === doc.id}
                      className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40"
                      onClick={() => void download(doc)}
                    >
                      <Download className="h-4 w-4" aria-hidden />
                    </button>
                    <button
                      type="button"
                      aria-label={`מחיקת ${doc.fileName}`}
                      disabled={busyId === doc.id}
                      className="rounded-lg p-1.5 text-slate-500 transition hover:bg-red-50 hover:text-red-700 disabled:opacity-40"
                      onClick={() => void remove(doc)}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                  </div>
                  <LibraryDocumentLinks doc={doc} />
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
