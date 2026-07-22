import { IsString, Length, Matches, MinLength } from 'class-validator';

export class CredentialsDto {
  @IsString()
  @Length(3, 64)
  @Matches(/^[a-zA-Z0-9._-]+$/, { message: '用户名只能包含字母、数字、点、下划线或连字符' })
  username!: string;

  @IsString()
  @MinLength(12)
  password!: string;
}

export class ChangePasswordDto {
  @IsString()
  currentPassword!: string;

  @IsString()
  @MinLength(12)
  newPassword!: string;
}
