import { Equals, IsBoolean, IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

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

  /**
   * Agreement to the terms and the privacy policy.
   *
   * Required and checked here, not only in the form: a tick box is a claim the client
   * makes, and the record that someone agreed is worth no more than the weakest place
   * it is enforced.
   */
  @IsBoolean()
  @Equals(true, { message: 'יש לאשר את תנאי השימוש ומדיניות הפרטיות' })
  acceptedTerms!: boolean;

  /** Name for a brand-new agency. Ignored when `claimAgencyId` is set. */
  @IsOptional() @IsString() @MaxLength(200) agencyName?: string;

  /** An existing *unclaimed* agency to request. Admin approval decides it. */
  @IsOptional() @IsString() claimAgencyId?: string;

  /** Cloudflare Turnstile. Only checked in production. */
  @IsOptional() @IsString() captchaToken?: string;
}
