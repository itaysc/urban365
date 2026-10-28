import { IsBoolean, IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { PASSWORD_MIN, PASSWORD_PATTERN } from '../../auth/dto/signup.dto.js';

/**
 * A consumer signing up. The same identity fields as an agency signup minus everything
 * about an agency — which is the whole difference between the two.
 */
export class BuyerSignupDto {
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

  /** Cloudflare Turnstile. Only checked in production. */
  @IsOptional() @IsString() captchaToken?: string;
}

export class UpdateBuyerProfileDto {
  @IsOptional() @IsString() @MaxLength(2000) searchNotes?: string;
  @IsOptional() @IsBoolean() notifyOnPriceDrop?: boolean;
  @IsOptional() @IsBoolean() notifyOnNewMatches?: boolean;
  @IsOptional() @IsBoolean() weeklyDigest?: boolean;
}

export class SaveListingDto {
  @IsString() @MaxLength(60) listingId!: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}
