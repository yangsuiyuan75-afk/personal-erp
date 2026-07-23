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
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import {
  ExpenseCategory,
  FinancialAccountType,
  FinancialDirection,
  FinancialTransactionCategory,
  MasterDataStatus,
} from '@prisma/client';
import { ListQueryDto } from '../../../common/dto/list-query.dto';

export class FinanceQueryDto extends ListQueryDto {
  @IsOptional()
  @IsUUID()
  accountId?: string;

  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @IsOptional()
  @IsUUID()
  buyerId?: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsString()
  documentStatus?: string;

  @IsOptional()
  @IsEnum(FinancialDirection)
  direction?: FinancialDirection;

  @IsOptional()
  @IsEnum(FinancialTransactionCategory)
  category?: FinancialTransactionCategory;

  @IsOptional()
  @IsEnum(ExpenseCategory)
  expenseCategory?: ExpenseCategory;

  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  month?: string;
}

export class CreateFinancialAccountDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  code!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @IsEnum(FinancialAccountType)
  type!: FinancialAccountType;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency = 'CNY';
}

export class UpdateFinancialAccountDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsEnum(FinancialAccountType)
  type?: FinancialAccountType;

  @IsOptional()
  @IsEnum(MasterDataStatus)
  status?: MasterDataStatus;
}

export class PaymentAllocationDto {
  @IsOptional()
  @IsUUID()
  payableId?: string;

  @IsOptional()
  @IsUUID()
  customerRefundId?: string;

  @IsNumberString()
  amount!: string;

  @IsOptional()
  @IsUUID()
  supplierCreditId?: string;

  @IsOptional()
  @IsNumberString()
  creditAmount?: string;
}

export class CreatePaymentDto {
  @IsUUID()
  accountId!: string;

  @IsNumberString()
  amount!: string;

  @IsISO8601({ strict: true })
  occurredAt!: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  settlementPeriod?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  remark?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => PaymentAllocationDto)
  allocations!: PaymentAllocationDto[];
}

export class ReceiptAllocationDto {
  @IsOptional()
  @IsUUID()
  receivableId?: string;

  @IsOptional()
  @IsUUID()
  supplierCompensationReceivableId?: string;

  @IsNumberString()
  amount!: string;
}

export class CreateReceiptDto {
  @IsUUID()
  accountId!: string;

  @IsNumberString()
  amount!: string;

  @IsISO8601({ strict: true })
  occurredAt!: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  settlementPeriod?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  remark?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ReceiptAllocationDto)
  allocations!: ReceiptAllocationDto[];
}

export class CreateAccountAdjustmentDto {
  @IsUUID()
  accountId!: string;

  @IsEnum(FinancialDirection)
  direction!: FinancialDirection;

  @IsEnum(FinancialTransactionCategory)
  category!: FinancialTransactionCategory;

  @IsNumberString()
  amount!: string;

  @IsISO8601({ strict: true })
  occurredAt!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason!: string;

  @IsOptional()
  @IsUUID()
  salesChannelId?: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @IsOptional()
  @IsUUID()
  purchaseChannelId?: string;

  @IsOptional()
  @IsUUID()
  buyerId?: string;
}

export class CreateExpenseBillDto {
  @IsUUID()
  accountId!: string;

  @IsEnum(ExpenseCategory)
  expenseCategory!: ExpenseCategory;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  payee!: string;

  @IsNumberString()
  amount!: string;

  @IsISO8601({ strict: true })
  occurredAt!: string;
}
