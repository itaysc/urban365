import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

/** Mirrors the reference's policy: length plus a little complexity, nothing exotic. */
export const PASSWORD_MIN = 10;
export const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/;

export class SignupDto {
  @IsEmail({}, { message: 'כתובת אימייל לא תקינה' })
  @MaxLength(255)
  email!: string;

  @IsString()
  @MinLength(PASSWORD_MIN, { message: `הסיסמה חייבת להכיל לפחות ${PASSWORD_MIN} תווים` })
  @MaxLength(200)
  @Matches(PASSWORD_PATTERN, { message: 'הסיסמה חייבת לכלול אות גדולה, אות קטנה וספרה' })
  password!: string;

  @IsString() @MinLength(1) @MaxLength(80) firstName!: string;
  @IsString() @MinLength(1) @MaxLength(80) lastName!: string;

  @IsOptional() @IsString() @MaxLength(40) phone?: string;

  /** Name for a brand-new agency. Ignored when `claimAgencyId` is set. */
  @IsOptional() @IsString() @MaxLength(200) agencyName?: string;

  /** An existing *unclaimed* agency to request. Admin approval decides it. */
  @IsOptional() @IsString() claimAgencyId?: string;

  /** Cloudflare Turnstile. Only checked in production. */
  @IsOptional() @IsString() captchaToken?: string;
}
