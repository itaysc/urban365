import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
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

  /** What the file is for. Blank is the same as leaving it out. */
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
}

/** The name and the memo. The bytes stay where they were uploaded. */
export class UpdateDocumentDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(180) fileName?: string;

  @IsOptional() @IsString() @MaxLength(2000) description?: string;
}

export class ListDocumentsQuery {
  @IsOptional() @IsIn(DOCUMENT_SUBJECTS) subject?: DocumentSubject;

  @IsOptional() @IsString() @MinLength(1) subjectId?: string;
}
