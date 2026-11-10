import { detectDocument, documentFileName } from './document-type.js';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

describe('detectDocument', () => {
  it('recognises a PDF, a scan and an Office file, and refuses anything else', () => {
    expect(detectDocument(Buffer.from('%PDF-1.7\n'))?.extension).toBe('pdf');
    expect(detectDocument(PNG)?.extension).toBe('png');
    expect(detectDocument(Buffer.concat([Buffer.from('PK\x03\x04'), Buffer.from('word/document.xml')]))?.extension).toBe(
      'docx',
    );
    expect(detectDocument(Buffer.concat([Buffer.from('PK\x03\x04'), Buffer.from('xl/workbook.xml')]))?.extension).toBe(
      'xlsx',
    );
    expect(detectDocument(Buffer.from('PK\x03\x04just a zip'))).toBeNull();
    expect(detectDocument(Buffer.from('MZ not a document'))).toBeNull();
    expect(detectDocument(Buffer.alloc(0))).toBeNull();
  });
});

describe('documentFileName', () => {
  it('keeps the readable name and forces the sniffed extension', () => {
    expect(documentFileName('חוזה שכירות.pdf', 'pdf')).toBe('חוזה שכירות.pdf');
    expect(documentFileName('evil.exe', 'pdf')).toBe('evil.pdf');
    expect(documentFileName('../../etc/passwd', 'pdf')).toBe('passwd.pdf');
    expect(documentFileName('a\u0000b.docx', 'docx')).toBe('ab.docx');
    expect(documentFileName('', 'pdf')).toBe('מסמך.pdf');
    expect(documentFileName('..', 'pdf')).toBe('מסמך.pdf');
    expect(documentFileName(Buffer.from('חוזה.pdf', 'utf8').toString('latin1'), 'pdf')).toBe('חוזה.pdf');
  });
});
