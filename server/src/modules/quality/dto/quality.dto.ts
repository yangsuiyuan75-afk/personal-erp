import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsISO8601,
  IsNotEmpty,
  IsNumberString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator'
import { ClaimResolutionType, QualityResponsibility } from '@prisma/client'
import { ListQueryDto } from '../../../common/dto/list-query.dto'

export class QualityQueryDto extends ListQueryDto {
  @IsOptional()
  @IsUUID()
  supplierId?: string

  @IsOptional()
  @IsUUID()
  skuId?: string

  @IsOptional()
  @IsString()
  documentStatus?: string

  @IsOptional()
  @IsEnum(QualityResponsibility)
  responsibility?: QualityResponsibility

  @IsOptional()
  @IsEnum(ClaimResolutionType)
  resolutionType?: ClaimResolutionType
}

export class QualityInspectionItemDto {
  @IsUUID()
  salesReturnItemId!: string

  @IsNumberString()
  goodQuantity!: string

  @IsNumberString()
  defectiveQuantity!: string

  @IsNumberString()
  supplierClaimQuantity!: string

  @IsNumberString()
  scrapQuantity!: string

  @IsEnum(QualityResponsibility)
  responsibility!: QualityResponsibility

  @IsOptional()
  @IsUUID()
  supplierId?: string

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  defectDescription?: string
}

export class CreateQualityInspectionDto {
  @IsUUID()
  salesReturnId!: string

  @IsISO8601({ strict: true })
  inspectedAt!: string

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => QualityInspectionItemDto)
  items!: QualityInspectionItemDto[]
}

export class ConfirmQualityInspectionDto {
  @IsOptional()
  @IsUUID()
  availableLocationId?: string

  @IsOptional()
  @IsUUID()
  defectiveLocationId?: string

  @IsOptional()
  @IsUUID()
  claimLocationId?: string

  @IsOptional()
  @IsUUID()
  scrapLocationId?: string
}

export class CreateClaimSettlementDto {
  @IsEnum(ClaimResolutionType)
  resolutionType!: ClaimResolutionType

  @IsOptional()
  @IsUUID()
  supplierClaimItemId?: string

  @IsOptional()
  @IsNumberString()
  quantity?: string

  @IsOptional()
  @IsNumberString()
  amount?: string

  @IsOptional()
  @IsUUID()
  replacementLocationId?: string

  @IsOptional()
  @IsUUID()
  claimStockLocationId?: string

  @IsOptional()
  @IsUUID()
  scrapLocationId?: string

  @IsOptional()
  @IsNumberString()
  disposeQuantity?: string

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  batchNo?: string

  @IsISO8601({ strict: true })
  occurredAt!: string

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  remark?: string
}
