import {
  ArgumentsHost,
  Catch,
  Body,
  Controller,
  Delete,
  ExceptionFilter,
  Get,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MulterError } from 'multer';
import type { Response } from 'express';
import { TenantGuard } from '../tenancy/tenant.guard.js';
import { MAX_DOCUMENT_BYTES } from '../storage/document-type.js';
import { DocumentsService } from './documents.service.js';
import { LinkDocumentDto, ListDocumentsQuery, UploadDocumentDto } from './dto/document.dto.js';

/**
 * Multer rejects an oversized part before the handler runs, which would otherwise
 * surface as a stack trace. The same sentence the service uses, so the toast does
 * not depend on which layer noticed first.
 */
@Catch(MulterError)
class UploadLimitFilter implements ExceptionFilter {
  catch(error: MulterError, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    if (error.code === 'LIMIT_FILE_SIZE') {
      response.status(413).json({ statusCode: 413, message: 'הקובץ גדול מ-10 מ״ב.' });
      return;
    }
    response.status(400).json({ statusCode: 400, message: 'ההעלאה נכשלה.' });
  }
}

/** `filename` for a legacy client, `filename*` so a Hebrew name survives. */
function contentDisposition(fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

@UseGuards(TenantGuard)
@UseFilters(UploadLimitFilter)
@Controller('my/documents')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get()
  list(@Query() query: ListDocumentsQuery) {
    return this.documents.list(query.subject, query.subjectId);
  }

  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_DOCUMENT_BYTES, files: 1 } }))
  add(@UploadedFile() file: Express.Multer.File, @Body() body: UploadDocumentDto) {
    return this.documents.add(file, body.subject, body.subjectId);
  }

  @Post(':id/links')
  link(@Param('id') id: string, @Body() body: LinkDocumentDto) {
    return this.documents.link(id, body.subject, body.subjectId);
  }

  @Delete(':id/links/:linkId')
  unlink(@Param('id') id: string, @Param('linkId') linkId: string) {
    return this.documents.unlink(id, linkId);
  }

  @Get(':id/file')
  async file(@Param('id') id: string, @Res() res: Response) {
    const doc = await this.documents.open(id);
    res.setHeader('Content-Type', doc.contentType);
    res.setHeader('Content-Length', String(doc.byteSize));
    res.setHeader('Content-Disposition', contentDisposition(doc.fileName));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(doc.buffer);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.documents.remove(id);
  }
}
