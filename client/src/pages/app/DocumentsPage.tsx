import { useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Search, Trash2, Upload } from 'lucide-react';
import { useAuth } from '@/auth/auth-context';
import { LibraryDocumentLinks, subjectsFor } from '@/components/agency/RecordDocuments';
import { Button } from '@/components/ui/Button';
import { inputClass, selectClass } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { errorMessageOf } from '@/lib/apiError';
import { formatDate } from '@/lib/format';
import { qk } from '@/queries/keys';
import {
  MAX_DOCUMENT_BYTES,
  deleteDocument,
  downloadDocument,
  fetchDocuments,
  uploadDocument,
  type AgencyDocument,
  type DocumentSubject,
} from '@/services/agency';
import { fetchCustomers, fetchDealBoard, fetchMortgageCaseBoard } from '@/services/crm';

const ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.docx,.xlsx';

type FileKind = 'pdf' | 'image' | 'word' | 'excel';
type LinkFilter = DocumentSubject | 'none';

const FILE_KINDS: { value: FileKind; label: string }[] = [
  { value: 'pdf', label: 'PDF' },
  { value: 'image', label: 'תמונה' },
  { value: 'word', label: 'Word' },
  { value: 'excel', label: 'Excel' },
];

function fileKindOf(contentType: string): FileKind | null {
  if (contentType === 'application/pdf') return 'pdf';
  if (contentType.startsWith('image/')) return 'image';
  if (contentType.includes('wordprocessingml')) return 'word';
  if (contentType.includes('spreadsheetml')) return 'excel';
  return null;
}

const isFileKind = (value: string): value is FileKind => FILE_KINDS.some((item) => item.value === value);

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
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const { data, isPending } = useQuery({ queryKey: qk.documents.list, queryFn: () => fetchDocuments() });
  const { data: customers } = useQuery({
    queryKey: qk.customers.picker,
    queryFn: () => fetchCustomers({ pageSize: 100 }),
  });

  const [q, setQ] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [link, setLink] = useState<LinkFilter | ''>('');
  const [kind, setKind] = useState<FileKind | ''>('');
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const vertical = user?.agency?.vertical;
  const { data: deals } = useQuery({
    queryKey: qk.deals.board,
    queryFn: fetchDealBoard,
    enabled: customerId !== '' && vertical !== 'mortgage_broker',
  });
  const { data: cases } = useQuery({
    queryKey: qk.mortgageCases.board,
    queryFn: fetchMortgageCaseBoard,
    enabled: customerId !== '' && vertical === 'mortgage_broker',
  });

  const subjects = subjectsFor(vertical);
  const customerOptions = useMemo(() => {
    const byId = new Map<string, string>();
    for (const customer of customers?.items ?? []) byId.set(customer.id, customer.name);
    for (const doc of data ?? []) {
      for (const item of doc.links) {
        if (item.subject === 'customer' && !byId.has(item.subjectId)) {
          byId.set(item.subjectId, item.label.replace(/^לקוח · /, ''));
        }
      }
    }
    return [...byId.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'he'));
  }, [customers, data]);

  /**
   * A file belongs to the customer when it is linked to them, or to a deal or mortgage
   * case that is theirs. The case is where a mortgage office usually hangs the paper.
   */
  const customerRecords = useMemo(() => {
    const ids = new Set<string>();
    if (!customerId) return ids;
    ids.add(customerId);
    for (const column of Object.values(deals?.columns ?? {})) {
      for (const deal of column) if (deal.customerId === customerId) ids.add(deal.id);
    }
    for (const column of Object.values(cases?.columns ?? {})) {
      for (const item of column) if (item.customerId === customerId) ids.add(item.id);
    }
    return ids;
  }, [customerId, deals, cases]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (data ?? []).filter((doc) => {
      if (customerId && !doc.links.some((item) => customerRecords.has(item.subjectId))) return false;
      if (kind && fileKindOf(doc.contentType) !== kind) return false;
      if (link === 'none' && doc.links.length > 0) return false;
      if (link && link !== 'none' && !doc.links.some((item) => item.subject === link)) return false;
      if (!term) return true;
      const haystack = [doc.fileName, ...doc.links.map((item) => item.label)].join(' ').toLowerCase();
      return haystack.includes(term);
    });
  }, [data, q, customerId, customerRecords, kind, link]);

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

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute inset-y-0 end-3 my-auto h-4 w-4 text-slate-500" aria-hidden />
          <input
            className={`${inputClass} w-full pe-9`}
            placeholder="חיפוש לפי שם קובץ או רשומה"
            value={q}
            aria-label="חיפוש מסמכים"
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        <select
          className={selectClass}
          value={customerId}
          aria-label="לקוח"
          onChange={(e) => setCustomerId(e.target.value)}
        >
          <option value="">לקוח</option>
          {customerOptions.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.name}
            </option>
          ))}
        </select>

        <select
          className={selectClass}
          value={link}
          aria-label="קישור לרשומה"
          onChange={(e) => {
            const value = e.target.value;
            setLink(
              value === 'none' || subjects.some((item) => item.value === value) ? (value as LinkFilter) : '',
            );
          }}
        >
          <option value="">כל הקישורים</option>
          <option value="none">ללא קישור</option>
          {subjects.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>

        <select
          className={selectClass}
          value={kind}
          aria-label="סוג קובץ"
          onChange={(e) => setKind(isFileKind(e.target.value) ? e.target.value : '')}
        >
          <option value="">כל הסוגים</option>
          {FILE_KINDS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        {isPending && <p className="text-sm text-slate-500">טוען…</p>}
        {data && data.length === 0 && <p className="text-sm text-slate-500">עדיין אין מסמכים.</p>}
        {data && data.length > 0 && filtered.length === 0 && (
          <p className="text-sm text-slate-500">אין מסמכים שתואמים לחיפוש.</p>
        )}

        {filtered.length > 0 && (
          <ul className="flex flex-col gap-2">
            {filtered.map((doc) => {
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
