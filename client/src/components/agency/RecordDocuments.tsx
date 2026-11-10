import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Trash2, Upload } from 'lucide-react';
import { useAuth } from '@/auth/auth-context';
import { Button } from '@/components/ui/Button';
import { selectClass } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { errorMessageOf } from '@/lib/apiError';
import { qk } from '@/queries/keys';
import {
  MAX_DOCUMENT_BYTES,
  downloadDocument,
  fetchDocuments,
  fetchMyListings,
  linkDocument,
  unlinkDocument,
  uploadDocument,
  type AgencyDocument,
  type DocumentLink,
  type DocumentSubject,
} from '@/services/agency';
import {
  fetchCustomers,
  fetchDealBoard,
  fetchLeads,
  fetchMortgageCaseBoard,
} from '@/services/crm';
import type { AgencyVertical } from '@/types/auth';

const ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.docx,.xlsx';

const SUBJECTS: { value: DocumentSubject; label: string; vertical?: AgencyVertical }[] = [
  { value: 'customer', label: 'לקוח' },
  { value: 'listing', label: 'נכס', vertical: 'real_estate' },
  { value: 'deal', label: 'עסקה' },
  { value: 'mortgage_case', label: 'תיק משכנתא', vertical: 'mortgage_broker' },
  { value: 'lead', label: 'פנייה' },
];

