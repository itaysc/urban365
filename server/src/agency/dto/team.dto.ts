import { IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export const AGENCY_ROLES = ['owner', 'agent'] as const;
export type AgencyRoleValue = (typeof AGENCY_ROLES)[number];

export class InviteMemberDto {
  @IsEmail({}, { message: 'כתובת אימייל לא תקינה.' })
  @MaxLength(200)
  email!: string;

  @IsOptional() @IsIn(AGENCY_ROLES) role?: AgencyRoleValue;
}

export class ChangeRoleDto {
  @IsIn(AGENCY_ROLES) role!: AgencyRoleValue;
}

/**
 * Sent by someone with no account yet. An existing user accepts while signed in, so
 * these fields are absent in that case.
 */
export class AcceptInviteDto {
  @IsOptional() @IsString() @MaxLength(80) firstName?: string;
  @IsOptional() @IsString() @MaxLength(80) lastName?: string;
  @IsOptional() @IsString() @MinLength(10, { message: 'הסיסמה צריכה להיות באורך 10 תווים לפחות.' }) @MaxLength(200)
  password?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
}

/** What a member may change about themselves, whatever their role. */
export class UpdateMyProfileDto {
  @IsOptional() @IsString() @MaxLength(80) firstName?: string;
  @IsOptional() @IsString() @MaxLength(80) lastName?: string;
  /**
   * Shown to buyers behind the "show number" button on this agent's own listings, in
   * preference to the agency switchboard. An empty string clears it.
   */
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
}
