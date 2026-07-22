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

export class SalesQueryDto extends ListQueryDto {
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsUUID()
  skuId?: string;

  @IsOptional()
  @IsUUID()
  locationId?: string;

  @IsOptional()
  @IsString()
  documentStatus?: string;
}

export class ResolveSalesPriceDto {
  @IsUUID()
  skuId!: string;

  @IsUUID()
  salesChannelId!: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsNumberString()
  quantity!: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  at?: string;
}

export class CreateSalesPriceDto {
  @IsUUID()
  skuId!: string;

  @IsOptional()
  @IsUUID()
  salesChannelId?: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;

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

export class UpdateSalesPriceDto {
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

export class SalesOrderItemDto {
  @IsUUID()
  skuId!: string;

  @IsNumberString()
  quantity!: string;

  @IsOptional()
  @IsNumberString()
  unitPrice?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  remark?: string;
}

export class CreateSalesOrderDto {
  @IsUUID()
  salesChannelId!: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency = 'CNY';

  @IsISO8601({ strict: true })
  orderDate!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  remark?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => SalesOrderItemDto)
  items!: SalesOrderItemDto[];
}

export class SalesIssueItemDto {
  @IsUUID()
  salesOrderItemId!: string;

  @IsNumberString()
  quantity!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  remark?: string;
}

export class CreateSalesIssueDto {
  @IsUUID()
  salesOrderId!: string;

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
  @Type(() => SalesIssueItemDto)
  items!: SalesIssueItemDto[];
}

export class SalesReturnItemDto {
  @IsUUID()
  salesIssueItemId!: string;

  @IsNumberString()
  quantity!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  remark?: string;
}

export class CreateSalesReturnDto {
  @IsUUID()
  salesIssueId!: string;

  @IsUUID()
  qcLocationId!: string;

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
  @Type(() => SalesReturnItemDto)
  items!: SalesReturnItemDto[];
}
