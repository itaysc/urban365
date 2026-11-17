import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { CUSTOMER_KINDS, type CustomerKindValue } from '../../crm/dto/customer.dto.js';
import { DEAL_STAGES, type DealStageValue } from '../../crm/dto/deal.dto.js';
import { LEAD_STATUSES, type LeadStatusValue } from '../../crm/dto/lead.dto.js';
import { VIEWING_OUTCOMES, type ViewingOutcomeValue } from '../../calendar/dto/meeting.dto.js';

export class FindCustomersDto {
  @IsOptional() @IsString() @MaxLength(120) q?: string;
  @IsOptional() @IsIn(CUSTOMER_KINDS) kind?: CustomerKindValue;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) pageSize?: number;
}

export class CustomerIdDto {
  @IsString() @MaxLength(40) id!: string;
}

export class CreateCustomerToolDto {
  @IsString() @MaxLength(120) name!: string;
  @ValidateIf((o: CreateCustomerToolDto) => !o.email) @IsString() @MaxLength(40) phone?: string;
  @ValidateIf((o: CreateCustomerToolDto) => !o.phone) @IsString() @MaxLength(200) email?: string;
  @IsOptional() @IsIn(CUSTOMER_KINDS) kind?: CustomerKindValue;
  @IsOptional() @IsString() @MaxLength(4000) notes?: string;
}

export class UpdateCustomerToolDto {
  @IsString() @MaxLength(40) id!: string;
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() @MaxLength(200) email?: string;
  @IsOptional() @IsIn(CUSTOMER_KINDS) kind?: CustomerKindValue;
  @IsOptional() @IsString() @MaxLength(4000) notes?: string;
}

export class FindLeadsDto {
  @IsOptional() @IsString() @MaxLength(120) q?: string;
  @IsOptional() @IsIn(LEAD_STATUSES) status?: LeadStatusValue;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) pageSize?: number;
}

export class CreateLeadToolDto {
  @IsString() @MaxLength(120) name!: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() @MaxLength(200) email?: string;
  @IsOptional() @IsString() @MaxLength(2000) message?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @IsOptional() @IsString() listingId?: string;
  @IsOptional() @IsIn(LEAD_STATUSES) status?: LeadStatusValue;
}

export class UpdateLeadToolDto {
  @IsString() @MaxLength(40) id!: string;
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() @MaxLength(200) email?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @IsOptional() @IsIn(LEAD_STATUSES) status?: LeadStatusValue;
  @IsOptional() @IsString() listingId?: string;
}

export class CreateDealToolDto {
  @IsString() @MaxLength(200) title!: string;
  @IsOptional() @IsIn(DEAL_STAGES) stage?: DealStageValue;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) price?: number;
  @IsOptional() @IsString() customerId?: string;
  @IsOptional() @IsString() listingId?: string;
  @IsOptional() @IsString() leadId?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class UpdateDealStageDto {
  @IsString() @MaxLength(40) id!: string;
  @IsIn(DEAL_STAGES) stage!: DealStageValue;
  @IsOptional() @IsString() @MaxLength(500) lostReason?: string;
}

export class UpcomingMeetingsDto {
  /** How many days ahead to look, including today. Defaults to 7. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(60) days?: number;
}

export class CreateMeetingToolDto {
  @IsString() @MaxLength(200) title!: string;
  @IsDateString() startsAt!: string;
  @IsDateString() endsAt!: string;
  @IsOptional() @IsString() @MaxLength(200) location?: string;
  @IsOptional() @IsString() @MaxLength(4000) notes?: string;
  @IsOptional() @IsString() customerId?: string;
  @IsOptional() @IsString() listingId?: string;
}

export class RecordFeedbackToolDto {
  @IsString() @MaxLength(40) id!: string;
  @IsIn(VIEWING_OUTCOMES) outcome!: ViewingOutcomeValue;
  @IsOptional() @IsString() @MaxLength(4000) notes?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(365) followUpInDays?: number;
}

export class MeetingIdDto {
  @IsString() @MaxLength(40) id!: string;
}

export class MyListingsToolDto {
  @IsOptional() @IsString() @MaxLength(120) q?: string;
  @IsOptional() @IsIn(['draft', 'published', 'archived']) status?: 'draft' | 'published' | 'archived';
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) pageSize?: number;
}
