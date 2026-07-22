import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsNotEmpty,
  IsNumberString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import {
  AdjustmentDirection,
  DocumentStatus,
  InventoryLocationType,
  InventoryStockStatus,
  InventoryTransactionType,
  MasterDataStatus,
} from '@prisma/client';
import { ListQueryDto } from '../../../common/dto/list-query.dto';

export class InventoryQueryDto extends ListQueryDto {
  @IsOptional()
  @IsUUID()
  locationId?: string;

  @IsOptional()
  @IsUUID()
  skuId?: string;

  @IsOptional()
  @IsEnum(InventoryStockStatus)
  stockStatus?: InventoryStockStatus;

  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @IsOptional()
  @IsEnum(InventoryTransactionType)
  transactionType?: InventoryTransactionType;

  @IsOptional()
  @IsEnum(DocumentStatus)
  documentStatus?: DocumentStatus;
}

export class CreateLocationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  code!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @IsEnum(InventoryLocationType)
  type!: InventoryLocationType;

  @IsOptional()
  @IsUUID()
  parentId?: string;

  @IsOptional()
  @IsUUID()
  salesChannelId?: string;

  @IsOptional()
  @IsBoolean()
  isLeaf?: boolean;
}

export class UpdateLocationDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsEnum(InventoryLocationType)
  type?: InventoryLocationType;

  @IsOptional()
  @IsUUID()
  parentId?: string;

  @IsOptional()
  @IsUUID()
  salesChannelId?: string;

  @IsOptional()
  @IsBoolean()
  isLeaf?: boolean;

  @IsOptional()
  @IsEnum(MasterDataStatus)
  status?: MasterDataStatus;
}

export class OpeningRowDto {
  @IsString()
  @IsNotEmpty()
  locationCode!: string;

  @IsString()
  @IsNotEmpty()
  skuCode!: string;

  @IsOptional()
  @IsEnum(InventoryStockStatus)
  stockStatus: InventoryStockStatus = InventoryStockStatus.AVAILABLE;

  @IsNumberString()
  quantity!: string;

  @IsNumberString()
  unitCost!: string;

  @IsString()
  @IsNotEmpty()
  batchNo!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  remark?: string;
}

export class OpeningRowsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => OpeningRowDto)
  rows!: OpeningRowDto[];
}

export class CreateOpeningDto extends OpeningRowsDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  importKey!: string;

  @IsISO8601({ strict: true })
  occurredAt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  remark?: string;
}

export class InventoryDocumentItemDto {
  @IsUUID()
  locationId!: string;

  @IsUUID()
  skuId!: string;

  @IsOptional()
  @IsEnum(InventoryStockStatus)
  stockStatus: InventoryStockStatus = InventoryStockStatus.AVAILABLE;

  @IsNumberString()
  quantity!: string;

  @IsOptional()
  @IsNumberString()
  unitCost?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  remark?: string;
}

export class CreateAdjustmentDto {
  @IsEnum(AdjustmentDirection)
  direction!: AdjustmentDirection;

  @IsISO8601({ strict: true })
  occurredAt!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => InventoryDocumentItemDto)
  items!: InventoryDocumentItemDto[];
}

export class TransferItemDto {
  @IsUUID()
  skuId!: string;

  @IsOptional()
  @IsEnum(InventoryStockStatus)
  stockStatus: InventoryStockStatus = InventoryStockStatus.AVAILABLE;

  @IsNumberString()
  quantity!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  remark?: string;
}

export class CreateTransferDto {
  @IsUUID()
  fromLocationId!: string;

  @IsUUID()
  toLocationId!: string;

  @IsISO8601({ strict: true })
  occurredAt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  remark?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => TransferItemDto)
  items!: TransferItemDto[];
}

export class ChannelAllocationItemDto {
  @IsUUID()
  skuId!: string;

  @IsNumberString()
  quantity!: string;
}

export class CreateChannelAllocationDto {
  @IsUUID()
  salesChannelId!: string;

  @IsUUID()
  locationId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ChannelAllocationItemDto)
  items!: ChannelAllocationItemDto[];
}
