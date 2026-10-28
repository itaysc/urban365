import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { PASSWORD_MIN, PASSWORD_PATTERN } from './signup.dto.js';

export class ForgotPasswordDto {
  @IsEmail({}, { message: 'כתובת אימייל לא תקינה' })
  @MaxLength(255)
  email!: string;

  @IsOptional() @IsString() captchaToken?: string;
}

export class ResetPasswordDto {
  @IsString() token!: string;

  @IsString()
  @MinLength(PASSWORD_MIN, { message: `הסיסמה חייבת להכיל לפחות ${PASSWORD_MIN} תווים` })
  @MaxLength(200)
  @Matches(PASSWORD_PATTERN, { message: 'הסיסמה חייבת לכלול אות גדולה, אות קטנה וספרה' })
  password!: string;
}

export class VerifyEmailDto {
  @IsString() token!: string;
}
