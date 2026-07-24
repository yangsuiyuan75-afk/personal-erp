import { Type } from 'class-transformer'
import {
  IsDecimal,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator'
import { ChannelInventoryMode, MasterDataStatus } from '@prisma/client'

export class MasterDataPayloadDto {
  @IsOptional()
  @IsString()
  @Length(1, 64)
  code?: string

  @IsOptional()
  @IsString()
  @Length(1, 200)
  name?: string

  @IsOptional()
  @IsEnum(MasterDataStatus)
  status?: MasterDataStatus

  @IsOptional()
  @IsUUID()
  categoryId?: string

  @IsOptional()
  @IsString()
  @Length(0, 100)
  brand?: string

  @IsOptional()
  @IsString()
  @Length(0, 2000)
  description?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(4)
  decimalScale?: number

  @IsOptional()
  @IsString()
  @Length(1, 128)
  barcode?: string

  @IsOptional()
  @IsUUID()
  productId?: string

  @IsOptional()
  @IsUUID()
  baseUnitId?: string

  @IsOptional()
  @IsObject()
  attributes?: Record<string, string>

  @IsOptional()
  @IsDecimal({ decimal_digits: '0,4', force_decimal: false })
  weight?: string

  @IsOptional()
  @IsString()
  @Length(1, 100)
  type?: string

  @IsOptional()
  @IsString()
  @Length(0, 100)
  contactName?: string

  @IsOptional()
  @IsString()
  @Length(0, 50)
  phone?: string

  @IsOptional()
  @IsString()
  @Length(0, 100)
  taxNo?: string

  @IsOptional()
  @IsUUID()
  purchaseChannelId?: string

  @IsOptional()
  @IsEnum(ChannelInventoryMode)
  inventoryMode?: ChannelInventoryMode

  @IsOptional()
  @IsUUID()
  defaultSalesChannelId?: string
}
