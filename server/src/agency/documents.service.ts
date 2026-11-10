import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { RequestContextService } from '../tenancy/request-context.service.js';
import { TenantPrismaService } from '../tenancy/tenant-prisma.service.js';
import { StorageService, isNotFoundError } from '../storage/storage.service.js';
import { MAX_DOCUMENT_BYTES, detectDocument, documentFileName } from '../storage/document-type.js';
import {
  SUBJECT_FIELD,
  isDocumentSubject,
  presentLink,
  type DocumentLinkView,
  type DocumentSubject,
  type LinkRow,
} from '../storage/document-links.js';

const LINK_SELECT = {
  id: true,
  customer: { select: { id: true, name: true } },
  listing: { select: { id: true, city: true, street: true } },
  deal: { select: { id: true, title: true } },
  mortgageCase: { select: { id: true, propertyCity: true, customer: { select: { name: true } } } },
  lead: { select: { id: true, name: true } },
} as const;

const SELECT = {
  id: true,
  fileName: true,
  contentType: true,
  byteSize: true,
  createdAt: true,
  uploadedBy: { select: { firstName: true, lastName: true } },
  links: { select: LINK_SELECT },
} as const;

const WITH_LINKS = {
  ...SELECT,
  links: { select: LINK_SELECT, orderBy: { createdAt: 'asc' as const } },
};

type DocumentRow = Prisma.AgencyDocumentGetPayload<{ select: typeof SELECT }>;

function present(row: DocumentRow) {
  const { links, ...rest } = row;
  return {
    ...rest,
    links: links.flatMap((link) => {
      const view = presentLink(link as LinkRow);
      return view ? [view] : [];
    }),
  };
}

/**
 * An office's own files, and where each one is attached.
 *
 * On the tenant client, so the agency id comes from the request rather than from
 * anything the caller sends, and a policy — not a `where` they might forget — is
 * what stops one office downloading another's payslips. Any member of the office
 * can add and remove them: the person on the file is usually an agent, not the owner.
 */