export function subjectsFor(vertical?: AgencyVertical) {
  return SUBJECTS.filter((item) => !item.vertical || item.vertical === vertical);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} ב׳`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} ק״ב`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} מ״ב`;
}

async function saveFile(doc: AgencyDocument) {
  const blob = await downloadDocument(doc.id);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = doc.fileName;
  link.click();
  URL.revokeObjectURL(url);
}

export async function recordOptions(subject: DocumentSubject): Promise<{ id: string; label: string }[]> {
  switch (subject) {
    case 'customer': {
      const page = await fetchCustomers({ pageSize: 100 });
      return page.items.map((customer) => ({ id: customer.id, label: customer.name }));
    }
    case 'listing': {
      const page = await fetchMyListings({ pageSize: 100 });
      return page.items.map((listing) => ({
        id: listing.id,
        label: [listing.street, listing.city].filter(Boolean).join(', ') || 'נכס',
      }));
    }
    case 'deal': {
      const board = await fetchDealBoard();
      return Object.values(board.columns)
        .flat()
        .map((deal) => ({ id: deal.id, label: deal.title }));
    }
    case 'mortgage_case': {
      const board = await fetchMortgageCaseBoard();
      return Object.values(board.columns)
        .flat()
        .map((item) => ({
          id: item.id,
          label: item.customer?.name ?? item.lead?.name ?? item.propertyCity ?? 'תיק משכנתא',
        }));
    }
    case 'lead': {
      const page = await fetchLeads({ pageSize: 100 });
      return page.items.map((lead) => ({ id: lead.id, label: lead.name }));
    }
  }
}

/**
 * The files attached to one record, and a way to attach one that is already in the
 * office library. Uploading here also files it in the library, so the same contract
 * can be linked to the customer and the listing afterwards.
 */
export function RecordDocuments({ subject, subjectId }: { subject: DocumentSubject; subjectId: string }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [chosen, setChosen] = useState('');

  const linked = useQuery({
    queryKey: qk.documents.for(subject, subjectId),
    queryFn: () => fetchDocuments({ subject, subjectId }),
  });
  const library = useQuery({ queryKey: qk.documents.list, queryFn: () => fetchDocuments() });

  const reload = () => queryClient.invalidateQueries({ queryKey: qk.documents.all });
  const attached = new Set((linked.data ?? []).map((doc) => doc.id));
  const available = (library.data ?? []).filter((doc) => !attached.has(doc.id));

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_DOCUMENT_BYTES) {
      toast.error('הקובץ גדול מ-10 מ״ב.');
      return;
    }
    setUploading(true);
    try {
      await uploadDocument(file, { subject, subjectId });
      await reload();
      toast.success('המסמך הועלה וקושר.');
    } catch (e) {
      toast.error(errorMessageOf(e, 'ההעלאה נכשלה.'));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const connect = async () => {
    if (!chosen) return;
    setBusyId(chosen);
    try {
      await linkDocument(chosen, { subject, subjectId });
      setChosen('');
      await reload();
      toast.success('המסמך קושר.');
    } catch (e) {
      toast.error(errorMessageOf(e, 'הקישור נכשל.'));
    } finally {
      setBusyId(null);
    }
  };

  const detach = async (doc: AgencyDocument) => {
    const link = doc.links.find((item) => item.subject === subject && item.subjectId === subjectId);
    if (!link) return;
    setBusyId(doc.id);
    try {
      await unlinkDocument(doc.id, link.id);
      await reload();
      toast.success('הקישור הוסר.');
    } catch (e) {
      toast.error(errorMessageOf(e, 'ההסרה נכשלה.'));
    } finally {
      setBusyId(null);
    }
  };

  const download = async (doc: AgencyDocument) => {
    setBusyId(doc.id);
    try {
      await saveFile(doc);
    } catch (e) {
      toast.error(errorMessageOf(e, 'ההורדה נכשלה.'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mt-3 flex flex-col gap-2">
      <h3 className="text-sm font-semibold text-slate-900">מסמכים</h3>
      <p className="text-xs text-slate-500">
        עד 10 מ״ב לקובץ. הסרה מנתקת את המסמך מהרשומה, והוא נשאר במסמכי המשרד.
      </p>

      {linked.isPending && <p className="text-sm text-slate-500">טוען…</p>}
      {linked.data && linked.data.length === 0 && (
        <p className="text-sm text-slate-500">עדיין אין מסמכים ברשומה הזו.</p>
      )}

      {linked.data && linked.data.length > 0 && (
        <ul className="flex flex-col gap-2">
          {linked.data.map((doc) => (
            <li
              key={doc.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900">{doc.fileName}</p>
                <p className="text-xs text-slate-500">{formatBytes(doc.byteSize)}</p>
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
                  aria-label={`הסרת ${doc.fileName} מהרשומה`}
                  disabled={busyId === doc.id}
                  className="rounded-lg p-1.5 text-slate-500 transition hover:bg-red-50 hover:text-red-700 disabled:opacity-40"
                  onClick={() => void detach(doc)}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2">
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
          variant="secondary"
          disabled={uploading}
          className="inline-flex items-center gap-2"
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="h-4 w-4" aria-hidden />
          {uploading ? 'מעלה…' : 'העלאה'}
        </Button>

        {available.length > 0 && (
          <>
            <select
              className={`${selectClass} max-w-xs`}
              aria-label="מסמך קיים"
              value={chosen}
              onChange={(e) => setChosen(e.target.value)}
            >
              <option value="">קישור למסמך קיים</option>
              {available.map((doc) => (
                <option key={doc.id} value={doc.id}>
                  {doc.fileName}
                </option>
              ))}
            </select>
            <Button type="button" variant="secondary" disabled={!chosen || busyId === chosen} onClick={() => void connect()}>
              קישור
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

/** A collapsed "מסמכים" on a card, so a board stays a board until somebody opens one. */
export function RecordDocumentsToggle({ subject, subjectId }: { subject: DocumentSubject; subjectId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2">
      <button
        type="button"
        aria-expanded={open}
        className="text-xs font-medium text-blue-700 hover:underline"
        onClick={() => setOpen((value) => !value)}
      >
        {open ? 'הסתרת מסמכים' : 'מסמכים'}
      </button>
      {open && <RecordDocuments subject={subject} subjectId={subjectId} />}
    </div>
  );
}

/**
 * On the library page: where this file is attached, and a way to attach it to another
 * record. The record pages do the same thing from the other side.
 */
export function LibraryDocumentLinks({ doc }: { doc: AgencyDocument }) {
  const { user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const options = subjectsFor(user?.agency?.vertical);
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState<DocumentSubject | ''>('');
  const [recordId, setRecordId] = useState('');
  const [busy, setBusy] = useState(false);

  const records = useQuery({
    queryKey: qk.documents.options(subject || 'none'),
    queryFn: () => recordOptions(subject as DocumentSubject),
    enabled: open && subject !== '',
  });

  const taken = new Set(doc.links.filter((link) => link.subject === subject).map((link) => link.subjectId));
  const choices = (records.data ?? []).filter((record) => !taken.has(record.id));

  const reload = () => queryClient.invalidateQueries({ queryKey: qk.documents.all });

  const connect = async () => {
    if (!subject || !recordId) return;
    setBusy(true);
    try {
      await linkDocument(doc.id, { subject, subjectId: recordId });
      setRecordId('');
      await reload();
      toast.success('המסמך קושר.');
    } catch (e) {
      toast.error(errorMessageOf(e, 'הקישור נכשל.'));
    } finally {
      setBusy(false);
    }
  };

  const detach = async (link: DocumentLink) => {
    setBusy(true);
    try {
      await unlinkDocument(doc.id, link.id);
      await reload();
      toast.success('הקישור הוסר.');
    } catch (e) {
      toast.error(errorMessageOf(e, 'ההסרה נכשלה.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-2 flex flex-col gap-2">
      {doc.links.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {doc.links.map((link) => (
            <li key={link.id}>
              <button
                type="button"
                disabled={busy}
                title="הסרת הקישור"
                aria-label={`הסרת הקישור ${link.label}`}
                className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700 transition hover:bg-red-50 hover:text-red-700 disabled:opacity-40"
                onClick={() => void detach(link)}
              >
                {link.label} ×
              </button>
            </li>
          ))}
        </ul>
      )}

      {open ? (
        <div className="flex flex-wrap items-center gap-2">
          <select
            className={selectClass}
            aria-label="סוג רשומה"
            value={subject}
            onChange={(e) => {
              setSubject(e.target.value as DocumentSubject | '');
              setRecordId('');
            }}
          >
            <option value="">סוג רשומה</option>
            {options.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <select
            className={`${selectClass} max-w-xs`}
            aria-label="רשומה"
            value={recordId}
            disabled={!subject || records.isPending}
            onChange={(e) => setRecordId(e.target.value)}
          >
            <option value="">{records.isPending ? 'טוען…' : 'בחירת רשומה'}</option>
            {choices.map((record) => (
              <option key={record.id} value={record.id}>
                {record.label}
              </option>
            ))}
          </select>
          <Button type="button" variant="secondary" disabled={!recordId || busy} onClick={() => void connect()}>
            קישור
          </Button>
          <button type="button" className="text-xs text-slate-500 hover:underline" onClick={() => setOpen(false)}>
            ביטול
          </button>
        </div>
      ) : (
        <button type="button" className="self-start text-xs font-medium text-blue-700 hover:underline" onClick={() => setOpen(true)}>
          קישור לרשומה
        </button>
      )}
    </div>
  );
}
