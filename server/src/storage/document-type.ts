import { sniffImageType } from './image-type.js';

/**
 * One file, not an archive of them. A phone scan of a contract fits; a dump of a
 * whole drive does not. Enforced again by multer before the bytes are buffered.
 */
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

/** Office formats the image allow-list does not already cover. */
export const DOCUMENT_EXTENSIONS: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
};

const IMAGE_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
};

export interface DetectedDocument {
  contentType: string;
  extension: string;
}

/**
 * What the bytes actually are. The multipart Content-Type and the filename are both
 * chosen by the browser, so neither is consulted.
 */
export function detectDocument(buffer: Buffer): DetectedDocument | null {
  if (buffer.length < 4) return null;

  // Office Open XML is a zip. The entry name is in the local headers, so it is in
  // the file itself — a renamed .zip of something else does not contain it.
  if (buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04) {
    if (buffer.includes(Buffer.from('word/document.xml'))) {
      return {
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        extension: 'docx',
      };
    }
    if (buffer.includes(Buffer.from('xl/workbook.xml'))) {
      return {
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        extension: 'xlsx',
      };
    }
    return null;
  }

  // The PDF header is supposed to be first, and readers still accept it a little way in.
  const head = buffer.subarray(0, Math.min(buffer.length, 1024));
  if (head.includes(Buffer.from('%PDF-'))) {
    return { contentType: 'application/pdf', extension: 'pdf' };
  }

  const image = sniffImageType(buffer);
  const extension = image ? IMAGE_EXTENSIONS[image] : undefined;
  if (image && extension) return { contentType: image, extension };

  return null;
}

/**
 * The name the office sees and the name the browser saves. The extension is the one
 * the bytes sniffed to, so a file called `contract.exe` that is really a PDF is saved
 * as a PDF. Path segments and control characters never survive.
 */
/**
 * Busboy reads a multipart filename as latin1, so a Hebrew name arrives as mojibake.
 * A name that is already Unicode (or that does not decode as UTF-8) is left alone.
 */
export function decodeOriginalName(original: string | undefined): string | undefined {
  if (!original) return original;
  if ([...original].some((ch) => ch.charCodeAt(0) > 0xff)) return original;
  const decoded = Buffer.from(original, 'latin1').toString('utf8');
  if (decoded.includes('\uFFFD')) return original;
  return decoded;
}

export function documentFileName(original: string | undefined, extension: string): string {
  const raw = (decodeOriginalName(original) ?? '').split(/[/\\]/).pop() ?? '';
  const cleaned = raw.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 180);
  const stem = cleaned.replace(/\.[^.]+$/, '').replace(/^\.+/, '').trim();
  return `${stem || 'מסמך'}.${extension}`;
}