@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: TenantPrismaService,
    private readonly context: RequestContextService,
    private readonly storage: StorageService,
  ) {}

  async list(subject?: string, subjectId?: string) {
    const attached = this.attachment(subject, subjectId);
    const rows = await this.prisma.client.agencyDocument.findMany({
      where: {
        agencyId: this.context.requireAgencyId(),
        ...(attached ? { links: { some: { [SUBJECT_FIELD[attached.subject]]: attached.subjectId } } } : {}),
      },
      select: WITH_LINKS,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(present);
  }

  async add(file: Express.Multer.File | undefined, subject?: string, subjectId?: string) {
    if (!file?.buffer?.length) throw new BadRequestException('לא נבחר קובץ.');
    if (file.buffer.length > MAX_DOCUMENT_BYTES) {
      throw new PayloadTooLargeException('הקובץ גדול מ-10 מ״ב.');
    }

    const detected = detectDocument(file.buffer);
    if (!detected) {
      throw new BadRequestException('אפשר להעלות PDF, תמונה, Word או Excel.');
    }

    const attached = this.attachment(subject, subjectId);
    const agencyId = this.context.requireAgencyId();
    if (attached) await this.assertSubject(agencyId, attached.subject, attached.subjectId);

    const storageKey = await this.storage.putObject(
      `agencies/${agencyId}/documents`,
      file.buffer,
      detected.contentType,
    );

    let createdId: string | null = null;
    try {
      const created = await this.prisma.client.agencyDocument.create({
        data: {
          agencyId,
          uploadedById: this.context.getPrincipal()?.userId ?? null,
          fileName: documentFileName(file.originalname, detected.extension),
          contentType: detected.contentType,
          byteSize: file.buffer.length,
          storageKey,
        },
        select: { id: true },
      });
      createdId = created.id;
      if (attached) await this.attach(created.id, attached.subject, attached.subjectId);
      return await this.one(created.id);
    } catch (error) {
      if (createdId) {
        await this.prisma.client.agencyDocument.deleteMany({ where: { id: createdId, agencyId } });
      }
      await this.storage.deleteObject(storageKey);
      throw error;
    }
  }

  /**
   * The bytes, for the download route. The row is read first so a missing document
   * is a 404 before we touch the bucket, and so a key that is not ours never is.
   */
  async open(id: string): Promise<{ buffer: Buffer; contentType: string; fileName: string; byteSize: number }> {
    const row = await this.prisma.client.agencyDocument.findFirst({
      where: { id, agencyId: this.context.requireAgencyId() },
      select: { storageKey: true, contentType: true, fileName: true, byteSize: true },
    });
    if (!row) throw new NotFoundException('המסמך לא נמצא.');

    try {
      const stored = await this.storage.getObject(row.storageKey);
      return {
        buffer: stored.buffer,
        contentType: row.contentType,
        fileName: row.fileName,
        byteSize: row.byteSize,
      };
    } catch (error) {
      if (isNotFoundError(error)) throw new NotFoundException('המסמך לא נמצא.');
      throw error;
    }
  }

  async link(id: string, subject: string, subjectId: string): Promise<DocumentLinkView> {
    const attached = this.attachment(subject, subjectId);
    if (!attached) throw new BadRequestException('כדי לקשר מסמך צריך רשומה.');

    const agencyId = this.context.requireAgencyId();
    const doc = await this.prisma.client.agencyDocument.findFirst({
      where: { id, agencyId },
      select: { id: true },
    });
    if (!doc) throw new NotFoundException('המסמך לא נמצא.');

    await this.assertSubject(agencyId, attached.subject, attached.subjectId);
    return this.attach(id, attached.subject, attached.subjectId);
  }

  async unlink(id: string, linkId: string) {
    const agencyId = this.context.requireAgencyId();
    const { count } = await this.prisma.client.agencyDocumentLink.deleteMany({
      where: { id: linkId, documentId: id, agencyId },
    });
    if (count === 0) throw new NotFoundException('הקישור לא נמצא.');
    return { ok: true };
  }

  async remove(id: string) {
    const agencyId = this.context.requireAgencyId();
    const row = await this.prisma.client.agencyDocument.findFirst({
      where: { id, agencyId },
      select: { storageKey: true },
    });
    if (!row) throw new NotFoundException('המסמך לא נמצא.');

    const { count } = await this.prisma.client.agencyDocument.deleteMany({ where: { id, agencyId } });
    if (count === 0) throw new NotFoundException('המסמך לא נמצא.');

    await this.storage.deleteObject(row.storageKey);
    return { ok: true };
  }

  /** Both halves, or neither. One without the other is not a link. */
  private attachment(subject?: string, subjectId?: string): { subject: DocumentSubject; subjectId: string } | null {
    if (!subject && !subjectId) return null;
    if (!subject || !subjectId || !isDocumentSubject(subject)) {
      throw new BadRequestException('כדי לקשר מסמך צריך רשומה.');
    }
    return { subject, subjectId };
  }

  private async one(id: string) {
    const row = await this.prisma.client.agencyDocument.findFirst({
      where: { id, agencyId: this.context.requireAgencyId() },
      select: WITH_LINKS,
    });
    if (!row) throw new NotFoundException('המסמך לא נמצא.');
    return present(row);
  }

  private async attach(documentId: string, subject: DocumentSubject, subjectId: string): Promise<DocumentLinkView> {
    try {
      const row = await this.prisma.client.agencyDocumentLink.create({
        data: {
          agencyId: this.context.requireAgencyId(),
          documentId,
          [SUBJECT_FIELD[subject]]: subjectId,
        },
        select: LINK_SELECT,
      });
      const view = presentLink(row as LinkRow);
      if (!view) throw new NotFoundException('הקישור לא נמצא.');
      return view;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('המסמך כבר מקושר לכאן.');
      }
      throw error;
    }
  }

  /** The id in the body has to be a record of this office. A foreign key alone would not check that. */
  private async assertSubject(agencyId: string, subject: DocumentSubject, subjectId: string): Promise<void> {
    const where = { id: subjectId, agencyId };
    const found = await (async () => {
      switch (subject) {
        case 'customer':
          return this.prisma.client.customer.findFirst({ where, select: { id: true } });
        case 'listing':
          return this.prisma.client.listing.findFirst({ where, select: { id: true } });
        case 'deal':
          return this.prisma.client.deal.findFirst({ where, select: { id: true } });
        case 'mortgage_case':
          return this.prisma.client.mortgageCase.findFirst({ where, select: { id: true } });
        case 'lead':
          return this.prisma.client.lead.findFirst({ where, select: { id: true } });
      }
    })();

    if (!found) {
      const missing: Record<DocumentSubject, string> = {
        customer: 'הלקוח לא נמצא.',
        listing: 'הנכס לא נמצא.',
        deal: 'העסקה לא נמצאה.',
        mortgage_case: 'התיק לא נמצא.',
        lead: 'הפנייה לא נמצאה.',
      };
      throw new NotFoundException(missing[subject]);
    }
  }
}
