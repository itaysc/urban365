import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { DOCUMENT_SUBJECTS, type DocumentSubject } from '../../storage/document-links.js';

/** Attaching a file that is already in the library. */
export class LinkDocumentDto {
  @IsIn(DOCUMENT_SUBJECTS) subject!: DocumentSubject;

  @IsString() @MinLength(1) subjectId!: string;
}

/** An upload may land in the library on its own, or already attached to a record. */
export class UploadDocumentDto {
  @IsOptional() @IsIn(DOCUMENT_SUBJECTS) subject?: DocumentSubject;

  @IsOptional() @IsString() @MinLength(1) subjectId?: string;
}

export class ListDocumentsQuery {
  @IsOptional() @IsIn(DOCUMENT_SUBJECTS) subject?: DocumentSubject;

  @IsOptional() @IsString() @MinLength(1) subjectId?: string;
}
