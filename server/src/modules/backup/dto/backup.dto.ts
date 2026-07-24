import { Transform } from 'class-transformer'
import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator'
import { BackupStatus, BackupTrigger } from '@prisma/client'
import { ListQueryDto } from '../../../common/dto/list-query.dto'

export class BackupListQueryDto extends ListQueryDto {
  @IsOptional()
  @IsEnum(BackupStatus)
  backupStatus?: BackupStatus

  @IsOptional()
  @IsEnum(BackupTrigger)
  trigger?: BackupTrigger

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  locked?: boolean
}

export class CreateBackupDto {
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  locked?: boolean
}

export class RestoreBackupDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password: string

  @IsString()
  @MaxLength(120)
  confirmPhrase: string
}

export class LockBackupDto {
  @IsBoolean()
  locked: boolean
}

export class BootstrapRestoreDto {
  @IsString()
  @MaxLength(120)
  confirmPhrase: string
}
