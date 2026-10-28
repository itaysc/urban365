import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: 'כתובת אימייל לא תקינה' })
  @MaxLength(255)
  email!: string;

  @IsString() @MinLength(1) @MaxLength(200) password!: string;
}
