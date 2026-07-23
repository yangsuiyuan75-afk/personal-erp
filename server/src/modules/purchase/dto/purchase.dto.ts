import { Type } from 'class-transformer';
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
  Length,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { MasterDataStatus } from '@prisma/client';
import { ListQueryDto } from '../../../common/dto/list-query.dto';

export class PurchaseQueryDto extends ListQueryDto {
  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @IsOptional()
  @IsUUID()
  buyerId?: string;

  @IsOptional()
  @IsUUID()
  skuId?: string;

  @IsOptional()
  @IsString()
  documentStatus?: string;

  @IsOptional()
  @IsString()
  sourceType?: string;
}

export class CreatePurchasePriceDto {
  @IsUUID()
  skuId!: string;

  @IsUUID()
  supplierId!: string;

  @IsOptional()
  @IsUUID()
  buyerId?: string;

  @IsUUID()
  purchaseChannelId!: string;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency = 'CNY';

  @IsNumberString()
  price!: string;

  @IsNumberString()
  minQuantity!: string;

  @IsISO8601({ strict: true })
  effectiveFrom!: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  effectiveTo?: string;
}

export class UpdatePurchasePriceDto {
  @IsOptional()
  @IsNumberString()
  price?: string;

  @IsOptional()
  @IsNumberString()
  minQuantity?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  effectiveFrom?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  effectiveTo?: string;

  @IsOptional()
  @IsEnum(MasterDataStatus)
  status?: MasterDataStatus;
}

export class PurchaseOrderItemDto {
  @IsUUID()
  skuId!: string;

  @IsNumberString()
  quantity!: string;

  @IsNumberString()
  unitPrice!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  remark?: string;
}

export class CreatePurchaseOrderDto {
  @IsUUID()
  supplierId!: string;

  @IsUUID()
  buyerId!: string;

  @IsUUID()
  purchaseChannelId!: string;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency = 'CNY';

  @IsISO8601({ strict: true })
  orderDate!: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  expectedAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  remark?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderItemDto)
  items!: PurchaseOrderItemDto[];
}

export class UpdatePurchaseOrderDto extends CreatePurchaseOrderDto {}

export class PurchaseReceiptItemDto {
  @IsUUID()
  purchaseOrderItemId!: string;

  @IsNumberString()
  quantity!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  batchNo!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  remark?: string;
}

export class CreatePurchaseReceiptDto {
  @IsUUID()
  purchaseOrderId!: string;

  @IsUUID()
  locationId!: string;

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
  @Type(() => PurchaseReceiptItemDto)
  items!: PurchaseReceiptItemDto[];
}

export class PurchaseReturnItemDto {
  @IsUUID()
  purchaseReceiptItemId!: string;

  @IsNumberString()
  quantity!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  remark?: string;
}

export class CreatePurchaseReturnDto {
  @IsUUID()
  purchaseReceiptId!: string;

  @IsUUID()
  locationId!: string;

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
  @Type(() => PurchaseReturnItemDto)
  items!: PurchaseReturnItemDto[];
}
