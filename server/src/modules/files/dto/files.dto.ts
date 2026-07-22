import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { FileAssetStatus, StorageProviderType } from '@prisma/client';
import { ListQueryDto } from '../../../common/dto/list-query.dto';

export class FileListQueryDto extends ListQueryDto {
  @IsOptional()
  @IsEnum(StorageProviderType)
  provider?: StorageProviderType;

  @IsOptional()
  @IsEnum(FileAssetStatus)
  fileStatus?: FileAssetStatus;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  module?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  entityType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  entityId?: string;
}

export class UploadFileDto {
  @IsString()
  @MaxLength(500)
  @Matches(/^(?![/.])(?!.*(?:^|\/)\.\.(?:\/|$))[\p{L}\p{N}._/-]+$/u, {
    message: 'logicalPath 必须是安全的相对路径',
  })
  logicalPath: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  module?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  entityType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  entityId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  label?: string;
}

export class UploadProductImagesDto {
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  isPrimary?: boolean;
}

export class ReorderProductImagesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(12)
  @IsUUID('4', { each: true })
  imageIds: string[];
}
