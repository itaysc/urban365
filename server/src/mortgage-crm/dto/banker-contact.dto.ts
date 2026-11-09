import { IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';

export class CreateBankerContactDto {
  @IsString() @MaxLength(120) bankName!: string;
  @IsOptional() @IsString() @MaxLength(120) branch?: string;
  @IsString() @MaxLength(120) name!: string;

  /** One of the two is required, the same rule a customer or a lead is held to. */
  @ValidateIf((o: CreateBankerContactDto) => !o.email) @IsString() @MaxLength(40) phone?: string;
  @ValidateIf((o: CreateBankerContactDto) => !o.phone) @IsString() @MaxLength(200) email?: string;

  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class UpdateBankerContactDto extends CreateBankerContactDto {
  @IsOptional() @IsString() @MaxLength(120) declare bankName: string;
  @IsOptional() @IsString() @MaxLength(120) declare name: string;
}
