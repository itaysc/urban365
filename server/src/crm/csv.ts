/**
 * A small RFC-4180 reader: quoted fields, embedded commas, doubled quotes, and both
 * line endings. Enough for a spreadsheet export, and it avoids a dependency whose
 * streaming API this does not need — the whole file is already in memory.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  // A BOM survives Excel's "CSV UTF-8" export and would otherwise become part of the
  // first header name, so the first column would never match.
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  const endField = () => {
    row.push(field);
    field = '';
  };
  const endRow = () => {
    endField();
    if (row.some((c) => c.trim() !== '')) rows.push(row);
    row = [];
  };

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (quoted) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') quoted = true;
    else if (char === ',') endField();
    else if (char === '\n') endRow();
    else if (char === '\r') continue;
    else field += char;
  }

  if (field !== '' || row.length > 0) endRow();
  return rows;
}

/** Header aliases, so an agency's own export does not have to be renamed first. */
const HEADER_ALIASES: Record<string, string[]> = {
  name: ['name', 'full name', 'שם', 'שם מלא', 'איש קשר'],
  phone: ['phone', 'telephone', 'mobile', 'טלפון', 'נייד'],
  email: ['email', 'e-mail', 'mail', 'אימייל', 'דוא"ל', 'דואל'],
  message: ['message', 'enquiry', 'הודעה', 'פנייה'],
  notes: ['notes', 'note', 'comment', 'הערות', 'הערה'],
};

export interface MappedRow {
  name: string;
  phone?: string;
  email?: string;
  message?: string;
  notes?: string;
}

export interface CsvImportResult {
  rows: MappedRow[];
  /** 1-based row numbers in the source file, with why each was dropped. */
  skipped: { row: number; reason: string }[];
}

/** Maps a parsed CSV to lead rows, reporting rather than throwing on bad lines. */
export function mapLeadRows(rows: string[][]): CsvImportResult {
  if (rows.length === 0) return { rows: [], skipped: [] };

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const indexOf = (field: keyof typeof HEADER_ALIASES): number =>
    header.findIndex((h) => HEADER_ALIASES[field].includes(h));

  const columns = {
    name: indexOf('name'),
    phone: indexOf('phone'),
    email: indexOf('email'),
    message: indexOf('message'),
    notes: indexOf('notes'),
  };

  if (columns.name === -1) {
    return { rows: [], skipped: [{ row: 1, reason: 'לא נמצאה עמודת שם' }] };
  }

  const out: MappedRow[] = [];
  const skipped: CsvImportResult['skipped'] = [];

  rows.slice(1).forEach((cells, i) => {
    const rowNumber = i + 2;
    const at = (index: number): string | undefined => {
      const value = index === -1 ? undefined : cells[index]?.trim();
      return value ? value : undefined;
    };

    const name = at(columns.name);
    if (!name) {
      skipped.push({ row: rowNumber, reason: 'שורה ללא שם' });
      return;
    }

    const phone = at(columns.phone);
    const email = at(columns.email);
    if (!phone && !email) {
      skipped.push({ row: rowNumber, reason: 'אין טלפון ואין אימייל' });
      return;
    }

    out.push({ name, phone, email, message: at(columns.message), notes: at(columns.notes) });
  });

  return { rows: out, skipped };
}
