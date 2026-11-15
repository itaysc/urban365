import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Pencil, Search, Trash2, Upload } from 'lucide-react';
import { useAuth } from '@/auth/auth-context';
import { EditDocumentDialog } from '@/components/agency/EditDocumentDialog';
import { subjectsFor } from '@/components/agency/RecordDocuments';
import { UploadDocumentDialog } from '@/components/agency/UploadDocumentDialog';
import { Button } from '@/components/ui/Button';
import { inputClass, selectClass } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { errorMessageOf } from '@/lib/apiError';
import { formatDate } from '@/lib/format';
import { qk } from '@/queries/keys';
import {
  deleteDocument,
  downloadDocument,
  fetchDocuments,
  type AgencyDocument,
  type DocumentSubject,
} from '@/services/agency';
import { fetchCustomers, fetchDealBoard, fetchMortgageCaseBoard } from '@/services/crm';

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

/** The same page length as the customer list, so a long library does not become one scroll. */
const PAGE_SIZE = 25;

/**
 * One line in the table, the whole sentence on hover. The tooltip is fixed so the
 * table's own scroll does not clip it.
 */
function NoteCell({ note }: { note: string | null }) {
  const [tip, setTip] = useState<{ top: number; right: number } | null>(null);

  if (!note) return <span className="text-slate-400">—</span>;

  const place = (target: HTMLElement) => {
    const rect = target.getBoundingClientRect();
    setTip({ top: rect.bottom + 6, right: window.innerWidth - rect.right });
  };

  return (
    <div onMouseEnter={(e) => place(e.currentTarget)} onMouseLeave={() => setTip(null)}>
      <p className="truncate text-slate-600">{note.replace(/\s+/g, ' ')}</p>
      {tip && (
        <span
          role="tooltip"
          style={{ top: tip.top, right: tip.right }}
          className="pointer-events-none fixed z-50 max-h-60 max-w-sm overflow-y-auto whitespace-pre-wrap rounded-lg bg-slate-900 px-3 py-2 text-xs leading-snug text-white shadow-lg"
        >
          {note}
        </span>
      )}
    </div>
  );
}

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
  const { data, isPending } = useQuery({ queryKey: qk.documents.list, queryFn: () => fetchDocuments() });
  const { data: customers } = useQuery({
    queryKey: qk.customers.picker,
    queryFn: () => fetchCustomers({ pageSize: 100 }),
  });

  const [q, setQ] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [link, setLink] = useState<LinkFilter | ''>('');
  const [kind, setKind] = useState<FileKind | ''>('');
  const [page, setPage] = useState(1);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
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
      const haystack = [doc.fileName, doc.description ?? '', ...doc.links.map((item) => item.label)]
        .join(' ')
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [data, q, customerId, customerRecords, kind, link]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const rows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const editing = (data ?? []).find((doc) => doc.id === editingId) ?? null;

  const reload = () => queryClient.invalidateQueries({ queryKey: qk.documents.all });

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
        <Button type="button" className="inline-flex items-center gap-2" onClick={() => setUploadOpen(true)}>
          <Upload className="h-4 w-4" aria-hidden />
          העלאת מסמך
        </Button>
      </div>

      <UploadDocumentDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onUploaded={() => {
          setUploadOpen(false);
          void reload();
        }}
      />
      <EditDocumentDialog
        doc={editing}
        onOpenChange={(next) => {
          if (!next) setEditingId(null);
        }}
        onSaved={() => void reload()}
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute inset-y-0 end-3 my-auto h-4 w-4 text-slate-500" aria-hidden />
          <input
            className={`${inputClass} w-full pe-9`}
            placeholder="חיפוש לפי שם קובץ או רשומה"
            value={q}
            aria-label="חיפוש מסמכים"
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
        </div>

        <select
          className={selectClass}
          value={customerId}
          aria-label="לקוח"
          onChange={(e) => {
            setCustomerId(e.target.value);
            setPage(1);
          }}
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
            setPage(1);
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
          onChange={(e) => {
            setKind(isFileKind(e.target.value) ? e.target.value : '');
            setPage(1);
          }}
        >
          <option value="">כל הסוגים</option>
          {FILE_KINDS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white">
        {isPending && <p className="p-4 text-sm text-slate-500">טוען…</p>}
        {data && data.length === 0 && <p className="p-4 text-sm text-slate-500">עדיין אין מסמכים.</p>}
        {data && data.length > 0 && filtered.length === 0 && (
          <p className="p-4 text-sm text-slate-500">אין מסמכים שתואמים לחיפוש.</p>
        )}

        {rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full table-fixed text-sm">
              <thead className="text-slate-500">
                <tr>
                  <th className="w-[22%] px-3 py-2 text-start font-medium">מסמך</th>
                  <th className="w-[22%] px-3 py-2 text-start font-medium">הערה</th>
                  <th className="px-3 py-2 text-start font-medium">קישורים</th>
                  <th className="px-3 py-2 text-start font-medium">גודל</th>
                  <th className="px-3 py-2 text-start font-medium">תאריך</th>
                  <th className="px-3 py-2 text-start font-medium">העלה</th>
                  <th className="px-3 py-2 text-end font-medium">פעולה</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((doc) => {
                  const who = doc.uploadedBy ? `${doc.uploadedBy.firstName} ${doc.uploadedBy.lastName}` : null;
                  return (
                    <tr key={doc.id} className="border-t border-slate-100">
                      <td className="overflow-hidden px-3 py-2">
                        <p className="truncate font-medium text-slate-900">{doc.fileName}</p>
                      </td>
                      <td className="overflow-hidden px-3 py-2">
                        <NoteCell note={doc.description} />
                      </td>
                      <td className="px-3 py-2">
                        {doc.links.length === 0 ? (
                          <span className="text-slate-400">—</span>
                        ) : (
                          <ul className="flex flex-wrap gap-1.5">
                            {doc.links.map((item) => (
                              <li key={item.id}>
                                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                                  {item.label}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-slate-600">{formatBytes(doc.byteSize)}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-slate-600">{formatDate(doc.createdAt)}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-slate-600">{who ?? '—'}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            aria-label={`עריכת ${doc.fileName}`}
                            className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                            onClick={() => setEditingId(doc.id)}
                          >
                            <Pencil className="h-4 w-4" aria-hidden />
                          </button>
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
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {filtered.length > PAGE_SIZE && (
          <div className="flex items-center justify-center gap-3 border-t border-slate-100 px-3 py-3 text-sm">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setPage(currentPage - 1)}
              className="text-blue-700 disabled:text-slate-300"
            >
              הקודם
            </button>
            <span className="text-slate-500">
              {currentPage} מתוך {totalPages}
            </span>
            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => setPage(currentPage + 1)}
              className="text-blue-700 disabled:text-slate-300"
            >
              הבא
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
